FROM php:8.4.28-fpm-alpine

RUN apk add --no-cache \
    nginx \
    curl \
    su-exec \
    libpq \
    libzip \
    icu-libs \
    libsodium \
    && apk add --no-cache --virtual .build-deps \
        $PHPIZE_DEPS \
        git \
        unzip \
        libpq-dev \
        libzip-dev \
        icu-dev \
        libsodium-dev \
        linux-headers \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && docker-php-ext-install -j"$(nproc)" \
        pdo \
        pdo_pgsql \
        bcmath \
        pcntl \
        zip \
        intl \
        opcache \
    && if ! php -m | grep -qi '^sodium$'; then docker-php-ext-install sodium; fi \
    && php -r 'exit(extension_loaded("sodium") ? 0 : 1);' \
    && apk del .build-deps \
    && mkdir -p /run/nginx /var/log/nginx

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

COPY apps/api/composer.json apps/api/composer.lock ./

RUN composer install --no-interaction --prefer-dist --optimize-autoloader --no-dev --no-scripts

COPY apps/api ./

RUN composer dump-autoload --optimize --no-dev \
    && mkdir -p storage/framework/sessions storage/framework/views storage/framework/cache/data storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

COPY docker/api/php-prod.ini /usr/local/etc/php/conf.d/zz-rpa-prod.ini
COPY docker/api/zz-fpm-prod.conf /usr/local/etc/php-fpm.d/zz-rpa-prod.conf
COPY docker/api/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/api/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["serve-http"]
