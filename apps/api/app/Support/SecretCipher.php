<?php

declare(strict_types=1);

namespace App\Support;

use RuntimeException;

/**
 * Cifrado autenticado de secretos con XChaCha20-Poly1305 (libsodium).
 *
 * El valor almacenado tiene el formato "{key_id}:{base64(nonce|ciphertext)}",
 * de modo que el identificador de la clave viaja con el dato y permite rotar
 * el keyring sin migraciones ni ventanas de indisponibilidad.
 */
final class SecretCipher
{
    private const NONCE_BYTES = SODIUM_CRYPTO_SECRETBOX_NONCEBYTES;

    private const KEY_BYTES = SODIUM_CRYPTO_SECRETBOX_KEYBYTES;

    /** @param array<string,string> $keys Claves binarias indexadas por identificador */
    public function __construct(
        private array $keys,
        private string $activeKeyId
    ) {}

    public static function fromConfig(): self
    {
        $keys = [];
        $configured = config('rpa.secrets.keys', []);

        if (is_array($configured)) {
            foreach ($configured as $keyId => $encoded) {
                if (! is_string($encoded) || $encoded === '') {
                    continue;
                }

                $decoded = base64_decode($encoded, true);
                if ($decoded === false || strlen($decoded) !== self::KEY_BYTES) {
                    throw new RuntimeException("La clave '{$keyId}' del keyring de secretos no es válida.");
                }

                $keys[(string) $keyId] = $decoded;
            }
        }

        $activeKeyId = (string) config('rpa.secrets.active_key', 'app');

        if (! isset($keys[$activeKeyId])) {
            $appKey = (string) config('app.key');
            if ($appKey === '') {
                throw new RuntimeException('No hay APP_KEY ni keyring configurado para cifrar secretos.');
            }

            $keys[$activeKeyId] = hash('sha256', $appKey, true);
        }

        return new self($keys, $activeKeyId);
    }

    public function encrypt(string $plaintext): string
    {
        $nonce = random_bytes(self::NONCE_BYTES);
        $ciphertext = sodium_crypto_secretbox($plaintext, $nonce, $this->activeKey());

        return $this->activeKeyId.':'.base64_encode($nonce.$ciphertext);
    }

    public function decrypt(string $payload): string
    {
        $separator = strpos($payload, ':');
        if ($separator === false) {
            throw new RuntimeException('El secreto almacenado no tiene un formato reconocido.');
        }

        $keyId = substr($payload, 0, $separator);
        $encoded = substr($payload, $separator + 1);

        if (! isset($this->keys[$keyId])) {
            throw new RuntimeException("No existe la clave '{$keyId}' en el keyring de secretos.");
        }

        $decoded = base64_decode($encoded, true);
        if ($decoded === false || strlen($decoded) <= self::NONCE_BYTES) {
            throw new RuntimeException('El secreto almacenado está corrupto.');
        }

        $nonce = substr($decoded, 0, self::NONCE_BYTES);
        $ciphertext = substr($decoded, self::NONCE_BYTES);

        $plaintext = sodium_crypto_secretbox_open($ciphertext, $nonce, $this->keys[$keyId]);
        if ($plaintext === false) {
            throw new RuntimeException('No se pudo descifrar el secreto (clave incorrecta o dato alterado).');
        }

        return $plaintext;
    }

    public function isEncrypted(string $payload): bool
    {
        $separator = strpos($payload, ':');
        if ($separator === false) {
            return false;
        }

        return isset($this->keys[substr($payload, 0, $separator)]);
    }

    public function activeKeyId(): string
    {
        return $this->activeKeyId;
    }

    private function activeKey(): string
    {
        return $this->keys[$this->activeKeyId];
    }
}
