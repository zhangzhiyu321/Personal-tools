#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""测试路由注册"""

import os
import sys

# 设置环境变量（避免数据库错误）
os.environ.setdefault('FLASK_ENV', 'development')

try:
    from app import create_app
    
    app = create_app()
    
    print("=" * 60)
    print("应用创建成功！")
    print("=" * 60)
    print("\n注册的认证路由:")
    print("-" * 60)
    
    auth_routes = []
    for rule in app.url_map.iter_rules():
        if '/api/auth' in rule.rule:
            auth_routes.append((rule.rule, rule.methods, rule.endpoint))
    
    if auth_routes:
        for rule, methods, endpoint in sorted(auth_routes):
            methods_str = ', '.join([m for m in methods if m not in ['HEAD', 'OPTIONS']])
            print(f"  {rule:40} [{methods_str:15}] -> {endpoint}")
    else:
        print("  ❌ 没有找到认证路由！")
    
    print("\n" + "=" * 60)
    print("所有路由:")
    print("-" * 60)
    for rule in sorted(app.url_map.iter_rules(), key=lambda x: x.rule):
        if rule.rule.startswith('/api/') or rule.rule.startswith('/tools/'):
            methods_str = ', '.join([m for m in rule.methods if m not in ['HEAD', 'OPTIONS']])
            print(f"  {rule.rule:50} [{methods_str:15}]")
    
except Exception as e:
    print(f"❌ 错误: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
