FROM php:8.4-cli-alpine

# Instalar dependencias del sistema y extensiones de PHP requeridas
RUN apk add --no-cache \
    curl \
    git \
    unzip \
    libpq-dev \
    libzip-dev \
    icu-dev \
    linux-headers \
    $PHPIZE_DEPS \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && docker-php-ext-install -j$(nproc) \
        pdo \
        pdo_pgsql \
        bcmath \
        pcntl \
        zip \
        intl \
        opcache \
    && apk del $PHPIZE_DEPS

# Instalar Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Copiar archivos de dependencias
COPY apps/api/composer.json apps/api/composer.lock ./

# Instalar dependencias sin scripts de dev
RUN composer install --no-interaction --prefer-dist --optimize-autoloader --no-dev --no-scripts

# Copiar el código fuente
COPY apps/api ./

# Generar autoloader y optimizaciones
RUN composer dump-autoload --optimize \
    && chown -R www-data:www-data storage bootstrap/cache

EXPOSE 8000

CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]
