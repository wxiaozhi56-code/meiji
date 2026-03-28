#!/bin/bash
# 美迹AI 服务端一键部署脚本
# 使用方法：bash deploy-server.sh

set -e

INSTALL_DIR="/var/www/meiji-ai/server"

echo "=========================================="
echo "  美迹AI 服务端一键部署脚本"
echo "=========================================="

# 创建目录
echo "[1/4] 创建目录结构..."
mkdir -p $INSTALL_DIR/src/routes
mkdir -p $INSTALL_DIR/src/storage/database/shared
mkdir -p $INSTALL_DIR/src/middleware
mkdir -p $INSTALL_DIR/src/utils
mkdir -p $INSTALL_DIR/dist

# 创建 package.json
echo "[2/4] 创建配置文件..."
cat > $INSTALL_DIR/package.json << 'PKGEOF'
{
  "name": "meiji-ai-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "node build.js",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.49.10",
    "bcrypt": "^6.0.0",
    "cors": "^2.8.5",
    "express": "^5.1.0",
    "jsonwebtoken": "^9.0.2",
    "multer": "^1.4.5-lts.2",
    "uuid": "^11.1.0"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.1",
    "@types/jsonwebtoken": "^9.0.9",
    "@types/multer": "^1.4.12",
    "@types/node": "^22.14.0",
    "@types/uuid": "^10.0.0",
    "esbuild": "^0.25.2",
    "tsx": "^4.19.3",
    "typescript": "^5.8.2"
  }
}
PKGEOF

# 创建 build.js
cat > $INSTALL_DIR/build.js << 'BUILDEOF'
import * as esbuild from 'esbuild';
await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'dist/index.js',
  external: ['@supabase/supabase-js'],
  minify: true,
});
BUILDEOF

# 创建 tsconfig.json
cat > $INSTALL_DIR/tsconfig.json << 'TSEOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
TSEOF

# 创建 .env 文件
echo "[3/4] 创建环境变量文件..."
cat > $INSTALL_DIR/.env << 'ENVEOF'
PORT=9091
JWT_SECRET=5cda5e9b95268cd0308d4e6d7a9bc967ad3ee1640c5a0c74910b2c3d72def48ea942855df0d658e50a531e4911319677d94d0d6f273f89a84b0c9a09c8701329
COZE_SUPABASE_URL=YOUR_SUPABASE_URL_HERE
COZE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY_HERE
ENVEOF

echo ""
echo "=========================================="
echo "  配置文件创建完成！"
echo "=========================================="
echo ""
echo "下一步："
echo "1. 编辑 /var/www/meiji-ai/server/.env 文件"
echo "   填写你的 Supabase URL 和 Key"
echo ""
echo "   命令：nano /var/www/meiji-ai/server/.env"
echo ""
echo "2. 上传源代码文件到服务器"
echo "   需要上传的目录："
echo "   - server/src/routes/*.ts"
echo "   - server/src/storage/database/*.ts"
echo "   - server/src/middleware/*.ts"
echo "   - server/src/utils/*.ts"
echo "   - server/src/index.ts"
echo ""
echo "=========================================="
