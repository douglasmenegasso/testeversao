<?php
declare(strict_types=1);

/**
 * Endpoint legado para criar preferências do Mercado Pago.
 *
 * Segurança: nenhum segredo é versionado. Configure no ambiente do servidor:
 * - MERCADOPAGO_ACCESS_TOKEN
 * - SUPABASE_URL
 * - SUPABASE_ANON_KEY
 * - KAYLA_ALLOWED_ORIGINS (lista separada por vírgulas)
 * - KAYLA_MP_NOTIFICATION_URL
 *
 * Para novos deployments, prefira a Edge Function autenticada em
 * supabase/functions/criar-pagamento. Este endpoint existe apenas para
 * compatibilidade com hospedagens PHP.
 */

header('Content-Type: application/json; charset=utf-8');

function responder(int $status, array $payload): never {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function carregarOrigensPermitidas(): array {
    $padrao = 'https://kayla.app.br,https://douglasmenegasso.github.io';
    $origens = getenv('KAYLA_ALLOWED_ORIGINS') ?: $padrao;
    return array_values(array_filter(array_map('trim', explode(',', $origens))));
}

function configurarCors(): void {
    $origem = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origem === '') {
        return;
    }

    if (!in_array($origem, carregarOrigensPermitidas(), true)) {
        responder(403, ['error' => 'Origem não permitida']);
    }

    header('Access-Control-Allow-Origin: ' . $origem);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Max-Age: 600');
}

configurarCors();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    responder(405, ['error' => 'Método não permitido']);
}

$tokenMp = getenv('MERCADOPAGO_ACCESS_TOKEN') ?: '';
$supabaseUrl = rtrim(getenv('SUPABASE_URL') ?: '', '/');
$supabaseAnonKey = getenv('SUPABASE_ANON_KEY') ?: '';
$notificationUrl = getenv('KAYLA_MP_NOTIFICATION_URL') ?: '';

if ($tokenMp === '' || $supabaseUrl === '' || $supabaseAnonKey === '' || $notificationUrl === '') {
    responder(503, ['error' => 'Pagamento indisponível: configuração do servidor pendente']);
}

$authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (!preg_match('/^Bearer\s+(.+)$/i', $authorization, $matches)) {
    responder(401, ['error' => 'Autenticação obrigatória']);
}

$accessTokenUsuario = trim($matches[1]);
$chAuth = curl_init($supabaseUrl . '/auth/v1/user');
curl_setopt_array($chAuth, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
    CURLOPT_HTTPHEADER => [
        'apikey: ' . $supabaseAnonKey,
        'Authorization: Bearer ' . $accessTokenUsuario,
    ],
]);
$respostaAuth = curl_exec($chAuth);
$statusAuth = (int) curl_getinfo($chAuth, CURLINFO_HTTP_CODE);
curl_close($chAuth);
$usuario = $respostaAuth ? json_decode($respostaAuth, true) : null;

if ($statusAuth !== 200 || !is_array($usuario) || empty($usuario['id'])) {
    responder(401, ['error' => 'Sessão inválida ou expirada']);
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);
if (!is_array($data)) {
    responder(400, ['error' => 'Corpo JSON inválido']);
}

$planoId = (string) ($data['plano_tipo'] ?? $data['plano_id'] ?? '');
$numDispositivos = filter_var($data['num_dispositivos'] ?? 1, FILTER_VALIDATE_INT, [
    'options' => ['min_range' => 1, 'max_range' => 5],
]);

$planos = [
    'mensal' => ['nome' => 'Plano Mensal', 'base' => 19.90, 'extra' => 5.00],
    'anual' => ['nome' => 'Plano Anual', 'base' => 199.90, 'extra' => 5.00],
];

if (!isset($planos[$planoId]) || $numDispositivos === false) {
    responder(422, ['error' => 'Plano ou quantidade de dispositivos inválido']);
}

$plano = $planos[$planoId];
$valor = round($plano['base'] + (($numDispositivos - 1) * $plano['extra']), 2);
$pagamentoId = trim((string) ($data['pagamento_id'] ?? ''));
if ($pagamentoId === '') {
    responder(422, ['error' => 'Identificador interno do pagamento é obrigatório']);
}

$titulo = 'Kayla PRO - ' . $plano['nome'];
$preference = [
    'items' => [[
        'title' => $titulo,
        'quantity' => 1,
        'unit_price' => $valor,
        'currency_id' => 'BRL',
    ]],
    'payer' => [
        'email' => (string) ($usuario['email'] ?? ''),
    ],
    'back_urls' => [
        'success' => 'https://kayla.app.br/app/pagamento-sucesso.html',
        'failure' => 'https://kayla.app.br/app/pagamento-falha.html',
        'pending' => 'https://kayla.app.br/app/pagamento-pendente.html',
    ],
    'auto_return' => 'approved',
    'notification_url' => $notificationUrl,
    'external_reference' => $pagamentoId,
    'metadata' => [
        'user_id' => (string) $usuario['id'],
        'plano_tipo' => $planoId,
        'num_dispositivos' => $numDispositivos,
        'tipo' => (string) ($data['tipo'] ?? 'novo'),
        'assinatura_id' => (string) ($data['assinatura_id'] ?? ''),
    ],
];

$ch = curl_init('https://api.mercadopago.com/checkout/preferences');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($preference),
    CURLOPT_TIMEOUT => 15,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $tokenMp,
    ],
]);
$resposta = curl_exec($ch);
$status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($status !== 201 || !$resposta) {
    error_log('[Kayla] Mercado Pago não criou a preferência. HTTP ' . $status);
    responder(502, ['error' => 'Não foi possível iniciar o pagamento']);
}

$preferencia = json_decode($resposta, true);
if (!is_array($preferencia) || empty($preferencia['id'])) {
    responder(502, ['error' => 'Resposta inválida do provedor de pagamento']);
}

responder(201, $preferencia);
