"""
加密模块
提供数据加密、解密功能
"""

import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.backends import default_backend
from .config import SecurityConfig


class EncryptionManager:
    """加密管理器"""
    
    def __init__(self):
        self.key = self._derive_key()
        self.cipher = Fernet(self.key)
    
    def _derive_key(self) -> bytes:
        """从主密钥派生Fernet密钥"""
        master_key = SecurityConfig.get_or_create_encryption_key()
        
        # 使用PBKDF2派生32字节密钥
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b'personal_tools_salt_2026',  # 固定salt（生产环境应使用随机salt）
            iterations=100000,
            backend=default_backend()
        )
        key = base64.urlsafe_b64encode(kdf.derive(master_key))
        return key
    
    def encrypt(self, data: str) -> str:
        """加密字符串数据"""
        if not data:
            return ""
        encrypted = self.cipher.encrypt(data.encode('utf-8'))
        return base64.urlsafe_b64encode(encrypted).decode('utf-8')
    
    def decrypt(self, encrypted_data: str) -> str:
        """解密字符串数据"""
        if not encrypted_data:
            return ""
        try:
            decoded = base64.urlsafe_b64decode(encrypted_data.encode('utf-8'))
            decrypted = self.cipher.decrypt(decoded)
            return decrypted.decode('utf-8')
        except Exception as e:
            raise ValueError(f"解密失败: {str(e)}")
    
    def encrypt_dict(self, data: dict) -> dict:
        """加密字典中的敏感字段"""
        sensitive_fields = ['password', 'secret', 'token', 'key', 'uri', 'connection_string']
        encrypted = data.copy()
        
        for key, value in encrypted.items():
            if any(sensitive in key.lower() for sensitive in sensitive_fields):
                if isinstance(value, str) and value:
                    encrypted[key] = self.encrypt(value)
        
        return encrypted
    
    def decrypt_dict(self, data: dict) -> dict:
        """解密字典中的敏感字段"""
        sensitive_fields = ['password', 'secret', 'token', 'key', 'uri', 'connection_string']
        decrypted = data.copy()
        
        for key, value in decrypted.items():
            if any(sensitive in key.lower() for sensitive in sensitive_fields):
                if isinstance(value, str) and value:
                    try:
                        decrypted[key] = self.decrypt(value)
                    except:
                        pass  # 如果解密失败，保持原值
        
        return decrypted
