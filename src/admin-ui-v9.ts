import { adminHtml as longVisitAdminHtml } from "./admin-ui-v8";

const HISTORY_HEAD_OLD = `<thead><tr><th>Student</th><th>Reason</th><th>Check in</th><th>Check out</th><th>Duration</th><th>Checkout</th><th></th></tr></thead>`;
const HISTORY_HEAD_NEW = `<thead><tr><th class="selcol"><input class="rowselect" id="selall" type="checkbox" aria-label="Select every editable visit on this page"></th><th>Student</th><th>Reason</th><th>Check in</th><th>Check out</th><th>Duration</th><th>Checkout</th><th></th></tr></thead>`;

const HISTORY_SECTION_OLD = `<div class="meta" id="historynote">Loading visits…</div></div></div><div class="tablewrap">`;
const HISTORY_SECTION_NEW = `<div class="meta" id="historynote">Loading visits…</div></div></div><div class="selbar" id="selbar" hidden><strong id="selcount">0 visits selected</strong><button class="btn small" id="selduration" type="button">Edit duration</button><button class="btn ghost small" id="selclear" type="button">Clear selection</button></div><div class="tablewrap">`;

const SELECTION_CSS = `
th.selcol,td.selcell{width:1%;padding-right:0;text-align:center}.rowselect{width:16px;height:16px;min-height:0;margin:0;accent-color:var(--accent)}#selall[hidden]{display:none}
.selbar{display:flex;align-items:center;gap:10px;padding:9px 15px;border-bottom:1px solid var(--line);background:var(--subtle);font-size:12.5px}.selbar[hidden]{display:none}.selbar strong{margin-right:auto;font-size:12.5px}
#bulkdurationmodal .modal{width:min(560px,100%)}
`;

const BULK_DURATION_MODAL = `
<div class="modalbg" id="bulkdurationmodal"><div class="modal"><div class="modalhead"><strong>Edit visit durations</strong><button class="x" id="bulkdurationclose">×</button></div><div class="modalbody"><div class="confirmcopy" id="bulkdurationcopy"></div><div class="lvbulk"><div class="field"><label for="bulkdurationall">Set all to</label><input id="bulkdurationall" type="number" min="0" max="1440" step="1" inputmode="numeric" placeholder="minutes"></div><button class="btn secondary" id="bulkdurationapply" type="button">Apply to all</button><div class="lvbulknote">Nobody goes past the time that has passed since they checked in.</div></div><div class="lvlist" id="bulkdurationlist"></div><div class="lvhint">Check-in times stay the same. Flow moves each checkout time so totals, stats, and exports use the corrected durations.</div></div><div class="modalactions"><button class="btn secondary" id="bulkdurationcancel">Cancel</button><button class="btn" id="bulkdurationsave">Save durations</button></div></div></div>
`;

