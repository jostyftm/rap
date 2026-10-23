<?php

declare(strict_types=1);

namespace App\Http\Requests\Webhook;

use Illuminate\Foundation\Http\FormRequest;

class WebhookTestListenRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'node_id' => ['required', 'string', 'max:100'],
            'path' => ['required', 'string', 'max:255', 'regex:#^/?[A-Za-z0-9/_\\-.]+$#'],
            'http_method' => ['required', 'string', 'in:ANY,GET,POST,PUT,DELETE,PATCH'],
            'response_code' => ['nullable', 'integer', 'between:100,599'],
            'response_body' => ['nullable', 'string', 'max:10240'],
        ];
    }
}
