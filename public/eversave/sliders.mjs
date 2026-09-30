import { offsets } from './slider-offsets.mjs';
const hair = [0,113,112,1,3,100,5,10,101,9,8,6,7,115,114,2,4,102,103,104,105,106,107,109,108,111,110,117,119,118,116,121,125,122,120,123,124];
const fields = [
 ['Adjust Face Template','@bone:Bone Structure','form_emphasis','apparent_age','facial_aesthetic'],
 ['Face Structure / Facial Balance','nose_size','nose_forehead_ratio','face_protrusion','vertical_face_ratio','facial_feature_slant','horizontal_face_ratio'],
 ['Face Structure / Forehead/Glabella','forehead_depth','forehead_protrusion','nose_bridge_height','bridge_protrusion1','bridge_protrusion2','nose_bridge_width'],
 ['Face Structure / Brow Ridge','brow_ridge_height','inner_brow_ridge','outer_brow_ridge'],
 ['Face Structure / Eyes','eye_position','eye_size','eye_slant','eye_spacing'],
 ['Face Structure / Nose Ridge','nose_ridge_depth','nose_ridge_length','nose_position','nose_tip_height','nose_protrusion','nose_height','nose_slant'],
 ['Face Structure / Nostrils','nostril_slant','nostril_size','nostril_width'],
 ['Face Structure / Cheeks','cheekbone_height','cheekbone_depth','cheekbone_width','cheekbone_protrusion','cheeks'],
 ['Face Structure / Lips','lip_shape','mouth_expression','lip_fullness','lip_size','lip_protrusion','lip_thickness'],
 ['Face Structure / Mouth','mouth_protrusion','mouth_slant','occlusion','mouth_position','mouth_width','mouth_chin_distance'],
 ['Face Structure / Chin','chin_tip_position','chin_length','chin_protrusion','chin_depth','chin_size','chin_height','chin_width'],
 ['Face Structure / Jaw','jaw_protrusion','jaw_width','lower_jaw','jaw_contour'],
 ['Hair','@hair:Hair','hair_color','luster','hair_root_darkness','white_hairs'],
 ['Eyebrows','@brow:Brow','brow_color','brow_luster','brow_root_darkness','brow_white_hairs'],
 ['Facial Hair','@beard:Beard','beard_color','beard_luster','beard_root_darkness','beard_white_hairs','stubble'],
 ['Eyelashes','@lashes:Eyelashes','eye_lash_color'],
 ['Eyes','right_iris_size','right_iris_color','right_eye_clouding','right_eye_clouding_color','right_eye_white_color','right_eye_position','left_iris_size','left_iris_color','left_eye_clouding','left_eye_clouding_color','left_eye_white_color','left_eye_position'],
 ['Skin Features','pores','skin_luster','dark_circles','dark_circle_color'],
 ['Cosmetics','eye_liner','eye_liner_color','eye_shadow_upper','eye_shadow_upper_color','eye_shadow_lower','eye_shadow_lower_color','cheeks_color_intensity','cheek_color','lip_stick','lip_stick_color'],
 ['Tattoo/Mark/Eyepatch','@tattoo:Tattoo/Mark','tattoo_mark_color','@patch:Eyepatch','eye_patch_color'],
 ['Tattoo/Mark/Eyepatch / Tweak Tattoo/Mark','tattoo_mark_position_horizontal','tattoo_mark_position_vertical','tattoo_mark_angle','tattoo_mark_expansion','tattoo_mark_flip'],
 ['Alter Body','head_size','chest_size','abdomen_size','arms_size','legs_size','body_hair','body_hair_color','@musculature:Musculature'],
];
const labels = { facial_aesthetic:'Facial Aesthetic', apparent_age:'Apparent Age', bridge_protrusion1:'Bridge Protrusion 1', bridge_protrusion2:'Bridge Protrusion 2', luster:'Luster', hair_root_darkness:'Root Darkness', white_hairs:'White Hairs', brow_luster:'Luster', brow_root_darkness:'Root Darkness', brow_white_hairs:'White Hairs', beard_luster:'Luster', beard_root_darkness:'Root Darkness', beard_white_hairs:'White Hairs', eye_liner:'Eyeliner', eye_liner_color:'Eyeliner Color', lip_stick:'Lipstick', lip_stick_color:'Lipstick Color', eye_shadow_upper:'Eyeshadow (Upper)', eye_shadow_upper_color:'Eyeshadow Color (Upper)', eye_shadow_lower:'Eyeshadow (Lower)', eye_shadow_lower_color:'Eyeshadow Color (Lower)', cheeks_color_intensity:'Cheeks', head_size:'Head', chest_size:'Chest', abdomen_size:'Abdomen', arms_size:'Arms', legs_size:'Legs', tattoo_mark_position_horizontal:'Position (Horizontal)', tattoo_mark_position_vertical:'Position (Vertical)', tattoo_mark_angle:'Angle', tattoo_mark_expansion:'Expansion', tattoo_mark_flip:'Flip' };
const pretty = key => labels[key] || key.replaceAll('_',' ').replace(/\b\w/g,c => c.toUpperCase());
export function sliderGroups(raw, manualValues = {}) {
  const selectors = { bone:[0x24,[0,10,20,30,40,50]], hair:[0x28,hair], brow:[0x30,Array.from({length:17},(_,i)=>i)], beard:[0x34,Array.from({length:12},(_,i)=>i)], patch:[0x38,[0,2,1,10]], lashes:[0x40,[0,1,2,3]] };
  // Tattoo selectors have documented exceptions. Only confirmed IDs are translated.
  selectors.tattoo=[0x3c,[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17]];
  const value = key => {
    if (key.startsWith('@')) {
      const [id,label] = key.slice(1).split(':');
      if(id==='musculature')return {key:id,label,value:manualValues[id]===1?'Standard':manualValues[id]===2?'Muscular':null,confirmed:manualValues[id]!==undefined,unmapped:manualValues[id]===undefined};
      const [off,table] = selectors[id]; const model=raw[off];
      let index=table.indexOf(model)+1;
      if (raw[9] === 1 && id === 'tattoo' && [29,33].includes(model)) index=model;
      const confirmed=manualValues[id];
      return { key:id,label,value:confirmed ?? (index || null), model, confirmed:confirmed !== undefined, unmapped:!index && confirmed === undefined };
    }
    const off = offsets[key];
    if (off !== undefined) return {key,label:pretty(key),value:key==='tattoo_mark_flip' ? (raw[off]===0?'Off':'On') : raw[off]};
    const color=offsets[key+'_r'];
    if (color === undefined) throw new Error('Unknown slider field: '+key);
    return {key,label:pretty(key),value:[...raw.subarray(color,color+3)],color:true};
  };
  return [{category:'Body Type',values:[{key:'bodyType',label:'Body Type',value:raw[9]===0?'A':'B'}]},
    {category:'Skin Color',values:[value('skin_color')]},...fields.map(([category,...keys])=>({category,values:keys.map(value)}))];
}
export function sliderText(raw, manualValues = {}) {
  return sliderGroups(raw,manualValues).map(g=>g.category+'\n'+g.values.map(v=>v.label+': '+(v.unmapped?(v.model===undefined?'Confirm in game':'Unconfirmed (internal ID '+v.model+')'):Array.isArray(v.value)?v.value.join(' / '):v.value)+(v.confirmed?' (author confirmed)':'')).join('\n')).join('\n\n');
}
export function renderSliders(parent, raw, manualValues = {}) {
  parent.replaceChildren();
  for (const g of sliderGroups(raw,manualValues)) {
    const d=document.createElement('details');d.open=g.category==='Body Type';
    const summary=document.createElement('summary');summary.textContent=g.category;d.append(summary);
    const table=document.createElement('table');const body=document.createElement('tbody');
    for (const v of g.values) {
      const row=document.createElement('tr'),label=document.createElement('th'),cell=document.createElement('td');label.scope='row';label.textContent=v.label;
      cell.textContent=v.unmapped?(v.model===undefined?'Confirm in game':'Confirm in game (ID '+v.model+')'):Array.isArray(v.value)?v.value.join(' / '):String(v.value);
      if(v.confirmed)cell.title='Menu number confirmed by the author';
      if(v.color){const swatch=document.createElement('span');swatch.className='swatch';swatch.style.backgroundColor='rgb('+v.value.join(',')+')';cell.prepend(swatch);}
      row.append(label,cell);body.append(row);
    }
    table.append(body);d.append(table);parent.append(d);
  }
}
