const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require(process.env.UNLIVED_JSDOM_MODULE||'jsdom');const root=path.dirname(__dirname);
const dom=new JSDOM('<div class="announcement"></div><div id="customer-dashboard"></div><div data-announcement-preview></div>',{url:'https://unlived.club',runScripts:'outside-only'}),w=dom.window;
w.eval(fs.readFileSync(path.join(root,'announcement.js'),'utf8'));
const settings={announcement:'Une nouvelle pièce arrive',announcement_link:'boutique.html',announcement_duration:37,announcement_code:'DAY10',announcement_enabled:true,announcement_scroll:true};w.UNLIVEDAnnouncement.render(settings);
assert.equal(w.document.querySelectorAll('.account-announcement').length,1);
for(const bar of w.document.querySelectorAll('.configured-announcement')){
 assert.equal(bar.style.getPropertyValue('--announcement-duration'),'37s');assert.equal(bar.querySelectorAll('.announcement-group').length,2);assert.equal(bar.querySelectorAll('.announcement-group[aria-hidden=true]').length,1);
 const button=bar.querySelector('button');button.click();assert.ok(bar.classList.contains('is-paused'));button.click();assert.ok(!bar.classList.contains('is-paused'));
}
w.UNLIVEDAnnouncement.render({...settings,announcement:'<img src=x onerror=alert(1)>',announcement_link:'javascript:alert(1)',announcement_scroll:false});
assert.equal(w.document.querySelectorAll('img').length,0);assert.equal(w.document.querySelector('.announcement a').getAttribute('href'),'boutique.html');assert.equal(w.document.querySelectorAll('.announcement-pause').length,0);
w.UNLIVEDAnnouncement.render({...settings,announcement_enabled:false});assert.ok(w.document.querySelector('.announcement').hidden);
w.UNLIVEDAnnouncement.render(settings);assert.equal(w.document.querySelectorAll('.account-announcement').length,1);
console.log('Bandeau : texte, code, durée, visibilité, pause, mode fixe, client, aperçu et protection XSS OK');w.close();
