"""
安全中间件
提供CSRF保护、安全头部、速率限制等
"""

from functools import wraps
from flask import request, jsonify, g, session
from werkzeug.middleware.proxy_fix import ProxyFix
import time
from collections import defaultdict
from .config import SecurityConfig
from .logging import SecurityLogger

logger = SecurityLogger()

# 速率限制存储（生产环境应使用Redis）
_rate_limit_store = defaultdict(list)


def setup_security_headers(app):
    """设置安全HTTP头部"""
    
    @app.after_request
    def set_security_headers(response):
        """添加安全头部"""
        # 防止XSS攻击
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        
        # 内容安全策略
        csp = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self' data:; "
            "connect-src 'self'; "
            "frame-ancestors 'none';"
        )
        response.headers['Content-Security-Policy'] = csp
        
        # HSTS（仅HTTPS）
        if request.is_secure:
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        
        # 移除服务器信息
        response.headers.pop('Server', None)
        
        return response


def rate_limit(max_requests: int = 100, window: int = 3600):
    """速率限制装饰器"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            client_id = (g.current_user.get('username') if hasattr(g, 'current_user') and g.current_user 
                         else request.remote_addr)
            current_time = time.time()
            requests = _rate_limit_store[client_id]
            requests[:] = [t for t in requests if t > current_time - window]
            
            if len(requests) >= max_requests:
                logger.log_security_event('rate_limit_exceeded', {
                    'client_id': client_id, 'path': request.path, 'count': len(requests)
                })
                return jsonify({'error': '请求过于频繁，请稍后再试', 'code': 'RATE_LIMIT_EXCEEDED'}), 429
            
            requests.append(current_time)
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def setup_csrf_protection(app):
    """设置CSRF保护"""
    from flask_wtf.csrf import CSRFProtect
    
    csrf = CSRFProtect(app)
    
    @app.before_request
    def csrf_protect():
        """CSRF保护"""
        # 跳过某些路由
        if request.endpoint in ['auth.login', 'static']:
            return
        
        # API路由使用Token验证（在Authorization头中）
        if request.path.startswith('/api/'):
            # API使用JWT，不需要CSRF
            return
        
        # 其他路由需要CSRF令牌
        if request.method in ['POST', 'PUT', 'DELETE', 'PATCH']:
            # 这里可以添加CSRF验证逻辑
            pass


def setup_request_logging(app):
    """设置请求日志"""
    @app.before_request
    def log_request():
        g.start_time = time.time()
    
    @app.after_request
    def log_response(response):
        if hasattr(g, 'start_time'):
            user = (g.current_user.get('username') if hasattr(g, 'current_user') and g.current_user else None)
            logger.log_access(
                method=request.method, path=request.path, ip=request.remote_addr,
                user=user, status_code=response.status_code
            )
        return response


def setup_error_handling(app):
    """设置错误处理"""
    @app.errorhandler(404)
    def not_found(error):
        logger.log_security_event('404_error', {'path': request.path, 'ip': request.remote_addr})
        return jsonify({'error': '资源不存在', 'code': 'NOT_FOUND'}), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        logger.log_error('500_error', {'path': request.path, 'ip': request.remote_addr, 'error': str(error)})
        return jsonify({'error': '服务器内部错误', 'code': 'INTERNAL_ERROR'}), 500
    
    @app.errorhandler(403)
    def forbidden(error):
        logger.log_security_event('403_error', {'path': request.path, 'ip': request.remote_addr})
        return jsonify({'error': '访问被拒绝', 'code': 'FORBIDDEN'}), 403
    
    @app.errorhandler(401)
    def unauthorized(error):
        return jsonify({'error': '需要认证', 'code': 'UNAUTHORIZED'}), 401
