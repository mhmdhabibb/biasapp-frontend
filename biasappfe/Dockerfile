
# Stage 1: Build Vue 3 App


FROM node:20-alpine AS build-stage

# Set working directory

WORKDIR /app

# Copy package files & install dependencies

COPY package*.json ./
RUN npm ci

# Copy seluruh source code

COPY . .

# Build aplikasi Vue 3 untuk production

RUN npm run build


# Stage 2: Serve dengan Nginx


FROM nginx:stable-alpine AS production-stage

# Copy hasil build dist dari build-stage ke folder Nginx html

COPY --from=build-stage /app/dist /usr/share/nginx/html

# Copy konfigurasi custom Nginx untuk SPA Vue Router

COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80

EXPOSE 80

# Jalankan Nginx

CMD ["nginx", "-g", "daemon off;"]