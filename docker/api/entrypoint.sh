#!/usr/bin/env sh
set -eu

cd /var/www/html

mkdir -p \
    storage/framework/sessions \
    storage/framework/views \
    storage/framework/cache/data \
    storage/logs \
    bootstrap/cache

chown -R www-data:www-data storage bootstrap/cache

if [ "${APP_ENV:-production}" = "production" ]; then
    su-exec www-data php artisan config:cache
    su-exec www-data php artisan view:cache
fi

if [ "${1:-serve-http}" = "serve-http" ]; then
    php-fpm -D
    exec nginx -g "daemon off;"
fi

if [ "$(id -u)" -eq 0 ]; then
    exec su-exec www-data "$@"
fi

exec "$@"
