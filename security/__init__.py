"""
安全模块 - 提供加密、认证、授权等安全功能
"""

from .config import SecurityConfig
from .encryption import EncryptionManager
from .validation import InputValidator
from .logging import SecurityLogger

# 唯一的安全日志实例，必须在 import .auth 之前创建，供全项目复用
security_logger = SecurityLogger()

from .auth import AuthManager, require_auth, require_admin

__all__ = [
    'SecurityConfig',
    'EncryptionManager',
    'AuthManager',
    'require_auth',
    'require_admin',
    'InputValidator',
    'SecurityLogger',
    'security_logger',
]
