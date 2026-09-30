import { openedSave } from './app.mjs';
import { readFavorites, createAppearance, readAppearance, restoreFavorite } from './appearance.mjs';
import { renderSliders, sliderText } from './sliders.mjs';
const $=id=>document.getElementById(id);
let selected=null, prepared=null, save=openedSave(), fileSequence=0;
const characterPanel=document.createElement('div');characterPanel.id='character-workspace';
$('results').before(characterPanel);
for(const element of [$('results'),document.querySelector('.library'),$('restore-panel'),document.querySelector('.scope')]) characterPanel.append(element);
function switchTab(){
 const appearance=location.hash.startsWith('#appearances');
 characterPanel.hidden=appearance;$('appearance-workspace').hidden=!appearance;
 $('characters-tab').setAttribute('aria-current',appearance?'false':'page');$('appearances-tab').setAttribute('aria-current',appearance?'page':'false');
}
window.addEventListener('hashchange',switchTab);switchTab();
function clearDownload(){if(prepared)URL.revokeObjectURL(prepared);prepared=null;$('favorite-ready').hidden=true;$('favorite-ready').removeAttribute('href');}
function download(value,name,type='application/json'){const url=URL.createObjectURL(new Blob([value],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function notify(message){$('appearance-status').textContent=message;}
function updateTarget(){
 clearDownload();$('favorite-ack').checked=false;
 const slot=Number($('favorite-target').value), entry=save?readFavorites(save.buffer).favorites[slot-1]:null;
 $('favorite-preview').textContent=entry?`Favorite ${slot} - ${entry.empty?'empty slot':'existing appearance will be replaced'}`:'Open a destination save first.';
 $('favorite-import').disabled=true;
}
async function select(archive){
 selected=await readAppearance(archive);$('appearance-detail').hidden=false;$('appearance-name').textContent=archive.name;
 renderSliders($('slider-values'),selected.raw,selected.archive.manualValues);updateTarget();
}
async function renderFavorites(){
 $('favorites').replaceChildren();$('favorite-target').replaceChildren();clearDownload();
 if(!save){updateTarget();return;}
 try {
  const {favorites,report}=readFavorites(save.buffer);
  for(const f of favorites){
   const option=document.createElement('option');option.value=f.slot;option.textContent=`Favorite ${f.slot} - ${f.empty?'Empty':f.issue?'Unsupported':'Body Type '+f.bodyType}`;$('favorite-target').append(option);
   const card=document.createElement('article');card.className='slot';const h=document.createElement('h3');h.textContent='Favorite '+f.slot;const p=document.createElement('p');p.textContent=f.empty?'Empty':f.issue||'Body Type '+f.bodyType;card.append(h,p);
   if(!f.empty&&!f.issue){const b=document.createElement('button');b.className='action-button';b.textContent='View sliders / export';b.disabled=report.accountChecksum!=='valid';b.onclick=()=>selectPreset(f);card.append(b);}
   $('favorites').append(card);
  }
  notify(report.accountChecksum==='valid'?`${favorites.filter(x=>!x.empty).length} favorites found. Save stays on this device.`:'Account checksum is invalid. Preset export and import are disabled.');updateTarget();
 }catch(e){notify(e.message);}
}
async function selectPreset(f){try{await select(await createAppearance(f.raw,'Favorite '+f.slot));$('appearance-detail').scrollIntoView({behavior:'smooth'});}catch(e){notify(e.message);}}
document.addEventListener('eversave:save',event=>{save=event.detail;renderFavorites();});renderFavorites();
$('appearance-file').onchange=async event=>{const file=event.target.files[0];if(!file)return;const sequence=++fileSequence;try{if(file.size>10000)throw new Error('Appearance file is too large.');const archive=JSON.parse(await file.text());if(sequence!==fileSequence)return;await select(archive);notify('Appearance loaded. Choose a favorite in your destination save.');}catch(e){notify(e.message);}finally{event.target.value='';}};
$('appearance-export').onclick=()=>{if(selected)download(JSON.stringify(selected.archive,null,2),'appearance.erappearance');};
$('slider-copy').onclick=async()=>{try{await navigator.clipboard.writeText(sliderText(selected.raw,selected.archive.manualValues));notify('Slider values copied.');}catch(e){notify('Could not copy values: '+e.message);}};
$('appearance-share').onclick=()=>{if(selected)sessionStorage.setItem('eversave.gallery.draft',JSON.stringify(selected.archive));};
$('favorite-target').onchange=updateTarget;
$('favorite-ack').onchange=()=>{clearDownload();$('favorite-import').disabled=!$('favorite-ack').checked||!save||!selected;};
$('favorite-import').onclick=()=>{try{if(!save||!selected||!$('favorite-ack').checked)throw new Error('Open a save and acknowledge replacement first.');const output=restoreFavorite(save.buffer,selected.raw,Number($('favorite-target').value));clearDownload();prepared=URL.createObjectURL(new Blob([output]));$('favorite-ready').href=prepared;$('favorite-ready').download='ER0000.sl2';$('favorite-ready').hidden=false;notify('The updated copy passed checksum and byte-range checks. In-game compatibility still requires testing.');}catch(e){notify(e.message);}};
const params=new URLSearchParams(location.hash.split('?')[1]||'');
if(params.has('preset')){
 const id=params.get('preset');
 if(/^[a-f0-9-]{36}$/.test(id))fetch('/api/appearances/'+id).then(async r=>{if(!r.ok)throw new Error('This gallery appearance is unavailable.');const entry=await r.json();await select(entry.appearance);notify('Gallery appearance loaded. Open your destination save above.');}).catch(e=>notify(e.message));
}
