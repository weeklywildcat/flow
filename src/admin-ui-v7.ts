import { adminHtml as timedAdminHtml } from "./admin-ui-v6";

const DURATION_CSS = `
.rowaction .editduration{margin-right:6px}.durationhint{margin-top:8px;color:var(--muted);font-size:11.5px;line-height:1.4}
`;

const DURATION_MODAL = `
<div class="modalbg" id="durationmodal"><div class="modal"><div class="modalhead"><strong>Edit visit duration</strong><button class="x" id="durationclose">×</button></div><div class="modalbody"><div class="confirmcopy" id="durationcopy"></div><div class="field" style="margin-top:14px"><label>Duration (minutes)</label><input id="durationminutes" type="number" min="0" max="1440" step="1" inputmode="numeric"></div><div class="durationhint">The check-in time stays the same. Flow will move the checkout time so totals, stats, and exports use the corrected duration.</div></div><div class="modalactions"><button class="btn secondary" id="durationcancel">Cancel</button><button class="btn" id="durationsave">Save duration</button></div></div></div>
`;

const DURATION_SCRIPT = `<script>
(function(){
let durationVisit=null;
function decorateDurationActions(){
  if(historyArchived())return;
  const rows=Array.from(document.querySelectorAll('#historybody tr'));
  rows.forEach((row,index)=>{
    const visit=state.history[index],cell=row.querySelector('.rowaction');
    if(!visit||!visit.checkedOutAt||!cell||cell.querySelector('.editduration'))return;
    const button=document.createElement('button');
    button.className='btn ghost small editduration';
    button.dataset.id=String(visit.visitId);
    button.textContent='Edit duration';
    cell.insertBefore(button,cell.firstChild);
  });
}
function closeDuration(){durationVisit=null;$('durationmodal').classList.remove('open')}
function openDuration(id){
  const visit=state.history.find(x=>String(x.visitId)===String(id));
  if(!visit||!visit.checkedOutAt)return;
  durationVisit=visit;
  const elapsed=Math.max(0,Math.floor((Date.now()-new Date(visit.checkedInAt).getTime())/60000));
  $('durationcopy').textContent='Correct '+visit.firstName+' '+visit.lastName+'’s completed visit from '+fdt(visit.checkedInAt)+'.';
  $('durationminutes').max=String(Math.min(1440,elapsed));
  $('durationminutes').value=String(Math.max(0,Number(visit.durationMinutes||0)));
  $('durationmodal').classList.add('open');
  setTimeout(()=>$('durationminutes').select(),0);
}
async function saveDuration(){
  if(!durationVisit)return;
  const minutes=Number($('durationminutes').value),max=Number($('durationminutes').max||1440);
  if(!Number.isInteger(minutes)||minutes<0||minutes>max){toast('Enter a whole number of minutes from 0 to '+max+'.');return}
  $('durationsave').disabled=true;
  try{
    await post('/api/library/admin-update-visit-duration',{visitId:durationVisit.visitId,durationMinutes:minutes});
    toast('Visit duration updated.');
    closeDuration();
    await loadHistory();
  }catch(e){toast(e.message)}finally{$('durationsave').disabled=false}
}
new MutationObserver(decorateDurationActions).observe($('historybody'),{childList:true});
decorateDurationActions();
$('historybody').addEventListener('click',e=>{const b=e.target.closest('.editduration');if(b){e.preventDefault();openDuration(b.dataset.id)}});
$('durationclose').onclick=closeDuration;
$('durationcancel').onclick=closeDuration;
$('durationsave').onclick=saveDuration;
$('durationminutes').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveDuration()}});
$('durationmodal').onclick=e=>{if(e.target===$('durationmodal'))closeDuration()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('durationmodal').classList.contains('open'))closeDuration()},true);
})();
</script>
`;

export function adminHtml(): string {
  return timedAdminHtml()
    .replace("</style>", DURATION_CSS + "</style>")
    .replace('<div class="toast" id="toast"></div>', DURATION_MODAL + '<div class="toast" id="toast"></div>')
    .replace("</body>", DURATION_SCRIPT + "</body>");
}
