# 快速部署指南

## 🚀 本地推送代码

```bash
cd "/Users/zhangzhiyu/Desktop/小工具/Personal_tools"

# 1. 查看更改
git status

# 2. 添加所有文件
git add .

# 3. 提交
git commit -m "更新：添加安全模块和文件上传修复"

# 4. 推送
git push origin main
```

## 🖥️ 服务器上部署

### 方法一：使用自动部署脚本（推荐）

```bash
# 1. 连接到服务器
ssh root@your-server-ip

# 2. 进入项目目录
cd /opt/Personal_tools

# 3. 拉取最新代码
git pull origin main

# 4. 运行部署脚本
bash scripts/deploy.sh
```

### 方法二：手动部署

```bash
# 1. 连接到服务器
ssh root@your-server-ip

# 2. 进入项目目录
cd /opt/Personal_tools

# 3. 拉取最新代码
git pull origin main

# 4. 激活虚拟环境
source venv/bin/activate

# 5. 安装/更新依赖
pip install -r requirements.txt

# 6. 检查 .env 配置（如果还没有）
cp .env.example .env
nano .env  # 配置数据库连接

# 7. 停止旧进程
pkill -f "python.*app.py"

# 8. 启动应用
nohup python app.py 5001 > app.log 2>&1 &

# 9. 查看日志
tail -f app.log
```

## ✅ 验证部署

```bash
# 检查进程是否运行
ps aux | grep "python.*app.py"

# 测试应用
curl http://localhost:5001/tools/expense_tracker

# 查看日志
tail -f app.log
```

## 📝 重要提示

1. **首次部署**：确保已创建数据库并配置 `.env` 文件
2. **更新代码**：只需 `git pull` 然后重启应用
3. **查看日志**：使用 `tail -f app.log` 实时查看日志
4. **停止应用**：使用 `pkill -f "python.*app.py"`

## 🔧 常见问题

- **端口被占用**：`lsof -i :5001` 查看占用进程
- **数据库连接失败**：检查 `.env` 文件中的数据库配置
- **模块未找到**：确保虚拟环境已激活并安装了依赖

详细说明请查看 `DEPLOYMENT.md`
