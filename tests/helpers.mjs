import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createAppearance} from '../public/eversave/appearance.mjs';
export function database(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../migrations/0001_gallery.sql',import.meta.url),'utf8'));
 return {prepare(sql){const statement=sqlite.prepare(sql);return {bind(...args){return {async run(){return {meta:{changes:Number(statement.run(...args).changes)}};},async all(){return {results:statement.all(...args)};},async first(){return statement.get(...args)||null;}};},async all(){return {results:statement.all()};}};},close(){sqlite.close();}};
}
export function preset(){const raw=new Uint8Array(304);raw[8]=1;const view=new DataView(raw.buffer);view.setInt32(20,0,true);raw.set(new TextEncoder().encode('FACE'),24);view.setUint32(28,4,true);view.setUint32(32,288,true);raw.fill(128,68,304);raw.fill(0,294);return raw;}
export async function environment(){
 const objects=new Map(),emails=[];const env={DB:database(),REVIEW_SECRET:'only-a-local-test-key',REVIEW_EMAIL:'kraxiloth@ancient.dev',EMAIL_FROM:'notifications@ancient.dev',SITE_ORIGIN:'https://ancient.dev',TURNSTILE_SECRET:'test',TURNSTILE_SITE_KEY:'test',EMAIL:{async send(message){emails.push(message);return {messageId:'test'};}},IMAGES:{async put(key,data){objects.set(key,Uint8Array.from(data));},async get(key){const value=objects.get(key);return value?{body:value}:null;},async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key);}},ASSETS:{async fetch(){return new Response('Test asset');}}};
 return {env,objects,emails};
}
export async function submission(env,name='Test appearance'){
 const form=new FormData();form.set('name',name);form.set('author','Test Author');form.set('description','Test description');form.set('appearance',JSON.stringify(await createAppearance(preset(),name,{musculature:1})));form.set('cf-turnstile-response','test-response');form.append('images',new Blob([new Uint8Array([255,216,255,224,...Array(20).fill(0)])],{type:'image/jpeg'}),'test.jpg');
 return new Request(env.SITE_ORIGIN+'/api/submissions',{method:'POST',headers:{origin:env.SITE_ORIGIN},body:form});
}
export function reviewLink(email){const url=new URL(email.text.match(/https:\/\/[^\s]+/)[0]);const p=new URLSearchParams(url.hash.slice(1));return {id:p.get('id'),token:p.get('token')};}
export function reviewRequest(env,link,action){return new Request(env.SITE_ORIGIN+'/api/review/'+link.id,{method:action?'POST':'GET',headers:{authorization:'Bearer '+link.token,...(action?{origin:env.SITE_ORIGIN,'content-type':'application/json'}:{})},...(action?{body:JSON.stringify({action})}:{})});}
