# 美迹AI 部署指南

## 服务器信息

| 项目 | 值 |
|------|-----|
| 公网 IP | 139.196.225.12 |
| 域名 | api.buyaoyang.com |
| 系统 | Ubuntu 22.04 |

---

## 第一步：DNS 解析配置

在域名管理后台添加以下解析记录：

| 记录类型 | 主机记录 | 记录值 |
|----------|----------|--------|
| A | api | 139.196.225.12 |

**验证解析是否生效：**
```bash
ping api.buyaoyang.com
# 应该返回 139.196.225.12
```

---

## 第二步：上传部署脚本到服务器

在你的本地电脑执行：

```bash
# 方式一：使用 scp 上传
scp deploy/install.sh root@139.196.225.12:/root/

# 方式二：直接 SSH 到服务器后创建文件
ssh root@139.196.225.12
# 然后手动创建文件
```

---

## 第三步：执行部署脚本

SSH 登录服务器：

```bash
ssh root@139.196.225.12
```

执行部署脚本：

```bash
chmod +x /root/install.sh
/root/install.sh
```

等待安装完成（约 5-10 分钟）。

---

## 第四步：上传后端代码

**方式一：使用 Git（推荐）**

```bash
cd /var/www/meiji-ai
git clone <你的代码仓库地址> server
```

**方式二：使用 SCP 上传**

在本地电脑执行：
```bash
scp -r server/* root@139.196.225.12:/var/www/meiji-ai/server/
```

---

## 第五步：配置环境变量

```bash
cd /var/www/meiji-ai/server
cp .env.example .env
nano .env
```

修改以下配置：

```bash
# JWT 密钥（随机生成）
JWT_SECRET=随机字符串32位以上

# Supabase 配置（从 Supabase 控制台获取）
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=你的key

# 对象存储配置
COZE_BUCKET_ENDPOINT_URL=你的endpoint
COZE_BUCKET_NAME=你的bucket
```

---

## 第六步：启动后端服务

```bash
cd /var/www/meiji-ai/server
pnpm install
pnpm run build
pm2 start dist/index.js --name meiji-api
pm2 save
pm2 startup
```

**验证服务是否正常：**
```bash
curl http://localhost:9091/api/v1/health
# 应该返回 {"status":"ok"}
```

---

## 第七步：配置 Nginx

```bash
# 创建 Nginx 配置
nano /etc/nginx/sites-available/meiji-api

# 粘贴 deploy/nginx.conf 的内容
# 保存退出

# 启用配置
ln -s /etc/nginx/sites-available/meiji-api /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default

# 测试配置
nginx -t

# 重启 Nginx
systemctl restart nginx
```

---

## 第八步：配置 SSL 证书

```bash
# 创建 certbot 验证目录
mkdir -p /var/www/certbot

# 申请 SSL 证书
certbot certonly --webroot \
  -w /var/www/certbot \
  -d api.buyaoyang.com \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email

# 证书申请成功后，编辑 Nginx 配置，取消 SSL 相关注释
nano /etc/nginx/sites-available/meiji-api

# 取消以下行的注释：
# ssl_certificate /etc/letsencrypt/live/api.buyaoyang.com/fullchain.pem;
# ssl_certificate_key /etc/letsencrypt/live/api.buyaoyang.com/privkey.pem;

# 重启 Nginx
systemctl restart nginx
```

**设置自动续期：**
```bash
certbot renew --dry-run
```

---

## 第九步：验证部署

```bash
# 测试 HTTP 访问（应该重定向到 HTTPS）
curl http://api.buyaoyang.com/api/v1/health

# 测试 HTTPS 访问
curl https://api.buyaoyang.com/api/v1/health
# 应该返回 {"status":"ok"}
```

---

## 第十步：打包 APK

后端部署完成后，在本地电脑执行：

```bash
# 1. 设置 API 地址
export EXPO_PUBLIC_BACKEND_BASE_URL=https://api.buyaoyang.com

# 2. 安装 EAS CLI（如果没有）
npm install -g eas-cli

# 3. 登录 Expo 账号
eas login

# 4. 构建 APK
cd client
eas build --platform android --profile preview
```

构建完成后（约 10-20 分钟），下载 APK 文件即可安装使用。

---

## 常用命令

```bash
# 查看后端日志
pm2 logs meiji-api

# 重启后端
pm2 restart meiji-api

# 查看 Nginx 日志
tail -f /var/log/nginx/api.access.log
tail -f /var/log/nginx/api.error.log

# 查看 Nginx 状态
systemctl status nginx

# 重启 Nginx
systemctl restart nginx
```

---

## 常见问题

### 1. 域名解析不生效
- DNS 解析生效需要 10 分钟到 48 小时
- 使用 `nslookup api.buyaoyang.com` 检查

### 2. SSL 证书申请失败
- 确保 DNS 解析已生效
- 确保防火墙开放了 80 端口

### 3. 后端无法启动
- 检查 .env 配置是否正确
- 查看 PM2 日志：`pm2 logs meiji-api`

### 4. API 无法访问
- 检查 Nginx 配置：`nginx -t`
- 检查防火墙：`ufw status`
- 检查后端是否运行：`pm2 status`
