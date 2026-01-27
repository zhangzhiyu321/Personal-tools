#!/bin/bash
# 服务器诊断脚本 - 检查路由配置和运行状态

echo "=== 检查服务器上的路由配置 ==="
echo ""

# 检查 Blueprint 注册
echo "1. 检查 Blueprint 注册..."
ssh root@118.190.134.93 "cd /opt/Personal_tools && python3 -c \"
from app import create_app
app = create_app()
print('已注册的 Blueprint:')
for bp in app.blueprints.values():
    print(f'  - {bp.name}: url_prefix={bp.url_prefix}')
\""

echo ""
echo "2. 检查路由列表..."
ssh root@118.190.134.93 "cd /opt/Personal_tools && python3 -c \"
from app import create_app
app = create_app()
print('所有路由:')
for rule in app.url_map.iter_rules():
    print(f'  {rule.rule} -> {rule.endpoint}')
\""

echo ""
echo "3. 检查应用日志（最近20行）..."
ssh root@118.190.134.93 "cd /opt/Personal_tools && tail -20 app.log"

echo ""
echo "4. 检查进程状态..."
ssh root@118.190.134.93 "ps aux | grep 'python.*app.py' | grep -v grep"

echo ""
echo "5. 测试路由..."
ssh root@118.190.134.93 "curl -s -o /dev/null -w 'HTTP状态码: %{http_code}\n' http://127.0.0.1:5001/tools/expense_tracker"
