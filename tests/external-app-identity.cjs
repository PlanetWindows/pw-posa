const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const mainManifestUrl='https://planetwindows.github.io/pw-posa/manifest.webmanifest';
const externalManifestUrl='https://planetwindows.github.io/pw-posa/esterni/manifest.webmanifest';
const main=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
const external=JSON.parse(fs.readFileSync(path.join(root,'esterni/manifest.webmanifest'),'utf8'));
// W3C: id is resolved against start_url's ORIGIN; start_url and scope use the manifest URL.
// https://www.w3.org/TR/appmanifest/#id-member
function resolveManifest(manifest,manifestUrl){
 const start=new URL(manifest.start_url,manifestUrl),scope=new URL(manifest.scope,manifestUrl);
 const id=new URL(manifest.id,start.origin+'/');id.hash='';
 assert.equal(id.origin,start.origin);assert.ok(start.href.startsWith(scope.href));
 return {id:id.href,start:start.href,scope:scope.href,icons:manifest.icons.map(i=>new URL(i.src,manifestUrl).href)};
}
const a=resolveManifest(main,mainManifestUrl),b=resolveManifest(external,externalManifestUrl);
assert.equal(a.id,'https://planetwindows.github.io/','Keep the existing main app identity and installed shortcuts');
assert.equal(a.start,'https://planetwindows.github.io/pw-posa/');
assert.equal(b.id,'https://planetwindows.github.io/pw-posa/esterni/');
assert.equal(b.start,'https://planetwindows.github.io/pw-posa/esterni/');
assert.equal(b.scope,b.start);assert.notEqual(a.id,b.id,'The browser must see two separate apps');
assert.notEqual(a.start,b.start,'Each pinned icon must launch its own page');
assert.equal(resolveManifest({...external,id:'./'},externalManifestUrl).id,a.id,'Reproduce the original collision: different manifest folders do not make ./ IDs distinct');
assert.equal(main.name,'PW Posa');assert.equal(external.name,'PW Posa Esterni');
assert.ok(a.icons.some(url=>url.endsWith('/pw-posa/icon-512-v2.png')));
assert.ok(b.icons.some(url=>url.endsWith('/pw-posa/esterni/icon-512-v3.png')));
assert.ok(b.icons.every(url=>!a.icons.includes(url)),'Preserve the separate installer artwork');
const html=fs.readFileSync(path.join(root,'esterni/index.html'),'utf8');
const worker=fs.readFileSync(path.join(root,'esterni/service-worker.js'),'utf8');
assert.ok(html.includes('manifest.webmanifest?v=4'));
assert.ok(worker.includes('manifest.webmanifest?v=4'));
assert.ok(worker.includes('pw-posa-esterni-v7-distinct-app'));
console.log('PASS: independent app identities, correct launch URLs, original main identity and icon retained, installer artwork retained, refreshed manifest cache.');
console.log(JSON.stringify({main:a.id,external:b.id}));
