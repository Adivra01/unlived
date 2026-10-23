<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function reply(int $code, array $payload): never { http_response_code($code); echo json_encode($payload, JSON_UNESCAPED_UNICODE); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') reply(405, ['error' => 'Méthode non autorisée.']);
if (!isset($_SERVER['HTTP_X_UNLIVED_REQUEST']) || $_SERVER['HTTP_X_UNLIVED_REQUEST'] !== '1') reply(403, ['error' => 'Requête interdite.']);
$host = $_SERVER['HTTP_HOST'] ?? '';
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin && parse_url($origin, PHP_URL_HOST) !== preg_replace('/:\d+$/', '', $host)) reply(403, ['error' => 'Origine interdite.']);
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 8192) reply(413, ['error' => 'Requête trop grande.']);
$data = json_decode(file_get_contents('php://input', false, null, 0, 8193), true);
if (!is_array($data)) reply(400, ['error' => 'Données invalides.']);
if (!extension_loaded('pdo_sqlite') || !extension_loaded('openssl')) reply(503, ['error' => 'Les extensions PHP pdo_sqlite et openssl doivent être activées dans Hostinger.']);
$folder = __DIR__ . '/.data';
if (!is_dir($folder) && !mkdir($folder, 0700, true)) reply(503, ['error' => 'Le stockage du serveur est indisponible.']);
@chmod($folder, 0700);
if (!is_writable($folder)) reply(503, ['error' => 'Le stockage du serveur n’est pas accessible en écriture.']);
$keyFile = $folder . '/waitlist.key';
if (!is_file($keyFile)) {
    $created = @fopen($keyFile, 'x');
    if ($created) { fwrite($created, random_bytes(32)); fclose($created); @chmod($keyFile, 0600); }
}
$key = @file_get_contents($keyFile);
if ($key === false || strlen($key) !== 32) reply(503, ['error' => 'La clé privée du serveur est indisponible.']);
function seal(string $value): string {
    global $key;
    $iv = random_bytes(12);
    $cipher = openssl_encrypt($value, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    if ($cipher === false) throw new RuntimeException('Chiffrement indisponible.');
    return base64_encode($iv . $tag . $cipher);
}
function field(array $data, string $name, int $max, bool $required = true): string {
    $value = trim((string)($data[$name] ?? ''));
    if (($required && $value === '') || strlen($value) > $max) reply(400, ['error' => 'Champ invalide : ' . $name]);
    return $value;
}
try {
    $db = new PDO('sqlite:' . $folder . '/waitlist.sqlite3', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 5]);
    $db->exec('PRAGMA journal_mode=WAL');
    $db->exec('CREATE TABLE IF NOT EXISTS launch_waitlist (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, email_hash TEXT NOT NULL, phone TEXT, concept_slug TEXT NOT NULL, selected_size TEXT NOT NULL, feedback_token_hash TEXT NOT NULL UNIQUE, utm_source TEXT, utm_campaign TEXT, utm_content TEXT, consent_at TEXT NOT NULL, UNIQUE(email_hash,concept_slug))');
    $db->exec('CREATE TABLE IF NOT EXISTS launch_waitlist_feedback (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, feedback_token_hash TEXT NOT NULL UNIQUE, interest_level INTEGER NOT NULL, what_appealed TEXT NOT NULL, what_to_improve TEXT NOT NULL)');
    $action = $data['action'] ?? '';
    if ($action === 'signup') {
        if (!empty($data['website'])) reply(200, ['ok' => true]);
        if (($data['consent'] ?? null) !== true) reply(400, ['error' => 'Le consentement est requis.']);
        $first = field($data, 'first_name', 80);
        $last = field($data, 'last_name', 100);
        $email = strtolower(field($data, 'email', 254));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) reply(400, ['error' => 'Adresse e-mail invalide.']);
        $phone = field($data, 'phone', 40, false);
        $concept = field($data, 'concept_slug', 30);
        $size = field($data, 'selected_size', 4);
        if (!in_array($concept, ['day-one-blanc','day-one-noir','day-one-rouge'], true) || !in_array($size, ['XS','S','M','L','XL','XXL'], true)) reply(400, ['error' => 'Choisis une pièce et une taille valides.']);
        $token = bin2hex(random_bytes(32));
        $now = gmdate('c');
        $stmt = $db->prepare('INSERT INTO launch_waitlist(created_at,first_name,last_name,email,email_hash,phone,concept_slug,selected_size,feedback_token_hash,utm_source,utm_campaign,utm_content,consent_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([$now,seal($first),seal($last),seal($email),hash_hmac('sha256',$email,$key),$phone === '' ? null : seal($phone),$concept,$size,hash('sha256',$token),field($data,'utm_source',160,false),field($data,'utm_campaign',160,false),field($data,'utm_content',160,false),$now]);
        reply(200, ['ok' => true, 'feedback_token' => $token]);
    }
    if ($action === 'feedback') {
        $token = field($data, 'feedback_token', 64);
        if (!preg_match('/^[a-f0-9]{64}$/D', $token)) reply(400, ['error' => 'Inscription introuvable.']);
        $hash = hash('sha256', $token);
        $exists = $db->prepare('SELECT 1 FROM launch_waitlist WHERE feedback_token_hash=?');
        $exists->execute([$hash]);
        if (!$exists->fetchColumn()) reply(404, ['error' => 'Inscription introuvable.']);
        $interest = $data['interest_level'] ?? null;
        if (!is_int($interest) || $interest < 1 || $interest > 5) reply(400, ['error' => 'Niveau d’intérêt invalide.']);
        $liked = field($data, 'what_appealed', 2000);
        $improve = field($data, 'what_to_improve', 2000);
        if (strlen($liked) < 5 || strlen($improve) < 5) reply(400, ['error' => 'Développe un peu tes réponses.']);
        $stmt = $db->prepare('INSERT INTO launch_waitlist_feedback(created_at,feedback_token_hash,interest_level,what_appealed,what_to_improve) VALUES (?,?,?,?,?)');
        $stmt->execute([gmdate('c'),$hash,$interest,seal($liked),seal($improve)]);
        reply(200, ['ok' => true]);
    }
    reply(400, ['error' => 'Action inconnue.']);
} catch (PDOException $e) {
    if (str_contains($e->getMessage(), 'UNIQUE constraint failed')) reply(409, ['error' => 'Cette adresse est déjà inscrite pour cette pièce.', 'code' => '23505']);
    error_log('UNLIVED waitlist: ' . $e->getMessage());
    reply(503, ['error' => 'La base de données est indisponible sur cet hébergement.']);
} catch (Throwable $e) {
    error_log('UNLIVED waitlist: ' . $e->getMessage());
    reply(500, ['error' => 'L’inscription ne peut pas être enregistrée pour le moment.']);
}
