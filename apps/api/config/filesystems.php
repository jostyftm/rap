<?php

$rawS3Url = trim((string) env('S3_URL', ''));
$parsedS3 = $rawS3Url !== '' ? parse_url($rawS3Url) : false;
$s3UrlEndpoint = null;
$s3UrlKey = null;
$s3UrlSecret = null;
$s3UrlBucket = null;
$s3UrlRegion = null;
$s3UrlPathStyle = null;

if (is_array($parsedS3) && ! empty($parsedS3['scheme']) && ! empty($parsedS3['host'])) {
    $s3UrlEndpoint = $parsedS3['scheme'].'://'.$parsedS3['host']
        .(isset($parsedS3['port']) ? ':'.$parsedS3['port'] : '');
    $s3UrlKey = isset($parsedS3['user']) ? rawurldecode($parsedS3['user']) : null;
    $s3UrlSecret = isset($parsedS3['pass']) ? rawurldecode($parsedS3['pass']) : null;

    $pathSegments = array_values(array_filter(explode('/', trim((string) ($parsedS3['path'] ?? ''), '/'))));
    if ($pathSegments !== []) {
        $s3UrlBucket = rawurldecode($pathSegments[0]);
    }

    if (! empty($parsedS3['query'])) {
        parse_str($parsedS3['query'], $s3Query);
        if (! empty($s3Query['region']) && is_string($s3Query['region'])) {
            $s3UrlRegion = $s3Query['region'];
        }
        if (isset($s3Query['pathStyle']) && is_string($s3Query['pathStyle'])) {
            $s3UrlPathStyle = $s3Query['pathStyle'];
        }
    }
}

return [

    /*
    |--------------------------------------------------------------------------
    | Default Filesystem Disk
    |--------------------------------------------------------------------------
    |
    | Here you may specify the default filesystem disk that should be used
    | by the framework. The "local" disk, as well as a variety of cloud
    | based disks are available to your application for file storage.
    |
    */

    'default' => env('FILESYSTEM_DISK', 'local'),

    /*
    |--------------------------------------------------------------------------
    | Filesystem Disks
    |--------------------------------------------------------------------------
    |
    | Below you may configure as many filesystem disks as necessary, and you
    | may even configure multiple disks for the same driver. Examples for
    | most supported storage drivers are configured here for reference.
    |
    | Supported drivers: "local", "ftp", "sftp", "s3"
    |
    */

    'disks' => [

        'local' => [
            'driver' => 'local',
            'root' => storage_path('app/private'),
            'serve' => true,
            'throw' => false,
            'report' => false,
        ],

        'public' => [
            'driver' => 'local',
            'root' => storage_path('app/public'),
            'url' => rtrim(env('APP_URL', 'http://localhost'), '/').'/storage',
            'visibility' => 'public',
            'throw' => false,
            'report' => false,
        ],

        's3' => [
            'driver' => 's3',
            'key' => $s3UrlKey ?: (env('AWS_ACCESS_KEY_ID') ?: env('S3_ACCESS_KEY')),
            'secret' => $s3UrlSecret ?: (env('AWS_SECRET_ACCESS_KEY') ?: env('S3_SECRET_KEY')),
            'region' => $s3UrlRegion ?: (env('AWS_DEFAULT_REGION') ?: env('S3_REGION', 'us-east-1')),
            'bucket' => $s3UrlBucket ?: (env('AWS_BUCKET') ?: env('S3_BUCKET')),
            'url' => env('AWS_URL') ?: env('S3_PUBLIC_URL'),
            'endpoint' => $s3UrlEndpoint ?: (env('AWS_ENDPOINT') ?: env('S3_ENDPOINT')),
            'use_path_style_endpoint' => filter_var(
                $s3UrlPathStyle ?? env('AWS_USE_PATH_STYLE_ENDPOINT', env('S3_FORCE_PATH_STYLE', true)),
                FILTER_VALIDATE_BOOLEAN
            ),
            'throw' => false,
            'report' => false,
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Symbolic Links
    |--------------------------------------------------------------------------
    |
    | Here you may configure the symbolic links that will be created when the
    | `storage:link` Artisan command is executed. The array keys should be
    | the locations of the links and the values should be their targets.
    |
    */

    'links' => [
        public_path('storage') => storage_path('app/public'),
    ],

];
