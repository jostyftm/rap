<?php

declare(strict_types=1);

use App\Support\SecretCipher;

function cipherKey(string $fill): string
{
    return str_repeat($fill, SODIUM_CRYPTO_SECRETBOX_KEYBYTES);
}

it('cifra y descifra con el keyring activo', function () {
    $cipher = new SecretCipher(['v1' => cipherKey('a')], 'v1');

    $payload = $cipher->encrypt('SuperSecreto123!');

    expect($payload)
        ->toStartWith('v1:')
        ->not->toContain('SuperSecreto123!')
        ->and($cipher->isEncrypted($payload))->toBeTrue()
        ->and($cipher->decrypt($payload))->toBe('SuperSecreto123!');
});

it('descifra datos antiguos tras rotar la clave activa', function () {
    $old = new SecretCipher(['v1' => cipherKey('a')], 'v1');
    $payload = $old->encrypt('rotacion');

    $rotated = new SecretCipher(['v1' => cipherKey('a'), 'v2' => cipherKey('b')], 'v2');

    expect($rotated->decrypt($payload))->toBe('rotacion')
        ->and($rotated->encrypt('nuevo'))->toStartWith('v2:');
});

it('rechaza cargas corruptas o claves desconocidas', function () {
    $cipher = new SecretCipher(['v1' => cipherKey('a')], 'v1');

    expect(fn () => $cipher->decrypt('v1:no-es-base64-valido'))->toThrow(RuntimeException::class)
        ->and(fn () => $cipher->decrypt('v9:AAAA'))->toThrow(RuntimeException::class);
});

it('no considera cifrado un payload heredado de Laravel Crypt', function () {
    $cipher = new SecretCipher(['v1' => cipherKey('a')], 'v1');

    expect($cipher->isEncrypted('eyJpdiI6Ii4uLiJ9'))->toBeFalse();
});

it('deriva una clave de APP_KEY cuando el keyring está vacío', function () {
    config([
        'rpa.secrets.keys' => [],
        'rpa.secrets.active_key' => 'app',
        'app.key' => 'base64:'.base64_encode(cipherKey('z')),
    ]);

    $cipher = SecretCipher::fromConfig();
    $payload = $cipher->encrypt('local');

    expect($payload)->toStartWith('app:')
        ->and($cipher->decrypt($payload))->toBe('local');
});
