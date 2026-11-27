# The Awning API as a container (for hosts other than Render, or a VPS).
#   docker build -t awning-api .
#   docker run -p 4000:4000 --env-file server/.env -e NODE_ENV=production awning-api
FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci --omit=dev
COPY server ./server
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["node", "server/src/index.js"]
