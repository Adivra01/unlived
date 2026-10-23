<?php
declare(strict_types=1);
const DATA_TABLES=['products','product_variants','product_media','orders','order_items','contact_messages','customer_favorites','launch_waitlist','launch_waitlist_feedback'];
const BUSINESS_TABLES=['affiliates','withdrawals','campaigns','discounts','settings','carts','closure_requests','audit_events','analytics_events','analytics_exclusions','affiliate_attributions'];
function nowUtc(): string {return gmdate('c');}
function uid(): string {return bin2hex(random_bytes(16));}
function needUser(?array $u,bool $admin=false): void {if(!$u || ($admin && $u['role']!=='admin'))throw new DomainException('Accès non autorisé.');}
function shortText(mixed $v,int $n=250): string {if(!is_scalar($v)&&$v!==null)throw new InvalidArgumentException('Texte invalide.');return mbCut(trim((string)$v),$n);}
function mbCut(string $v,int $n): string {return function_exists('mb_substr')?mb_substr($v,0,$n):substr($v,0,$n);}
function moneyValue(mixed $v): int {if(!is_int($v)||$v<0)throw new InvalidArgumentException('Montant invalide.');return $v;}
function entityTable(string $t): string {if(!in_array($t,array_merge(DATA_TABLES,BUSINESS_TABLES),true))throw new DomainException('Table interdite.');return 'app_'.$t;}
function encodeEntity(array $r): array {foreach(['first_name','last_name','email','phone','customer_name','customer_email','name','message','what_appealed','what_to_improve','reason','address','display_name'] as $f)if(isset($r[$f])&&!str_starts_with((string)$r[$f],'enc:php:'))$r[$f]='enc:php:'.cryptField((string)$r[$f]);return $r;}
function decodeEntity(array $r): array {foreach($r as $f=>$v)if(is_string($v)&&str_starts_with($v,'enc:php:'))$r[$f]=openField(substr($v,8));return $r;}
function entities(string $t): array {global $db;return array_map(static fn($s)=>decodeEntity(json_decode($s,true,64,JSON_THROW_ON_ERROR)),$db->query('SELECT data FROM '.entityTable($t).' ORDER BY rowid')->fetchAll(PDO::FETCH_COLUMN));}
function storeEntity(string $t,array $r): array {global $db;$s=$db->prepare('INSERT INTO '.entityTable($t).'(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data');$s->execute([$r['id'],json_encode(encodeEntity($r),JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE)]);return $r;}
function addEntity(string $t,array $v): array {return storeEntity($t,array_merge(['id'=>uid(),'created_at'=>nowUtc()],$v));}
function removeEntity(string $t,string $id): void {global $db;$s=$db->prepare('DELETE FROM '.entityTable($t).' WHERE id=?');$s->execute([$id]);}
function ownedEntities(string $t,array $u): array {return array_values(array_filter(entities($t),static fn($r)=>($r['user_id']??null)===$u['id']));}
function settings(): array {return entities('settings')[0];}
function auditEvent(array $u,string $action,string $entity): void {addEntity('audit_events',['user_id'=>$u['id'],'action'=>$action,'entity'=>$entity]);}
function initBusiness(): void {
 global $db;
 $db->exec('BEGIN IMMEDIATE');
 try {
  foreach(array_merge(DATA_TABLES,BUSINESS_TABLES) as $t)$db->exec('CREATE TABLE IF NOT EXISTS '.entityTable($t).'(id TEXT PRIMARY KEY,data TEXT NOT NULL CHECK(json_valid(data)))');
  $db->exec('CREATE TABLE IF NOT EXISTS app_migrations(name TEXT PRIMARY KEY)');
  if(!$db->query("SELECT 1 FROM app_migrations WHERE name='catalog-v1'")->fetchColumn()) {
   $catalog=json_decode(file_get_contents(__DIR__.'/data/catalog.json'),true,64,JSON_THROW_ON_ERROR);
   foreach(['products','product_variants','product_media'] as $t)foreach($catalog[$t]??[] as $r)storeEntity($t,$r);
   $db->exec("INSERT INTO app_migrations VALUES ('catalog-v1')");
  }
  if(!entities('settings'))storeEntity('settings',['id'=>'site','announcement'=>'ACTE I: DAY ONE — Le premier chapitre.','announcement_link'=>'boutique.html','commission_percent'=>20,'withdrawal_min_cents'=>2000,'commission_hold_days'=>30,'withdrawal_methods'=>['mobile_money','bank_transfer']]);
  if(!$db->query("SELECT 1 FROM app_migrations WHERE name='waitlist-v1'")->fetchColumn()) {
   $file=__DIR__.'/.data/waitlist.sqlite3';
   if(is_file($file)) {
    $legacyKey=@file_get_contents(__DIR__.'/.data/waitlist.key');if($legacyKey===false||strlen($legacyKey)!==32)throw new RuntimeException('Clé waitlist historique manquante.');
    $old=new PDO('sqlite:'.$file,null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    $decrypt=static function($v)use($legacyKey){if(!$v)return ''; $raw=base64_decode($v,true);if($raw===false||strlen($raw)<28)throw new RuntimeException('Champ historique invalide.');$value=openssl_decrypt(substr($raw,28),'aes-256-gcm',$legacyKey,OPENSSL_RAW_DATA,substr($raw,0,12),substr($raw,12,16));if($value===false)throw new RuntimeException('Déchiffrement historique impossible.');return $value;};
    foreach(['launch_waitlist','launch_waitlist_feedback'] as $t) {
     $exists=$old->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?");$exists->execute([$t]);if(!$exists->fetchColumn())continue;
     foreach($old->query('SELECT * FROM '.$t)->fetchAll(PDO::FETCH_ASSOC) as $r) {
      $r['id']='legacy-'.$t.'-'.$r['id'];$r['feedback_token']=$r['feedback_token_hash'];unset($r['feedback_token_hash'],$r['email_hash']);
      foreach(['first_name','last_name','email','phone','what_appealed','what_to_improve'] as $f)if(array_key_exists($f,$r))$r[$f]=$decrypt($r[$f]);
      if(isset($r['interest_level']))$r['interest_level']=(int)$r['interest_level'];storeEntity($t,$r);
     }
    }
   }
   $db->exec("INSERT INTO app_migrations VALUES ('waitlist-v1')");
  }
  $db->exec('COMMIT');
 } catch(Throwable $e){$db->exec('ROLLBACK');throw $e;}
}
function validateRow(string $t,array $r,bool $admin): array {
 if($t==='products') {
  if(!is_string($r['title']??null)||trim($r['title'])===''||!in_array($r['status']??'', ['active','draft','archived'],true))throw new InvalidArgumentException('Produit invalide.');
  foreach(['price_cents','planned_price_cents'] as $f)if(isset($r[$f]))moneyValue($r[$f]);$r['featured']??=false;
 }
 if($t==='product_variants') {
  if(!array_filter(entities('products'),fn($p)=>$p['id']===($r['product_id']??null)))throw new InvalidArgumentException('Produit introuvable.');
  if(isset($r['stock_quantity']))moneyValue($r['stock_quantity']);
  if(!in_array($r['stock_status']??'', ['in_stock','out_of_stock','unknown'],true)||(($r['stock_quantity']??null)===0&&$r['stock_status']==='in_stock'))throw new InvalidArgumentException('Disponibilité incompatible avec le stock.');
  if(isset($r['is_available'])&&!is_bool($r['is_available']))throw new InvalidArgumentException('Disponibilité invalide.');
 }
 if($t==='product_media' && (!is_string($r['url']??null)||(!str_starts_with($r['url'],'assets/')&&!str_starts_with($r['url'],'https://'))))throw new InvalidArgumentException('URL de média invalide.');
 if($t==='contact_messages'&&!$admin) {
  $r=array_intersect_key($r,array_flip(['id','created_at','name','email','message']));$r['status']='new';
  foreach(['name','email','message'] as $f)if(!is_string($r[$f]??null)||strlen($r[$f])<1||strlen($r[$f])>5000)throw new InvalidArgumentException('Message invalide.');
  if(!filter_var($r['email'],FILTER_VALIDATE_EMAIL))throw new InvalidArgumentException('Adresse invalide.');
 }
 return $r;
}
function productJoin(array $p,bool $admin): array {
 $p['product_variants']=array_values(array_filter(entities('product_variants'),fn($v)=>$v['product_id']===$p['id']&&($admin||($v['is_available']??false))));
 $p['product_media']=array_values(array_filter(entities('product_media'),fn($m)=>$m['product_id']===$p['id']));if(!$admin)unset($p['planned_price_cents']);return $p;
}
function dataQuery(array $body,?array $user): array {
 $t=$body['table']??'';$action=$body['action']??'select';$admin=$user&&$user['role']==='admin';
 if($t==='admin_users'&&$action==='select')return $admin?[['user_id'=>$user['id']]]:[];
 if(!in_array($t,DATA_TABLES,true)||!in_array($action,['select','insert','upsert','update','delete'],true))throw new DomainException('Accès interdit.');
 if(in_array($t,['launch_waitlist','launch_waitlist_feedback'],true)&&$action==='insert') {
  $values=$body['values']??[];if(!is_array($values))throw new InvalidArgumentException('Données invalides.');$batch=array_is_list($values)?$values:[$values];if(count($batch)>100)throw new InvalidArgumentException('Trop de lignes.');$out=[];
  foreach($batch as $v){if(!is_array($v))throw new InvalidArgumentException('Ligne invalide.');$signup=$t==='launch_waitlist';$token=$signup?($v['feedback_token']??null):null;$result=waitlistAction(array_merge($v,['action'=>$signup?'signup':'feedback']),$token);if($admin){$saved=entities($t);$out[]=$saved[count($saved)-1];}}
  return $out;
 }
 $all=entities($t);if($t==='customer_favorites'){needUser($user);$all=array_values(array_filter($all,fn($r)=>$r['user_id']===$user['id']));}$active=array_column(array_filter(entities('products'),fn($p)=>$p['status']==='active'),'id');$rows=$all;
 if(!$admin) {
  if(in_array($t,['products','product_variants','product_media'],true)&&$action==='select')$rows=array_values(array_filter($rows,fn($r)=>in_array($t==='products'?$r['id']:$r['product_id'],$active,true)&&($t!=='product_variants'||($r['is_available']??false))));
  elseif($t==='customer_favorites') {needUser($user);$rows=array_values(array_filter($rows,fn($r)=>$r['user_id']===$user['id']));}
  elseif(in_array($t,['orders','order_items'],true)&&$action==='select') {needUser($user);$ids=array_column(array_filter(entities('orders'),fn($r)=>($r['customer_id']??null)===$user['id']),'id');$rows=array_values(array_filter($rows,fn($r)=>$t==='orders'?in_array($r['id'],$ids,true):in_array($r['order_id'],$ids,true)));}
  elseif($t==='contact_messages'&&$action==='insert'){}
  else throw new DomainException('Connexion administrateur requise.');
 }
 $filters=$body['filters']??[];if(!is_array($filters)||count($filters)>20)throw new InvalidArgumentException('Filtres invalides.');
 foreach($filters as $f)if(!is_array($f)||!is_string($f['key']??null)||!in_array($f['op']??'', ['eq','in'],true)||($f['op']==='in'&&!is_array($f['value']??null)))throw new InvalidArgumentException('Filtre invalide.');
 $rows=array_values(array_filter($rows,static function($r)use($filters){foreach($filters as $f){$v=$r[$f['key']]??null;if($f['op']==='eq'?$v!==($f['value']??null):!in_array($v,$f['value'],true))return false;}return true;}));
 if(in_array($action,['update','delete'],true)&&!$filters)throw new InvalidArgumentException('Identifiant requis.');
 if($action==='delete') {
  foreach($rows as $r) {
   removeEntity($t,$r['id']);
   if($t==='products')foreach(['product_variants','product_media','customer_favorites'] as $child)foreach(entities($child) as $c)if(($c['product_id']??null)===$r['id'])removeEntity($child,$c['id']);
  }return [];
 }
 if(in_array($action,['insert','upsert','update'],true)) {
  $incoming=$body['values']??[];if(!is_array($incoming))throw new InvalidArgumentException('Données invalides.');$incoming=array_is_list($incoming)?$incoming:[$incoming];if(count($incoming)>100)throw new InvalidArgumentException('Trop de lignes.');$result=[];
  foreach($incoming as $v) {
   if(!is_array($v)||array_is_list($v))throw new InvalidArgumentException('Ligne invalide.');
   if($t==='orders') {
    foreach(['payment_verified','payment_status','paid_at','commission_cents','commission_percent','total_cents','affiliate_code'] as $f)if(array_key_exists($f,$v))throw new DomainException('Le paiement doit être confirmé par le prestataire.');
    if(in_array($v['status']??'', ['processing','shipped','delivered'],true))foreach($rows as $r)if(($r['payment_verified']??false)!==true)throw new InvalidArgumentException('Paiement non confirmé.');
   }
   if($t==='customer_favorites'&&isset($v['user_id'])&&$v['user_id']!==$user['id'])throw new DomainException('Ce favori appartient à un autre compte.');
   unset($v['id'],$v['created_at']);$candidates=$action==='update'?array_map(fn($r)=>array_merge($r,$v),$rows):[array_merge($v,['id'=>uid(),'created_at'=>nowUtc()])];
   foreach($candidates as $r) {
    if($t==='customer_favorites') {
     if(!in_array($r['product_id']??null,$active,true))throw new InvalidArgumentException('Produit indisponible.');
     $prior=array_values(array_filter($all,fn($x)=>$x['product_id']===$r['product_id']&&$x['user_id']===$user['id']));
     if($prior){if($action==='upsert'){$result[]=$prior[0];continue;}throw new InvalidArgumentException('Favori déjà enregistré.');}
     $r=array_intersect_key($r,array_flip(['id','created_at','product_id']));$r['user_id']=$user['id'];
    }
    if(in_array($t,['launch_waitlist','launch_waitlist_feedback'],true)) {
     if($action!=='update')throw new InvalidArgumentException('Utilise le formulaire sécurisé de liste d’attente.');
     // Administrative corrections retain the existing response link.
     $prior=array_values(array_filter($rows,fn($x)=>$x['id']===$r['id']))[0];$r['feedback_token']=$prior['feedback_token'];
     if($t==='launch_waitlist') {
      foreach(['first_name','last_name','email'] as $f)if(!is_string($r[$f]??null)||trim($r[$f])==='')throw new InvalidArgumentException('Champ invalide.');
      if(!filter_var($r['email'],FILTER_VALIDATE_EMAIL)||!in_array($r['concept_slug']??'', ['day-one-blanc','day-one-noir','day-one-rouge'],true)||!in_array($r['selected_size']??'', ['XS','S','M','L','XL','XXL'],true))throw new InvalidArgumentException('Inscription invalide.');
     } else {
      if(!is_int($r['interest_level']??null)||$r['interest_level']<1||$r['interest_level']>5)throw new InvalidArgumentException('Note invalide.');
      foreach(['what_appealed','what_to_improve'] as $f)if(!is_string($r[$f]??null)||strlen($r[$f])<5||strlen($r[$f])>2000)throw new InvalidArgumentException('Réponse invalide.');
     }
    }
    if($t==='orders'&&$action!=='update') {
     global $db;$s=$db->prepare('SELECT * FROM users WHERE id=?');$s->execute([$r['customer_id']??'']);$buyer=$s->fetch(PDO::FETCH_ASSOC)?:null;[$ref]=attribution($buyer);$aff=array_values(array_filter(entities('affiliates'),fn($a)=>$ref&&$a['code']===$ref['code']));$r['affiliate_code']=$aff[0]['code']??null;$r['commission_percent']=$aff[0]['percent']??0;
    }
    $r=validateRow($t,$r,(bool)$admin);$r['updated_at']=nowUtc();storeEntity($t,$r);$result[]=$r;
   }
  }
  return $admin||$t==='customer_favorites'?$result:[];
 }
 $orders=$body['orders']??[];foreach(array_reverse($orders) as $order){$field=$order['key']??'';$ascending=$order['ascending']??true;usort($rows,fn($a,$b)=>((($a[$field]??null)===null)<=>((($b[$field]??null)===null)) ?: (($a[$field]??'')<=>($b[$field]??'')))*($ascending?1:-1));}
 $rows=array_slice($rows,max(0,(int)($body['offset']??0)),min(1000,max(1,(int)($body['limit']??1000))));
 if($t==='products')$rows=array_map(fn($p)=>productJoin($p,(bool)$admin),$rows);
 if($t==='customer_favorites'){$products=[];foreach(entities('products') as $p)if($admin||in_array($p['id'],$active,true))$products[$p['id']]=productJoin($p,(bool)$admin);$rows=array_map(fn($r)=>array_merge($r,['products'=>$products[$r['product_id']]??null]),$rows);}
 if($t==='orders')$rows=array_map(fn($r)=>array_merge($r,['order_items'=>array_values(array_filter(entities('order_items'),fn($i)=>$i['order_id']===$r['id']))]),$rows);
 return $rows;
}
function waitlistAction(array $body,?string $tokenOverride=null): array {
 $action=$body['action']??'';
 if($action==='signup') {
  if(!empty($body['website']))return ['ok'=>true];
  if(($body['consent']??null)!==true)throw new InvalidArgumentException('Consentement requis.');
  $row=[];foreach(['first_name'=>80,'last_name'=>100,'email'=>254,'phone'=>40,'utm_source'=>160,'utm_campaign'=>160,'utm_content'=>160] as $f=>$max){$value=$body[$f]??'';if(!is_string($value)&&$value!==null)throw new InvalidArgumentException('Champ invalide.');if(strlen((string)$value)>$max)throw new InvalidArgumentException('Champ trop long.');$row[$f]=trim((string)$value);}
  $row['email']=strtolower($row['email']);if(!$row['first_name']||!$row['last_name']||!filter_var($row['email'],FILTER_VALIDATE_EMAIL))throw new InvalidArgumentException('Nom ou e-mail invalide.');
  $row['concept_slug']=$body['concept_slug']??'';$row['selected_size']=$body['selected_size']??'';
  if(!in_array($row['concept_slug'],['day-one-blanc','day-one-noir','day-one-rouge'],true)||!in_array($row['selected_size'],['XS','S','M','L','XL','XXL'],true))throw new InvalidArgumentException('Sélection invalide.');
  foreach(entities('launch_waitlist') as $prior)if($prior['email']===$row['email']&&$prior['concept_slug']===$row['concept_slug'])throw new InvalidArgumentException('Cette adresse est déjà inscrite pour cette pièce.');
  if($tokenOverride!==null&&!preg_match('/^(?:[a-f0-9]{64}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/iD',$tokenOverride))throw new InvalidArgumentException('Jeton invalide.');
  $token=$tokenOverride??bin2hex(random_bytes(32));$row['feedback_token']=hash('sha256',$token);foreach(entities('launch_waitlist') as $prior)if($prior['feedback_token']===$row['feedback_token'])throw new InvalidArgumentException('Jeton déjà utilisé.');$row['consent_at']=nowUtc();addEntity('launch_waitlist',$row);return ['ok'=>true,'feedback_token'=>$token];
 }
 if($action==='feedback') {
  $token=$body['feedback_token']??'';if(!is_string($token)||!preg_match('/^(?:[a-f0-9]{64}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/iD',$token))throw new InvalidArgumentException('Jeton invalide.');$digest=hash('sha256',$token);
  if(!array_filter(entities('launch_waitlist'),fn($r)=>$r['feedback_token']===$digest))throw new InvalidArgumentException('Inscription introuvable.');
  if(array_filter(entities('launch_waitlist_feedback'),fn($r)=>$r['feedback_token']===$digest))throw new InvalidArgumentException('Avis déjà enregistré.');
  $r=['feedback_token'=>$digest,'interest_level'=>$body['interest_level']??null];if(!is_int($r['interest_level'])||$r['interest_level']<1||$r['interest_level']>5)throw new InvalidArgumentException('Note invalide.');
  foreach(['what_appealed','what_to_improve'] as $f){$value=$body[$f]??null;if(!is_string($value)||strlen(trim($value))<5||strlen($value)>2000)throw new InvalidArgumentException('Réponse invalide.');$r[$f]=trim($value);}addEntity('launch_waitlist_feedback',$r);return ['ok'=>true];
 }
 throw new InvalidArgumentException('Action inconnue.');
}
function excludeIp(string $ip): void {global $key;storeEntity('analytics_exclusions',['id'=>hash_hmac('sha256','analytics-exclusion:'.$ip,$key),'expires'=>time()+365*86400]);}
function ipExcluded(string $ip): bool {global $key;$id=hash_hmac('sha256','analytics-exclusion:'.$ip,$key);foreach(entities('analytics_exclusions') as $r)if($r['id']===$id&&$r['expires']>time())return true;return false;}
function attribution(?array $user=null,string $token='',?string $code=null): array {
 $current=null;$entries=entities('affiliate_attributions');usort($entries,fn($a,$b)=>$b['expires']<=>$a['expires']);
 if($user&&$user['role']==='admin')return [null,null];
 foreach($entries as $r)if($token&&$r['id']===hash('sha256',$token)&&$r['expires']>time()){$current=$r;break;}
 if(!$current&&$user)foreach($entries as $r)if(($r['user_id']??null)===$user['id']&&$r['expires']>time()){$current=$r;break;}
 $active=[];foreach(entities('affiliates') as $a)if($a['status']==='active'&&(!$user||$a['user_id']!==$user['id']))$active[$a['code']]=$a;
 if($code&&isset($active[$code])&&(!$current||$current['code']!==$code)) {
  $token=bin2hex(random_bytes(32));$current=['id'=>hash('sha256',$token),'code'=>$code,'expires'=>time()+30*86400];if($user)$current['user_id']=$user['id'];storeEntity('affiliate_attributions',$current);return [$current,$token];
 }
 if($current&&isset($active[$current['code']])){if($user&&($current['user_id']??null)!==$user['id']){$current['user_id']=$user['id'];storeEntity('affiliate_attributions',$current);}return [$current,null];}return [null,null];
}
function newAffiliateCode(): string {do{$code=bin2hex(random_bytes(5));}while(array_filter(entities('affiliates'),fn($r)=>($r['code']??null)===$code));return $code;}
function countsFor(string $field,array $items,int $limit=30): array {$counts=[];foreach($items as $r){$name=$r[$field]??'Inconnu';$name=$name?:'Inconnu';$counts[$name]=($counts[$name]??0)+1;}arsort($counts);$result=[];foreach(array_slice($counts,0,$limit,true) as $name=>$count)$result[]=['name'=>(string)$name,'count'=>$count];return $result;}
function trafficStats(int $days=30,?string $affiliate=null,?string $campaign=null): array {
 $start=gmdate('Y-m-d',time()-($days-1)*86400);$events=array_values(array_filter(entities('analytics_events'),fn($e)=>substr($e['created_at'],0,10)>=$start&&(!$affiliate||($e['affiliate']??null)===$affiliate)&&(!$campaign||($e['campaign']??null)===$campaign)));
 $visits=array_values(array_filter($events,fn($e)=>$e['event']==='page_view'));$daily=[];
 for($i=$days-1;$i>=0;$i--){$day=gmdate('Y-m-d',time()-$i*86400);$items=array_filter($visits,fn($r)=>substr($r['created_at'],0,10)===$day);$daily[]=['day'=>$day,'views'=>count($items),'visitors'=>count(array_unique(array_column($items,'visitor')))];}
 return ['views'=>count($visits),'visitors'=>count(array_unique(array_column($visits,'visitor'))),'sessions'=>count(array_unique(array_column($visits,'session'))),'daily'=>$daily,'pages'=>countsFor('path',$visits),'countries'=>countsFor('country',$visits),'products'=>countsFor('product',array_filter($events,fn($e)=>$e['event']==='product_view')),'events'=>countsFor('event',$events),'sources'=>countsFor('source',$visits),'devices'=>countsFor('device',$visits)];
}
function paidOrders(): array {return array_values(array_filter(entities('orders'),fn($o)=>($o['payment_verified']??false)===true&&($o['payment_status']??null)==='paid'&&!in_array($o['status']??'', ['cancelled','refunded'],true)&&($o['currency']??'EUR')==='EUR'));}
function affiliateBalance(array $a): array {
 $orders=array_values(array_filter(paidOrders(),fn($o)=>($o['affiliate_code']??null)===$a['code']&&($o['customer_id']??null)!==$a['user_id']));$pending=0;$available=0;$hold=settings()['commission_hold_days'];
 foreach($orders as $o){$value=(int)($o['commission_cents']??0);$paid=strtotime($o['paid_at']??'');if($paid&&$paid<time()-$hold*86400)$available+=$value;else $pending+=$value;}
 $withdrawals=array_values(array_filter(entities('withdrawals'),fn($w)=>$w['user_id']===$a['user_id']));$reserved=0;foreach($withdrawals as $w)if(in_array($w['status'],['requested','approved','paid'],true))$reserved+=$w['amount_cents'];
 return ['sales_cents'=>array_sum(array_column($orders,'total_cents')),'orders'=>count($orders),'pending_cents'=>$pending,'earned_cents'=>$available+$pending,'available_cents'=>max(0,$available-$reserved),'withdrawals'=>$withdrawals];
}
function businessOverview(int $days): array {
 global $db;$start=gmdate('Y-m-d',time()-($days-1)*86400);$traffic=trafficStats($days);$visits=array_filter(entities('analytics_events'),fn($e)=>$e['event']==='page_view');$paid=paidOrders();$period=array_values(array_filter($paid,fn($o)=>substr($o['paid_at']??$o['created_at'],0,10)>=$start));$ids=array_column($period,'id');$names=[];
 foreach(entities('products') as $p){$names[$p['id']]=$p['title'];$names[$p['slug']??$p['id']]=$p['title'];}foreach($traffic['products'] as &$r)$r['name']=$names[$r['name']]??$r['name'];unset($r);
 $sold=[];foreach(entities('order_items') as $i)if(in_array($i['order_id'],$ids,true))$sold[$i['product_id']]=($sold[$i['product_id']]??0)+max(0,(int)($i['quantity']??0));
 $waitlist=entities('launch_waitlist');$interest=[];$feedback=[];foreach(entities('launch_waitlist_feedback') as $r)$feedback[$r['feedback_token']]=$r;
 foreach($waitlist as $r)if(substr($r['created_at'],0,10)>=$start){$k=$r['concept_slug'];$interest[$k]=($interest[$k]??0)+1;}
 $rank=static function($counter)use($names){arsort($counter);$out=[];foreach(array_slice($counter,0,10,true) as $k=>$v)$out[]=['name'=>$names[$k]??$k,'count'=>$v];return $out;};
 $daily=[];foreach($traffic['daily'] as $d){$sum=0;foreach($period as $o)if(substr($o['paid_at']??$o['created_at'],0,10)===$d['day'])$sum+=$o['total_cents']??0;$daily[]=['day'=>$d['day'],'revenue_cents'=>$sum];}
 usort($waitlist,fn($a,$b)=>strcmp($b['created_at'],$a['created_at']));$recent=[];$answered=0;
 foreach($waitlist as $r)if(isset($feedback[$r['feedback_token']]))$answered++;
 foreach(array_slice($waitlist,0,5) as $r){$x=array_intersect_key($r,array_flip(['id','first_name','last_name','email','concept_slug','selected_size','created_at']));$x['feedback']=isset($feedback[$r['feedback_token']])?array_intersect_key($feedback[$r['feedback_token']],array_flip(['interest_level','what_appealed','what_to_improve','created_at'])):null;$recent[]=$x;}
 $s=$db->prepare("SELECT count(*) FROM users WHERE role='client' AND substr(created_at,1,10)>=?");$s->execute([$start]);$revenue=array_sum(array_column($period,'total_cents'));
 return ['days'=>$days,'traffic'=>$traffic,'total_visitors'=>count(array_unique(array_column($visits,'visitor'))),'total_views'=>count($visits),'revenue_cents'=>array_sum(array_column($paid,'total_cents')),'period_revenue_cents'=>$revenue,'paid_orders'=>count($period),'average_order_cents'=>$period?(int)round($revenue/count($period)):0,'daily_revenue'=>$daily,'registrations'=>(int)$s->fetchColumn(),'interest_count'=>array_sum($interest),'best_sellers'=>$rank($sold),'interest'=>$rank($interest),'waitlist'=>['total'=>count($waitlist),'period'=>array_sum($interest),'answered'=>$answered,'recent'=>$recent,'source'=>'shared'],'retention_days'=>395];
}
function saveProduct(array $v,array $user): array {
 $product=array_intersect_key($v['product']??[],array_flip(['title','slug','collection','category','description','status','price_cents','planned_price_cents','currency']));$variant=array_intersect_key($v['variant']??[],array_flip(['color_name','color_slug','color_hex','sku','stock_quantity','stock_status','is_available']));$pid=$v['product_id']??null;$vid=$v['variant_id']??null;$urls=$v['media']??[];
 if(!is_array($urls)||count($urls)>40)throw new InvalidArgumentException('Médias invalides.');foreach($urls as $url)if(!is_string($url)||(!str_starts_with($url,'assets/')&&!str_starts_with($url,'https://')))throw new InvalidArgumentException('Média invalide.');
 if($pid&&!array_filter(entities('products'),fn($r)=>$r['id']===$pid))throw new InvalidArgumentException('Produit introuvable.');
 if($vid&&!array_filter(entities('product_variants'),fn($r)=>$r['id']===$vid&&$r['product_id']===$pid))throw new InvalidArgumentException('Variante introuvable.');
 $write=static fn($t,$values,$id=null)=>dataQuery(['table'=>$t,'action'=>$id?'update':'insert','values'=>$values,'filters'=>$id?[['op'=>'eq','key'=>'id','value'=>$id]]:[]],$user)[0];
 $saved=$write('products',$product,$pid);$pid=$saved['id'];$variant['product_id']=$pid;$sv=$write('product_variants',$variant,$vid);$vid=$sv['id'];$previous=array_values(array_filter(entities('product_media'),fn($r)=>$r['product_id']===$pid&&($r['variant_id']??null)===$vid));usort($previous,fn($a,$b)=>($a['sort_order']??0)<=>($b['sort_order']??0));$urls=array_values(array_unique($urls));
 foreach($urls as $i=>$url){$values=['product_id'=>$pid,'variant_id'=>$vid,'url'=>$url,'media_type'=>preg_match('/\.mp4(?:\?|$)/i',$url)?'video':'image','alt_text'=>$saved['title'].' — '.($variant['color_name']??''),'sort_order'=>$i];$write('product_media',$values,$previous[$i]['id']??null);}
 foreach(array_slice($previous,count($urls)) as $r)removeEntity('product_media',$r['id']);auditEvent($user,'product_save',$pid);return productJoin($saved,true);
}
function businessAction(array $body,?array $user): mixed {
 global $db;$action=$body['action']??'';$v=$body['values']??[];if(!is_array($v))throw new InvalidArgumentException('Données invalides.');
 if($action==='public_settings')return array_intersect_key(settings(),array_flip(['announcement','announcement_link','commission_percent','withdrawal_min_cents','commission_hold_days']));
 if($action==='coupon'){$code=strtoupper(shortText($v['code']??'',40));foreach(entities('discounts') as $r)if($r['code']===$code&&$r['active']&&(!$r['expires']||$r['expires']>=gmdate('Y-m-d')))return ['code'=>$code,'percent'=>$r['percent'],'note'=>'Applicable à une future commande éligible ; aucun paiement actuellement.'];throw new InvalidArgumentException('Code invalide ou expiré.');}
 needUser($user);
 if($action==='account'){$aff=ownedEntities('affiliates',$user)[0]??null;return ['public_origin'=>mailOrigin(),'user_id'=>$user['id'],'role'=>$user['role'],'affiliate'=>$aff,'balance'=>$aff?affiliateBalance($aff):null,'stats'=>$aff?trafficStats(30,$aff['code']):null,'cart'=>ownedEntities('carts',$user)[0]['items']??[],'closure'=>ownedEntities('closure_requests',$user),'settings'=>settings()];}
 if($action==='cart_load') {
  $result=[];$products=array_column(entities('products'),null,'id');$variants=array_column(entities('product_variants'),null,'id');
  foreach(ownedEntities('carts',$user)[0]['items']??[] as $x){$p=$products[$x['productId']]??null;$variant=$variants[$x['variantId']]??null;if(!$p||!$variant||$p['status']!=='active')continue;$photo='';foreach(entities('product_media') as $m)if($m['product_id']===$p['id']&&$m['media_type']==='image'){$photo=$m['url'];break;}$result[]=array_merge($x,['title'=>$p['title'],'collection'=>$p['collection']??'','variantName'=>$variant['color_name']??'','image'=>$photo,'priceCents'=>null,'currency'=>$p['currency']??'EUR']);}return $result;
 }
 if($action==='cart_save') {
  if(isset($v['expected_user_id'])&&$v['expected_user_id']!==$user['id'])throw new DomainException('Le compte a changé. Recharge ton panier.');
  $items=$v['items']??[];if(!is_array($items)||count($items)>40)throw new InvalidArgumentException('Panier trop grand.');$clean=[];$variants=array_column(entities('product_variants'),null,'id');$products=array_column(entities('products'),null,'id');
  foreach($items as $x){if(!is_array($x))throw new InvalidArgumentException('Panier invalide.');$variant=$variants[$x['variantId']??'']??null;$p=$products[$x['productId']??'']??null;if(!$variant||!$p||$variant['product_id']!==$p['id']||$p['status']!=='active')continue;$q=$x['quantity']??1;if(!is_int($q)||$q<1||$q>20||!in_array($x['size']??'', ['XS','S','M','L','XL','XXL'],true))throw new InvalidArgumentException('Taille ou quantité invalide.');$clean[]=array_intersect_key($x,array_flip(['key','productId','variantId','size','quantity']));}
  [$ref]=attribution($user);storeEntity('carts',['id'=>$user['id'],'user_id'=>$user['id'],'items'=>$clean,'affiliate_code'=>$ref['code']??null,'updated_at'=>nowUtc()]);return $clean;
 }
 if($action==='affiliate_apply') {
  if($user['role']!=='client')throw new DomainException('Seuls les clients peuvent candidater.');if(ownedEntities('affiliates',$user))throw new InvalidArgumentException('Demande déjà enregistrée.');if(($v['accept']??null)!==true)throw new InvalidArgumentException('Accepte les conditions du programme.');return addEntity('affiliates',['user_id'=>$user['id'],'code'=>newAffiliateCode(),'status'=>'pending','percent'=>settings()['commission_percent'],'terms_accepted_at'=>nowUtc(),'terms_version'=>'2026-10-19']);
 }
 if($action==='withdraw') {
  if($user['role']!=='client')throw new DomainException('Seuls les clients peuvent demander un retrait.');$aff=ownedEntities('affiliates',$user)[0]??null;if(!$aff||$aff['status']!=='active')throw new InvalidArgumentException('Affiliation non active.');$method=shortText($v['method']??'',30);$s=settings();if(!in_array($method,$s['withdrawal_methods'],true))throw new InvalidArgumentException('Mode de retrait non autorisé.');$amount=moneyValue($v['amount_cents']??null);$b=affiliateBalance($aff);if($amount<$s['withdrawal_min_cents']||$amount>$b['available_cents'])throw new InvalidArgumentException('Solde insuffisant ou seuil non atteint.');return addEntity('withdrawals',['user_id'=>$user['id'],'amount_cents'=>$amount,'currency'=>'EUR','method'=>$method,'status'=>'requested']);
 }
 if($action==='close_request'){if(ownedEntities('closure_requests',$user))throw new InvalidArgumentException('Une demande existe déjà.');return addEntity('closure_requests',['user_id'=>$user['id'],'reason'=>shortText($v['reason']??'',1000),'status'=>'requested']);}
 needUser($user,true);
 if($action==='mail_status'){$c=mailConfig();return ['configured'=>(bool)($c['RESEND_API_KEY']&&$c['RESEND_FROM']),'pending'=>(int)$db->query("SELECT count(*) FROM auth_outbox WHERE status='pending' AND attempts<5")->fetchColumn(),'failed'=>(int)$db->query('SELECT count(*) FROM auth_outbox WHERE attempts>=5')->fetchColumn()];}
 if($action==='mail_retry'){$s=$db->prepare("UPDATE auth_outbox SET status='pending',attempts=0,next_attempt=? WHERE attempts>=5");$s->execute([time()]);$count=$s->rowCount();auditEvent($user,'mail_retry',(string)$count);return ['retried'=>$count];}
 if($action==='product_save')return saveProduct($v,$user);
 if($action==='overview')return businessOverview(max(1,min(366,(int)($v['days']??30))));
 if($action==='dashboard'){$days=max(1,min(366,(int)($v['days']??30)));$users=[];foreach($db->query('SELECT * FROM users')->fetchAll(PDO::FETCH_ASSOC) as $u)$users[]=array_merge(publicUser($u),['role'=>$u['role'],'created_at'=>$u['created_at']]);$aff=[];foreach(entities('affiliates') as $a)$aff[]=array_merge($a,['balance'=>affiliateBalance($a),'stats'=>trafficStats($days,$a['code'])]);return ['stats'=>trafficStats($days,$v['affiliate']??null,$v['campaign']??null),'users'=>$users,'products'=>entities('products'),'variants'=>entities('product_variants'),'media'=>entities('product_media'),'affiliates'=>$aff,'campaigns'=>entities('campaigns'),'discounts'=>entities('discounts'),'settings'=>settings(),'withdrawals'=>entities('withdrawals'),'closures'=>entities('closure_requests'),'audit'=>array_reverse(array_slice(entities('audit_events'),-100))];}
 if($action==='settings_save') {
  $s=settings();$percent=(int)($v['commission_percent']??$s['commission_percent']);if($percent<0||$percent>100)throw new InvalidArgumentException('Commission entre 0 et 100 %.');$link=shortText($v['announcement_link']??$s['announcement_link'],250);if(!preg_match('/^[a-z0-9-]+\.html(?:#[a-z0-9-]+)?$/D',$link))throw new InvalidArgumentException('Lien interne attendu.');$methods=$v['withdrawal_methods']??$s['withdrawal_methods'];if(!is_array($methods)||!count($methods)||count($methods)>3||array_diff($methods,['mobile_money','bank_transfer','paypal']))throw new InvalidArgumentException('Modes de retrait invalides.');
  $s=array_merge($s,['announcement'=>shortText($v['announcement']??$s['announcement'],200),'announcement_link'=>$link,'commission_percent'=>$percent,'withdrawal_min_cents'=>moneyValue($v['withdrawal_min_cents']??$s['withdrawal_min_cents']),'commission_hold_days'=>max(0,min(365,(int)($v['commission_hold_days']??$s['commission_hold_days']))),'withdrawal_methods'=>array_values(array_unique($methods))]);storeEntity('settings',$s);auditEvent($user,$action,'site');return $s;
 }
 if($action==='campaign_create'){$slug=strtolower(shortText($v['slug']??'',60));if(!preg_match('/^[a-z0-9-]{3,60}$/D',$slug))throw new InvalidArgumentException('Identifiant invalide.');foreach(entities('campaigns') as $r)if($r['slug']===$slug)throw new InvalidArgumentException('Identifiant déjà utilisé.');$r=addEntity('campaigns',['name'=>shortText($v['name']??'',100),'slug'=>$slug,'source'=>shortText($v['source']??'',80),'url'=>mailOrigin().'/boutique.html?utm_source='.$slug.'&utm_campaign='.$slug]);auditEvent($user,$action,$r['id']);return $r;}
 if($action==='discount_create'){$code=strtoupper(shortText($v['code']??'',40));$percent=(int)($v['percent']??0);$expires=shortText($v['expires']??'',10);if(!preg_match('/^[A-Z0-9-]{3,40}$/D',$code)||$percent<1||$percent>100||($expires&&(!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$expires)||date('Y-m-d',strtotime($expires))!==$expires)))throw new InvalidArgumentException('Code, pourcentage ou date invalide.');foreach(entities('discounts') as $r)if($r['code']===$code)throw new InvalidArgumentException('Code déjà utilisé.');$r=addEntity('discounts',['code'=>$code,'percent'=>$percent,'expires'=>$expires,'active'=>true]);auditEvent($user,$action,$r['id']);return $r;}
 if($action==='affiliate_update'){$r=null;foreach(entities('affiliates') as $x)if($x['id']===($v['id']??null))$r=$x;$status=$v['status']??'';$percent=(int)($v['percent']??20);if(!$r||!in_array($status,['active','rejected','suspended','pending'],true)||$percent<0||$percent>100)throw new InvalidArgumentException('Affilié ou statut invalide.');if($status==='active'&&empty($r['code']))$r['code']=newAffiliateCode();$r['status']=$status;$r['percent']=$percent;storeEntity('affiliates',$r);auditEvent($user,$action,$r['id']);return $r;}
 if($action==='request_update'){$t=$v['table']??'';if(!in_array($t,['withdrawals','closure_requests','discounts'],true))throw new InvalidArgumentException('Action invalide.');$r=null;foreach(entities($t) as $x)if($x['id']===($v['id']??null))$r=$x;if(!$r)throw new InvalidArgumentException('Demande introuvable.');if($t==='discounts')$r['active']=(bool)($v['active']??false);else{$allowed=$t==='withdrawals'?['approved','rejected']:['reviewing','rejected'];if(!in_array($v['status']??'', $allowed,true))throw new InvalidArgumentException('Statut invalide.');$r['status']=$v['status'];}storeEntity($t,$r);auditEvent($user,$action,$r['id']);return $r;}
 throw new InvalidArgumentException('Action inconnue.');
}
function trackEvent(array $body,?array $user,string $ip,string $ua): array {
 global $key;
 if(in_array($ip,['127.0.0.1','::1'],true)||($user&&$user['role']==='admin')||ipExcluded($ip)||preg_match('/bot|crawler|spider/i',$ua)||($body['consent']??null)!==true||($_COOKIE['unlived_analytics_exclude']??'')==='1')return ['excluded'=>true];
 $event=$body['event']??'';$path=shortText($body['path']??'',100);if(!in_array($event,['page_view','product_view','waitlist_success','add_to_cart'],true)||!preg_match('~^/[a-z0-9-]*\.?[a-z]*$~D',$path))throw new InvalidArgumentException('Événement invalide.');
 foreach(['visitor','session'] as $f)if(!is_string($body[$f]??null)||!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iD',$body[$f]))throw new InvalidArgumentException('Identifiant invalide.');
 $visitor=hash_hmac('sha256',gmdate('Y-m').$body['visitor'],$key);$session=hash_hmac('sha256',$body['session'],$key);$eventId=$body['event_id']??null;if($eventId&&(!is_string($eventId)||!preg_match('/^[0-9a-f-]{36}$/iD',$eventId)))throw new InvalidArgumentException('Événement invalide.');
 foreach(entities('analytics_events') as $r)if($r['session']===$session&&($eventId?($r['event_id']??null)===$eventId:($r['path']===$path&&$r['event']===$event&&($r['product']??'')===shortText($body['product']??'',60)&&substr($r['created_at'],0,16)===substr(nowUtc(),0,16))))return ['duplicate'=>true];
 $aff=shortText($body['affiliate']??'',20);if(!array_filter(entities('affiliates'),fn($a)=>$a['code']===$aff&&$a['status']==='active'&&(!$user||$a['user_id']!==$user['id'])))$aff='';$country=strtoupper(shortText($body['country']??'',2));if(!preg_match('/^[A-Z]{2}$/D',$country))$country='??';$device=in_array($body['device']??'', ['mobile','tablet','desktop'],true)?$body['device']:'unknown';
 addEntity('analytics_events',['event'=>$event,'event_id'=>$eventId,'path'=>$path,'visitor'=>$visitor,'session'=>$session,'country'=>$country,'product'=>shortText($body['product']??'',60),'affiliate'=>$aff,'campaign'=>shortText($body['campaign']??'',60),'source'=>shortText($body['source']??'',80),'device'=>$device]);$cutoff=gmdate('c',time()-395*86400);foreach(entities('analytics_events') as $r)if($r['created_at']<$cutoff)removeEntity('analytics_events',$r['id']);return ['recorded'=>true];
}
