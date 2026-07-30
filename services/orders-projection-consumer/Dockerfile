FROM node:24.16.0-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 3003

CMD ["node", "src/index.js"]
