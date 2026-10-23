<?php
declare(strict_types=1);
const AUTH_GENERIC='Si cette adresse correspond à un compte, un e-mail contenant les prochaines étapes sera envoyé.';
function mailConfig(): array {
    $v=[];
    foreach (is_file(__DIR__.'/.env') ? file(__DIR__.'/.env',FILE_IGNORE_NEW_LINES) : [] as $line) {
        $line=trim($line);if ($line==='' || str_starts_with($line,'#') || !str_contains($line,'=')) continue;
        [$k,$value]=explode('=',$line,2);$v[trim($k)]=trim(trim($value),"\"'");
    }
    foreach (['RESEND_API_KEY','RESEND_FROM','EMAIL_PUBLIC_ORIGIN'] as $k) {$env=getenv($k);$v[$k]=$env!==false?$env:($v[$k]??'');}
    return $v;
}
function mailOrigin(): string {
    $origin=rtrim(mailConfig()['EMAIL_PUBLIC_ORIGIN'] ?: 'https://unlived.club','/');$p=parse_url($origin);
    if (!$p || isset($p['user']) || isset($p['pass']) || isset($p['query']) || isset($p['fragment']) || !empty($p['path']) || empty($p['host']) || (($p['scheme']??'')!=='https' && !(($p['scheme']??'')==='http' && in_array($p['host'],['localhost','127.0.0.1'],true)))) throw new InvalidArgumentException('Origine des e-mails invalide.');
    return $origin;
}
function validatePassword(string $p): void {
    if (preg_match_all('/./us',$p,$chars)<8 || count($chars[0])>256 || !preg_match('/[A-Z]/',$p) || !preg_match('/[0-9]/',$p) || !preg_match('/[[:punct:]]/',$p)) throw new InvalidArgumentException('8 caractères minimum, avec une majuscule, un chiffre et un caractère spécial.');
}
function hashAuthPassword(string $password): string {
    validatePassword($password);$algorithm=defined('PASSWORD_ARGON2ID')?constant('PASSWORD_ARGON2ID'):PASSWORD_BCRYPT;
    if($algorithm===PASSWORD_BCRYPT && strlen($password)>72)throw new InvalidArgumentException('Sur cet hébergement, le mot de passe doit contenir au maximum 72 octets.');
    return password_hash($password,$algorithm);
}
function authSchema(): void {
    global $db;
    if (!in_array('email_verified',$db->query('PRAGMA table_info(users)')->fetchAll(PDO::FETCH_COLUMN,1),true)) $db->exec('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1');
    $db->exec('CREATE TABLE IF NOT EXISTS auth_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT,purpose TEXT,expires INTEGER,target TEXT,original_lookup TEXT,created INTEGER)');
    $db->exec('CREATE TABLE IF NOT EXISTS auth_outbox(id TEXT PRIMARY KEY,payload TEXT,next_attempt INTEGER,attempts INTEGER,status TEXT)');
    $db->exec('CREATE TABLE IF NOT EXISTS auth_limits(id TEXT PRIMARY KEY,attempts TEXT,updated INTEGER)');
}
function authLimit(string $action,string $email): void {
    global $db,$key;if (in_array($action,['session','logout'],true)) return;
    $now=time();$policies=[['ip:'.($_SERVER['REMOTE_ADDR']??'unknown'),20,900]];
    if(in_array($action,['business','track'],true))$policies=[['ip:'.($_SERVER['REMOTE_ADDR']??'unknown'),180,60]];
    elseif($action==='waitlist')$policies=[['ip:'.($_SERVER['REMOTE_ADDR']??'unknown'),25,300]];
    elseif (in_array($action,['signup','reset_request','resend_verification'],true)) $policies=[['ip:'.($_SERVER['REMOTE_ADDR']??'unknown'),10,900],['email:'.$email,3,3600]];
    elseif ($action==='login') $policies[]=['email:'.$email,10,900];
    $db->exec('BEGIN IMMEDIATE');
    try {
        $s=$db->prepare('DELETE FROM auth_limits WHERE updated<?');$s->execute([$now-86400]);
        foreach ($policies as [$subject,$max,$window]) {
            $id=hash_hmac('sha256','auth-limit:'.$action.':'.$subject,$key);$s=$db->prepare('SELECT attempts FROM auth_limits WHERE id=?');$s->execute([$id]);$stored=$s->fetchColumn();
            $attempts=array_values(array_filter($stored?json_decode($stored,true):[],static fn($t)=>$t>$now-$window));
            if (count($attempts)>=$max) throw new InvalidArgumentException('Trop de tentatives. Réessaie plus tard.');
            $attempts[]=$now;$s=$db->prepare('INSERT INTO auth_limits VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET attempts=excluded.attempts,updated=excluded.updated');$s->execute([$id,json_encode($attempts),$now]);
        }
        $db->exec('COMMIT');
    } catch (Throwable $e) {$db->exec('ROLLBACK');throw $e;}
}
function queueAuthMail(string $email,string $subject,string $text,?string $url=null,?int $expires=null,?string $challenge=null): void {
    global $db;
    $safe=htmlspecialchars($text,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
    $button=$url?'<p><a style="padding:14px 20px;background:#7a2e38;color:white" href="'.htmlspecialchars($url,ENT_QUOTES,'UTF-8').'">Continuer en toute sécurité</a></p>':'';
    $payload=['to'=>[$email],'subject'=>$subject,'text'=>$text,'_expires'=>$expires??time()+86400,'_challenge'=>$challenge,'html'=>'<div style="font-family:Arial,sans-serif;padding:28px"><h2>UNLIVED</h2><p style="white-space:pre-line;line-height:1.8">'.$safe.'</p>'.$button.'</div>'];
    $s=$db->prepare("INSERT INTO auth_outbox VALUES (?,?,?,0,'pending')");$s->execute([bin2hex(random_bytes(16)),cryptField(json_encode($payload,JSON_UNESCAPED_UNICODE)),time()]);
}
function issueAuthToken(array $u,string $purpose,?string $email=null): void {
    global $db;$now=time();$target=$email??openField($u['email']);
    $s=$db->prepare('SELECT created FROM auth_tokens WHERE user_id=? AND purpose=? ORDER BY created DESC LIMIT 1');$s->execute([$u['id'],$purpose]);$last=$s->fetchColumn();if ($last!==false && $last>$now-60) return;
    $s=$db->prepare('DELETE FROM auth_tokens WHERE user_id=? AND purpose=?');$s->execute([$u['id'],$purpose]);
    $token=rtrim(strtr(base64_encode(random_bytes(32)),'+/','-_'),'=');$ttl=$purpose==='reset'?1800:86400;
    $s=$db->prepare('INSERT INTO auth_tokens VALUES (?,?,?,?,?,?,?)');$s->execute([hash('sha256',$token),$u['id'],$purpose,$now+$ttl,cryptField($target),$u['email_lookup'],$now]);
    $link=mailOrigin().'/auth.html#'.http_build_query(['action'=>$purpose==='reset'?'reset':'verify','token'=>$token]);$subject=$purpose==='reset'?'Réinitialise ton mot de passe':'Confirme ton adresse e-mail';
    queueAuthMail($target,$subject,$subject."\n\nOuvre ce lien personnel, utilisable une seule fois :\n".$link."\n\nExpiration : ".($purpose==='reset'?'30 minutes.':'24 heures.')."\nSi tu n’es pas à l’origine de cette demande, ignore cet e-mail.",$link,$now+$ttl,hash('sha256',$token));
}
function consumeAuthToken(string $token,array $purposes,?string $password): string {
    global $db,$key;
    if (!preg_match('/^[A-Za-z0-9_-]{43}$/',$token)) throw new InvalidArgumentException('Lien invalide ou expiré. Demande un nouveau lien.');
    $s=$db->prepare('SELECT * FROM auth_tokens WHERE token_hash=? AND expires>?');$s->execute([hash('sha256',$token),time()]);$c=$s->fetch(PDO::FETCH_ASSOC);
    if (!$c || !in_array($c['purpose'],$purposes,true)) throw new InvalidArgumentException('Lien invalide ou expiré. Demande un nouveau lien.');
    $s=$db->prepare('SELECT * FROM users WHERE id=?');$s->execute([$c['user_id']]);$u=$s->fetch(PDO::FETCH_ASSOC);
    if (!$u || !hash_equals($u['email_lookup'],$c['original_lookup'])) throw new InvalidArgumentException('Lien invalide ou expiré. Demande un nouveau lien.');
    if ($c['purpose']==='reset') {
        validatePassword($password??'');$s=$db->prepare('UPDATE users SET password_hash=? WHERE id=?');$s->execute([hashAuthPassword($password),$u['id']]);
        queueAuthMail(openField($u['email']),'Ton mot de passe a été modifié','Ton mot de passe UNLIVED a été modifié. Si tu n’es pas à l’origine de cette action, contacte notre équipe.');
    } else {
        $email=openField($c['target']);$lookup=hash_hmac('sha256',$email,$key);$s=$db->prepare('SELECT id FROM users WHERE email_lookup=?');$s->execute([$lookup]);$existing=$s->fetchColumn();
        if ($existing!==false && $existing!==$u['id']) throw new InvalidArgumentException('Cette adresse ne peut pas être utilisée.');
        $s=$db->prepare('UPDATE users SET email=?,email_lookup=?,email_verified=1 WHERE id=?');$s->execute([cryptField($email),$lookup,$u['id']]);
        if ($c['purpose']==='email_change') queueAuthMail(openField($u['email']),'Ton adresse e-mail a été modifiée','L’adresse e-mail de ton compte UNLIVED vient d’être modifiée. Si tu n’es pas à l’origine de cette action, contacte notre équipe.');
    }
    $s=$db->prepare('DELETE FROM sessions WHERE user_id=?');$s->execute([$u['id']]);$s=$db->prepare('DELETE FROM auth_tokens WHERE user_id=?');$s->execute([$u['id']]);
    return $c['purpose']==='reset'?'Mot de passe modifié. Connecte-toi avec ton nouveau mot de passe.':'Adresse e-mail confirmée. Tu peux maintenant te connecter.';
}
function pumpAuthMail(): void {
    global $db;$config=mailConfig();if (!$config['RESEND_API_KEY'] || !$config['RESEND_FROM']) return;
    $db->exec('BEGIN IMMEDIATE');
    $s=$db->prepare("UPDATE auth_outbox SET status='pending' WHERE status='sending' AND next_attempt<?");$s->execute([time()-120]);
    $s=$db->prepare("SELECT * FROM auth_outbox WHERE status='pending' AND next_attempt<=? AND attempts<5 ORDER BY next_attempt LIMIT 1");$s->execute([time()]);$job=$s->fetch(PDO::FETCH_ASSOC);
    if (!$job) {$db->exec('COMMIT');return;}
    $s=$db->prepare("UPDATE auth_outbox SET status='sending',next_attempt=? WHERE id=?");$s->execute([time(),$job['id']]);$db->exec('COMMIT');
    try {
        $p=json_decode(openField($job['payload']),true,512,JSON_THROW_ON_ERROR);$expires=$p['_expires']??0;unset($p['_expires']);$challenge=$p['_challenge']??null;unset($p['_challenge']);if($challenge){$s=$db->prepare('SELECT 1 FROM auth_tokens WHERE token_hash=? AND expires>?');$s->execute([$challenge,time()]);if(!$s->fetchColumn())$expires=0;}
        if ($expires>=time()) {
            $context=stream_context_create(['http'=>['method'=>'POST','timeout'=>12,'ignore_errors'=>true,'header'=>"Content-Type: application/json\r\nAuthorization: Bearer ".$config['RESEND_API_KEY']."\r\nIdempotency-Key: unlived-auth/".$job['id']."\r\n",'content'=>json_encode(['from'=>$config['RESEND_FROM']]+$p,JSON_THROW_ON_ERROR)],'ssl'=>['verify_peer'=>true,'verify_peer_name'=>true]]);
            $result=@file_get_contents('https://api.resend.com/emails',false,$context);$data=$result!==false?json_decode($result,true):null;if (!is_array($data) || empty($data['id'])) throw new RuntimeException('Envoi non confirmé.');
        }
        $s=$db->prepare('DELETE FROM auth_outbox WHERE id=?');$s->execute([$job['id']]);
    } catch (Throwable $e) {$s=$db->prepare("UPDATE auth_outbox SET status='pending',attempts=attempts+1,next_attempt=? WHERE id=?");$s->execute([time()+min(3600,30*(2**$job['attempts'])),$job['id']]);}
}

