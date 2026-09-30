import { readAppearance } from './public/eversave/appearance.mjs';
import { sliderGroups } from './public/eversave/sliders.mjs';

const MAX_BODY=13*1024*1024;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const validId=id=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
async function token(env,row){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.REVIEW_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(row.id+':'+row.nonce)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function authorized(request,env,row){
 if(!row||row.status!=='pending')fail('This review link is unavailable.',404);
 const presented=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 if(!/^[a-f0-9]{64}$/.test(presented))fail('Invalid review link.',403);
 const expected=await token(env,row);let diff=0;for(let i=0;i<64;i++)diff|=presented.charCodeAt(i)^expected.charCodeAt(i);if(diff)fail('Invalid review link.',403);
}
function unpack(row){return {id:row.id,name:row.name,author:row.author,description:row.description,appearance:JSON.parse(row.appearance),images:JSON.parse(row.images),publishedAt:row.published_at};}
function requireOrigin(request,env){if(request.headers.get('origin')!==env.SITE_ORIGIN)fail('Request origin is not allowed.',403);}
async function limitedBody(request){
 if(Number(request.headers.get('content-length'))>MAX_BODY)fail('Submission is too large.',413);
 const reader=request.body?.getReader();if(!reader)fail('Submission is empty.');
 let length=0;const chunks=[];
 while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>MAX_BODY){await reader.cancel();fail('Submission is too large.',413);}chunks.push(value);}
 const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return bytes;
}
function imageType(bytes){
 if(bytes.length>12&&[137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x))return 'image/png';
 if(bytes.length>4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(bytes.length>12&&String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&String.fromCharCode(...bytes.subarray(8,12))==='WEBP')return 'image/webp';
 fail('Screenshots must be PNG, JPEG, or WebP images.');
}
async function notify(env,row){
 const secret=await token(env,row);
 const link=env.SITE_ORIGIN+'/gallery/review/#'+new URLSearchParams({id:row.id,token:secret});
 await env.EMAIL.send({to:env.REVIEW_EMAIL,from:env.EMAIL_FROM,subject:'Appearance awaiting review',text:`A new appearance needs your review.\n\nName: ${row.name}\nAuthor: ${row.author}\n\nReview screenshots and sliders, then choose Approve or Deny:\n${link}\n\nApproval publishes the entire entry. Denial deletes the entire submission. The private link is valid until the submission is reviewed.`});
 await env.DB.prepare('UPDATE appearances SET notification_sent=1 WHERE id=? AND status=?').bind(row.id,'pending').run();
}
async function removeSubmission(env,row){
 const images=JSON.parse(row.images);
 await env.IMAGES.delete(images.map(i=>row.id+'/'+i.key));
 await env.DB.prepare('DELETE FROM appearances WHERE id=? AND status=?').bind(row.id,'deleting').run();
}
async function submit(request,env){
 requireOrigin(request,env);
 if(!env.REVIEW_SECRET||!env.TURNSTILE_SECRET||!env.EMAIL||!env.DB||!env.IMAGES)fail('The gallery is not ready for submissions.',503);
 const bytes=await limitedBody(request);
 let form;try{form=await new Response(bytes,{headers:{'content-type':request.headers.get('content-type')||''}}).formData();}catch{fail('Invalid submission.');}
 const challenge=form.get('cf-turnstile-response');
 if(typeof challenge!=='string'||!challenge||challenge.length>2048)fail('Please complete the verification.');
 const verification=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET,response:challenge,remoteip:request.headers.get('cf-connecting-ip')})});
 const verified=await verification.json();
 if(!verified.success||verified.action!=='appearance-submit'||verified.hostname!==new URL(env.SITE_ORIGIN).hostname)fail('Verification failed. Please try again.',403);
 const name=form.get('name'),author=form.get('author'),description=form.get('description')||'';
 if(typeof name!=='string'||!name.trim()||name.length>80||typeof author!=='string'||!author.trim()||author.length>60||typeof description!=='string'||description.length>1000)fail('Please provide a name, author, and a description within the length limits.');
 const preset=form.get('appearance');if(typeof preset!=='string'||preset.length>10000)fail('Invalid appearance file.');
 let parsed;try{parsed=JSON.parse(preset);}catch{fail('Invalid appearance file.');}
 let decoded;try{decoded=await readAppearance(parsed);}catch(e){fail(e.message);}
 const {archive,raw}=decoded;
 if(sliderGroups(raw,archive.manualValues).some(g=>g.values.some(v=>v.unmapped)))fail('Confirm all unmapped menu selectors before submitting.');
 const files=form.getAll('images');if(files.length<1||files.length>3)fail('Attach one to three screenshots.');
 const uploads=[];
 for(let i=0;i<files.length;i++){
  const file=files[i];if(typeof file==='string'||file.size<16||file.size>4*1024*1024)fail('Each screenshot must be smaller than 4 MiB.');
  const data=new Uint8Array(await file.arrayBuffer());uploads.push({key:String(i),type:imageType(data),data});
 }
 const id=crypto.randomUUID(),nonce=crypto.randomUUID(),created=Date.now();const images=uploads.map(({key,type})=>({key,type}));
 await env.DB.prepare('INSERT INTO appearances (id,status,name,author,description,appearance,images,created_at,nonce) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,'uploading',name.trim(),author.trim(),description,JSON.stringify({...archive,name:name.trim()}),JSON.stringify(images),created,nonce).run();
 try{
  for(const image of uploads)await env.IMAGES.put(id+'/'+image.key,image.data,{httpMetadata:{contentType:image.type}});
  await env.DB.prepare('UPDATE appearances SET status=? WHERE id=? AND status=?').bind('pending',id,'uploading').run();
 }catch{
  await env.DB.prepare('UPDATE appearances SET status=? WHERE id=?').bind('deleting',id).run();
  fail('The submission could not be stored. Please try again.',503);
 }
 const row=await env.DB.prepare('SELECT * FROM appearances WHERE id=?').bind(id).first();
 let notification='sent';try{await notify(env,row);}catch{notification='queued';}
 return json({id,status:'pending',notification},201);
}
async function api(request,env){
 const url=new URL(request.url),path=url.pathname;
 if(path==='/api/config'&&request.method==='GET')return json({turnstileSiteKey:env.TURNSTILE_SITE_KEY||'',everSaveUrl:env.EVERSAVE_URL||'/eversave/',submissionEnabled:Boolean(env.REVIEW_SECRET&&env.TURNSTILE_SECRET&&env.EMAIL&&env.DB&&env.IMAGES)});
 if(path==='/api/submissions'&&request.method==='POST')return submit(request,env);
 if(!env.DB)fail('Gallery service is not configured.',503);
 if(path==='/api/appearances'&&request.method==='GET'){
  const page=Math.max(1,Math.min(10000,Number(url.searchParams.get('page'))||1));
  const q=(url.searchParams.get('q')||'').slice(0,100);
  const result=await env.DB.prepare("SELECT id,name,author,description,images,published_at FROM appearances WHERE status='approved' AND (instr(lower(name),lower(?))>0 OR instr(lower(author),lower(?))>0) ORDER BY published_at DESC,id DESC LIMIT 25 OFFSET ?").bind(q,q,(Math.floor(page)-1)*24).all();
  return json({entries:result.results.slice(0,24).map(r=>({...r,images:JSON.parse(r.images)})),hasMore:result.results.length>24});
 }
 const match=path.match(/^\/api\/(appearances|review)\/([a-f0-9-]+)(?:\/(images)\/([0-2]))?$/);
 if(!match||!validId(match[2]))fail('Not found.',404);
 const [,kind,id,,imageKey]=match,row=await env.DB.prepare('SELECT * FROM appearances WHERE id=?').bind(id).first();
 if(kind==='review')await authorized(request,env,row);else if(!row||row.status!=='approved')fail('Appearance not found.',404);
 if(imageKey!==undefined&&request.method==='GET'){
  const image=JSON.parse(row.images).find(i=>i.key===imageKey);if(!image)fail('Image not found.',404);
  const object=await env.IMAGES.get(id+'/'+image.key);if(!object)fail('Image not found.',404);
  return new Response(object.body,{headers:{'content-type':image.type,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
 }
 if(request.method==='GET')return json(unpack(row));
 if(kind==='review'&&imageKey===undefined&&request.method==='POST'){
  requireOrigin(request,env);
  let body;try{body=JSON.parse(new TextDecoder().decode(await limitedBody(request)));}catch{fail('Invalid review action.');}
  if(!['approve','deny'].includes(body.action))fail('Choose Approve or Deny.');
  const state=body.action==='approve'?'approved':'deleting';
  const result=await env.DB.prepare('UPDATE appearances SET status=?,published_at=? WHERE id=? AND status=?').bind(state,state==='approved'?Date.now():null,id,'pending').run();
  if(result.meta.changes!==1)fail('This submission has already been reviewed.',409);
  if(state==='deleting'){
   try{await removeSubmission(env,row);}catch{return json({status:'deleting',message:'Submission is hidden. Deletion will be retried automatically.'},202);}
  }
  return json({status:state==='approved'?'approved':'deleted'});
 }
 fail('Method not allowed.',405);
}
export default {
 async fetch(request,env){
  try{
   if(new URL(request.url).pathname.startsWith('/api/'))return await api(request,env);
   const response=await env.ASSETS.fetch(request),headers=new Headers(response.headers);
   headers.set('referrer-policy','no-referrer');headers.set('x-content-type-options','nosniff');
   headers.set('content-security-policy',"default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
   return new Response(response.body,{status:response.status,headers});
  }catch(e){return json({error:e.status?e.message:'The gallery service could not complete the request.'},e.status||503);}
 },
 async scheduled(event,env){
  if(!env.DB)return;
  const stale=await env.DB.prepare("SELECT * FROM appearances WHERE status='uploading' AND created_at<? LIMIT 20").bind(Date.now()-3600000).all();
  for(const row of stale.results)await env.DB.prepare("UPDATE appearances SET status='deleting' WHERE id=? AND status='uploading'").bind(row.id).run();
  const deletes=await env.DB.prepare("SELECT * FROM appearances WHERE status='deleting' LIMIT 20").all();
  for(const row of deletes.results)try{await removeSubmission(env,row);}catch{console.error('Submission deletion needs another retry.');}
  const pending=await env.DB.prepare("SELECT * FROM appearances WHERE status='pending' AND notification_sent=0 ORDER BY created_at LIMIT 20").all();
  for(const row of pending.results)try{await notify(env,row);}catch{console.error('Review notification needs another retry.');}
 }
};
