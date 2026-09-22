# syntax=docker/dockerfile:1
FROM node:22-alpine

WORKDIR /app

# 无构建步骤：纯静态 + Node 代理服务
COPY package.json ./
COPY server.js ./
COPY index.html favicon.svg ./
COPY css ./css
COPY js ./js
COPY .env.example ./

ENV NODE_ENV=production
ENV PORT=8747
ENV HOST=0.0.0.0

EXPOSE 8747

# 密钥在运行时通过 -e / compose env_file 注入，不进镜像
USER node

# Phase 11 健康检查：调用 /api/ready 轻量端点（不读 Key、无令牌校验）
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
