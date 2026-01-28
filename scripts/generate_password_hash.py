#!/usr/bin/env python3
"""
生成密码哈希工具
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from security.auth import AuthManager

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python generate_password_hash.py <密码>")
        sys.exit(1)
    
    password = sys.argv[1]
    password_hash = AuthManager.hash_password(password)
    print(password_hash)
