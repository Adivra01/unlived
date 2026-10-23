<?php
declare(strict_types=1);
// Invoked only inside the authenticated, CSRF-protected waitlist administrator POST.
function importTestAccounts(PDO $db, string $key, string $payload): void {
    if (strlen($payload)>8192) throw new InvalidArgumentException('Fichier trop volumineux.');
    $bundle=json_decode($payload,true,16,JSON_THROW_ON_ERROR);
    $roles=['admin.test@unlived.example'=>'admin','client.test@unlived.example'=>'client'];
    if (($bundle['format']??'')!=='unlived-test-accounts-v1' || !is_array($bundle['accounts']??null) || count($bundle['accounts'])!==2) throw new InvalidArgumentException('Fichier de transfert invalide.');
    $validated=[];
    foreach ($bundle['accounts'] as $account) {
        if (!is_array($account)) throw new InvalidArgumentException('Compte invalide.');
        $email=$account['email']??'';$hash=$account['password_hash']??'';
        if (!is_string($email) || !isset($roles[$email]) || isset($validated[$email]) || !is_string($hash) || !preg_match('/^\$2[by]\$12\$[.\/A-Za-z0-9]{53}$/D',$hash)) throw new InvalidArgumentException('Seuls les deux comptes de test et leurs mots de passe hachés sont acceptés.');
        $validated[$email]=$hash;
    }
    $db->exec('BEGIN IMMEDIATE');
    try {
        foreach($validated as $email=>$hash) {
            $lookup=hash_hmac('sha256',$email,$key);
            $query=$db->prepare('SELECT id,role FROM users WHERE email_lookup=?');$query->execute([$lookup]);$existing=$query->fetch(PDO::FETCH_ASSOC);
            if ($existing && $existing['role']!==$roles[$email]) throw new InvalidArgumentException('Le rôle du compte existant ne correspond pas. Aucun compte modifié.');
            if ($existing) {
                $id=$existing['id'];$query=$db->prepare('UPDATE users SET password_hash=?,email_verified=1 WHERE id=?');$query->execute([$hash,$id]);
                foreach(['sessions','auth_tokens'] as $table) {$query=$db->prepare('DELETE FROM '.$table.' WHERE user_id=?');$query->execute([$id]);}
            } else {
                $id=bin2hex(random_bytes(16));$query=$db->prepare('INSERT INTO users(id,email,email_lookup,password_hash,display_name,role,created_at,email_verified) VALUES (?,?,?,?,?,?,?,1)');
                $query->execute([$id,cryptField($email),$lookup,$hash,cryptField($roles[$email]==='admin'?'Administrateur test':'Client test'),$roles[$email],gmdate('c')]);
            }
        }
        $db->exec('COMMIT');
    } catch(Throwable $e) {$db->exec('ROLLBACK');throw $e;}
}
