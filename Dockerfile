FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATA_DIR=/data/yoonseul/data
ENV UPLOAD_DIR=/data/yoonseul/uploads
ENV MAX_BODY_MB=120
ENV MAX_UPLOAD_MB=80
ENV IMAGE_MAX_WIDTH=1800
ENV IMAGE_WEBP_QUALITY=82

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY public ./public
COPY data ./data

RUN mkdir -p /data/yoonseul/data /data/yoonseul/uploads/products /app/public/uploads/products

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
