FROM node:22-alpine AS build

RUN apk add --no-cache postgresql-client tzdata

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine

RUN apk add --no-cache postgresql-client tzdata

WORKDIR /app
ENV NODE_ENV=production

# Directorios de estado/respaldo (hardening base; en bind-mount prevalecen permisos del host)
RUN mkdir -p /app/license /backups && chmod 700 /app/license /backups

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/index.html ./index.html
COPY --from=build /app/styles.css ./styles.css

EXPOSE 3000

CMD ["node", "dist/main.js"]