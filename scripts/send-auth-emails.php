<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(403);exit;}
define('UNLIVED_MAIL_WORKER',true);
require dirname(__DIR__).'/api.php';
