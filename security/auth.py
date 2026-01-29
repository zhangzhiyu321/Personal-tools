"""
认证和授权模块
提供JWT认证、密码加密、权限控制
"""

import jwt
import hashlib
import secrets
from datetime import datetime, timedelta
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
        payload = {
            'user_id': user_id,
            'username': username,
            'is_admin': is_admin,
            'exp': datetime.now() + timedelta(seconds=SecurityConfig.get_session_timeout()),
            'iat': datetime.now(),
            'jti': secrets.token_urlsafe(16)  # JWT ID，用于撤销令牌
        }
        return jwt.encode(payload, secret, algorithm='HS256')
    
    @staticmethod
    def verify_token(token: str) -> dict:
        """验证JWT令牌"""
        try:
            secret = SecurityConfig.get_jwt_secret()
            payload = jwt.decode(token, secret, algorithms=['HS256'])
            return payload
        except jwt.ExpiredSignatureError:
            raise ValueError("令牌已过期")
        except jwt.InvalidTokenError:
            raise ValueError("无效的令牌")
    
    @staticmethod
    def get_current_user() -> Optional[dict]:
        """获取当前用户信息（从数据库验证）"""
        token = request.headers.get('Authorization')
        if not token:
            return None
        
        if token.startswith('Bearer '):
            token = token[7:]
        
        try:
            payload = AuthManager.verify_token(token)
            username = payload.get('username')
            
            # 从数据库验证用户是否仍然有效
            from .models import UserManager
            user = UserManager.get_user_by_username(username)
            
            if not user or not user.is_active:
                return None
            
            # 返回包含用户ID的完整信息
            return {
                'id': user.id,
                'username': user.username,
                'is_admin': user.is_admin,
                'is_active': user.is_active
            }
        except:
            return None


def require_auth(f):
    """要求认证的装饰器"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = AuthManager.get_current_user()
        if not user:
            logger.log_security_event('unauthorized_access', {
                'path': request.path,
                'ip': request.remote_addr
            })
            return jsonify({'error': '需要认证', 'code': 'UNAUTHORIZED'}), 401
        
        g.current_user = user
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
            logger.log_security_event('failed_login', {
                'username': username,
                'reason': '用户名或密码错误'
            })
            return None
        
        logger.log_info('successful_login', {'username': username, 'user_id': user.id})
        
        return {
            'id': user.id,
            'username': user.username,
            'is_admin': user.is_admin,
            'is_active': user.is_active
        }
    except Exception as e:
        logger.log_error('auth_exception', {'error': str(e)})
        return None
