FROM node:12-alpine as base
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

FROM base as test
RUN npm test

FROM base as app
CMD ["./node_modules/nodemon/bin/nodemon.js", "server.js"]