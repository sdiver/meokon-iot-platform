FROM node:22-alpine AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=web /app/web/dist /app/web/dist
ENV DB_FILE=/data/iot.db
VOLUME /data
# HTTP / TCP / UDP / MQTT
EXPOSE 8080 9000 9001/udp 1883
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
