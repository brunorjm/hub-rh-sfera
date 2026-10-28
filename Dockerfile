# Hub Sfera — imagens Docker (mesmo padrão do Portal do Fera).
#   migrator: aplica as migrations (prisma migrate deploy) e sai.
#   cron:     jobs agendados (sincronização do Twygo).
#   runner:   o app (Next.js standalone), sem root.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx --no prisma generate
RUN npm run build

# Migrations: o runner de produção não migra no boot (ver docs de deploy).
FROM node:24-alpine AS migrator
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
COPY package.json ./
RUN npx --no prisma generate
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

# Jobs agendados pelo cron do próprio container (dcron com tini como PID 1:
# use "init: true" no compose, senão o crond reinicia em laço).
FROM node:24-alpine AS cron
WORKDIR /app
RUN apk add --no-cache dcron
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
COPY src/lib/twygo.ts ./src/lib/twygo.ts
COPY tsconfig.json package.json ./
RUN npx --no prisma generate
# Twygo: todo dia às 05:00 UTC (02:00 em Brasília), o mesmo horário do pg_cron do Supabase.
RUN echo "0 5 * * * cd /app && /app/node_modules/.bin/tsx prisma/jobs/sync-twygo.ts >> /proc/1/fd/1 2>> /proc/1/fd/2" > /etc/crontabs/root
CMD ["crond", "-f", "-l", "2"]

FROM node:24-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0 NODE_ENV=production
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=5 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
