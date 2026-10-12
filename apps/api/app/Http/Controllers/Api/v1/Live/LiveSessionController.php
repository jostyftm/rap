<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\v1\Live;

use App\Http\Controllers\Controller;
use App\Models\Recipe;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

/**
 * Sesiones de "Sitio en Vivo": delega en el Runner la creación del proxy embebido
 * o del Chromium externo, y reenvía comandos del editor al navegador externo.
 */
class LiveSessionController extends Controller
{
    private function runner(): PendingRequest
    {
        return Http::baseUrl((string) config('rpa.live.url'))
            ->withHeaders(['x-rpa-live-token' => (string) config('rpa.live.token')])
            ->acceptJson()
            ->timeout(35);
    }

    private function unavailable(\Throwable $e): JsonResponse
    {
        report($e);

        return response()->json([
            'type' => 'about:blank',
            'title' => 'Runner no disponible',
            'status' => 503,
            'detail' => 'No se pudo contactar al servidor de sitio en vivo del Runner.',
        ], 503);
    }

    public function start(Request $request, Recipe $recipe): JsonResponse
    {
        $data = $request->validate(['url' => ['required', 'url', 'max:500']]);

        try {
            $res = $this->runner()->post('/live/sessions', ['url' => $data['url']]);
        } catch (\Throwable $e) {
            return $this->unavailable($e);
        }

        return response()->json($res->json(), $res->status());
    }

    public function external(Request $request, Recipe $recipe): JsonResponse
    {
        $data = $request->validate(['url' => ['required', 'url', 'max:500']]);

        try {
            $res = $this->runner()->post('/live/external', [
                'url' => $data['url'],
                'recipe_id' => $recipe->uuid,
            ]);
        } catch (\Throwable $e) {
            return $this->unavailable($e);
        }

        return response()->json($res->json(), $res->status());
    }

    public function command(Request $request, Recipe $recipe): JsonResponse
    {
        $data = $request->validate([
            'session_id' => ['required', 'string', 'max:64'],
            'message' => ['required', 'array'],
        ]);

        try {
            $res = $this->runner()->post("/live/sessions/{$data['session_id']}/command", [
                'message' => $data['message'],
            ]);
        } catch (\Throwable $e) {
            return $this->unavailable($e);
        }

        return response()->json($res->json(), $res->status());
    }

    public function stop(Request $request, Recipe $recipe): JsonResponse
    {
        $data = $request->validate(['session_id' => ['required', 'string', 'max:64']]);

        try {
            $this->runner()->delete("/live/sessions/{$data['session_id']}");
        } catch (\Throwable $e) {
            return $this->unavailable($e);
        }

        return response()->json(['status' => 'stopped']);
    }
}
