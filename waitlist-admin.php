<?php
declare(strict_types=1);
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
$https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
session_name('unlived_waitlist_admin');
session_set_cookie_params(['lifetime'=>0,'path'=>'/','secure'=>$https,'httponly'=>true,'samesite'=>'Strict']);
session_start();
$verifier = require __DIR__.'/waitlist-admin-hash.php';
define('UNLIVED_AUTH_MAINTENANCE',true);
require __DIR__.'/api.php';
header('Content-Type: text/html; charset=utf-8');
// The main administrator session also authorizes exports; no second login required.
if(empty($_SESSION['admin']) && !empty($_COOKIE['unlived_session'])) {
    $s=$db->prepare("SELECT u.id FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires>? AND u.role='admin' AND u.email_verified=1");
    $s->execute([hash('sha256',$_COOKIE['unlived_session']),time()]);
    if($s->fetchColumn()){session_regenerate_id(true);$_SESSION['admin']=true;$_SESSION['via_account']=true;}
}
if(!empty($_SESSION['via_account'])) {
    $s=$db->prepare("SELECT u.id FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires>? AND u.role='admin' AND u.email_verified=1");$s->execute([hash('sha256',$_COOKIE['unlived_session']??''),time()]);
    if(!$s->fetchColumn()){unset($_SESSION['admin'],$_SESSION['via_account']);}
}

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (empty($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], (string)($_POST['csrf'] ?? ''))) { http_response_code(403); exit('Session expirée. Recharge la page.'); }
    if (isset($_POST['logout'])) { $viaAccount=!empty($_SESSION['via_account']);if($viaAccount){$s=$db->prepare('DELETE FROM sessions WHERE token_hash=?');$s->execute([hash('sha256',$_COOKIE['unlived_session']??'')]);cookieToken('',0);}$_SESSION=[]; session_destroy(); header('Location: '.($viaAccount?'compte.html':'waitlist-admin.php')); exit; }
    if (isset($_POST['import_test_accounts']) && !empty($_SESSION['admin'])) {
        try {
            if (($_POST['confirm_test_import']??'')!=='1') throw new InvalidArgumentException('Confirme la restauration des comptes administrateur et client.');
            $upload=$_FILES['accounts_file']??[];
            if (($upload['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK || ($upload['size']??0)>8192 || !is_uploaded_file($upload['tmp_name']??'')) throw new InvalidArgumentException('Choisis le fichier JSON de transfert (8 Ko maximum).');
            require __DIR__.'/auth-test-import.php';
            importTestAccounts($db,$key,(string)file_get_contents($upload['tmp_name']));
            $_SESSION['notice']='Comptes restaurés. Connecte-toi sur compte.html avec contact@unlived.club pour l’administration et client.test@unlived.example pour le compte client. Les mots de passe restent ceux du transfert.';
        } catch (Throwable $e) {
            $_SESSION['notice']=$e instanceof InvalidArgumentException ? $e->getMessage() : 'Import impossible. Aucun transfert validé ; vérifie les journaux Hostinger.';
        }
        header('Location: waitlist-admin.php');exit;
    }
    if (isset($_POST['create_account']) && !empty($_SESSION['admin'])) {
        try {
            $email=strtolower(trim((string)($_POST['email']??'')));
            $password=(string)($_POST['account_password']??'');
            if (!filter_var($email,FILTER_VALIDATE_EMAIL) || strlen($email)>254) throw new InvalidArgumentException('Adresse e-mail invalide.');
            $hash=hashAuthPassword($password);
            $lookup=hash_hmac('sha256',$email,$key);
            $db->exec('BEGIN IMMEDIATE');
            $stmt=$db->prepare('SELECT id FROM users WHERE email_lookup=?');$stmt->execute([$lookup]);
            if ($stmt->fetchColumn()) throw new InvalidArgumentException('Ce compte existe déjà. Utilise « Mot de passe oublié » pour le récupérer. Aucun compte modifié.');
            $stmt=$db->prepare('INSERT INTO users(id,email,email_lookup,password_hash,display_name,role,created_at,email_verified) VALUES (?,?,?,?,?,?,?,1)');
            $stmt->execute([bin2hex(random_bytes(16)),cryptField($email),$lookup,$hash,cryptField('Administrateur'),'admin',gmdate('c')]);
            $db->exec('COMMIT');
            $_SESSION['notice']='Compte administrateur créé sur ce serveur. Tu peux maintenant te connecter sur compte.html avec cette adresse et ce mot de passe.';
        } catch (Throwable $e) {
            if (isset($db) && $db->inTransaction()) $db->rollBack();
            // SQLite transactions opened with exec need an explicit rollback.
            if (isset($db)) {try {$db->exec('ROLLBACK');} catch(Throwable $ignored) {}}
            $_SESSION['notice']=$e instanceof InvalidArgumentException ? $e->getMessage() : 'Création impossible. Vérifie le stockage SQLite et les journaux Hostinger.';
        }
        header('Location: waitlist-admin.php');exit;
    }
    try {authLimit('admin_code','');} catch(InvalidArgumentException $e) {http_response_code(429);exit('Trop de tentatives. Réessaie plus tard.');}
    $attempts = (int)($_SESSION['attempts'] ?? 0);
    $since = (int)($_SESSION['attempt_time'] ?? 0);
    if (time()-$since > 900) $attempts=0;
    if ($attempts >= 8) $error='Trop de tentatives. Réessaie dans 15 minutes.';
    elseif (hash_equals($verifier, hash('sha256', (string)($_POST['password'] ?? '')))) {
        session_regenerate_id(true); $_SESSION['admin']=true; $_SESSION['attempts']=0;
        header('Location: waitlist-admin.php'); exit;
    } else { $_SESSION['attempts']=$attempts+1; $_SESSION['attempt_time']=time(); $error='Code administrateur incorrect.'; }
}
$_SESSION['csrf'] ??= bin2hex(random_bytes(32));
function h(?string $v): string { return htmlspecialchars((string)$v, ENT_QUOTES|ENT_SUBSTITUTE, 'UTF-8'); }
function csvcell(?string $v): string { $v=(string)$v; return preg_match('/^(?:[\x00-\x20]*[=+\-@]|[\t\r\n])/u',$v) ? "'".$v : $v; }
$rows=[]; $dbError='';
if (!empty($_SESSION['admin'])) {
    try {
        header('Content-Type: text/html; charset=utf-8');
        $feedback=[];foreach(entities('launch_waitlist_feedback') as $reply)$feedback[$reply['feedback_token']]=$reply;
        foreach(entities('launch_waitlist') as $entry){$reply=$feedback[$entry['feedback_token']]??null;$rows[]=array_merge($entry,['interest_level'=>$reply['interest_level']??null,'what_appealed'=>$reply['what_appealed']??'','what_to_improve'=>$reply['what_to_improve']??'','feedback_at'=>$reply['created_at']??'']);}
        usort($rows,static fn($a,$b)=>strcmp($b['created_at'],$a['created_at']));
        if (($_GET['export'] ?? '')==='xlsx') {
            require __DIR__.'/waitlist-export.php';
            exportWaitlistWorkbook($rows);
        }
        if (($_GET['export'] ?? '')==='csv') {
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="unlived-liste-attente.csv"');
            $out=fopen('php://output','w'); fwrite($out,"\xEF\xBB\xBF");
            $fields=['created_at','first_name','last_name','email','phone','concept_slug','selected_size','utm_source','utm_campaign','utm_content','consent_at','interest_level','what_appealed','what_to_improve','feedback_at'];
            fputcsv($out,$fields,';');
            foreach ($rows as $r) fputcsv($out,array_map(static fn($field)=>csvcell(isset($r[$field]) ? (string)$r[$field] : ''),$fields),';');
            exit;
        }
    } catch (Throwable $e) { error_log('UNLIVED waitlist admin: '.$e->getMessage()); $dbError='La base de la liste d’attente est indisponible. Vérifie PHP pdo_sqlite et les permissions de .data.'; }
}
$total=count($rows); $answered=count(array_filter($rows,static fn($r)=>$r['interest_level']!==null));
?><!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Liste d’attente · Administration UNLIVED</title><style>
:root{font-family:Inter,Arial,sans-serif;color:#202020;background:#f5f4f1}*{box-sizing:border-box}body{margin:0}a{color:#7a2e38}.layout{display:grid;grid-template-columns:220px minmax(0,1fr);min-height:100vh}aside{background:#fff;border-right:1px solid #ddd;padding:28px 16px}aside img{width:125px;background:#000;padding:8px}nav{display:grid;gap:5px;margin-top:35px}nav a{display:block;padding:12px 14px;text-decoration:none;color:#353535;border-radius:9px}nav a.active{background:#f3e9eb;color:#7a2e38;font-weight:700}main{padding:35px clamp(20px,4vw,60px);min-width:0}.top{display:flex;align-items:center;justify-content:space-between;gap:20px}h1{font-size:clamp(29px,3vw,42px);margin:12px 0 7px}p{line-height:1.5;color:#666}.stats{display:flex;gap:12px;flex-wrap:wrap;margin:25px 0}.stat{background:#fff;border:1px solid #e1dfdb;padding:18px 24px;min-width:170px;border-radius:11px}.stat strong{display:block;font-size:30px;margin-top:7px}.tools{display:flex;gap:10px;flex-wrap:wrap;margin:24px 0}input{border:1px solid #ccc;padding:12px;font:inherit;border-radius:7px;min-width:230px}.button,button{background:#7a2e38;color:#fff;border:0;border-radius:7px;padding:12px 17px;text-decoration:none;font:inherit;cursor:pointer}.table-wrap{overflow:auto;background:#fff;border:1px solid #ddd;border-radius:11px}table{border-collapse:collapse;width:100%;min-width:900px}th,td{text-align:left;padding:15px;border-bottom:1px solid #eceae7;vertical-align:top;font-size:13px}th{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#777}td small{display:block;color:#777;margin-top:5px}details{max-width:310px}summary{cursor:pointer;color:#7a2e38}details p{white-space:pre-wrap;color:#333}.login{max-width:420px;margin:12vh auto;background:#fff;padding:35px;border:1px solid #ddd;border-radius:12px}.login label{display:grid;gap:9px;margin:22px 0}.login input{width:100%}.error{color:#9b202d}.logout{background:none;color:#7a2e38;padding:0}.empty{padding:30px}@media(max-width:750px){.layout{display:block}aside{border-right:0;border-bottom:1px solid #ddd;padding:15px}nav{display:flex;overflow:auto;margin-top:14px}nav a{white-space:nowrap}main{padding:22px}}
</style><link rel="stylesheet" href="password-visibility.css?v=20261023s"><script defer src="password-visibility.js?v=20261023s"></script></head><body>
<?php if (empty($_SESSION['admin'])): ?><div class="login"><img src="assets/unlived-logo.svg" alt="UNLIVED" width="145" style="background:#000;padding:9px"><h1>Liste d’attente</h1><p>Accès administrateur aux inscriptions et aux réponses.</p><form method="post"><input type="hidden" name="csrf" value="<?=h($_SESSION['csrf'])?>"><label>Code administrateur<input type="password" name="password" autocomplete="current-password" required autofocus></label><button>Se connecter</button></form><?php if ($error): ?><p class="error" role="alert"><?=h($error)?></p><?php endif; ?></div>
<?php else: ?><div class="layout"><aside><a href="index.html"><img src="assets/unlived-logo.svg" alt="UNLIVED"></a><nav aria-label="Administration"><a class="active" href="waitlist-admin.php">Liste d’attente</a><a href="admin.html">Administration complète</a><a href="index.html">Voir le site</a></nav></aside><main><div class="top"><div><small>ADMINISTRATION / ACTE I</small><h1>Liste d’attente</h1><p>Inscriptions et réponses au questionnaire enregistrées sur ce serveur.</p></div><form method="post"><input type="hidden" name="csrf" value="<?=h($_SESSION['csrf'])?>"><button class="logout" name="logout" value="1">Déconnexion</button></form></div>
<?php if (isset($_SESSION['notice'])): ?><p role="status"><?=h($_SESSION['notice'])?></p><?php unset($_SESSION['notice']); endif; ?>
<details style="max-width:650px;margin:24px 0"><summary>Restaurer mes comptes administrateur et client</summary><p>Importe le fichier privé de transfert généré en local. L’administrateur utilise contact@unlived.club et le client utilise client.test@unlived.example. L’ancien compte admin.test@unlived.example est renommé en conservant son identifiant et ses données. Les mots de passe restent hachés. Les autres comptes ne sont pas modifiés.</p><form method="post" enctype="multipart/form-data"><input type="hidden" name="csrf" value="<?=h($_SESSION['csrf'])?>"><input type="file" name="accounts_file" accept=".json,application/json" required aria-label="Fichier de transfert des comptes"><p><label><input type="checkbox" name="confirm_test_import" value="1" required> Je confirme la restauration des mots de passe habituels et la déconnexion des sessions existantes de ces deux comptes.</label></p><button name="import_test_accounts" value="1">Restaurer les comptes</button></form></details>
<details style="max-width:650px;margin:24px 0"><summary>Créer mon compte administrateur sur le site</summary><p>Le compte local n’est pas transféré sur Hostinger. Ce formulaire crée un compte dans la base SQLite de ce serveur, sans modifier les comptes existants. Utilise ton adresse réelle pour pouvoir récupérer ton mot de passe.</p><form method="post"><input type="hidden" name="csrf" value="<?=h($_SESSION['csrf'])?>"><label>Adresse e-mail <input type="email" name="email" autocomplete="email" required maxlength="254"></label><label>Mot de passe <input type="password" name="account_password" autocomplete="new-password" required minlength="8" maxlength="72"></label><p>8 caractères minimum, une majuscule, un chiffre et un caractère spécial.</p><button name="create_account" value="1">Créer mon compte administrateur</button></form><p><a href="compte.html">Ouvrir la connexion au compte</a></p></details>
<?php if ($dbError): ?><p class="error" role="alert"><?=h($dbError)?></p><?php else: ?><div class="stats"><div class="stat">Inscriptions<strong><?=$total?></strong></div><div class="stat">Questionnaires reçus<strong><?=$answered?></strong></div><div class="stat">En attente d’avis<strong><?=$total-$answered?></strong></div></div><div class="tools"><input id="search" type="search" placeholder="Rechercher nom, e-mail, pièce…" aria-label="Rechercher"><a class="button" href="?export=xlsx">Télécharger Excel · XLSX</a><a class="button" href="?export=csv">CSV · Excel / Google Sheets</a></div><div class="table-wrap"><table id="entries"><thead><tr><th>Personne</th><th>Contact</th><th>Pièce</th><th>Inscription</th><th>Questionnaire</th></tr></thead><tbody><?php foreach ($rows as $r): ?><tr><td><b><?=h($r['first_name'].' '.$r['last_name'])?></b></td><td><a href="mailto:<?=h($r['email'])?>"><?=h($r['email'])?></a><small><?=h($r['phone'] ?: 'Sans téléphone')?></small></td><td><?=h($r['concept_slug'])?><small>Taille <?=h($r['selected_size'])?></small></td><td><?=h($r['created_at'])?><small><?=h($r['utm_source'])?></small></td><td><?php if ($r['interest_level']!==null): ?><details><summary>Intérêt <?=h((string)$r['interest_level'])?>/5 · Lire les réponses</summary><p><b>Ce qui a plu</b><br><?=h($r['what_appealed'])?></p><p><b>À améliorer</b><br><?=h($r['what_to_improve'])?></p></details><?php else: ?>Avis en attente<?php endif; ?></td></tr><?php endforeach; ?></tbody></table><?php if (!$rows): ?><p class="empty">Aucune inscription enregistrée dans la base déployée.</p><?php endif; ?></div><?php endif; ?></main></div><script defer src="waitlist-admin-search.js?v=20261023t"></script><?php endif; ?></body></html>
