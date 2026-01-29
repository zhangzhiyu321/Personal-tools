"""
认证和授权模块
提供JWT认证、密码加密、权限控制
"""

import jwt
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Optional
from flask import request, jsonify, current_app, g
from werkzeug.security import generate_password_hash, check_password_hash
from .config import SecurityConfig
from .logging import SecurityLogger

logger = SecurityLogger()


class AuthManager:
    """认证管理器"""
    
    @staticmethod
    def hash_password(password: str) -> str:
        """生成密码哈希"""
        return generate_password_hash(password, method='pbkdf2:sha256:600000')
    
    @staticmethod
    def verify_password(password_hash: str, password: str) -> bool:
        """验证密码"""
        return check_password_hash(password_hash, password)
    
    @staticmethod
    def generate_token(user_id: int, username: str, is_admin: bool = False) -> str:
        """生成JWT令牌"""
        secret = SecurityConfig.get_jwt_secret()
        if not secret:
            logger.log_error('jwt_secret_missing_on_generate', {})
            raise ValueError("JWT密钥未配置，无法生成令牌")
        
        # 使用 UTC 时间（JWT 标准要求）；过期时间与 get_session_timeout 一致，默认 6 个月
        now = datetime.now(timezone.utc)
        payload = {
            'user_id': user_id,
            'username': username,
            'is_admin': is_admin,
            'exp': now + timedelta(seconds=SecurityConfig.get_session_timeout()),
            'iat': now,
            'jti': secrets.token_urlsafe(16)  # JWT ID，用于撤销令牌
        }
        try:
            token = jwt.encode(payload, secret, algorithm='HS256')
            # PyJWT 2.x 返回字符串，1.x 返回字节，统一转换为字符串
            if isinstance(token, bytes):
                token = token.decode('utf-8')
            return token
        except Exception as e:
            logger.log_error('token_generation_failed', {'error': str(e)})
            raise ValueError(f"令牌生成失败: {str(e)}")
    
    @staticmethod
    def verify_token(token: str) -> dict:
        """验证JWT令牌"""
        try:
            secret = SecurityConfig.get_jwt_secret()
            if not secret:
                logger.log_error('jwt_secret_missing', {})
                raise ValueError("JWT密钥未配置")
            
            payload = jwt.decode(token, secret, algorithms=['HS256'])
            return payload
        except jwt.ExpiredSignatureError:
            raise ValueError("令牌已过期")
        except jwt.DecodeError as e:
            logger.log_warning('jwt_decode_error', {'error': str(e)})
            raise ValueError("无效的令牌格式")
        except jwt.InvalidTokenError as e:
            logger.log_warning('jwt_invalid_token', {'error': str(e)})
            raise ValueError("无效的令牌")
    
    @staticmethod
    def get_current_user() -> Optional[dict]:
        """获取当前用户信息（从数据库验证）"""
        token = request.headers.get('Authorization', '')
        if not token:
            logger.log_warning('no_authorization_header', {'path': request.path})
            return None
        
        if not token.startswith('Bearer '):
            logger.log_warning('invalid_authorization_format', {'path': request.path, 'header': token[:20]})
            return None
        
        token = token[7:]
        try:
            payload = AuthManager.verify_token(token)
            username = payload.get('username')
            if not username:
                logger.log_warning('token_missing_username', {'path': request.path})
                return None
            
            from .models import UserManager
            user = UserManager.get_user_by_username(username)
            if not user:
                logger.log_warning('user_not_found', {'username': username, 'path': request.path})
                return None
            
            if not user.is_active:
                logger.log_warning('user_inactive', {'username': username, 'path': request.path})
                return None
            
            user_info = {
                'id': user.id, 'username': user.username,
                'is_admin': user.is_admin, 'is_active': user.is_active
            }
            # 确保id字段存在
            if not user_info.get('id'):
                logger.log_error('user_info_missing_id', {'user_info': user_info, 'path': request.path})
                return None
            
            return user_info
        except (ValueError, Exception) as e:
            logger.log_security_event('token_verification_failed', {
                'error': str(e), 
                'error_type': type(e).__name__,
                'path': request.path
            })
            return None


def require_auth(f):
    """要求认证的装饰器"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = AuthManager.get_current_user()
        if not user:
            logger.log_security_event('unauthorized_access', {
                'path': request.path, 'ip': request.remote_addr
            })
            return jsonify({'error': '需要认证', 'code': 'UNAUTHORIZED'}), 401
        # 确保g.current_user被正确设置，包含id字段
        g.current_user = user
        # 验证user包含id字段
        if 'id' not in user or not user.get('id'):
            logger.log_error('user_missing_id', {'user': user, 'path': request.path})
            return jsonify({'error': '用户信息不完整', 'code': 'UNAUTHORIZED'}), 401
        return f(*args, **kwargs)
    return decorated_function


def require_admin(f):
    """要求管理员权限的装饰器"""
    @wraps(f)
    @require_auth
    def decorated_function(*args, **kwargs):
        if not g.current_user.get('is_admin', False):
            logger.log_security_event('unauthorized_admin_access', {
                'path': request.path,
                'username': g.current_user.get('username'),
                'ip': request.remote_addr
            })
            return jsonify({'error': '需要管理员权限', 'code': 'FORBIDDEN'}), 403
        return f(*args, **kwargs)
    return decorated_function


def authenticate_user(username: str, password: str) -> Optional[dict]:
    """验证用户登录（从数据库）"""
    try:
        from .models import UserManager
        user = UserManager.authenticate(username, password)
        if not user:
            logger.log_security_event('failed_login', {'username': username})
            return None
        logger.log_info('successful_login', {'username': username, 'user_id': user.id})
        return {
            'id': user.id, 'username': user.username,
            'is_admin': user.is_admin, 'is_active': user.is_active
        }
    except Exception as e:
        logger.log_error('auth_exception', {'error': str(e)})
        return None
