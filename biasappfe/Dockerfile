# Stage 1: Build Vue 3 App
FROM node:22-alpine AS build-stage

# Set working directory
WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable

# Copy package files & install dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/pnpm-store \
    pnpm config set store-dir /pnpm-store && \
    pnpm install --frozen-lockfile

# Copy seluruh source code
COPY . .

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Build aplikasi Vue 3 untuk production (vite only, no type-check)
RUN pnpm exec vite build


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
