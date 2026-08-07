import { adminHtml as completeStatsHtml } from "./admin-ui-v4";

const COMPARE_CALL_OLD = `$('trafficcompare').innerHTML=statsCompare(s.visitChange,s.previousVisits);`;
const COMPARE_CALL_NEW = `$('trafficcompare').innerHTML=statsCompare(s.visitChange,s.previousVisits,s.comparisonLabel);`;
const COMPARE_FN_OLD = `function statsCompare(change,previous){change=Number(change||0);if(previous==null)return'';if(change===0)return'<strong>Same number of visits</strong> as the previous period';return'<strong>'+Math.abs(change)+' '+(change>0?'more':'fewer')+' visits</strong> than the previous period'}`;
const COMPARE_FN_NEW = `function statsCompare(change,previous,label){change=Number(change||0);label=label||'previous period';if(previous==null)return'';if(change===0)return'<strong>Same number of visits</strong> as '+esc(label);return'<strong>'+Math.abs(change)+' '+(change>0?'more':'fewer')+' visits</strong> than '+esc(label)}`;

export function adminHtml(): string {
  return completeStatsHtml()
    .replace(COMPARE_CALL_OLD, COMPARE_CALL_NEW)
    .replace(COMPARE_FN_OLD, COMPARE_FN_NEW);
}
