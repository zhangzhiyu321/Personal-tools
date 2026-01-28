#!/usr/bin/env python3
"""
安全设置脚本
用于首次部署时设置安全配置
"""

import os
import sys
from pathlib import Path

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from security.config import SecurityConfig
from security.auth import AuthManager
from security.encryption import EncryptionManager


def setup_security():
    """设置安全配置"""
    print("🔒 开始安全配置...")
    
    # 1. 确保密钥目录存在
    SecurityConfig.ensure_keys_dir()
    print("✓ 密钥目录已创建")
    
    # 2. 生成密钥
    secret_key = SecurityConfig.get_or_create_secret_key()
    encryption_key = SecurityConfig.get_or_create_encryption_key()
    print("✓ 密钥已生成")
    
    # 3. 设置密钥文件权限
    try:
        os.chmod(SecurityConfig.SECRET_KEY_FILE, 0o600)
        os.chmod(SecurityConfig.ENCRYPTION_KEY_FILE, 0o600)
        os.chmod(SecurityConfig.KEYS_DIR, 0o700)
        print("✓ 密钥文件权限已设置")
    except Exception as e:
        print(f"⚠️  设置权限失败: {e}")
    
    # 4. 生成管理员密码哈希
    print("\n📝 管理员账户配置:")
    username = input("请输入管理员用户名 (默认: admin): ").strip() or "admin"
    password = input("请输入管理员密码: ").strip()
    
    if not password:
        print("❌ 密码不能为空")
        return
    
    if len(password) < 8:
        print("⚠️  警告: 密码长度少于8位，建议使用更强的密码")
        confirm = input("是否继续? (y/N): ").strip().lower()
        if confirm != 'y':
            return
    
    password_hash = AuthManager.hash_password(password)
    print(f"\n✓ 密码哈希已生成")
    print(f"\n请将以下内容添加到 .env 文件:")
    print(f"ADMIN_USERNAME={username}")
    print(f"ADMIN_PASSWORD_HASH={password_hash}")
    
    # 5. 加密数据库URI（可选）
    print("\n🔐 数据库URI加密 (可选):")
    encrypt_uri = input("是否加密数据库连接字符串? (y/N): ").strip().lower()
    
    if encrypt_uri == 'y':
        db_uri = input("请输入数据库连接字符串: ").strip()
        if db_uri:
            enc_manager = EncryptionManager()
            encrypted_uri = enc_manager.encrypt(db_uri)
            print(f"\n✓ 加密后的URI:")
            print(f"EXPENSE_TRACKER_DB_URI=encrypted:{encrypted_uri}")
            print("\n请将上述内容添加到 .env 文件")
    
    print("\n✅ 安全配置完成!")
    print("\n📋 下一步:")
    print("1. 创建 .env 文件并配置环境变量")
    print("2. 设置密钥文件权限: chmod 600 .security/*")
    print("3. 启动应用: python app.py")


if __name__ == "__main__":
    try:
        setup_security()
    except KeyboardInterrupt:
        print("\n\n❌ 已取消")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
