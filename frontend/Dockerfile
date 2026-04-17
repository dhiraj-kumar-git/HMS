# Stage 1: Build robust static bundle via Node
FROM node:18-alpine as builder

WORKDIR /app

COPY package*.json ./
RUN npm install

# Inject React URL build argument
ARG REACT_APP_BASE_URL
ENV REACT_APP_BASE_URL=$REACT_APP_BASE_URL

COPY . .
RUN npm run build

# Stage 2: Deploy statically using NGINX Server
FROM nginx:alpine

# Purge default static assets just in case
RUN rm -rf /usr/share/nginx/html/*

# Copy the static production build bundle from Stage 1
COPY --from=builder /app/build /usr/share/nginx/html

# Overwrite Nginx default configuration snippet to support Frontend Router (falling back to index.html)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Port 80 for proxy
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
