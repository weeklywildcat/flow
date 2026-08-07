import { adminHtml as statsAdminHtml } from "./admin-ui-v3";

const FACTS_OLD = `facts.push(fact(statsDuration(p.longestCompletedVisitMinutes),'longest completed visit'));facts.push(fact(String(l.visits||0),'lunch visits',l.peakOccupancy?'peak lunch occupancy '+l.peakOccupancy:''));facts.push(fact(statsDuration(l.medianDurationMinutes),'median lunch visit'));facts.push(fact(String(v.fiveDayVisitors||0),'students who visited on 5+ days'));$('factgrid').innerHTML=facts.join('')}`;

const FACTS_NEW = `facts.push(fact(statsDuration(p.longestCompletedVisitMinutes),'longest completed visit'));facts.push(fact(statsDuration(p.shortestMeaningfulVisitMinutes),'shortest meaningful visit','Ignores visits under 2 minutes'));facts.push(fact(String(l.visits||0),'lunch visits',l.peakOccupancy?'peak lunch occupancy '+l.peakOccupancy:''));facts.push(fact(l.typicalPeakOccupancy==null?'—':String(l.typicalPeakOccupancy),'typical lunch peak','Average daily peak among days with lunch visits'));facts.push(fact(statsDuration(l.medianDurationMinutes),'median lunch visit'));facts.push(fact(String(v.fiveDayVisitors||0),'students who visited on 5+ days'));(p.reasonByDaypart||[]).forEach(x=>facts.push(fact(x.reason||'—',x.daypart.toLowerCase()+' favorite reason',x.visits?x.visits+' visits':'')));$('factgrid').innerHTML=facts.join('')}`;

export function adminHtml(): string {
  return statsAdminHtml().replace(FACTS_OLD, FACTS_NEW);
}
