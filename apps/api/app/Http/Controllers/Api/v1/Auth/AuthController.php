<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\v1\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\AuthLoginRequest;
use App\Http\Requests\Auth\AuthRegisterRequest;
use App\Http\Resources\User\UserResource;
use App\Services\AuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class AuthController extends Controller
{
    public function __construct(
        private AuthService $authService
    ) {}

    /**
     * Register a new user and personal workspace
     */
    public function register(AuthRegisterRequest $request): JsonResponse
    {
        $user = $this->authService->register($request);
        $token = $user->createToken('auth-token')->plainTextToken;

        return (new UserResource($user))
            ->additional(['token' => $token])
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    /**
     * Authenticate user session
     */
    public function login(AuthLoginRequest $request): JsonResponse
    {
        $user = $this->authService->login($request);
        $token = $user->createToken('auth-token')->plainTextToken;

        return (new UserResource($user))
            ->additional(['token' => $token])
            ->response();
    }

    /**
     * Terminate active user session
     */
    public function logout(Request $request): Response
    {
        $token = $request->user()?->currentAccessToken();
        if ($token && method_exists($token, 'delete')) {
            $token->delete();
        }

        $this->authService->logout($request);

        return response()->noContent();
    }

    /**
     * Get authenticated user profile with workspaces
     */
    public function me(Request $request): UserResource
    {
        $user = $this->authService->me($request);

        return new UserResource($user);
    }
}
