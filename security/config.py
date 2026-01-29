"""
安全配置模块
管理密钥、加密配置、安全策略等
"""

import os
import secrets
from pathlib import Path
from typing import Optional


class SecurityConfig:
    """安全配置管理"""
    
    # 密钥文件路径
    KEYS_DIR = Path(__file__).parent.parent / '.security'
    SECRET_KEY_FILE = KEYS_DIR / 'secret_key.txt'
    ENCRYPTION_KEY_FILE = KEYS_DIR / 'encryption_key.txt'
    
    @staticmethod
    def ensure_keys_dir():
        """确保密钥目录存在"""
        SecurityConfig.KEYS_DIR.mkdir(mode=0o700, exist_ok=True)
    
    @staticmethod
    def get_or_create_secret_key() -> str:
        """获取或创建Flask密钥"""
        SecurityConfig.ensure_keys_dir()
        
        if SecurityConfig.SECRET_KEY_FILE.exists():
            return SecurityConfig.SECRET_KEY_FILE.read_text().strip()
        
        # 生成新的密钥（32字节，base64编码后约44字符）
        key = secrets.token_urlsafe(32)
        SecurityConfig.SECRET_KEY_FILE.write_text(key)
        SecurityConfig.SECRET_KEY_FILE.chmod(0o600)  # 仅所有者可读写
        return key
    
    @staticmethod
    def get_or_create_encryption_key() -> bytes:
        """获取或创建加密密钥（32字节用于AES-256）"""
        SecurityConfig.ensure_keys_dir()
        
        if SecurityConfig.ENCRYPTION_KEY_FILE.exists():
            key_hex = SecurityConfig.ENCRYPTION_KEY_FILE.read_text().strip()
            return bytes.fromhex(key_hex)
        
        # 生成新的32字节密钥
        key = secrets.token_bytes(32)
        SecurityConfig.ENCRYPTION_KEY_FILE.write_text(key.hex())
        SecurityConfig.ENCRYPTION_KEY_FILE.chmod(0o600)
        return key
    
    @staticmethod
    def get_jwt_secret() -> str:
        """获取JWT密钥"""
        env_key = os.getenv('JWT_SECRET_KEY')
        if env_key:
            return env_key
        return SecurityConfig.get_or_create_secret_key()
    
    @staticmethod
    def get_db_uri() -> Optional[str]:
        """获取数据库URI（从环境变量，加密存储）"""
        return os.getenv('EXPENSE_TRACKER_DB_URI')
    
    @staticmethod
    def get_admin_username() -> str:
        """获取管理员用户名"""
        return os.getenv('ADMIN_USERNAME', 'admin')
    
    @staticmethod
    def get_admin_password_hash() -> Optional[str]:
        """获取管理员密码哈希（从环境变量）"""
        return os.getenv('ADMIN_PASSWORD_HASH')
    
    @staticmethod
    def is_production() -> bool:
        """判断是否为生产环境"""
        return os.getenv('FLASK_ENV', 'development') == 'production'
    
    # 登录一次持续 6 个月（180 天），单位：秒
    SESSION_TIMEOUT_SIX_MONTHS = 180 * 24 * 60 * 60  # 15552000

    @staticmethod
    def get_session_timeout() -> int:
        """获取会话超时时间（秒）。默认 6 个月，JWT 与 Flask session 均使用此值。"""
        default = SecurityConfig.SESSION_TIMEOUT_SIX_MONTHS
        return int(os.getenv('SESSION_TIMEOUT', str(default)))
    
    @staticmethod
    def get_backup_enabled() -> bool:
        """是否启用自动备份"""
        return os.getenv('ENABLE_BACKUP', 'true').lower() == 'true'
    
    @staticmethod
    def get_backup_interval() -> int:
        """备份间隔（小时）"""
        return int(os.getenv('BACKUP_INTERVAL', '24'))
    
    @staticmethod
    def get_backup_retention() -> int:
        """备份保留天数"""
        return int(os.getenv('BACKUP_RETENTION', '30'))
