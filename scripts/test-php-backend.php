<?php
declare(strict_types=1);
// Run using PHP 8.1+, pdo_sqlite and openssl. Only temporary fixtures are modified.
$source=dirname(__DIR__);$fixture=sys_get_temp_dir().'/unlived-php-'.bin2hex(random_bytes(6));mkdir($fixture,0700,true);mkdir($fixture.'/data',0700);mkdir($fixture.'/.data',0700);
foreach(['api.php','auth-mail.php','business-api.php','auth-test-import.php','waitlist-export.php'] as $file)copy($source.'/'.$file,$fixture.'/'.$file);
copy($source.'/data/catalog.json',$fixture.'/data/catalog.json');
// An existing encrypted waitlist must survive the migration into the shared database.
$legacyKey=random_bytes(32);file_put_contents($fixture.'/.data/waitlist.key',$legacyKey);
$legacy=new PDO('sqlite:'.$fixture.'/.data/waitlist.sqlite3');$legacy->exec('CREATE TABLE launch_waitlist(id INTEGER PRIMARY KEY,created_at TEXT,first_name TEXT,last_name TEXT,email TEXT,phone TEXT,concept_slug TEXT,selected_size TEXT,feedback_token_hash TEXT,consent_at TEXT)');
$seal=static function($value)use($legacyKey){$iv=random_bytes(12);$cipher=openssl_encrypt($value,'aes-256-gcm',$legacyKey,OPENSSL_RAW_DATA,$iv,$tag);return base64_encode($iv.$tag.$cipher);};
$s=$legacy->prepare('INSERT INTO launch_waitlist VALUES (1,?,?,?,?,?,?,?,?,?)');$s->execute([gmdate('c'),$seal('Ancien'),$seal('Client'),$seal('legacy@example.com'),null,'day-one-noir','M',hash('sha256',str_repeat('a',64)),gmdate('c')]);unset($legacy);
define('UNLIVED_AUTH_MAINTENANCE',true);require $fixture.'/api.php';require $fixture.'/auth-test-import.php';
function check(bool $condition,string $message): void {if(!$condition)throw new RuntimeException($message);}
function denied(callable $operation): void {try{$operation();}catch(DomainException|InvalidArgumentException $e){return;}throw new RuntimeException('Access should have failed');}
function transaction(callable $operation): mixed {global $db;$db->exec('BEGIN IMMEDIATE');try{$r=$operation();$db->exec('COMMIT');return $r;}catch(Throwable $e){$db->exec('ROLLBACK');throw $e;}}
function makeUser(string $role): array {global $db,$key;$id=uid();$email=$id.'@example.com';$s=$db->prepare('INSERT INTO users(id,email,email_lookup,password_hash,display_name,role,created_at,email_verified) VALUES (?,?,?,?,?,?,?,1)');$s->execute([$id,cryptField($email),hash_hmac('sha256',$email,$key),hashAuthPassword('StrongPassword123!'),cryptField('Test'),$role,nowUtc()]);return ['id'=>$id,'role'=>$role];}
$admin=makeUser('admin');$client=makeUser('client');$buyer=makeUser('client');$checks=0;
$test=static function(string $name,callable $run)use(&$checks){$run();$checks++;echo 'OK '.$name."\n";};
$test('legacy waitlist migrated once with decryption',function(){check(entities('launch_waitlist')[0]['email']==='legacy@example.com','legacy decryption');initBusiness();check(count(entities('launch_waitlist'))===1,'idempotent migration');});
$test('public product access and admin-only writes',function()use($client){check(count(dataQuery(['table'=>'products'],null))>0,'seed');denied(fn()=>dataQuery(['table'=>'products','action'=>'delete','filters'=>[['op'=>'eq','key'=>'id','value'=>'x']]],$client));denied(fn()=>businessAction(['action'=>'dashboard'],null));});
$products=entities('products');$product=array_values(array_filter($products,fn($p)=>$p['status']==='active'))[0];$variant=array_values(array_filter(entities('product_variants'),fn($v)=>$v['product_id']===$product['id']))[0];
$test('product saves variant and price atomically',function()use($product,$variant,$admin){$saved=transaction(fn()=>businessAction(['action'=>'product_save','values'=>['product_id'=>$product['id'],'variant_id'=>$variant['id'],'product'=>['title'=>$product['title'],'status'=>'active','price_cents'=>4200],'variant'=>['stock_status'=>'in_stock','stock_quantity'=>null,'is_available'=>true],'media'=>['assets/test.png']]],$admin));check($saved['price_cents']===4200,'price');check(count($saved['product_media'])>0,'media');});
$test('invalid stock rolls back product update',function()use($product,$variant,$admin){denied(fn()=>transaction(fn()=>businessAction(['action'=>'product_save','values'=>['product_id'=>$product['id'],'variant_id'=>$variant['id'],'product'=>['title'=>'Must roll back','status'=>'active'],'variant'=>['stock_status'=>'in_stock','stock_quantity'=>0],'media'=>[]]],$admin)));$p=array_column(entities('products'),null,'id')[$product['id']];check($p['title']===$product['title'],'transaction rollback');});
$test('favorites are scoped to owner',function()use($product,$client,$buyer){denied(fn()=>dataQuery(['table'=>'customer_favorites','action'=>'insert','values'=>['product_id'=>$product['id'],'user_id'=>$buyer['id']]],$client));transaction(fn()=>dataQuery(['table'=>'customer_favorites','action'=>'insert','values'=>['product_id'=>$product['id'],'user_id'=>$client['id']]],$client));check(count(dataQuery(['table'=>'customer_favorites'],$client))===1,'own favorite');check(!dataQuery(['table'=>'customer_favorites'],$buyer),'other favorites hidden');});
$test('waitlist and feedback share the same store',function(){$saved=transaction(fn()=>waitlistAction(['action'=>'signup','consent'=>true,'first_name'=>'Alice','last_name'=>'Test','email'=>'alice@example.com','concept_slug'=>'day-one-noir','selected_size'=>'L']));transaction(fn()=>waitlistAction(['action'=>'feedback','feedback_token'=>$saved['feedback_token'],'interest_level'=>5,'what_appealed'=>'Le style noir','what_to_improve'=>'Plus de tailles']));check(count(entities('launch_waitlist'))===2,'signup');check(count(entities('launch_waitlist_feedback'))===1,'feedback');denied(fn()=>waitlistAction(['action'=>'feedback','feedback_token'=>str_repeat('b',64)]));});
$test('personal fields encrypted on disk',function()use($db){$raw=$db->query('SELECT data FROM app_launch_waitlist')->fetchAll(PDO::FETCH_COLUMN);check(!str_contains(implode('',$raw),'alice@example.com'),'email encrypted');});
$affiliate=transaction(fn()=>businessAction(['action'=>'affiliate_apply','values'=>['accept'=>true]],$client));
$test('affiliate pending then active with unique code',function()use($affiliate,$admin,$client){$a=transaction(fn()=>businessAction(['action'=>'affiliate_update','values'=>['id'=>$affiliate['id'],'status'=>'active','percent'=>20]],$admin));check($a['code']===$affiliate['code'],'stable code');denied(fn()=>businessAction(['action'=>'affiliate_apply','values'=>['accept'=>true]],$client));});
$token='';
$test('attribution survives return login and cart',function()use($affiliate,$buyer,$client,$product,$variant,&$token){[$ref,$token]=transaction(fn()=>attribution(null,'',$affiliate['code']));check((bool)$token,'new token');[$return]=attribution(null,$token);check($return['code']===$affiliate['code'],'return');transaction(fn()=>attribution($buyer,$token));transaction(fn()=>businessAction(['action'=>'cart_save','values'=>['items'=>[['key'=>'one','productId'=>$product['id'],'variantId'=>$variant['id'],'quantity'=>1,'size'=>'M']]]],$buyer));check(ownedEntities('carts',$buyer)[0]['affiliate_code']===$affiliate['code'],'cart attribution');check(attribution($client,$token)[0]===null,'self referral excluded');});
$test('order attribution cannot be forged',function()use($buyer,$admin,$affiliate){$orders=transaction(fn()=>dataQuery(['table'=>'orders','action'=>'insert','values'=>['customer_id'=>$buyer['id'],'status'=>'pending','currency'=>'EUR']],$admin));check($orders[0]['affiliate_code']===$affiliate['code'],'order attribution');denied(fn()=>dataQuery(['table'=>'orders','action'=>'update','filters'=>[['op'=>'eq','key'=>'id','value'=>$orders[0]['id']]],'values'=>['payment_verified'=>true,'total_cents'=>99999]],$admin));});
$test('unpaid orders never create commission',function()use($affiliate,$client){check(affiliateBalance($affiliate)['available_cents']===0,'no commission');denied(fn()=>businessAction(['action'=>'withdraw','values'=>['amount_cents'=>2000,'method'=>'bank_transfer']],$client));});
$test('marketing campaigns coupons and settings',function()use($admin){$r=transaction(fn()=>businessAction(['action'=>'campaign_create','values'=>['name'=>'Launch','slug'=>'launch-test','source'=>'email']],$admin));check(str_contains($r['url'],'utm_campaign=launch-test'),'campaign URL');transaction(fn()=>businessAction(['action'=>'discount_create','values'=>['code'=>'TEST10','percent'=>10]],$admin));check(businessAction(['action'=>'coupon','values'=>['code'=>'test10']],null)['percent']===10,'coupon');denied(fn()=>businessAction(['action'=>'settings_save','values'=>['announcement_link'=>'javascript:alert(1)']],$admin));});
$test('tracking deduplicates and excludes owner',function()use($admin){$event=['consent'=>true,'event'=>'page_view','event_id'=>'11111111-1111-4111-8111-111111111111','visitor'=>'22222222-2222-4222-8222-222222222222','session'=>'33333333-3333-4333-8333-333333333333','path'=>'/boutique.html','device'=>'desktop'];check(trackEvent($event,null,'198.51.100.1','Mozilla')['recorded'],'recorded');check(trackEvent($event,null,'198.51.100.1','Mozilla')['duplicate'],'duplicate');excludeIp('198.51.100.2');check(trackEvent($event,null,'198.51.100.2','Mozilla')['excluded'],'IP exclusion');check(trackEvent($event,$admin,'198.51.100.3','Mozilla')['excluded'],'admin exclusion');});
$test('overview dashboard and closure request',function()use($admin,$client){$o=businessAction(['action'=>'overview'],$admin);check($o['waitlist']['total']===2&&$o['waitlist']['answered']===1,'real waitlist metrics');check($o['total_views']===1,'traffic');$d=businessAction(['action'=>'dashboard'],$admin);check(count($d['affiliates'])===1,'dashboard');transaction(fn()=>businessAction(['action'=>'close_request','values'=>['reason'=>'Test request']],$client));check(count(businessAction(['action'=>'account'],$client)['closure'])===1,'closure');});
$test('paid commissions are held then reserved on withdrawal',function()use($affiliate,$client){
 addEntity('orders',['customer_id'=>'external-buyer','affiliate_code'=>$affiliate['code'],'payment_verified'=>true,'payment_status'=>'paid','status'=>'delivered','currency'=>'EUR','total_cents'=>25000,'commission_cents'=>5000,'paid_at'=>gmdate('c',time()-31*86400)]);
 check(affiliateBalance($affiliate)['available_cents']===5000,'matured commission');
 transaction(fn()=>businessAction(['action'=>'withdraw','values'=>['amount_cents'=>3000,'method'=>'bank_transfer']],$client));
 check(affiliateBalance($affiliate)['available_cents']===2000,'reserved withdrawal');
 denied(fn()=>transaction(fn()=>businessAction(['action'=>'withdraw','values'=>['amount_cents'=>3000,'method'=>'bank_transfer']],$client)));
});
$test('all account management and request actions',function()use($admin,$client){
 transaction(fn()=>businessAction(['action'=>'settings_save','values'=>['commission_percent'=>25,'withdrawal_min_cents'=>1000,'withdrawal_methods'=>['paypal'],'commission_hold_days'=>15]],$admin));
 check(settings()['commission_percent']===25,'settings');$discount=entities('discounts')[0];
 transaction(fn()=>businessAction(['action'=>'request_update','values'=>['table'=>'discounts','id'=>$discount['id'],'active'=>false]],$admin));
 denied(fn()=>businessAction(['action'=>'coupon','values'=>['code'=>$discount['code']]],null));
 $request=entities('closure_requests')[0];transaction(fn()=>businessAction(['action'=>'request_update','values'=>['table'=>'closure_requests','id'=>$request['id'],'status'=>'reviewing']],$admin));
 check(entities('closure_requests')[0]['status']==='reviewing','request updated');
 check(is_array(businessAction(['action'=>'cart_load'],$client)),'cart load');
 check(businessAction(['action'=>'mail_status'],$admin)['configured']===false,'mail status without secrets');
 check(businessAction(['action'=>'mail_retry'],$admin)['retried']===0,'mail retry');
 denied(fn()=>businessAction(['action'=>'settings_save'],$client));
});
$test('restricted test account import and revocation',function()use($db,$key){
 $hash=password_hash('MigrationPassword123!',PASSWORD_BCRYPT,['cost'=>12]);
 $payload=['format'=>'unlived-test-accounts-v1','accounts'=>[['email'=>'admin.test@unlived.example','password_hash'=>$hash],['email'=>'client.test@unlived.example','password_hash'=>$hash]]];
 importTestAccounts($db,$key,json_encode($payload));
 $q=$db->prepare('SELECT * FROM users WHERE email_lookup=?');$q->execute([hash_hmac('sha256','contact@unlived.club',$key)]);$u=$q->fetch(PDO::FETCH_ASSOC);
 check($u['role']==='admin'&&password_verify('MigrationPassword123!',$u['password_hash']),'imported hash');
 $db->prepare('INSERT INTO sessions VALUES (?,?,?)')->execute([hash('sha256','session'),$u['id'],time()+1000]);
 importTestAccounts($db,$key,json_encode($payload));check((int)$db->query('SELECT count(*) FROM sessions')->fetchColumn()===0,'revoked session');
 $payload['accounts'][0]['email']='real-admin@example.com';denied(fn()=>importTestAccounts($db,$key,json_encode($payload)));
});
$test('admin email migration preserves identity and rejects collisions',function()use($db,$key){
 $db->exec('SAVEPOINT email_test');
 try {
  $target=hash_hmac('sha256','contact@unlived.club',$key);$source=hash_hmac('sha256','admin.test@unlived.example',$key);
  $query=$db->prepare('SELECT * FROM users WHERE email_lookup=?');$query->execute([$target]);$before=$query->fetch(PDO::FETCH_ASSOC);
  $db->prepare('UPDATE users SET email=?,email_lookup=? WHERE id=?')->execute([cryptField('admin.test@unlived.example'),$source,$before['id']]);
  $db->exec('RELEASE email_test');
  $payload=['format'=>'unlived-accounts-v2','accounts'=>[['email'=>'contact@unlived.club','password_hash'=>$before['password_hash']],['email'=>'client.test@unlived.example','password_hash'=>password_hash('Client123!',PASSWORD_BCRYPT,['cost'=>12])]]];
  importTestAccounts($db,$key,json_encode($payload));$query->execute([$target]);$after=$query->fetch(PDO::FETCH_ASSOC);
  check($after['id']===$before['id']&&$after['password_hash']===$before['password_hash'],'identity and password preserved');$query->execute([$source]);check(!$query->fetch(),'old email removed');
  $legacyId=uid();$db->prepare('INSERT INTO users(id,email,email_lookup,password_hash,display_name,role,created_at,email_verified) VALUES (?,?,?,?,?,?,?,1)')->execute([$legacyId,cryptField('admin.test@unlived.example'),$source,$before['password_hash'],cryptField('Legacy'),'admin',nowUtc()]);
  denied(fn()=>importTestAccounts($db,$key,json_encode($payload)));$query->execute([$target]);check($query->fetch(PDO::FETCH_ASSOC)['id']===$before['id'],'collision leaves target unchanged');$db->prepare('DELETE FROM users WHERE id=?')->execute([$legacyId]);
 } catch(Throwable $e){throw $e;}
});
$test('deleting products also removes variants and media',function()use($product,$admin){transaction(fn()=>dataQuery(['table'=>'products','action'=>'delete','filters'=>[['op'=>'eq','key'=>'id','value'=>$product['id']]]],$admin));check(!array_filter(entities('product_variants'),fn($r)=>$r['product_id']===$product['id']),'cascade');});
$test('private favorites never surface to administrators or other accounts',function()use($client,$buyer,$admin,$db){
 $p=array_values(array_filter(entities('products'),fn($r)=>$r['status']==='active'))[0];
 $audit=count(entities('audit_events'));$mail=(int)$db->query('SELECT count(*) FROM auth_outbox')->fetchColumn();
 $saved=transaction(fn()=>dataQuery(['table'=>'customer_favorites','action'=>'insert','values'=>['product_id'=>$p['id'],'user_id'=>$client['id']]],$client));
 check(!dataQuery(['table'=>'customer_favorites'],$admin),'admin cannot read client favorites');
 check(!dataQuery(['table'=>'customer_favorites','filters'=>[['op'=>'eq','key'=>'user_id','value'=>$client['id']]]],$buyer),'forged owner filter');
 transaction(fn()=>dataQuery(['table'=>'customer_favorites','action'=>'delete','filters'=>[['op'=>'eq','key'=>'id','value'=>$saved[0]['id']]]],$buyer));
 check(count(dataQuery(['table'=>'customer_favorites'],$client))===1,'other client cannot delete');
 transaction(fn()=>dataQuery(['table'=>'customer_favorites','action'=>'update','filters'=>[['op'=>'eq','key'=>'id','value'=>$saved[0]['id']]],'values'=>['product_id'=>'invalid']],$admin));
 check(dataQuery(['table'=>'customer_favorites'],$client)[0]['product_id']===$p['id'],'admin cannot alter client favorite');
 $overview=businessAction(['action'=>'overview'],$admin);check(!array_key_exists('favorites',$overview)&&!array_key_exists('favorites_count',$overview),'no administrative aggregate');
 check(count(entities('audit_events'))===$audit&&(int)$db->query('SELECT count(*) FROM auth_outbox')->fetchColumn()===$mail,'no admin notification or email');
 denied(fn()=>businessAction(['action'=>'cart_save','values'=>['expected_user_id'=>$client['id'],'items'=>[]]],$buyer));
});
$test('original Python data-query waitlist protocol remains compatible',function(){
 $token='55555555-5555-4555-8555-555555555555';
 transaction(fn()=>dataQuery(['table'=>'launch_waitlist','action'=>'insert','values'=>['consent'=>true,'first_name'=>'Legacy','last_name'=>'Protocol','email'=>'protocol@example.com','concept_slug'=>'day-one-rouge','selected_size'=>'M','feedback_token'=>$token]],null));
 transaction(fn()=>dataQuery(['table'=>'launch_waitlist_feedback','action'=>'insert','values'=>['feedback_token'=>$token,'interest_level'=>4,'what_appealed'=>'Le design rouge','what_to_improve'=>'Plus de choix']],null));
 check(count(array_filter(entities('launch_waitlist_feedback'),fn($r)=>$r['feedback_token']===hash('sha256',$token)))===1,'legacy client feedback');
});
$test('announcement configuration is admin-only and validated',function()use($admin,$client){
 transaction(fn()=>businessAction(['action'=>'settings_save','values'=>['announcement'=>'La nouvelle édition arrive','announcement_code'=>'DAY10','announcement_duration'=>42,'announcement_enabled'=>true,'announcement_scroll'=>true]],$admin));
 $public=businessAction(['action'=>'public_settings'],null);check($public['announcement_duration']===42&&$public['announcement_code']==='DAY10','public configuration');
 denied(fn()=>businessAction(['action'=>'settings_save','values'=>['announcement_duration'=>1]],$admin));
 denied(fn()=>businessAction(['action'=>'settings_save','values'=>['announcement_duration'=>'20']],$admin));
 denied(fn()=>businessAction(['action'=>'settings_save','values'=>['announcement_scroll'=>'false']],$admin));
 denied(fn()=>businessAction(['action'=>'settings_save','values'=>['announcement'=>'Client override']],$client));
});
$test('structured personal data remains typed and encrypted',function()use($db){
 $address=['city'=>'Bamako','street'=>'Fixture street 123','contacts'=>[['email'=>'private@example.com']]];
 $r=addEntity('orders',['shipping_address'=>$address,'metadata'=>['email'=>'nested@example.com'],'payment_reference'=>'provider-fixture-reference']);
 $raw=$db->query("SELECT data FROM app_orders WHERE id='".$r['id']."'")->fetchColumn();
 foreach(['Fixture street','private@example.com','nested@example.com','provider-fixture-reference'] as $value)check(!str_contains($raw,$value),'private value encrypted');
 $decoded=array_column(entities('orders'),null,'id')[$r['id']];check($decoded['shipping_address']===$address&&$decoded['metadata']['email']==='nested@example.com','types preserved');
 removeEntity('orders',$r['id']);
 $legacy=['id'=>'legacy-fixture','message'=>'enc:php:'.cryptField('Historical private text')];$db->prepare('INSERT INTO app_contact_messages(id,data) VALUES (?,?)')->execute([$legacy['id'],json_encode($legacy)]);
 check(array_column(entities('contact_messages'),null,'id')['legacy-fixture']['message']==='Historical private text','legacy encryption readable');
});
$test('SQL injection and raw card payloads are rejected',function()use($admin,$db){
 $count=(int)$db->query('SELECT count(*) FROM users')->fetchColumn();
 denied(fn()=>dataQuery(['table'=>'products; DROP TABLE users; --','action'=>'select'],$admin));
 check(!dataQuery(['table'=>'products','action'=>'select','filters'=>[['op'=>'eq','key'=>'id OR 1=1 --','value'=>"' OR 1=1 --"]]],$admin),'filter does not become SQL');
 denied(fn()=>dataQuery(['table'=>'orders','action'=>'insert','values'=>['metadata'=>['card_number'=>'4242424242424242','cvv'=>'123']]],$admin));
 check((int)$db->query('SELECT count(*) FROM users')->fetchColumn()===$count,'users unchanged');
});
$test('closure requests reach admin without exposing other clients',function()use($admin,$client,$buyer){
 transaction(fn()=>businessAction(['action'=>'close_request','values'=>['reason'=>'Je souhaite résilier mon compte']],$buyer));
 $requests=businessAction(['action'=>'dashboard'],$admin)['closures'];check((bool)array_filter($requests,fn($r)=>$r['user_id']===$buyer['id']),'administrator receives request');
 check(businessAction(['action'=>'requests_summary'],$admin)['pending']===1,'pending badge');
 denied(fn()=>businessAction(['action'=>'requests_summary'],$client));
 check(!array_filter(businessAction(['action'=>'account'],$client)['closure'],fn($r)=>$r['user_id']===$buyer['id']),'client cannot see other request');
});
$test('existing structured personal data is migrated atomically',function()use($db){
 $row=['id'=>'old-address-fixture','shipping_address'=>['street'=>'Private old street','city'=>'Bamako'],'metadata'=>['email'=>'old-private@example.com']];
 $db->prepare('INSERT INTO app_orders(id,data) VALUES (?,?)')->execute([$row['id'],json_encode($row)]);
 $db->exec("DELETE FROM app_migrations WHERE name='personal-data-v2'");initBusiness();
 $raw=$db->query("SELECT data FROM app_orders WHERE id='old-address-fixture'")->fetchColumn();check(!str_contains($raw,'Private old street')&&!str_contains($raw,'old-private@example.com'),'historical private data encrypted');
 check(array_column(entities('orders'),null,'id')[$row['id']]['shipping_address']===$row['shipping_address'],'structured address preserved');initBusiness();check((int)$db->query("SELECT count(*) FROM app_migrations WHERE name='personal-data-v2'")->fetchColumn()===1,'migration idempotent');removeEntity('orders',$row['id']);
});
echo "$checks PHP integration tests passed (temporary database only).\n";
