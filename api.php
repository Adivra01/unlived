<?php
declare(strict_types=1);
require_once __DIR__.'/auth-mail.php';
require_once __DIR__.'/business-api.php';
$authTransaction=false;
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');
if(!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off')header('Strict-Transport-Security: max-age=15552000');
function answer(int $status, mixed $data=null, ?string $error=null): never {
    global $db,$authTransaction;
    if ($authTransaction) { $db->exec($status<400?'COMMIT':'ROLLBACK');$authTransaction=false; }
    http_response_code($status);$payload=['data'=>$data,'error'=>$error?['message'=>$error]:null];if(defined('UNLIVED_WAITLIST_COMPAT')){$payload=array_merge($payload,is_array($data)?$data:[]);if($error)$payload['error']=$error;}echo json_encode($payload,JSON_UNESCAPED_UNICODE);
    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
    if ($status<400 && isset($db)) { try { for($i=0;$i<3;$i++) pumpAuthMail(); } catch(Throwable $e) {} }
    exit;
}
if (!defined('UNLIVED_MAIL_WORKER') && !defined('UNLIVED_AUTH_MAINTENANCE')) {
if ($_SERVER['REQUEST_METHOD']!=='POST' || ($_SERVER['HTTP_X_UNLIVED_REQUEST']??'')!=='1') answer(403,null,'Requête interdite.');
$origin=$_SERVER['HTTP_ORIGIN']??''; $host=$_SERVER['HTTP_HOST']??'';
$scheme=!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS']!=='off'?'https':'http';
if ($origin && !hash_equals($scheme.'://'.$host,$origin)) answer(403,null,'Origine interdite.');
if ((int)($_SERVER['CONTENT_LENGTH']??0)>65536) answer(413,null,'Requête trop grande.');
$body=json_decode(file_get_contents('php://input',false,null,0,65537),true);
if (!is_array($body)) answer(400,null,'Données invalides.');
foreach (['action','email','password','current_password','token','display_name'] as $field) if (isset($body[$field]) && !is_string($body[$field])) answer(400,null,'Données invalides.');
} else { $body=[]; }
if (!extension_loaded('pdo_sqlite') || !extension_loaded('openssl')) answer(503,null,'Active pdo_sqlite et openssl dans Hostinger.');
$folder=__DIR__.'/.data';
if (!is_dir($folder) && !mkdir($folder,0700,true)) answer(503,null,'Stockage indisponible.');
@chmod($folder,0700);
$keyFile=$folder.'/auth.key';
if (!is_file($keyFile) && is_file($folder.'/auth.sqlite3')) answer(503,null,'Clé de comptes manquante : restaurer auth.key avec sa base.');
if (!is_file($keyFile)) { $f=@fopen($keyFile,'x'); if ($f) { fwrite($f,random_bytes(32)); fclose($f); @chmod($keyFile,0600); } }
$key=@file_get_contents($keyFile);
if ($key===false || strlen($key)!==32) answer(503,null,'Clé du serveur indisponible.');
function cryptField(string $s): string { global $key; $iv=random_bytes(12); $cipher=openssl_encrypt($s,'aes-256-gcm',$key,OPENSSL_RAW_DATA,$iv,$tag); if ($cipher===false) throw new RuntimeException('Chiffrement indisponible.'); return base64_encode($iv.$tag.$cipher); }
function openField(string $s): string { global $key; $v=base64_decode($s,true); if ($v===false || strlen($v)<28) return ''; $p=openssl_decrypt(substr($v,28),'aes-256-gcm',$key,OPENSSL_RAW_DATA,substr($v,0,12),substr($v,12,16)); return $p===false ? '' : $p; }
function publicUser(array $u): array { return ['id'=>$u['id'],'email'=>openField($u['email']),'role'=>$u['role'],'user_metadata'=>['display_name'=>openField($u['display_name'])]]; }
function cookieToken(string $token,int $maxAge): void { setcookie('unlived_session',$token,['expires'=>$maxAge ? time()+$maxAge : time()-3600,'path'=>'/','secure'=>!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off','httponly'=>true,'samesite'=>'Lax']); }
try {
    $db=new PDO('sqlite:'.$folder.'/auth.sqlite3',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_TIMEOUT=>5]);
    $db->exec('PRAGMA journal_mode=WAL');
    $db->exec('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,email TEXT NOT NULL,email_lookup TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,display_name TEXT NOT NULL,role TEXT NOT NULL,created_at TEXT NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL)');
    authSchema();
    initBusiness();
    if (defined('UNLIVED_AUTH_MAINTENANCE')) return;
    if(defined('UNLIVED_MAIL_WORKER')) {for($i=0;$i<10;$i++)pumpAuthMail();exit;}
    $route=parse_url($_SERVER['REQUEST_URI']??'',PHP_URL_PATH);
    $token=$_COOKIE['unlived_session']??'';
    $stmt=$db->prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires>? AND u.email_verified=1');
    $stmt->execute([hash('sha256',$token),time()]);
    $user=$token!=='' ? ($stmt->fetch(PDO::FETCH_ASSOC) ?: null) : null;
    $refToken=$_COOKIE['unlived_affiliate']??'';
    if (in_array($route,['/api/data','/api/business','/api/track','/api/waitlist'],true)) {
        authLimit($route==='/api/track'?'track':(($route==='/api/waitlist'||($route==='/api/data'&&($body['action']??'')==='insert'&&in_array($body['table']??'', ['launch_waitlist','launch_waitlist_feedback','contact_messages'],true)))?'waitlist':'business'),'');
        $db->exec('BEGIN IMMEDIATE');$authTransaction=true;
        // Recheck sessions after acquiring the writer lock, including revoked sessions.
        $stmt=$db->prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires>? AND u.email_verified=1');$stmt->execute([hash('sha256',$token),time()]);$user=$token!==''?($stmt->fetch(PDO::FETCH_ASSOC)?:null):null;
        attribution($user,$refToken);
        if($route==='/api/data')answer(200,dataQuery($body,$user));
        if($route==='/api/waitlist')answer(200,waitlistAction($body));
        $ip=$_SERVER['REMOTE_ADDR']??'';
        if($route==='/api/track') {
            [$previous]=attribution($user,$refToken);
            $active=array_column(array_filter(entities('affiliates'),static fn($a)=>$a['status']==='active'),'code');
            if(!in_array($body['affiliate']??'', $active,true)&&$previous)$body['affiliate']=$previous['code'];
            $result=trackEvent($body,$user,$ip,$_SERVER['HTTP_USER_AGENT']??'');
            if(isset($result['recorded'])||isset($result['duplicate'])){[$ref,$newToken]=attribution($user,$refToken,$body['affiliate']??null);if($newToken)setcookie('unlived_affiliate',$newToken,['expires'=>time()+30*86400,'path'=>'/','secure'=>$scheme==='https','httponly'=>true,'samesite'=>'Lax']);}
            answer(200,$result);
        }
        if(($body['action']??'')==='exclude_tracking'){needUser($user,true);excludeIp($ip);setcookie('unlived_analytics_exclude','1',['expires'=>time()+365*86400,'path'=>'/','secure'=>$scheme==='https','httponly'=>true,'samesite'=>'Lax']);answer(200,['excluded'=>true]);}
        answer(200,businessAction($body,$user));
    }
    if ($route!=='/api/auth') answer(404,null,'Route inconnue.');
    $action=$body['action']??'';
    authLimit($action,strtolower(trim((string)($body['email']??''))));
    $db->exec('BEGIN IMMEDIATE');$authTransaction=true;
    $stmt=$db->prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires>? AND u.email_verified=1');$stmt->execute([hash('sha256',$token),time()]);$user=$token!==''?($stmt->fetch(PDO::FETCH_ASSOC)?:null):null;
    if($user){attribution($user,$refToken);if($user['role']==='admin'){excludeIp($_SERVER['REMOTE_ADDR']??'');setcookie('unlived_analytics_exclude','1',['expires'=>time()+365*86400,'path'=>'/','secure'=>$scheme==='https','httponly'=>true,'samesite'=>'Lax']);}}
    if ($action==='session') answer(200,['session'=>$user ? ['user'=>publicUser($user)] : null,'user'=>$user ? publicUser($user) : null]);
    if ($action==='logout') { if ($token!=='') { $stmt=$db->prepare('DELETE FROM sessions WHERE token_hash=?'); $stmt->execute([hash('sha256',$token)]); } cookieToken('',0); answer(200,['session'=>null,'user'=>null]); }
    if ($action==='reset_request' || $action==='resend_verification') {
        $email=strtolower(trim((string)($body['email']??'')));$stmt=$db->prepare('SELECT * FROM users WHERE email_lookup=?');$stmt->execute([hash_hmac('sha256',$email,$key)]);$existing=$stmt->fetch(PDO::FETCH_ASSOC);
        if ($existing && ($action==='reset_request' || !(int)$existing['email_verified'])) issueAuthToken($existing,$action==='reset_request'?'reset':'verify');
        answer(200,['user'=>null,'session'=>null,'message'=>AUTH_GENERIC]);
    }
    if ($action==='verify_email' || $action==='reset_password') {
        $message=consumeAuthToken((string)($body['token']??''),$action==='reset_password'?['reset']:['verify','email_change'],isset($body['password'])?(string)$body['password']:null);cookieToken('',0);answer(200,['user'=>null,'session'=>null,'message'=>$message]);
    }
    if ($action==='login' || $action==='signup') {
        $email=strtolower(trim((string)($body['email']??'')));$password=(string)($body['password']??'');
        if (!filter_var($email,FILTER_VALIDATE_EMAIL) || strlen($email)>254) answer(400,null,'Adresse e-mail invalide.');
        $lookup=hash_hmac('sha256',$email,$key);$stmt=$db->prepare('SELECT * FROM users WHERE email_lookup=?');$stmt->execute([$lookup]);$existing=$stmt->fetch(PDO::FETCH_ASSOC)?:null;
        if ($action==='signup') {
            validatePassword($password);$name=trim((string)($body['display_name']??''));if(strlen($name)>120)answer(400,null,'Prénom trop long.');
            if (!$existing) {
                $id=bin2hex(random_bytes(16));$stmt=$db->prepare('INSERT INTO users(id,email,email_lookup,password_hash,display_name,role,created_at,email_verified) VALUES (?,?,?,?,?,?,?,0)');$stmt->execute([$id,cryptField($email),$lookup,hashAuthPassword($password),cryptField($name),'client',gmdate('c')]);$stmt=$db->prepare('SELECT * FROM users WHERE id=?');$stmt->execute([$id]);issueAuthToken($stmt->fetch(PDO::FETCH_ASSOC),'verify');
            } elseif (!(int)$existing['email_verified']) issueAuthToken($existing,'verify');
            answer(200,['user'=>null,'session'=>null,'message'=>AUTH_GENERIC]);
        }
        // A dummy verification keeps unknown-email failures on the password-hashing path.
        $algorithm=defined('PASSWORD_ARGON2ID')?constant('PASSWORD_ARGON2ID'):PASSWORD_BCRYPT;$dummy=password_hash('Dummy-authentication123!',$algorithm);
        $valid=password_verify($password,$existing?$existing['password_hash']:$dummy);
        if (!$existing || !$valid) answer(403,null,'E-mail ou mot de passe incorrect.');
        if (!(int)$existing['email_verified']) answer(403,null,'Confirme ton adresse e-mail avant de te connecter.');
        $user=$existing;attribution($user,$refToken);if($user['role']==='admin'){excludeIp($_SERVER['REMOTE_ADDR']??'');setcookie('unlived_analytics_exclude','1',['expires'=>time()+365*86400,'path'=>'/','secure'=>$scheme==='https','httponly'=>true,'samesite'=>'Lax']);}$newToken=bin2hex(random_bytes(32));$ttl=604800;$stmt=$db->prepare('INSERT INTO sessions VALUES (?,?,?)');$stmt->execute([hash('sha256',$newToken),$user['id'],time()+$ttl]);cookieToken($newToken,$ttl);$public=publicUser($user);answer(200,['session'=>['user'=>$public],'user'=>$public]);
    }
    if ($action==='update') {
        if (!$user) answer(403,null,'Connexion requise.');
        if (!password_verify((string)($body['current_password']??''),$user['password_hash'])) answer(403,null,'Mot de passe actuel incorrect.');
        if(isset($body['email'],$body['password']))answer(400,null,'Modifie ton adresse et ton mot de passe séparément.');
        $message=null;
        if (isset($body['email'])) {
            $email=strtolower(trim((string)$body['email']));if(!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($email)>254)answer(400,null,'Adresse e-mail invalide.');
            if($email!==openField($user['email'])) {issueAuthToken($user,'email_change',$email);$message='Un lien sera envoyé à la nouvelle adresse. Ton adresse actuelle reste active jusqu’à confirmation.';}
        }
        if (isset($body['password'])) {
            $password=(string)$body['password'];validatePassword($password);$stmt=$db->prepare('UPDATE users SET password_hash=? WHERE id=?');$stmt->execute([hashAuthPassword($password),$user['id']]);$stmt=$db->prepare('DELETE FROM sessions WHERE user_id=?');$stmt->execute([$user['id']]);$stmt=$db->prepare('DELETE FROM auth_tokens WHERE user_id=?');$stmt->execute([$user['id']]);$newToken=bin2hex(random_bytes(32));$stmt=$db->prepare('INSERT INTO sessions VALUES (?,?,?)');$stmt->execute([hash('sha256',$newToken),$user['id'],time()+604800]);cookieToken($newToken,604800);
            queueAuthMail(openField($user['email']),'Ton mot de passe a été modifié','Ton mot de passe UNLIVED vient d’être modifié. Si tu n’es pas à l’origine de cette action, contacte notre équipe.');
        }
        $stmt=$db->prepare('SELECT * FROM users WHERE id=?');$stmt->execute([$user['id']]);$public=publicUser($stmt->fetch(PDO::FETCH_ASSOC));answer(200,['session'=>['user'=>$public],'user'=>$public,'message'=>$message]);
    }
    answer(400,null,'Action inconnue.');
} catch (DomainException $e) { answer(403,null,$e->getMessage()); }
  catch (InvalidArgumentException $e) { answer(400,null,$e->getMessage()); }
  catch (PDOException $e) { error_log('UNLIVED auth: '.$e->getMessage()); answer(503,null,'Base de comptes indisponible.'); }
  catch (Throwable $e) { error_log('UNLIVED auth: '.$e->getMessage()); answer(500,null,'Le serveur ne peut pas traiter la demande.'); }
