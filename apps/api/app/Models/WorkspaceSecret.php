<?php

declare(strict_types=1);

namespace App\Models;

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
     * Mutator para cifrar el valor antes de guardar
     */
    public function setValueAttribute(string $value): void
    {
        $this->attributes['value'] = Crypt::encryptString($value);
    }

    /**
     * Accesor para obtener el valor descifrado explícitamente
     */
    public function getDecryptedValue(): string
    {
        return Crypt::decryptString($this->attributes['value']);
    }
}
