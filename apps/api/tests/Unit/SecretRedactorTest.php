<?php

declare(strict_types=1);

use App\Services\SecretRedactor;

it('enmascara los valores secretos en texto y contexto', function () {
    $redactor = new SecretRedactor(['PORTAL_PASSWORD' => 'Sup3rS3cret!']);

    $context = $redactor->redactArray([
        'value' => 'Sup3rS3cret!',
        'nested' => ['url' => 'https://x.test/?token=Sup3rS3cret!'],
        'duration' => 120,
    ]);

    expect($redactor->redact('login con Sup3rS3cret! falló'))
        ->toBe('login con *** falló')
        ->and($context['value'])->toBe('***')
        ->and($context['nested']['url'])->toBe('https://x.test/?token=***')
        ->and($context['duration'])->toBe(120);
});

it('enmascara también la variante codificada para URL', function () {
    $redactor = new SecretRedactor(['TOKEN' => 'a b+c/d']);

    expect($redactor->redact('x=a%20b%2Bc%2Fd'))->toBe('x=***');
});

it('ignora valores demasiado cortos para no corromper los logs', function () {
    $redactor = new SecretRedactor(['PIN' => '12']);

    expect($redactor->redact('paso 12 de 30'))->toBe('paso 12 de 30');
});
