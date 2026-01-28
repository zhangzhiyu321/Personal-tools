# 部署指南

本文档详细说明如何将代码推送到 Git 仓库，并在服务器上部署应用。

## 📋 目录

1. [本地准备和推送代码](#1-本地准备和推送代码)
2. [服务器上拉取和配置](#2-服务器上拉取和配置)
3. [服务器上运行应用](#3-服务器上运行应用)
4. [常见问题排查](#4-常见问题排查)

---

## 1. 本地准备和推送代码

### 1.1 检查当前状态

```bash
cd "/Users/zhangzhiyu/Desktop/小工具/Personal_tools"
git status
```

### 1.2 添加所有更改的文件

```bash
# 添加所有修改和新文件
git add .

# 或者选择性添加
git add .gitignore
git add app.py
git add requirements.txt
git add tools/expense_tracker/
git add security/
git add scripts/
git add .env.example
git add test_routes.py
```

### 1.3 提交更改

```bash
git commit -m "添加安全模块、用户系统和文件上传修复"
```

**提交信息建议：**
- `"修复文件上传功能，添加FormData支持"`
- `"添加用户认证系统和数据隔离"`
- `"优化频率限制和错误处理"`

### 1.4 推送到远程仓库

```bash
git push origin main
```

如果遇到冲突，先拉取远程更改：
```bash
git pull origin main
# 解决冲突后
git push origin main
```

---

## 2. 服务器上拉取和配置

### 2.1 连接到服务器

```bash
ssh root@your-server-ip
# 或使用你的用户名
ssh username@your-server-ip
```

### 2.2 进入项目目录

```bash
cd /opt/Personal_tools
# 或你的项目目录
```

### 2.3 拉取最新代码

```bash
# 如果项目已存在，先拉取更新
git pull origin main

# 如果是新项目，克隆仓库
# git clone https://github.com/zhangzhiyu321/Personal-tools.git /opt/Personal_tools
# cd /opt/Personal_tools
```

### 2.4 创建虚拟环境（如果还没有）

```bash
# 创建虚拟环境
python3 -m venv venv

# 激活虚拟环境
source venv/bin/activate
```

### 2.5 安装依赖

```bash
# 确保在虚拟环境中
pip install --upgrade pip
pip install -r requirements.txt
```

### 2.6 配置环境变量

#### 2.6.1 创建 `.env` 文件

```bash
# 复制示例文件
cp .env.example .env

# 编辑 .env 文件
nano .env
# 或使用 vim
# vim .env
```

#### 2.6.2 配置 `.env` 文件内容

```env
# Flask 配置
FLASK_SECRET_KEY=你的随机密钥（至少32个字符）
FLASK_ENV=production
FLASK_DEBUG=False

# 数据库配置
EXPENSE_TRACKER_DB_URI=mysql+pymysql://用户名:密码@localhost:3306/数据库名?charset=utf8mb4

# 示例：
# EXPENSE_TRACKER_DB_URI=mysql+pymysql://root:yourpassword@localhost:3306/expense_tracker?charset=utf8mb4

# 安全配置（可选，用于加密敏感数据）
ENCRYPTION_KEY=你的32字节加密密钥（base64编码）
```

**生成密钥的方法：**

```bash
# 生成 Flask SECRET_KEY（32个字符）
python3 -c "import secrets; print(secrets.token_hex(16))"

# 生成加密密钥（32字节，base64编码）
python3 -c "import secrets, base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"
```

#### 2.6.3 设置文件权限

```bash
# 确保 .env 文件权限安全（仅所有者可读）
chmod 600 .env
```

### 2.7 初始化数据库

#### 2.7.1 确保 MySQL 已安装并运行

```bash
# 检查 MySQL 状态
systemctl status mysql
# 或
systemctl status mariadb

# 如果未运行，启动 MySQL
systemctl start mysql
```

#### 2.7.2 创建数据库

```bash
# 登录 MySQL
mysql -u root -p

# 在 MySQL 中执行
CREATE DATABASE IF NOT EXISTS expense_tracker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'your_username'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON expense_tracker.* TO 'your_username'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

#### 2.7.3 初始化数据库表

```bash
# 确保在项目目录和虚拟环境中
cd /opt/Personal_tools
source venv/bin/activate

# 运行初始化脚本（如果存在）
python scripts/init_db.py

# 或直接运行应用，它会自动初始化数据库
python app.py 5001
# 按 Ctrl+C 停止，然后继续下一步
```

### 2.8 创建安全目录（如果需要）

```bash
# 创建安全目录存储密钥
mkdir -p .security
chmod 700 .security

# 如果需要生成密钥文件，运行：
# python scripts/generate_keys.py
```

---

## 3. 服务器上运行应用

### 3.1 使用 nohup 后台运行（推荐）

```bash
cd /opt/Personal_tools
source venv/bin/activate

# 停止之前的进程（如果有）
pkill -f "python.*app.py"

# 后台运行应用
nohup python app.py 5001 > app.log 2>&1 &

# 查看进程
ps aux | grep "python.*app.py"

# 查看日志
tail -f app.log
```

### 3.2 使用 systemd 服务（更专业的方式）

#### 3.2.1 创建服务文件

```bash
sudo nano /etc/systemd/system/personal-tools.service
```

#### 3.2.2 服务文件内容

```ini
[Unit]
Description=Personal Tools Flask Application
After=network.target mysql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/Personal_tools
Environment="PATH=/opt/Personal_tools/venv/bin"
ExecStart=/opt/Personal_tools/venv/bin/python /opt/Personal_tools/app.py 5001
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

#### 3.2.3 启动服务

```bash
# 重新加载 systemd
sudo systemctl daemon-reload

# 启动服务
sudo systemctl start personal-tools

# 设置开机自启
sudo systemctl enable personal-tools

# 查看状态
sudo systemctl status personal-tools

# 查看日志
sudo journalctl -u personal-tools -f
```

### 3.3 配置 Nginx 反向代理（可选但推荐）

#### 3.3.1 安装 Nginx

```bash
sudo apt update
sudo apt install nginx -y
```

#### 3.3.2 创建 Nginx 配置

```bash
sudo nano /etc/nginx/sites-available/personal-tools
```

#### 3.3.3 Nginx 配置内容

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 替换为你的域名或IP

    # 如果需要 HTTPS，取消下面的注释并配置 SSL
    # listen 443 ssl;
    # ssl_certificate /path/to/cert.pem;
    # ssl_certificate_key /path/to/key.pem;

    client_max_body_size 50M;  # 允许上传大文件

    location / {
        proxy_pass http://127.0.0.1:5001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 静态文件缓存（可选）
    location /static/ {
        alias /opt/Personal_tools/tools/expense_tracker/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

#### 3.3.4 启用配置

```bash
# 创建符号链接
sudo ln -s /etc/nginx/sites-available/personal-tools /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

### 3.4 配置防火墙

```bash
# 如果使用 UFW
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 5001/tcp  # 如果直接访问 Flask
sudo ufw enable

# 如果使用 firewalld
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --permanent --add-port=5001/tcp
sudo firewall-cmd --reload
```

---

## 4. 常见问题排查

### 4.1 应用无法启动

**检查日志：**
```bash
tail -f app.log
# 或
sudo journalctl -u personal-tools -f
```

**常见错误：**

1. **数据库连接失败**
   - 检查 `.env` 文件中的数据库配置
   - 确认 MySQL 服务正在运行：`systemctl status mysql`
   - 测试数据库连接：`mysql -u username -p database_name`

2. **模块未找到**
   - 确认虚拟环境已激活：`which python`
   - 重新安装依赖：`pip install -r requirements.txt`

3. **端口被占用**
   ```bash
   # 查看端口占用
   lsof -i :5001
   # 或
   netstat -tulpn | grep 5001
   # 杀死进程
   kill -9 <PID>
   ```

### 4.2 文件上传失败

- 检查 Nginx 的 `client_max_body_size` 配置
- 检查文件权限
- 查看应用日志中的错误信息

### 4.3 频率限制问题

- 等待一段时间后重试
- 检查 `security/middleware.py` 中的频率限制配置

### 4.4 更新代码后应用未更新

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 重启应用
# 如果使用 nohup
pkill -f "python.*app.py"
nohup python app.py 5001 > app.log 2>&1 &

# 如果使用 systemd
sudo systemctl restart personal-tools
```

### 4.5 查看应用运行状态

```bash
# 检查进程
ps aux | grep "python.*app.py"

# 检查端口监听
netstat -tulpn | grep 5001

# 测试应用响应
curl http://localhost:5001/tools/expense_tracker
```

---

## 5. 快速部署检查清单

- [ ] 本地代码已提交并推送到 Git
- [ ] 服务器上已拉取最新代码
- [ ] 虚拟环境已创建并激活
- [ ] 依赖已安装（`pip install -r requirements.txt`）
- [ ] `.env` 文件已配置
- [ ] 数据库已创建并配置
- [ ] 应用已启动（nohup 或 systemd）
- [ ] Nginx 已配置（如需要）
- [ ] 防火墙已配置
- [ ] 应用可以正常访问

---

## 6. 安全建议

1. **不要提交敏感信息**
   - `.env` 文件已在 `.gitignore` 中
   - 不要在代码中硬编码密码或密钥

2. **使用 HTTPS**
   - 配置 SSL 证书（Let's Encrypt 免费）
   - 强制 HTTPS 重定向

3. **定期备份数据库**
   ```bash
   mysqldump -u username -p expense_tracker > backup_$(date +%Y%m%d).sql
   ```

4. **更新系统**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

5. **监控日志**
   - 定期检查应用日志
   - 设置日志轮转

---

## 7. 联系和支持

如果遇到问题，请检查：
1. 应用日志（`app.log` 或 `journalctl`）
2. Nginx 日志（`/var/log/nginx/error.log`）
3. 系统日志（`/var/log/syslog`）

---

**最后更新：** 2026-01-28
