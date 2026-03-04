FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY init.sql ./
COPY src/ ./src/
COPY public/ ./public/

RUN npm run build

EXPOSE 5000

CMD ["node", "dist/server.js"]
