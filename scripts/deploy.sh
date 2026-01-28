#!/bin/bash

# 部署脚本 - 用于服务器上快速部署应用
# 使用方法: bash scripts/deploy.sh

set -e  # 遇到错误立即退出

echo "🚀 开始部署 Personal Tools 应用..."
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查是否在项目目录
if [ ! -f "app.py" ]; then
    echo -e "${RED}❌ 错误: 请在项目根目录运行此脚本${NC}"
    exit 1
fi

# 1. 拉取最新代码
echo -e "${YELLOW}📥 拉取最新代码...${NC}"
git pull origin main || {
    echo -e "${RED}❌ Git 拉取失败，请检查网络连接和仓库配置${NC}"
    exit 1
}
echo -e "${GREEN}✅ 代码拉取成功${NC}"
echo ""

# 2. 检查虚拟环境
echo -e "${YELLOW}🐍 检查虚拟环境...${NC}"
if [ ! -d "venv" ]; then
    echo "创建虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
source venv/bin/activate
echo -e "${GREEN}✅ 虚拟环境已激活${NC}"
echo ""

# 3. 安装/更新依赖
echo -e "${YELLOW}📦 安装依赖...${NC}"
pip install --upgrade pip
pip install -r requirements.txt
echo -e "${GREEN}✅ 依赖安装完成${NC}"
echo ""

# 4. 检查 .env 文件
echo -e "${YELLOW}⚙️  检查配置文件...${NC}"
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo "复制 .env.example 到 .env..."
        cp .env.example .env
        echo -e "${YELLOW}⚠️  请编辑 .env 文件并配置数据库连接等信息${NC}"
        echo "   使用命令: nano .env 或 vim .env"
        read -p "按 Enter 继续（确保已配置 .env 文件）..."
    else
        echo -e "${RED}❌ 未找到 .env.example 文件${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ .env 文件已存在${NC}"
fi
echo ""

# 5. 检查数据库连接（可选）
echo -e "${YELLOW}🗄️  检查数据库配置...${NC}"
if python3 -c "from dotenv import load_dotenv; import os; load_dotenv(); db_uri = os.getenv('EXPENSE_TRACKER_DB_URI'); print('数据库URI:', db_uri if db_uri else '未配置')" 2>/dev/null; then
    echo -e "${GREEN}✅ 数据库配置检查完成${NC}"
else
    echo -e "${YELLOW}⚠️  无法检查数据库配置，请手动确认${NC}"
fi
echo ""

# 6. 停止旧进程
echo -e "${YELLOW}🛑 停止旧进程...${NC}"
pkill -f "python.*app.py" 2>/dev/null && echo -e "${GREEN}✅ 旧进程已停止${NC}" || echo -e "${YELLOW}⚠️  未找到运行中的进程${NC}"
sleep 2
echo ""

# 7. 启动应用
echo -e "${YELLOW}🚀 启动应用...${NC}"
PORT=${1:-5001}  # 默认端口 5001，可通过参数指定
echo "应用将在端口 $PORT 上运行"

# 使用 nohup 后台运行
nohup python app.py $PORT > app.log 2>&1 &
APP_PID=$!

# 等待一下确保应用启动
sleep 3

# 检查进程是否还在运行
if ps -p $APP_PID > /dev/null; then
    echo -e "${GREEN}✅ 应用已启动 (PID: $APP_PID)${NC}"
    echo ""
    echo -e "${GREEN}📋 部署信息:${NC}"
    echo "   - 进程 ID: $APP_PID"
    echo "   - 端口: $PORT"
    echo "   - 日志文件: app.log"
    echo ""
    echo "查看日志: tail -f app.log"
    echo "停止应用: kill $APP_PID"
    echo "查看进程: ps aux | grep 'python.*app.py'"
else
    echo -e "${RED}❌ 应用启动失败，请查看 app.log 文件${NC}"
    tail -20 app.log
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 部署完成！${NC}"
