import { adminHtml as durationAdminHtml } from "./admin-ui-v7";

const LONG_VISIT_CSS = `
#longvisitmodal .modal{width:min(560px,100%)}.lvbulk{display:flex;align-items:end;gap:8px;margin-top:14px;padding:11px;border:1px solid var(--line);border-radius:8px;background:var(--subtle)}.lvbulk .field{flex:0 0 130px}.lvbulknote{flex:1;color:var(--quiet);font-size:11px;line-height:1.35}
.lvlist{max-height:min(48vh,360px);overflow:auto;margin-top:12px;border:1px solid var(--line);border-radius:8px}.lvrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line)}.lvrow:last-child{border-bottom:0}.lvname{font-size:12.5px;font-weight:650}.lvmeta{margin-top:3px;color:var(--muted);font-size:11px}.lvfield{display:flex;align-items:center;gap:6px;color:var(--quiet);font-size:11px}.lvminutes{width:82px;text-align:right;font-variant-numeric:tabular-nums}
.lvhint{margin-top:10px;color:var(--muted);font-size:11.5px;line-height:1.4}
`;

const LONG_VISIT_MODAL = `
<div class="modalbg" id="longvisitmodal"><div class="modal"><div class="modalhead"><strong>Did they forget to check out?</strong><button class="x" id="longvisitclose">×</button></div><div class="modalbody"><div class="confirmcopy" id="longvisitcopy"></div><div class="lvbulk"><div class="field"><label for="longvisitall">Set all to</label><input id="longvisitall" type="number" min="0" max="1440" step="1" inputmode="numeric" placeholder="minutes"></div><button class="btn secondary" id="longvisitapply" type="button">Apply to all</button><div class="lvbulknote">Nobody is capped above the time they have already been checked in.</div></div><div class="lvlist" id="longvisitlist"></div><div class="lvhint">Check-in times stay the same. Everyone still in the library is checked out, and the times you correct here are what history, stats, and exports will show.</div></div><div class="modalactions"><button class="btn secondary" id="longvisitcancel">Cancel</button><button class="btn" id="longvisitconfirm">Check everyone out</button></div></div></div>
`;

const LONG_VISIT_SCRIPT = `<script>
(function(){
const LONG_VISIT_MINUTES=30;
const CLEAR_TITLE='Check everyone out?';
const CLEAR_COPY='This will check out every student who is currently in the library. Use this at closing time or when the live roster needs to be cleared.';
let reviewing=[];
function elapsedMinutes(v){const t=new Date(v.checkedInAt).getTime();return Number.isFinite(t)?Math.max(0,Math.floor((Date.now()-t)/60000)):null}
function longVisits(){return (state.current||[]).filter(v=>{const m=elapsedMinutes(v);return m!=null&&m>LONG_VISIT_MINUTES})}
function inputs(){return Array.from($('longvisitlist').querySelectorAll('.lvminutes'))}
function closeLong(){reviewing=[];$('longvisitmodal').classList.remove('open')}
function plainClear(){
  confirmDo(CLEAR_TITLE,CLEAR_COPY,'Check everyone out',async()=>{
    await post('/api/library/clear',{method:'clear_all'});
    toast('Everyone was checked out.');
    await loadCurrent();
    loadOverview();
  });
}
function openLong(rows){
  reviewing=rows.map(v=>({visitId:v.visitId,minutes:elapsedMinutes(v)}));
  $('longvisitcopy').textContent=rows.length+' students have been checked in for more than '+LONG_VISIT_MINUTES+' minutes. If any of them forgot to scan out, correct how long the visit really lasted before you check everyone out.';
  $('longvisitlist').innerHTML=rows.map((v,i)=>{
    const here=elapsedMinutes(v),name=v.firstName+' '+v.lastName;
    return '<div class="lvrow"><div><div class="lvname">'+esc(name)+'</div><div class="lvmeta">'+esc('Checked in '+ft(v.checkedInAt)+' · here '+dur(here))+'</div></div><div class="lvfield"><input class="lvminutes" type="number" min="0" max="'+here+'" step="1" inputmode="numeric" value="'+here+'" data-index="'+i+'" aria-label="'+esc('Minutes for '+name)+'"><span>min</span></div></div>';
  }).join('');
  $('longvisitall').value='';
  $('longvisitmodal').classList.add('open');
}
function applyToAll(){
  const raw=$('longvisitall').value.trim();
  if(raw===''){toast('Enter the number of minutes to use for everyone.');$('longvisitall').focus();return}
  const value=Number(raw);
  if(!Number.isInteger(value)||value<0){toast('Enter a whole number of minutes.');$('longvisitall').focus();return}
  let capped=0;
  inputs().forEach(input=>{const max=Number(input.max);if(value>max)capped++;input.value=String(Math.min(value,max))});
  toast(capped?(value+' min applied · '+capped+' kept at their time in the library.'):('Every visit set to '+value+' min.'));
}
function readRows(){
  const out=[];
  for(const input of inputs()){
    const row=reviewing[Number(input.dataset.index)];
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
async function confirmLong(){
  const rows=readRows();
  if(!rows)return;
  const adjustments=rows.filter(r=>r.durationMinutes!==r.original).map(r=>({visitId:r.visitId,durationMinutes:r.durationMinutes}));
  $('longvisitconfirm').disabled=true;
  try{
    await post('/api/library/admin-clear-with-durations',{adjustments:adjustments});
    toast(adjustments.length?('Everyone was checked out · '+adjustments.length+' time'+(adjustments.length===1?'':'s')+' corrected.'):'Everyone was checked out.');
    closeLong();
    await loadCurrent();
    loadOverview();
  }catch(e){toast(e.message)}finally{$('longvisitconfirm').disabled=false}
}
$('clearall').onclick=()=>{const rows=longVisits();if(rows.length>1)openLong(rows);else plainClear()};
$('longvisitclose').onclick=closeLong;
$('longvisitcancel').onclick=closeLong;
$('longvisitapply').onclick=applyToAll;
$('longvisitconfirm').onclick=confirmLong;
$('longvisitall').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyToAll()}});
$('longvisitmodal').onclick=e=>{if(e.target===$('longvisitmodal'))closeLong()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('longvisitmodal').classList.contains('open')){e.stopPropagation();closeLong()}},true);
})();
</script>
`;

export function adminHtml(): string {
  return durationAdminHtml()
    .replace("</style>", LONG_VISIT_CSS + "</style>")
    .replace('<div class="toast" id="toast"></div>', LONG_VISIT_MODAL + '<div class="toast" id="toast"></div>')
    .replace("</body>", LONG_VISIT_SCRIPT + "</body>");
}
