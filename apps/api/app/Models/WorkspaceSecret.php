<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\SecretCipher;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Crypt;

class WorkspaceSecret extends Model
{
    use HasUuids;

    protected $fillable = [
        'workspace_id',
        'key',
        'value',
        'description',
    ];

    /**
     * Ocultar el valor cifrado en serializaciones normales
     */
    protected $hidden = [
        'value',
    ];

    /** @return list<string> */
    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    /** @return BelongsTo<Workspace, $this> */
    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    /**
     * Cifra el valor con el keyring activo (XChaCha20-Poly1305).
     */
    public function setValueAttribute(string $value): void
    {
        $this->attributes['value'] = app(SecretCipher::class)->encrypt($value);
    }

    /**
     * Descifra el valor y migra de forma perezosa los datos heredados
     * cifrados con Crypt (AES-256-CBC) al keyring actual.
     */
    public function getDecryptedValue(): string
    {
        $cipher = app(SecretCipher::class);
        $stored = (string) $this->attributes['value'];

        if ($cipher->isEncrypted($stored)) {
            return $cipher->decrypt($stored);
        }

        $plaintext = Crypt::decryptString($stored);

        if ($this->exists) {
            $this->attributes['value'] = $cipher->encrypt($plaintext);
            $this->saveQuietly();
        }

        return $plaintext;
    }
}