const SELECTION_SCRIPT = `<script>
(function(){
const selected=new Set();
let editing=[];
function editable(visit){return !!visit&&!!visit.checkedOutAt&&!visit.archivedAt}
function maxMinutes(visit){const t=new Date(visit.checkedInAt).getTime();return Number.isFinite(t)?Math.min(1440,Math.max(0,Math.floor((Date.now()-t)/60000))):1440}
function boxes(){return Array.from(document.querySelectorAll('#historybody .rowselect'))}
function selectedVisits(){return (state.history||[]).filter(v=>selected.has(String(v.visitId)))}
function refreshBar(){const n=selected.size;$('selcount').textContent=n+' visit'+(n===1?'':'s')+' selected';$('selbar').hidden=n===0}
function syncSelectAll(){
  const all=boxes(),checked=all.filter(b=>b.checked);
  $('selall').hidden=historyArchived()||all.length===0;
  $('selall').checked=all.length>0&&checked.length===all.length;
  $('selall').indeterminate=checked.length>0&&checked.length<all.length;
}
function decorateSelection(){
  const archived=historyArchived();
  Array.from(document.querySelectorAll('#historybody tr')).forEach((row,index)=>{
    if(row.querySelector('.selcell'))return;
    const visit=state.history[index],cell=document.createElement('td');
    cell.className='selcell';
    if(!archived&&editable(visit)){
      cell.innerHTML='<input class="rowselect" type="checkbox" data-id="'+esc(visit.visitId)+'" aria-label="'+esc('Select the '+visit.firstName+' '+visit.lastName+' visit')+'">';
    }
    row.insertBefore(cell,row.firstChild);
  });
}
function historyRendered(){selected.clear();decorateSelection();syncSelectAll();refreshBar()}
function closeBulk(){editing=[];$('bulkdurationmodal').classList.remove('open')}
function openBulk(){
  const visits=selectedVisits();
  if(!visits.length){toast('Select at least one visit first.');return}
  editing=visits.map(v=>({visitId:v.visitId,minutes:Math.max(0,Number(v.durationMinutes||0))}));
  $('bulkdurationcopy').textContent='Correct how long '+(visits.length===1?'this visit':'these '+visits.length+' visits')+' really lasted.';
  $('bulkdurationlist').innerHTML=visits.map((v,i)=>{
    const name=v.firstName+' '+v.lastName,current=Math.max(0,Number(v.durationMinutes||0));
    return '<div class="lvrow"><div><div class="lvname">'+esc(name)+'</div><div class="lvmeta">'+esc('Checked in '+fdt(v.checkedInAt)+' · recorded '+dur(current))+'</div></div><div class="lvfield"><input class="bdminutes" type="number" min="0" max="'+maxMinutes(v)+'" step="1" inputmode="numeric" value="'+current+'" data-index="'+i+'" aria-label="'+esc('Minutes for '+name)+'"><span>min</span></div></div>';
  }).join('');
  $('bulkdurationall').value='';
  $('bulkdurationmodal').classList.add('open');
}
function fields(){return Array.from($('bulkdurationlist').querySelectorAll('.bdminutes'))}
function applyToAll(){
  const raw=$('bulkdurationall').value.trim();
  if(raw===''){toast('Enter the number of minutes to use for everyone.');$('bulkdurationall').focus();return}
  const value=Number(raw);
  if(!Number.isInteger(value)||value<0){toast('Enter a whole number of minutes.');$('bulkdurationall').focus();return}
  let capped=0;
  fields().forEach(input=>{const max=Number(input.max);if(value>max)capped++;input.value=String(Math.min(value,max))});
  toast(capped?(value+' min applied · '+capped+' kept shorter so the checkout stays in the past.'):('Every visit set to '+value+' min.'));
}
function readFields(){
  const out=[];
  for(const input of fields()){
    const row=editing[Number(input.dataset.index)];
    if(!row)continue;
    const raw=input.value.trim(),max=Number(input.max),value=Number(raw);
    if(raw===''||!Number.isInteger(value)||value<0||value>max){
      toast('Enter a whole number of minutes from 0 to '+max+'.');
      input.focus();
      return null;
    }
    out.push({visitId:row.visitId,durationMinutes:value,original:row.minutes});
  }
  return out;
}
async function saveBulk(){
  const rows=readFields();
  if(!rows)return;
  const updates=rows.filter(r=>r.durationMinutes!==r.original).map(r=>({visitId:r.visitId,durationMinutes:r.durationMinutes}));
  if(!updates.length){toast('No durations were changed.');return}
  $('bulkdurationsave').disabled=true;
  try{
    await post('/api/library/admin-update-visit-durations',{updates:updates});
    toast(updates.length+' visit duration'+(updates.length===1?'':'s')+' updated.');
    closeBulk();
    await loadHistory();
    loadOverview();
  }catch(e){toast(e.message)}finally{$('bulkdurationsave').disabled=false}
}
new MutationObserver(historyRendered).observe($('historybody'),{childList:true});
historyRendered();
$('historybody').addEventListener('click',e=>{
  const box=e.target.closest('.rowselect');
  if(!box)return;
  if(box.checked)selected.add(box.dataset.id);else selected.delete(box.dataset.id);
  syncSelectAll();
  refreshBar();
});
$('selall').addEventListener('change',()=>{
  boxes().forEach(box=>{box.checked=$('selall').checked;if(box.checked)selected.add(box.dataset.id);else selected.delete(box.dataset.id)});
  syncSelectAll();
  refreshBar();
});
$('selclear').onclick=()=>{selected.clear();boxes().forEach(box=>{box.checked=false});syncSelectAll();refreshBar()};
$('selduration').onclick=openBulk;
$('bulkdurationclose').onclick=closeBulk;
$('bulkdurationcancel').onclick=closeBulk;
$('bulkdurationapply').onclick=applyToAll;
$('bulkdurationsave').onclick=saveBulk;
$('bulkdurationall').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyToAll()}});
$('bulkdurationmodal').onclick=e=>{if(e.target===$('bulkdurationmodal'))closeBulk()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('bulkdurationmodal').classList.contains('open')){e.stopPropagation();closeBulk()}},true);
})();
</script>
`;

export function adminHtml(): string {
  return longVisitAdminHtml()
    .replace(HISTORY_HEAD_OLD, HISTORY_HEAD_NEW)
    .replace(HISTORY_SECTION_OLD, HISTORY_SECTION_NEW)
    .replace("</style>", SELECTION_CSS + "</style>")
    .replace('<div class="toast" id="toast"></div>', BULK_DURATION_MODAL + '<div class="toast" id="toast"></div>')
    .replace("</body>", SELECTION_SCRIPT + "</body>");
}
