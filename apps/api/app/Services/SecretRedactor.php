<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Enmascara valores secretos antes de persistir o emitir logs.
 *
 * Es una segunda línea de defensa: el Runner ya redacta en origen, pero la API
 * nunca debe almacenar un secreto aunque el Runner falle al hacerlo.
 */
final class SecretRedactor
{
    public const MASK = '***';

    private const MIN_LENGTH = 4;

    /** @var list<string> */
    private array $values = [];

    /** @param array<string,string>|list<string> $secrets */
    public function __construct(array $secrets = [])
    {
        $this->setSecrets($secrets);
    }

    /** @param array<string,string>|list<string> $secrets */
    public function setSecrets(array $secrets): void
    {
        $values = [];

        foreach ($secrets as $secret) {
            if (is_string($secret) && strlen($secret) >= self::MIN_LENGTH) {
                $values[] = $secret;
            }
        }

        // Los valores más largos primero evitan dejar fragmentos al sustituir.
        usort($values, fn (string $a, string $b): int => strlen($b) <=> strlen($a));
        $this->values = array_values(array_unique($values));
    }

    public function redact(?string $value): ?string
    {
        if ($value === null || $value === '' || $this->values === []) {
            return $value;
        }

        foreach ($this->values as $secret) {
            $value = str_replace($secret, self::MASK, $value);
            $value = str_replace(rawurlencode($secret), self::MASK, $value);
            $value = str_replace(urlencode($secret), self::MASK, $value);
        }

        return $value;
    }

    /**
     * @param  array<string,mixed>  $payload
     * @return array<string,mixed>
     */
    public function redactArray(array $payload): array
    {
        foreach ($payload as $key => $value) {
            if (is_string($value)) {
                $payload[$key] = $this->redact($value);
            } elseif (is_array($value)) {
                $payload[$key] = $this->redactArray($value);
            }
        }

        return $payload;
    }
}
