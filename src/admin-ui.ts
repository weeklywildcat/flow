import { adminHtml as baseAdminHtml } from "./admin-ui-v2";

const CURRENT_ACTIONS_OLD = `<div class="menuwrap"><button class="btn secondary" id="more">More</button><div class="menu" id="moremenu"><button class="red" id="clearall" disabled>Check everyone out…</button><button id="openkiosk">Open kiosk in new tab</button></div></div>`;

const CURRENT_ACTIONS_NEW = `<button class="btn" id="clearall" disabled>Check everyone out</button><div class="menuwrap"><button class="btn secondary" id="more">More</button><div class="menu" id="moremenu"><button id="openkiosk">Open kiosk in new tab</button></div></div>`;

export function adminHtml(): string {
  return baseAdminHtml().replace(CURRENT_ACTIONS_OLD, CURRENT_ACTIONS_NEW);
}
