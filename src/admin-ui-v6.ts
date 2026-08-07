import { adminHtml as refinedStatsHtml } from "./admin-ui-v5";

const STUDENT_DETAILS_OLD = `<div class="drawersection"><div class="eyebrow">Student information</div><div class="details"><div class="detail"><small>Grade</small><b id="dgrade">—</b></div><div class="detail"><small>Status</small><b id="dstatus">—</b></div><div class="detail"><small>Barcode</small><b class="mono" id="dbarcode">—</b></div><div class="detail"><small>Total visits</small><b id="dvisits">—</b></div></div></div>`;
const STUDENT_DETAILS_NEW = `<div class="drawersection"><div class="eyebrow">Student information</div><div class="details"><div class="detail"><small>Grade</small><b id="dgrade">—</b></div><div class="detail"><small>Status</small><b id="dstatus">—</b></div><div class="detail"><small>Barcode</small><b class="mono" id="dbarcode">—</b></div><div class="detail"><small>Total visits</small><b id="dvisits">—</b></div><div class="detail"><small>Total time in library</small><b id="dtime">—</b></div><div class="detail"><small>Average completed visit</small><b id="davg">—</b></div></div></div>`;

const DRAWER_VISITS_OLD = `$('dvisits').textContent=s.visitCount;$('drecent').innerHTML=`;
const DRAWER_VISITS_NEW = `$('dvisits').textContent=s.visitCount;$('dtime').textContent=statsDuration(s.timeSpentMinutes);$('davg').textContent=statsDuration(s.averageCompletedVisitMinutes);$('drecent').innerHTML=`;

const FACT_HELPER_OLD = `function fact(value,label,note){return'<div class="fact"><b>'+esc(value)+'</b><span>'+esc(label)+'</span>'+(note?'<small>'+esc(note)+'</small>':'')+'</div>'}`;
const FACT_HELPER_NEW = `function fact(value,label,note){return'<div class="fact"><b>'+esc(value)+'</b><span>'+esc(label)+'</span>'+(note?'<small>'+esc(note)+'</small>':'')+'</div>'}\nfunction statsClockMinute(m){m=Number(m);if(!Number.isFinite(m))return'—';const h=Math.floor(m/60),min=Math.round(m%60),suffix=h>=12?'PM':'AM',hh=h%12||12;return hh+':'+String(min).padStart(2,'0')+' '+suffix}`;

const FACTS_OLD = `facts.push(fact(statsDuration(p.longestCompletedVisitMinutes),'longest completed visit'));facts.push(fact(statsDuration(p.shortestMeaningfulVisitMinutes),'shortest meaningful visit','Ignores visits under 2 minutes'));facts.push(fact(String(l.visits||0),'lunch visits',l.peakOccupancy?'peak lunch occupancy '+l.peakOccupancy:''));facts.push(fact(l.typicalPeakOccupancy==null?'—':String(l.typicalPeakOccupancy),'typical lunch peak','Average daily peak among days with lunch visits'));facts.push(fact(statsDuration(l.medianDurationMinutes),'median lunch visit'));facts.push(fact(String(v.fiveDayVisitors||0),'students who visited on 5+ days'));(p.reasonByDaypart||[]).forEach(x=>facts.push(fact(x.reason||'—',x.daypart.toLowerCase()+' favorite reason',x.visits?x.visits+' visits':'')));$('factgrid').innerHTML=facts.join('')}`;
const FACTS_NEW = `facts.push(fact(statsDuration(p.longestCompletedVisitMinutes),'longest completed visit','Outliers can reflect a missed checkout'));const middle=p.durationMiddle50;facts.push(fact(middle?statsDuration(middle.lowMinutes)+'–'+statsDuration(middle.highMinutes):'—','typical visit range','Middle 50% of completed visits'));facts.push(fact(statsDuration(p.durationP90Minutes),'90% of visits are under','Completed visits only'));facts.push(fact(String(l.visits||0),'lunch-window visits',l.windowLabel||'11:45 AM–1:40 PM'));facts.push(fact(l.peakOccupancy==null?'—':String(l.peakOccupancy),'peak lunch occupancy',l.windowLabel||'11:45 AM–1:40 PM'));facts.push(fact(l.typicalPeakOccupancy==null?'—':String(l.typicalPeakOccupancy),'typical lunch peak','Average daily peak during '+(l.windowLabel||'11:45 AM–1:40 PM')));facts.push(fact(statsDuration(l.medianDurationMinutes),'median lunch-window visit',l.windowLabel||'11:45 AM–1:40 PM'));facts.push(fact(l.rushWindow?statsClockMinute(l.rushWindow.startMinute)+'–'+statsClockMinute(l.rushWindow.endMinute):'—','busiest lunch window',l.rushWindow?(l.rushWindow.checkInsPerActiveDay+' check-ins per active day on average'):''));facts.push(fact(String(v.fiveDayVisitors||0),'students who visited on 5+ days'));(p.reasonByDaypart||[]).forEach(x=>facts.push(fact(x.reason||'—',x.daypart.toLowerCase()+' favorite reason',x.visits?x.visits+' visits':'')));$('factgrid').innerHTML=facts.join('')}`;

const WEEKDAY_NOTE_OLD = `$('weekdaynote').textContent=p.busiestWeekday?p.busiestWeekday.weekday+' is busiest in this period':'Which days are busiest';`;
const WEEKDAY_NOTE_NEW = `$('weekdaynote').textContent=p.busiestWeekday?(p.busiestWeekday.weekday+' averages '+p.busiestWeekday.averageVisits+' visits'):'Average visits per occurrence of each weekday';`;

const LIVE_TRACKER_SCRIPT = `<script>\nsetInterval(()=>{const s=state&&state.student;if(!s||!s.activeSince||!document.getElementById('dtime')||!document.getElementById('drawer').classList.contains('open'))return;const active=Math.max(0,(Date.now()-new Date(s.activeSince).getTime())/60000);document.getElementById('dtime').textContent=statsDuration(Number(s.completedTimeMinutes||0)+active)},30000);\n</script>\n`;

export function adminHtml(): string {
  return refinedStatsHtml()
    .replace(STUDENT_DETAILS_OLD, STUDENT_DETAILS_NEW)
    .replace(DRAWER_VISITS_OLD, DRAWER_VISITS_NEW)
    .replace(FACT_HELPER_OLD, FACT_HELPER_NEW)
    .replace(FACTS_OLD, FACTS_NEW)
    .replace(WEEKDAY_NOTE_OLD, WEEKDAY_NOTE_NEW)
    .replace("</body>", LIVE_TRACKER_SCRIPT + "</body>");
}
