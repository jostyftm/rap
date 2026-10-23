<?php

declare(strict_types=1);

namespace App\Services;

use App\Http\Requests\Secret\WorkspaceSecretCreateRequest;
use App\Models\Workspace;
use App\Models\WorkspaceSecret;
use Illuminate\Database\Eloquent\Collection;

class WorkspaceSecretService
{
    /**
     * @return Collection<int, WorkspaceSecret>
     */
    public function list(Workspace $workspace): Collection
    {
        return $workspace->secrets()->orderBy('key')->get();
    }

    public function set(WorkspaceSecretCreateRequest $request, Workspace $workspace): WorkspaceSecret
    {
        $validated = $request->validated();

        /** @var WorkspaceSecret $secret */
        $secret = WorkspaceSecret::updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'key' => $validated['key'],
            ],
            [
                'value' => $validated['value'],
                'description' => $validated['description'] ?? null,
            ]
        );

        Audit::log('secret.set', $request->user(), $workspace, $secret);

        return $secret;
    }

    public function delete(Workspace $workspace, WorkspaceSecret $secret): void
    {
        if ($secret->workspace_id === $workspace->id) {
            $secret->delete();
        }
    }

    /**
     * Retorna mapa clave => valor descifrado para ejecución en el Runner.
     *
     * @param  list<string>  $keys  Si se indica, solo resuelve esas claves
     * @return array<string, string>
     */
    public function getDecryptedForWorkspace(Workspace $workspace, array $keys = []): array
    {
        $query = WorkspaceSecret::where('workspace_id', $workspace->id);

        if ($keys !== []) {
            $query->whereIn('key', $keys);
        }

        $map = [];

        foreach ($query->get() as $secret) {
            try {
                $map[$secret->key] = $secret->getDecryptedValue();
            } catch (\Throwable $e) {
                // Si la clave no puede ser descifrada, ignorar
                report($e);
            }
        }

        return $map;
    }
}
