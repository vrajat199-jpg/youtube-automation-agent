FROM mcr.microsoft.com/playwright:v1.54.2-noble

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3456
ENV DB_PATH=/app/data/youtube_automation.db
ENV TMPDIR=/tmp

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
RUN mkdir -p /app/data /app/uploads /tmp \
    && chown -R pwuser:pwuser /app /tmp

USER pwuser

EXPOSE 3456

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3456/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
