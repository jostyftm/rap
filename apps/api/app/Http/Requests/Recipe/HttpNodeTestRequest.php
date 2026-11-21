<?php

declare(strict_types=1);

namespace App\Http\Requests\Recipe;

use Illuminate\Foundation\Http\FormRequest;

class HttpNodeTestRequest extends FormRequest
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
            'method' => ['required', 'string', 'in:GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS'],
            'url' => ['required', 'string', 'max:4096'],
            'pathParams' => ['nullable', 'array'],
            'pathParams.*.key' => ['required_with:pathParams', 'string', 'max:200'],
            'pathParams.*.value' => ['nullable', 'string', 'max:4096'],
            'pathParams.*.enabled' => ['nullable', 'boolean'],
            'queryParams' => ['nullable', 'array'],
            'queryParams.*.key' => ['required_with:queryParams', 'string', 'max:200'],
            'queryParams.*.value' => ['nullable', 'string', 'max:4096'],
            'queryParams.*.enabled' => ['nullable', 'boolean'],
            'headers' => ['nullable', 'array'],
            'headers.*.key' => ['required_with:headers', 'string', 'max:200'],
            'headers.*.value' => ['nullable', 'string', 'max:8192'],
            'headers.*.enabled' => ['nullable', 'boolean'],
            'auth' => ['nullable', 'array'],
            'auth.type' => ['nullable', 'string', 'in:none,bearer,basic,apiKey'],
            'auth.token' => ['nullable', 'string', 'max:4096'],
            'auth.username' => ['nullable', 'string', 'max:1024'],
            'auth.password' => ['nullable', 'string', 'max:4096'],
            'auth.keyName' => ['nullable', 'string', 'max:256'],
            'auth.keyValue' => ['nullable', 'string', 'max:4096'],
            'auth.in' => ['nullable', 'string', 'in:header,query'],
            'bodyType' => ['nullable', 'string', 'in:none,json,formUrlEncoded,multipart,raw,binary'],
            'bodyJson' => ['nullable', 'string', 'max:1048576'],
            'bodyForm' => ['nullable', 'array'],
            'bodyForm.*.key' => ['required_with:bodyForm', 'string', 'max:200'],
            'bodyForm.*.value' => ['nullable', 'string', 'max:8192'],
            'bodyForm.*.enabled' => ['nullable', 'boolean'],
            'bodyMultipart' => ['nullable', 'array'],
            'bodyMultipart.*.key' => ['required_with:bodyMultipart', 'string', 'max:200'],
            'bodyMultipart.*.value' => ['nullable', 'string', 'max:10485760'],
            'bodyMultipart.*.fieldType' => ['nullable', 'string', 'in:text,fileBase64'],
            'bodyMultipart.*.filename' => ['nullable', 'string', 'max:255'],
            'bodyMultipart.*.contentType' => ['nullable', 'string', 'max:120'],
            'bodyMultipart.*.enabled' => ['nullable', 'boolean'],
            'bodyRaw' => ['nullable', 'string', 'max:1048576'],
            'rawContentType' => ['nullable', 'string', 'max:120'],
            'bodyBinaryBase64' => ['nullable', 'string', 'max:10485760'],
            'binaryContentType' => ['nullable', 'string', 'max:120'],
            'responseType' => ['nullable', 'string', 'in:auto,json,text,xml,binary,headersOnly'],
            'timeoutMs' => ['nullable', 'integer', 'between:500,60000'],
            'followRedirects' => ['nullable', 'boolean'],
            'failOnHttpError' => ['nullable', 'boolean'],
        ];
    }
}
