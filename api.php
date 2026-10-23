<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function answer(int $status, mixed $data=null, ?string $error=null): never { http_response_code($status); echo json_encode(['data'=>$data,'error'=>$error ? ['message'=>$error] : null],JSON_UNESCAPED_UNICODE); exit; }
if ($_SERVER['REQUEST_METHOD']!=='POST' || ($_SERVER['HTTP_X_UNLIVED_REQUEST']??'')!=='1') answer(403,null,'Requête interdite.');
$origin=$_SERVER['HTTP_ORIGIN']??''; $host=preg_replace('/:\d+$/','',$_SERVER['HTTP_HOST']??'');
if ($origin && parse_url($origin,PHP_URL_HOST)!==$host) answer(403,null,'Origine interdite.');
if ((int)($_SERVER['CONTENT_LENGTH']??0)>65536) answer(413,null,'Requête trop grande.');
$body=json_decode(file_get_contents('php://input',false,null,0,65537),true);
if (!is_array($body)) answer(400,null,'Données invalides.');
if (!extension_loaded('pdo_sqlite') || !extension_loaded('openssl')) answer(503,null,'Active pdo_sqlite et openssl dans Hostinger.');
$folder=__DIR__.'/.data';
if (!is_dir($folder) && !mkdir($folder,0700,true)) answer(503,null,'Stockage indisponible.');
@chmod($folder,0700);
$keyFile=$folder.'/auth.key';
if (!is_file($keyFile)) { $f=@fopen($keyFile,'x'); if ($f) { fwrite($f,random_bytes(32)); fclose($f); @chmod($keyFile,0600); } }
$key=@file_get_contents($keyFile);
if ($key===false || strlen($key)!==32) answer(503,null,'Clé du serveur indisponible.');
function cryptField(string $s): string { global $key; $iv=random_bytes(12); $cipher=openssl_encrypt($s,'aes-256-gcm',$key,OPENSSL_RAW_DATA,$iv,$tag); if ($cipher===false) throw new RuntimeException('Chiffrement indisponible.'); return base64_encode($iv.$tag.$cipher); }
function openField(string $s): string { global $key; $v=base64_decode($s,true); if ($v===false || strlen($v)<28) return ''; $p=openssl_decrypt(substr($v,28),'aes-256-gcm',$key,OPENSSL_RAW_DATA,substr($v,0,12),substr($v,12,16)); return $p===false ? '' : $p; }
function publicUser(array $u): array { return ['id'=>$u['id'],'email'=>openField($u['email']),'user_metadata'=>['display_name'=>openField($u['display_name'])]]; }
function cookieToken(string $token,int $maxAge): void { setcookie('unlived_session',$token,['expires'=>$maxAge ? time()+$maxAge : time()-3600,'path'=>'/','secure'=>!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off','httponly'=>true,'samesite'=>'Lax']); }
try {
    $db=new PDO('sqlite:'.$folder.'/auth.sqlite3',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_TIMEOUT=>5]);
    $db->exec('PRAGMA journal_mode=WAL');
    $db->exec('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,email TEXT NOT NULL,email_lookup TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,display_name TEXT NOT NULL,role TEXT NOT NULL,created_at TEXT NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL)');
    $route=parse_url($_SERVER['REQUEST_URI']??'',PHP_URL_PATH);
    $token=$_COOKIE['unlived_session']??'';
    $stmt=$db->prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires>?');
    $stmt->execute([hash('sha256',$token),time()]);
    $user=$token!=='' ? ($stmt->fetch(PDO::FETCH_ASSOC) ?: null) : null;
    if ($route==='/api/data') {
        $table=$body['table']??''; $action=$body['action']??'';
        answer(403,null,'Cette fonction sera disponible après conversion du module client.');
    }
    if ($route!=='/api/auth') answer(404,null,'Route inconnue.');
    $action=$body['action']??'';
    if ($action==='session') answer(200,['session'=>$user ? ['user'=>publicUser($user)] : null,'user'=>$user ? publicUser($user) : null]);
    if ($action==='logout') { if ($token!=='') { $stmt=$db->prepare('DELETE FROM sessions WHERE token_hash=?'); $stmt->execute([hash('sha256',$token)]); } cookieToken('',0); answer(200,['session'=>null,'user'=>null]); }
    if ($action==='login' || $action==='signup') {
        $email=strtolower(trim((string)($body['email']??'')));
        $password=(string)($body['password']??'');
        if (!filter_var($email,FILTER_VALIDATE_EMAIL) || strlen($email)>254) answer(400,null,'Adresse e-mail invalide.');
        $lookup=hash_hmac('sha256',$email,$key);
        $stmt=$db->prepare('SELECT * FROM users WHERE email_lookup=?'); $stmt->execute([$lookup]); $existing=$stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        if ($action==='signup') {
            if (strlen($password)<10 || strlen($password)>256) answer(400,null,'Mot de passe : 10 caractères minimum.');
            if ($existing) answer(409,null,'Cette adresse possède déjà un compte.');
            $name=trim((string)($body['display_name']??''));
            if (strlen($name)>120) answer(400,null,'Prénom trop long.');
            $id=bin2hex(random_bytes(16));
            $stmt=$db->prepare('INSERT INTO users(id,email,email_lookup,password_hash,display_name,role,created_at) VALUES (?,?,?,?,?,?,?)');
            $stmt->execute([$id,cryptField($email),$lookup,password_hash($password,PASSWORD_DEFAULT),cryptField($name),'client',gmdate('c')]);
            $stmt=$db->prepare('SELECT * FROM users WHERE id=?'); $stmt->execute([$id]); $user=$stmt->fetch(PDO::FETCH_ASSOC);
        } else {
            if (!$existing || !password_verify($password,$existing['password_hash'])) answer(403,null,'E-mail ou mot de passe incorrect.');
            $user=$existing;
        }
        $newToken=bin2hex(random_bytes(32)); $ttl=60*60*24*14;
        $stmt=$db->prepare('INSERT INTO sessions(token_hash,user_id,expires) VALUES (?,?,?)'); $stmt->execute([hash('sha256',$newToken),$user['id'],time()+$ttl]);
        cookieToken($newToken,$ttl); $public=publicUser($user); answer(200,['session'=>['user'=>$public],'user'=>$public]);
    }
    if ($action==='update') {
        if (!$user) answer(403,null,'Connexion requise.');
        if (!password_verify((string)($body['current_password']??''),$user['password_hash'])) answer(403,null,'Mot de passe actuel incorrect.');
        if (isset($body['email'])) {
            $email=strtolower(trim((string)$body['email']));
            if (!filter_var($email,FILTER_VALIDATE_EMAIL) || strlen($email)>254) answer(400,null,'Adresse e-mail invalide.');
            $stmt=$db->prepare('UPDATE users SET email=?,email_lookup=? WHERE id=?'); $stmt->execute([cryptField($email),hash_hmac('sha256',$email,$key),$user['id']]);
        }
        if (isset($body['password'])) {
            $password=(string)$body['password']; if (strlen($password)<10 || strlen($password)>256) answer(400,null,'Mot de passe : 10 caractères minimum.');
            $stmt=$db->prepare('UPDATE users SET password_hash=? WHERE id=?'); $stmt->execute([password_hash($password,PASSWORD_DEFAULT),$user['id']]);
        }
        $stmt=$db->prepare('SELECT * FROM users WHERE id=?'); $stmt->execute([$user['id']]); $public=publicUser($stmt->fetch(PDO::FETCH_ASSOC)); answer(200,['session'=>['user'=>$public],'user'=>$public]);
    }
    answer(400,null,'Action inconnue.');
} catch (PDOException $e) { error_log('UNLIVED auth: '.$e->getMessage()); answer(503,null,'Base de comptes indisponible.'); }
  catch (Throwable $e) { error_log('UNLIVED auth: '.$e->getMessage()); answer(500,null,'Le serveur ne peut pas traiter la demande.'); }
