#!/bin/sh
set -e

NGINX_PORT="${PORT:-80}"
BACKEND_PORT="${BACKEND_PORT:-9001}"
AUTH_SERVER="${AUTH_SERVER:-http://localhost:${BACKEND_PORT}}"

echo "=== Standalone Container Starting ==="
echo "Nginx port:   ${NGINX_PORT}"
echo "Backend port: ${BACKEND_PORT}"
echo "Auth server:  ${AUTH_SERVER}"

# Generate Nginx config from template
export PORT="$NGINX_PORT" AUTH_SERVER
envsubst '${PORT} ${AUTH_SERVER}' < /etc/nginx/templates/default.conf.template > /etc/nginx/http.d/default.conf

# Start backend
cd /home/app/srv
ENV="${ENV:-production}" PORT="$BACKEND_PORT" npm run start:prod &
BACKEND_PID=$!

# Wait for backend
echo "Waiting for backend..."
until wget -q --spider "http://localhost:${BACKEND_PORT}/api/v1/health-check" 2>/dev/null; do
    sleep 2
done
echo "Backend is ready!"

# Start Nginx
mkdir -p /run/nginx
echo "Starting Nginx on port ${NGINX_PORT}..."
nginx -g 'daemon off;' &
NGINX_PID=$!

echo "=== Standalone Container Ready ==="

# Shut down both if either exits
trap 'kill $BACKEND_PID $NGINX_PID 2>/dev/null; exit 0' TERM INT
wait -n "$BACKEND_PID" "$NGINX_PID" 2>/dev/null
kill $BACKEND_PID $NGINX_PID 2>/dev/null
