import {readAppearance} from '/eversave/appearance.mjs';import {renderSliders} from '/eversave/sliders.mjs';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.hash.slice(1)),id=params.get('id'),token=params.get('token');
history.replaceState(null,'',location.pathname);
const headers={authorization:'Bearer '+token};let busy=false;const urls=[];
async function request(suffix='',options={}){const r=await fetch('/api/review/'+id+suffix,{...options,headers:{...headers,...options.headers}});if(!r.ok){let data;try{data=await r.json();}catch{}throw new Error(data?.error||'Review request failed.');}return r;}
try{
 if(!id||!token)throw new Error('Open the private review link from your notification email.');
 const row=await (await request()).json(),appearance=await readAppearance(row.appearance);
 $('review-name').textContent=row.name;$('review-author').textContent='By '+row.author;$('review-description').textContent=row.description;renderSliders($('review-sliders'),appearance.raw,appearance.archive.manualValues);
 for(const image of row.images){const blob=await (await request('/images/'+image.key)).blob(),url=URL.createObjectURL(blob);urls.push(url);const img=document.createElement('img');img.src=url;img.alt='Submitted screenshot';$('review-images').append(img);}
 $('review-content').hidden=false;$('review-status').textContent='Awaiting your decision.';
}catch(e){$('review-status').textContent=e.message;}
async function decide(action){if(busy)return;busy=true;$('approve').disabled=$('deny').disabled=true;try{const result=await (await request('',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action})})).json();$('review-content').hidden=true;$('review-status').className='review-message';$('review-status').textContent=result.status==='approved'?'Approved. The appearance is now publicly visible.':result.status==='deleted'?'Denied. The submission and its images have been deleted.':result.message;urls.forEach(URL.revokeObjectURL);}catch(e){$('review-status').textContent=e.message;$('approve').disabled=$('deny').disabled=false;}finally{busy=false;}}
$('approve').onclick=()=>decide('approve');$('deny').onclick=()=>decide('deny');window.addEventListener('pagehide',()=>urls.forEach(URL.revokeObjectURL));
