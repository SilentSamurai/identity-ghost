FROM node:20.19.0-alpine AS build

# Set work directory
WORKDIR /home/app

# SRV
COPY ./srv/package.json             /home/app/srv/
COPY ./srv/package-lock.json        /home/app/srv/
COPY ./srv/src                      /home/app/srv/src
COPY ./srv/tsconfig.build.json      /home/app/srv/
COPY ./srv/tsconfig.json            /home/app/srv/
COPY ./srv/nest-cli.json            /home/app/srv/
COPY ./srv/users.json               /home/app/srv/
COPY ./srv/envs                     /home/app/srv/envs

# UI
COPY ./ui/package-lock.json     /home/app/ui/
COPY ./ui/package.json          /home/app/ui/
COPY ./ui/src                   /home/app/ui/src/
COPY ./ui/tsconfig.json         /home/app/ui/tsconfig.json
COPY ./ui/tsconfig.app.json     /home/app/ui/tsconfig.app.json
COPY ./ui/angular.json          /home/app/ui/angular.json

# Build backend
WORKDIR /home/app/srv
RUN npm ci && npm run build

# Build frontend
WORKDIR /home/app/ui
RUN npm ci && npm run build


# Production image
FROM node:20.19.0-alpine

RUN apk add --no-cache nginx gettext

WORKDIR /home/app/srv

# Copy backend package files and install production dependencies only
COPY ./srv/package.json ./srv/package-lock.json ./
RUN npm ci --omit=dev

# Copy backend build artifacts
COPY --from=build /home/app/srv/dist ./dist
COPY --from=build /home/app/srv/envs ./envs
COPY --from=build /home/app/srv/users.json ./users.json

# Copy Nginx configs
COPY ./ui/nginx/mime.types /etc/nginx/mime.types
COPY ./ui/nginx/templates /etc/nginx/templates

# Nginx static files
COPY --from=build /home/app/ui/dist /home/static/

# Start script
COPY scripts/start-standalone.sh /home/app/start-standalone.sh

EXPOSE 80 9001

CMD ["sh", "/home/app/start-standalone.sh"]
