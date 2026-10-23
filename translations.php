<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
$method=$_SERVER['REQUEST_METHOD']??'GET';
if(!in_array($method,['GET','HEAD'],true)){http_response_code(405);header('Allow: GET, HEAD');exit;}
$language=basename((string)parse_url($_SERVER['REQUEST_URI']??'',PHP_URL_PATH));
if(!in_array($language,['fr','en','es','it','ar'],true)){http_response_code(404);exit;}
$content=@file_get_contents(__DIR__.'/locales/'.$language.'.json');
if($content===false){http_response_code(503);exit;}
$etag='"'.hash('sha256',$content).'"';header('ETag: '.$etag);header('Cache-Control: public, max-age=3600');
if(($_SERVER['HTTP_IF_NONE_MATCH']??'')===$etag){http_response_code(304);exit;}
if($method!=='HEAD')echo $content;
