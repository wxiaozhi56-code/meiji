#!/bin/bash

# ============================================
# 美迹AI 后端部署脚本
# 服务器：Ubuntu 22.04
# 域名：api.buyaoyang.com
# ============================================

set -e

echo "=========================================="
echo "  美迹AI 后端部署脚本"
echo "=========================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 打印函数
print_success() { echo -e "${GREEN}[✓] $1${NC}"; }
print_error() { echo -e "${RED}[✗] $1${NC}"; }
print_info() { echo -e "${YELLOW}[→] $1${NC}"; }

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then
    print_error "请使用 root 用户运行此脚本"
    exit 1
fi

# ============================================
# 1. 更新系统
# ============================================
print_info "更新系统包..."
apt update && apt upgrade -y
print_success "系统更新完成"

# ============================================
# 2. 安装 Node.js 20
# ============================================
print_info "安装 Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version
npm --version
print_success "Node.js 安装完成"

# ============================================
# 3. 安装 pnpm
# ============================================
print_info "安装 pnpm..."
npm install -g pnpm
pnpm --version
print_success "pnpm 安装完成"

# ============================================
# 4. 安装 PM2（进程管理）
# ============================================
print_info "安装 PM2..."
npm install -g pm2
print_success "PM2 安装完成"

# ============================================
# 5. 安装 Nginx
# ============================================
print_info "安装 Nginx..."
apt install -y nginx
print_success "Nginx 安装完成"

# ============================================
# 6. 安装 Certbot（SSL证书）
# ============================================
print_info "安装 Certbot..."
apt install -y certbot python3-certbot-nginx
print_success "Certbot 安装完成"

# ============================================
# 7. 创建项目目录
# ============================================
print_info "创建项目目录..."
mkdir -p /var/www/meiji-ai
mkdir -p /var/www/meiji-ai/server
mkdir -p /var/log/meiji-ai
print_success "项目目录创建完成"

# ============================================
# 8. 配置防火墙
# ============================================
print_info "配置防火墙..."
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable
print_success "防火墙配置完成"

# ============================================
# 完成
# ============================================
echo ""
echo "=========================================="
echo -e "${GREEN}基础环境安装完成！${NC}"
echo "=========================================="
echo ""
echo "接下来请执行以下步骤："
echo ""
echo "1. 将 server 代码上传到 /var/www/meiji-ai/server"
echo "   可以使用 scp 或 git clone"
echo ""
echo "2. 配置环境变量"
echo "   cd /var/www/meiji-ai/server"
echo "   cp .env.example .env"
echo "   nano .env  # 编辑配置"
echo ""
echo "3. 运行部署脚本"
echo "   cd /var/www/meiji-ai/server"
echo "   pnpm install"
echo "   pnpm run build"
echo "   pm2 start dist/index.js --name meiji-api"
echo ""
echo "4. 配置 Nginx 和 SSL"
echo "   参考 deploy/nginx.conf"
echo ""
