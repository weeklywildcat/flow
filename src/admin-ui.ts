export function adminHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Library · Flow</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f5f7;
      --sidebar: rgba(249, 249, 251, .94);
      --surface: #fff;
      --surface-2: #f7f7f9;
      --ink: #1d1d1f;
      --muted: #6e6e73;
      --quiet: #8e8e93;
      --line: rgba(0,0,0,.09);
      --line-strong: rgba(0,0,0,.14);
      --blue: #007aff;
      --blue-soft: rgba(0,122,255,.10);
      --green: #248a3d;
      --green-soft: rgba(52,199,89,.12);
      --orange: #a05a00;
      --orange-soft: rgba(255,159,10,.14);
      --red: #d70015;
      --red-soft: rgba(255,59,48,.11);
      --shadow: 0 1px 2px rgba(0,0,0,.025), 0 12px 34px rgba(0,0,0,.055);
      --sidebar-w: 224px;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 100%; min-height: 100%; background: var(--bg); color: var(--ink); }
    body { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
    button, input, select { font: inherit; }
    button { cursor: pointer; }
    .app { min-height: 100vh; display: grid; grid-template-columns: var(--sidebar-w) minmax(0,1fr); }
    .sidebar {
      position: fixed; inset: 0 auto 0 0; width: var(--sidebar-w); z-index: 20;
      display: flex; flex-direction: column; padding: 18px 12px 14px;
      background: var(--sidebar); border-right: 1px solid var(--line);
      backdrop-filter: blur(28px) saturate(160%);
    }
    .brand { display: flex; align-items: center; gap: 11px; min-height: 44px; padding: 0 10px 14px; }
    .brand-mark { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 9px; background: var(--blue); color: #fff; font-size: 16px; font-weight: 760; letter-spacing: -.04em; }
    .brand-copy { min-width: 0; }
    .brand-title { font-size: 15px; font-weight: 700; letter-spacing: -.02em; }
    .brand-sub { margin-top: 2px; color: var(--muted); font-size: 11.5px; }
    .nav { display: grid; gap: 3px; }
    .nav-item {
      width: 100%; min-height: 40px; padding: 0 10px; border: 0; border-radius: 10px;
      display: flex; align-items: center; gap: 10px; background: transparent; color: #3a3a3c;
      text-align: left; font-size: 13.5px; font-weight: 560; transition: background 120ms ease, color 120ms ease;
    }
    .nav-item:hover { background: rgba(0,0,0,.045); }
    .nav-item.active { background: var(--blue-soft); color: var(--blue); font-weight: 650; }
    .nav-icon { width: 18px; height: 18px; flex: 0 0 auto; display: grid; place-items: center; }
    .nav-icon svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .sidebar-spacer { flex: 1; }
    .sidebar-footer { padding: 12px 6px 0; border-top: 1px solid var(--line); display: grid; gap: 8px; }
    .kiosk-link { min-height: 34px; padding: 0 8px; display: flex; align-items: center; gap: 8px; color: var(--muted); text-decoration: none; font-size: 12.5px; border-radius: 9px; }
    .kiosk-link:hover { background: rgba(0,0,0,.04); color: var(--ink); }
    .main { grid-column: 2; min-width: 0; min-height: 100vh; padding: 0 28px 34px; }
    .topbar {
      position: sticky; top: 0; z-index: 10; min-height: 82px; display: flex; align-items: center; justify-content: space-between; gap: 18px;
      background: rgba(245,245,247,.84); backdrop-filter: blur(24px) saturate(160%); border-bottom: 1px solid transparent;
    }
    .page-title { margin: 0; font-size: 27px; line-height: 1.05; letter-spacing: -.045em; font-weight: 730; }
    .page-subtitle { margin-top: 5px; color: var(--muted); font-size: 13px; }
    .top-actions { display: flex; align-items: center; gap: 9px; }
    .btn {
      min-height: 36px; padding: 0 13px; border: 1px solid transparent; border-radius: 10px;
      background: var(--blue); color: #fff; font-size: 13px; font-weight: 620; box-shadow: 0 1px 2px rgba(0,0,0,.05);
    }
    .btn:hover { filter: brightness(.98); }
    .btn:active { transform: scale(.985); }
    .btn.secondary { background: #fff; color: var(--ink); border-color: var(--line-strong); box-shadow: none; }
    .btn.ghost { background: transparent; color: var(--blue); border-color: transparent; box-shadow: none; }
    .btn.danger { background: var(--red); color: #fff; }
    .btn.soft-danger { background: var(--red-soft); color: var(--red); border-color: transparent; box-shadow: none; }
    .btn.small { min-height: 30px; padding: 0 10px; font-size: 12px; border-radius: 8px; }
    .btn:disabled { opacity: .48; cursor: not-allowed; transform: none; filter: none; }
    .page { display: none; animation: pageIn 160ms ease-out both; }
    .page.active { display: block; }
    @keyframes pageIn { from { opacity: .45; transform: translateY(3px); } to { opacity: 1; transform: none; } }
    .metrics { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 14px; margin-bottom: 16px; }
    .metric, .card {
      background: var(--surface); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow);
    }
    .metric { min-height: 124px; padding: 18px; display: grid; align-content: space-between; }
    .metric-label { color: var(--muted); font-size: 12px; font-weight: 600; }
    .metric-value { margin-top: 15px; font-size: 31px; line-height: 1; font-weight: 730; letter-spacing: -.045em; font-variant-numeric: tabular-nums; }
    .metric-foot { margin-top: 9px; color: var(--quiet); font-size: 11.5px; }
    .content-grid { display: grid; grid-template-columns: minmax(0,1.55fr) minmax(270px,.75fr); gap: 16px; }
    .card { min-width: 0; overflow: hidden; }
    .card-header { min-height: 58px; padding: 0 17px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--line); }
    .card-title { font-size: 15px; font-weight: 680; letter-spacing: -.02em; }
    .card-note { margin-top: 3px; color: var(--muted); font-size: 11.5px; }
    .card-body { padding: 16px; }
    .quick-list { display: grid; }
    .quick-link { width: 100%; min-height: 54px; border: 0; border-bottom: 1px solid var(--line); background: #fff; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 17px; color: var(--ink); text-align: left; }
    .quick-link:last-child { border-bottom: 0; }
    .quick-link:hover { background: var(--surface-2); }
    .quick-main { font-size: 13.5px; font-weight: 600; }
    .quick-sub { margin-top: 3px; color: var(--muted); font-size: 11.5px; font-weight: 450; }
    .chev { color: var(--quiet); font-size: 18px; }
    .toolbar { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; margin-bottom: 12px; }
    .search { position: relative; flex: 1 1 260px; min-width: 210px; }
    .search input { padding-left: 34px; }
    .search::before { content: "⌕"; position: absolute; left: 12px; top: 50%; transform: translateY(-53%); color: var(--quiet); font-size: 19px; z-index: 1; }
    input, select {
      min-height: 38px; border: 1px solid var(--line-strong); border-radius: 10px; background: #fff; color: var(--ink); padding: 0 11px; outline: none; font-size: 13px;
    }
    input:focus, select:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(0,122,255,.10); }
    select { min-width: 120px; }
    .table-wrap { overflow: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 720px; }
    th { height: 36px; padding: 0 14px; background: var(--surface-2); color: var(--quiet); border-bottom: 1px solid var(--line); text-align: left; font-size: 10.5px; line-height: 1; font-weight: 680; letter-spacing: .03em; text-transform: uppercase; white-space: nowrap; }
    td { min-height: 52px; padding: 11px 14px; border-bottom: 1px solid var(--line); color: #343437; font-size: 12.5px; vertical-align: middle; }
    tbody tr:last-child td { border-bottom: 0; }
    tbody tr:hover td { background: rgba(0,122,255,.022); }
    .person { font-weight: 650; color: var(--ink); font-size: 13px; }
    .secondary-line { margin-top: 3px; color: var(--quiet); font-size: 11px; }
    .mono { font-variant-numeric: tabular-nums; }
    .pill { display: inline-flex; align-items: center; min-height: 23px; padding: 0 8px; border-radius: 999px; background: rgba(0,0,0,.055); color: var(--muted); font-size: 10.5px; font-weight: 650; white-space: nowrap; }
    .pill.green { background: var(--green-soft); color: var(--green); }
    .pill.orange { background: var(--orange-soft); color: var(--orange); }
    .pill.red { background: var(--red-soft); color: var(--red); }
    .pill.blue { background: var(--blue-soft); color: var(--blue); }
    .empty { min-height: 250px; display: grid; place-items: center; padding: 28px; color: var(--muted); text-align: center; }
    .empty strong { display: block; margin-bottom: 5px; color: var(--ink); font-size: 14px; }
    .pagination { min-height: 48px; padding: 8px 13px; display: flex; align-items: center; justify-content: space-between; gap: 10px; border-top: 1px solid var(--line); color: var(--muted); font-size: 11.5px; }
    .current-hero { padding: 18px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
    .current-count { font-size: 36px; font-weight: 740; letter-spacing: -.05em; }
    .current-label { margin-top: 5px; color: var(--muted); font-size: 12.5px; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; background: var(--green); box-shadow: 0 0 0 4px var(--green-soft); }
    .kiosk-grid { display: grid; grid-template-columns: minmax(300px,.75fr) minmax(0,1.35fr); gap: 16px; }
    .form-stack { display: grid; gap: 12px; }
    .field { display: grid; gap: 6px; }
    .field label { color: var(--muted); font-size: 11.5px; font-weight: 600; }
    .pairing { margin-top: 4px; padding: 15px; border-radius: 13px; background: var(--green-soft); text-align: center; }
    .pairing[hidden] { display: none; }
    .pairing-code { color: var(--green); font-size: 29px; font-weight: 760; letter-spacing: .12em; font-variant-numeric: tabular-nums; }
    .pairing-meta { margin-top: 6px; color: var(--muted); font-size: 11.5px; }
    .modal-backdrop { position: fixed; inset: 0; z-index: 50; display: none; place-items: center; padding: 18px; background: rgba(0,0,0,.28); backdrop-filter: blur(7px); }
    .modal-backdrop.open { display: grid; }
    .modal { width: min(500px,100%); border: 1px solid var(--line); border-radius: 18px; background: #fff; box-shadow: 0 24px 80px rgba(0,0,0,.2); overflow: hidden; }
    .modal-head { min-height: 60px; display: flex; align-items: center; justify-content: space-between; padding: 0 17px; border-bottom: 1px solid var(--line); }
    .modal-title { font-size: 16px; font-weight: 700; letter-spacing: -.02em; }
    .close { width: 30px; height: 30px; border: 0; border-radius: 50%; background: rgba(0,0,0,.06); color: var(--muted); font-size: 17px; }
    .modal-body { padding: 17px; display: grid; gap: 12px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; }
    .check { display: flex; align-items: center; gap: 8px; color: var(--ink); font-size: 12.5px; }
    .check input { width: 16px; height: 16px; min-height: 0; padding: 0; accent-color: var(--blue); }
    .modal-actions { padding: 13px 17px 17px; display: flex; justify-content: flex-end; gap: 9px; }
    .toast { position: fixed; right: 22px; bottom: 22px; z-index: 80; min-width: 220px; max-width: 380px; padding: 11px 13px; border-radius: 11px; background: rgba(29,29,31,.94); color: #fff; box-shadow: 0 14px 42px rgba(0,0,0,.18); font-size: 12.5px; opacity: 0; transform: translateY(8px); pointer-events: none; transition: opacity 140ms ease, transform 140ms ease; }
    .toast.show { opacity: 1; transform: none; }
    .loading { opacity: .52; pointer-events: none; }
    @media (max-width: 1100px) { .metrics { grid-template-columns: repeat(2,minmax(0,1fr)); } .content-grid { grid-template-columns: 1fr; } .kiosk-grid { grid-template-columns: 1fr; } }
    @media (max-width: 760px) {
      :root { --sidebar-w: 70px; }
      .sidebar { padding-left: 8px; padding-right: 8px; }
      .brand { justify-content: center; padding-left: 0; padding-right: 0; }
      .brand-copy, .nav-label, .sidebar-footer .nav-label { display: none; }
      .nav-item { justify-content: center; padding: 0; }
      .kiosk-link { justify-content: center; }
      .main { padding: 0 16px 26px; }
      .topbar { min-height: 74px; }
      .page-title { font-size: 24px; }
      .page-subtitle { display: none; }
      .metrics { grid-template-columns: 1fr 1fr; gap: 10px; }
      .metric { min-height: 108px; padding: 14px; }
      .metric-value { font-size: 27px; }
      .current-hero { align-items: flex-start; flex-direction: column; }
      .two { grid-template-columns: 1fr; }
    }
    @media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation-duration: .001ms !important; transition-duration: .001ms !important; } }
  </style>
</head>
<body>
<div class="app">
  <aside class="sidebar">
    <div class="brand"><div class="brand-mark">F</div><div class="brand-copy"><div class="brand-title">Flow</div><div class="brand-sub">Library</div></div></div>
    <nav class="nav" aria-label="Library management">
      <button class="nav-item active" data-page="overview"><span class="nav-icon"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg></span><span class="nav-label">Overview</span></button>
      <button class="nav-item" data-page="current"><span class="nav-icon"><svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span><span class="nav-label">Current</span></button>
      <button class="nav-item" data-page="students"><span class="nav-icon"><svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/></svg></span><span class="nav-label">Students</span></button>
      <button class="nav-item" data-page="history"><span class="nav-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span><span class="nav-label">History</span></button>
      <button class="nav-item" data-page="kiosks"><span class="nav-icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg></span><span class="nav-label">Kiosks</span></button>
    </nav>
    <div class="sidebar-spacer"></div>
    <div class="sidebar-footer"><a class="kiosk-link" href="/library/kiosk" target="_blank" rel="noopener"><span class="nav-icon"><svg viewBox="0 0 24 24"><path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg></span><span class="nav-label">Open kiosk</span></a></div>
  </aside>

  <main class="main">
    <header class="topbar">
      <div><h1 class="page-title" id="page-title">Overview</h1><div class="page-subtitle" id="page-subtitle">A live snapshot of the library.</div></div>
      <div class="top-actions"><button class="btn secondary" id="refresh-page" type="button">Refresh</button></div>
    </header>

    <section class="page active" id="page-overview">
      <div class="metrics">
        <div class="metric"><div class="metric-label">In library now</div><div class="metric-value" id="ov-current">—</div><div class="metric-foot">Live roster</div></div>
        <div class="metric"><div class="metric-label">Visits today</div><div class="metric-value" id="ov-visits">—</div><div class="metric-foot" id="ov-unique">— unique students</div></div>
        <div class="metric"><div class="metric-label">Student records</div><div class="metric-value" id="ov-students">—</div><div class="metric-foot">Active in database</div></div>
        <div class="metric"><div class="metric-label">Kiosks online</div><div class="metric-value" id="ov-kiosks">—</div><div class="metric-foot" id="ov-kiosk-total">— paired</div></div>
      </div>
      <div class="content-grid">
        <div class="card">
          <div class="card-header"><div><div class="card-title">Recent activity</div><div class="card-note">Latest check-ins and checkouts</div></div><button class="btn ghost small" data-go="history">View history</button></div>
          <div class="table-wrap"><table><thead><tr><th>Student</th><th>Reason</th><th>Check in</th><th>Duration</th><th>Status</th></tr></thead><tbody id="overview-recent"><tr><td colspan="5">Loading…</td></tr></tbody></table></div>
        </div>
        <div class="card">
          <div class="card-header"><div><div class="card-title">Manage</div><div class="card-note">Common library tasks</div></div></div>
          <div class="quick-list">
            <button class="quick-link" data-go="current"><span><span class="quick-main">Current students</span><span class="quick-sub">See who is in the library now</span></span><span class="chev">›</span></button>
            <button class="quick-link" data-go="students"><span><span class="quick-main">Student database</span><span class="quick-sub">Search and manage student records</span></span><span class="chev">›</span></button>
            <button class="quick-link" data-go="kiosks"><span><span class="quick-main">Kiosk devices</span><span class="quick-sub">Pair or revoke a Chromebook</span></span><span class="chev">›</span></button>
          </div>
        </div>
      </div>
    </section>

    <section class="page" id="page-current">
      <div class="card current-hero"><div><div class="current-count" id="current-count">—</div><div class="current-label"><span class="status-dot"></span>Students currently checked in</div></div><button class="btn soft-danger" id="clear-current" type="button" disabled>Check everyone out</button></div>
      <div class="card"><div class="card-header"><div><div class="card-title">Current students</div><div class="card-note" id="current-note">Live roster</div></div></div><div class="table-wrap"><table><thead><tr><th>Student</th><th>Grade</th><th>Reason</th><th>Checked in</th><th>Time here</th><th></th></tr></thead><tbody id="current-body"></tbody></table></div><div class="empty" id="current-empty" hidden><div><strong>No students are checked in.</strong>The roster will update when someone scans in.</div></div></div>
    </section>

    <section class="page" id="page-students">
      <div class="toolbar"><div class="search"><input id="student-search" type="search" placeholder="Search name, ID, or barcode"></div><select id="student-grade"><option value="">All grades</option><option>9</option><option>10</option><option>11</option><option>12</option></select><select id="student-status"><option value="">All records</option><option value="active">Active</option><option value="inactive">Inactive</option></select><button class="btn" id="add-student" type="button">Add student</button></div>
      <div class="card"><div class="card-header"><div><div class="card-title">Students</div><div class="card-note" id="students-note">Database records</div></div></div><div class="table-wrap"><table><thead><tr><th>Student</th><th>Grade</th><th>Barcode</th><th>Visits</th><th>Last visit</th><th>Status</th><th></th></tr></thead><tbody id="students-body"></tbody></table></div><div class="empty" id="students-empty" hidden><div><strong>No students found.</strong>Try a different search or filter.</div></div><div class="pagination"><span id="students-page-label"></span><div><button class="btn secondary small" id="students-prev">Previous</button> <button class="btn secondary small" id="students-next">Next</button></div></div></div>
    </section>

    <section class="page" id="page-history">
      <div class="toolbar"><div class="search"><input id="history-search" type="search" placeholder="Search student name or ID"></div><select id="history-reason"><option value="">All reasons</option><option>Class work</option><option>Printing</option><option>Book checkout</option><option>Lunch</option><option>Meeting</option><option>Other</option></select><input id="history-from" type="date" aria-label="Start date"><input id="history-to" type="date" aria-label="End date"><button class="btn secondary" id="history-export" type="button">Export CSV</button></div>
      <div class="card"><div class="card-header"><div><div class="card-title">Visit history</div><div class="card-note" id="history-note">Check-in and checkout records</div></div></div><div class="table-wrap"><table><thead><tr><th>Student</th><th>Reason</th><th>Check in</th><th>Check out</th><th>Duration</th><th>Checkout</th></tr></thead><tbody id="history-body"></tbody></table></div><div class="empty" id="history-empty" hidden><div><strong>No visits found.</strong>Change the date range or filters.</div></div><div class="pagination"><span id="history-page-label"></span><div><button class="btn secondary small" id="history-prev">Previous</button> <button class="btn secondary small" id="history-next">Next</button></div></div></div>
    </section>

    <section class="page" id="page-kiosks">
      <div class="kiosk-grid">
        <div class="card"><div class="card-header"><div><div class="card-title">Pair a kiosk</div><div class="card-note">Generate a one-time PIN for a Chromebook</div></div></div><div class="card-body"><div class="form-stack"><div class="field"><label for="kiosk-name">Device name</label><input id="kiosk-name" maxlength="80" placeholder="Front desk Chromebook"></div><button class="btn" id="generate-pin" type="button">Generate pairing PIN</button><div class="pairing" id="pairing" hidden><div class="pairing-code" id="pairing-code"></div><div class="pairing-meta" id="pairing-meta"></div></div></div></div></div>
        <div class="card"><div class="card-header"><div><div class="card-title">Kiosk devices</div><div class="card-note" id="kiosk-note">Paired Chromebooks</div></div></div><div class="table-wrap"><table><thead><tr><th>Device</th><th>Status</th><th>Last seen</th><th>Paired</th><th></th></tr></thead><tbody id="kiosk-body"></tbody></table></div><div class="empty" id="kiosk-empty" hidden><div><strong>No kiosks paired yet.</strong>Generate a PIN to connect the first Chromebook.</div></div></div>
      </div>
    </section>
  </main>
</div>

<div class="modal-backdrop" id="student-modal" role="dialog" aria-modal="true" aria-labelledby="student-modal-title">
  <form class="modal" id="student-form">
    <div class="modal-head"><div class="modal-title" id="student-modal-title">Add student</div><button class="close" id="student-modal-close" type="button" aria-label="Close">×</button></div>
    <div class="modal-body">
      <input id="student-edit-id" type="hidden">
      <div class="field"><label for="student-id">Student ID</label><input id="student-id" maxlength="64" required></div>
      <div class="two"><div class="field"><label for="student-first">First name</label><input id="student-first" maxlength="80" required></div><div class="field"><label for="student-last">Last name</label><input id="student-last" maxlength="80" required></div></div>
      <div class="two"><div class="field"><label for="student-barcode">Barcode</label><input id="student-barcode" maxlength="80" required></div><div class="field"><label for="student-edit-grade">Grade</label><select id="student-edit-grade"><option value="">Not set</option><option>9</option><option>10</option><option>11</option><option>12</option></select></div></div>
      <label class="check"><input id="student-active" type="checkbox" checked> Active student record</label>
    </div>
    <div class="modal-actions"><button class="btn secondary" id="student-cancel" type="button">Cancel</button><button class="btn" type="submit">Save student</button></div>
  </form>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>

<script>
  const $ = (id) => document.getElementById(id);
  const pageMeta = {
    overview: ['Overview', 'A live snapshot of the library.'],
    current: ['Current', 'Students who are checked in right now.'],
    students: ['Students', 'Search and manage the student database.'],
    history: ['History', 'Review library visits and export records.'],
    kiosks: ['Kiosks', 'Pair and manage library kiosk devices.']
  };
  const state = { page: 'overview', studentOffset: 0, studentTotal: 0, historyOffset: 0, historyTotal: 0, pageSize: 100, students: [], history: [] };
  const dt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const tm = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  let toastTimer = 0;
  let searchTimer = 0;

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmtDateTime(value) { if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : dt.format(d); }
  function fmtTime(value) { if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : tm.format(d); }
  function durationMinutes(start, end) { const a = new Date(start).getTime(); const b = new Date(end || Date.now()).getTime(); if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null; return Math.max(0, Math.round((b-a)/60000)); }
  function durationLabel(minutes) { if (minutes == null) return '—'; if (minutes < 60) return minutes + 'm'; const h = Math.floor(minutes/60); const m = minutes % 60; return h + 'h' + (m ? ' ' + m + 'm' : ''); }
  function toast(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2200); }

  async function api(url, options) {
    const response = await fetch(url, Object.assign({ cache: 'no-store' }, options || {}));
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed.');
    return data;
  }
  async function post(url, body) { return api(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body || {}) }); }

  function setPage(page) {
    if (!pageMeta[page]) return;
    state.page = page;
    document.querySelectorAll('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.page === page));
    document.querySelectorAll('.page').forEach((el) => el.classList.toggle('active', el.id === 'page-' + page));
    $('page-title').textContent = pageMeta[page][0];
    $('page-subtitle').textContent = pageMeta[page][1];
    history.replaceState(null, '', '#'+page);
    loadPage(page);
  }
  function loadPage(page) {
    if (page === 'overview') return loadOverview();
    if (page === 'current') return loadCurrent();
    if (page === 'students') return loadStudents();
    if (page === 'history') return loadHistory();
    if (page === 'kiosks') return loadKiosks();
  }

  async function loadOverview() {
    try {
      const data = await api('/api/library/admin-overview');
      $('ov-current').textContent = data.currentCount;
      $('ov-visits').textContent = data.visitsToday;
      $('ov-unique').textContent = data.uniqueVisitorsToday + ' unique student' + (data.uniqueVisitorsToday === 1 ? '' : 's');
      $('ov-students').textContent = data.activeStudents;
      $('ov-kiosks').textContent = data.onlineKiosks;
      $('ov-kiosk-total').textContent = data.pairedKiosks + ' paired';
      const rows = data.recent || [];
      $('overview-recent').innerHTML = rows.length ? rows.map((v) => '<tr><td><div class="person">'+esc(v.firstName+' '+v.lastName)+'</div><div class="secondary-line">'+esc(v.studentId)+'</div></td><td>'+esc(v.reason)+'</td><td class="mono">'+esc(fmtDateTime(v.checkedInAt))+'</td><td>'+esc(durationLabel(v.durationMinutes))+'</td><td>'+(v.checkedOutAt ? '<span class="pill">Checked out</span>' : '<span class="pill green">In library</span>')+'</td></tr>').join('') : '<tr><td colspan="5">No activity yet.</td></tr>';
    } catch (error) { toast(error.message); }
  }

  async function loadCurrent() {
    try {
      const data = await api('/api/library/current');
      const rows = data.students || [];
      $('current-count').textContent = data.currentCount;
      $('current-note').textContent = data.currentCount + ' student' + (data.currentCount === 1 ? '' : 's') + ' checked in';
      $('clear-current').disabled = data.currentCount === 0;
      $('current-empty').hidden = rows.length > 0;
      $('current-body').innerHTML = rows.map((v) => '<tr><td><div class="person">'+esc(v.firstName+' '+v.lastName)+'</div><div class="secondary-line">'+esc(v.studentId)+'</div></td><td>'+esc(v.grade || '—')+'</td><td>'+esc(v.reason)+'</td><td class="mono">'+esc(fmtTime(v.checkedInAt))+'</td><td>'+esc(durationLabel(durationMinutes(v.checkedInAt)))+'</td><td><button class="btn soft-danger small checkout-one" data-visit="'+esc(v.visitId)+'">Check out</button></td></tr>').join('');
    } catch (error) { toast(error.message); }
  }

  function studentQuery() {
    const p = new URLSearchParams({ limit: String(state.pageSize), offset: String(state.studentOffset) });
    const q = $('student-search').value.trim(); const grade = $('student-grade').value; const status = $('student-status').value;
    if (q) p.set('q', q); if (grade) p.set('grade', grade); if (status) p.set('status', status);
    return p;
  }
  async function loadStudents() {
    try {
      const data = await api('/api/library/admin-students?' + studentQuery().toString());
      state.students = data.students || []; state.studentTotal = data.total || 0;
      $('students-note').textContent = state.studentTotal + ' record' + (state.studentTotal === 1 ? '' : 's');
      $('students-empty').hidden = state.students.length > 0;
      $('students-body').innerHTML = state.students.map((s) => '<tr><td><div class="person">'+esc(s.firstName+' '+s.lastName)+'</div><div class="secondary-line">'+esc(s.studentId)+'</div></td><td>'+esc(s.grade || '—')+'</td><td class="mono">'+esc(s.barcode)+'</td><td>'+esc(s.visitCount)+'</td><td>'+esc(fmtDateTime(s.lastVisitAt))+'</td><td>'+(s.active ? '<span class="pill green">Active</span>' : '<span class="pill">Inactive</span>')+'</td><td><button class="btn secondary small edit-student" data-id="'+esc(s.id)+'">Edit</button></td></tr>').join('');
      const start = state.studentTotal ? state.studentOffset + 1 : 0; const end = Math.min(state.studentOffset + state.students.length, state.studentTotal);
      $('students-page-label').textContent = start + '–' + end + ' of ' + state.studentTotal;
      $('students-prev').disabled = state.studentOffset === 0;
      $('students-next').disabled = state.studentOffset + state.pageSize >= state.studentTotal;
    } catch (error) { toast(error.message); }
  }

  function historyQuery() {
    const p = new URLSearchParams({ limit: String(state.pageSize), offset: String(state.historyOffset) });
    const q = $('history-search').value.trim(); const reason = $('history-reason').value; const from = $('history-from').value; const to = $('history-to').value;
    if (q) p.set('q', q); if (reason) p.set('reason', reason); if (from) p.set('from', from); if (to) p.set('to', to);
    return p;
  }
  async function loadHistory() {
    try {
      const data = await api('/api/library/admin-history?' + historyQuery().toString());
      state.history = data.visits || []; state.historyTotal = data.total || 0;
      $('history-note').textContent = state.historyTotal + ' visit' + (state.historyTotal === 1 ? '' : 's') + ' in this view';
      $('history-empty').hidden = state.history.length > 0;
      $('history-body').innerHTML = state.history.map((v) => '<tr><td><div class="person">'+esc(v.firstName+' '+v.lastName)+'</div><div class="secondary-line">'+esc(v.studentId)+'</div></td><td>'+esc(v.reason)+'</td><td class="mono">'+esc(fmtDateTime(v.checkedInAt))+'</td><td class="mono">'+esc(fmtDateTime(v.checkedOutAt))+'</td><td>'+esc(durationLabel(v.durationMinutes))+'</td><td>'+checkoutLabel(v)+'</td></tr>').join('');
      const start = state.historyTotal ? state.historyOffset + 1 : 0; const end = Math.min(state.historyOffset + state.history.length, state.historyTotal);
      $('history-page-label').textContent = start + '–' + end + ' of ' + state.historyTotal;
      $('history-prev').disabled = state.historyOffset === 0;
      $('history-next').disabled = state.historyOffset + state.pageSize >= state.historyTotal;
    } catch (error) { toast(error.message); }
  }
  function checkoutLabel(v) {
    if (!v.checkedOutAt) return '<span class="pill green">Still in</span>';
    const labels = { scan_out: 'Scanned out', librarian: 'Librarian', clear_all: 'Cleared', auto_end_of_day: 'End of day' };
    return '<span class="pill">'+esc(labels[v.checkoutMethod] || 'Checked out')+'</span>';
  }

  async function loadKiosks() {
    try {
      const data = await api('/api/library/kiosk-devices');
      const devices = data.devices || [];
      $('kiosk-note').textContent = devices.filter((d) => !d.revokedAt).length + ' active paired device' + (devices.filter((d) => !d.revokedAt).length === 1 ? '' : 's');
      $('kiosk-empty').hidden = devices.length > 0;
      $('kiosk-body').innerHTML = devices.map((d) => {
        const status = kioskStatus(d);
        return '<tr><td><div class="person">'+esc(d.name)+'</div><div class="secondary-line">Device '+esc(d.id)+'</div></td><td>'+status.html+'</td><td>'+esc(fmtDateTime(d.lastSeenAt))+'</td><td>'+esc(fmtDateTime(d.createdAt))+'</td><td>'+(d.revokedAt ? '' : '<button class="btn soft-danger small revoke-kiosk" data-id="'+esc(d.id)+'">Revoke</button>')+'</td></tr>';
      }).join('');
    } catch (error) { toast(error.message); }
  }
  function kioskStatus(d) {
    if (d.revokedAt) return { html: '<span class="pill red">Revoked</span>' };
    const seen = d.lastSeenAt ? new Date(d.lastSeenAt).getTime() : 0;
    if (seen && Date.now() - seen < 10*60*1000) return { html: '<span class="pill green">Online</span>' };
    return { html: '<span class="pill orange">Offline</span>' };
  }

  function openStudentModal(student) {
    $('student-form').reset();
    $('student-edit-id').value = student ? student.id : '';
    $('student-id').value = student ? student.studentId : '';
    $('student-id').disabled = !!student;
    $('student-first').value = student ? student.firstName : '';
    $('student-last').value = student ? student.lastName : '';
    $('student-barcode').value = student ? student.barcode : '';
    $('student-edit-grade').value = student && student.grade ? student.grade : '';
    $('student-active').checked = student ? student.active : true;
    $('student-modal-title').textContent = student ? 'Edit student' : 'Add student';
    $('student-modal').classList.add('open');
    setTimeout(() => (student ? $('student-first') : $('student-id')).focus(), 0);
  }
  function closeStudentModal() { $('student-modal').classList.remove('open'); }

  document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => setPage(button.dataset.page)));
  document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => setPage(button.dataset.go)));
  $('refresh-page').addEventListener('click', () => loadPage(state.page));
  $('clear-current').addEventListener('click', async () => {
    if (!confirm('Check out every student currently in the library?')) return;
    try { await post('/api/library/clear', { method: 'clear_all' }); toast('Everyone was checked out.'); loadCurrent(); loadOverview(); } catch (error) { toast(error.message); }
  });
  $('current-body').addEventListener('click', async (event) => {
    const button = event.target.closest('.checkout-one'); if (!button) return;
    button.disabled = true;
    try { await post('/api/library/checkout', { visitId: Number(button.dataset.visit), method: 'librarian' }); loadCurrent(); } catch (error) { button.disabled = false; toast(error.message); }
  });

  ['student-search','student-grade','student-status'].forEach((id) => $(id).addEventListener(id === 'student-search' ? 'input' : 'change', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.studentOffset = 0; loadStudents(); }, 180); }));
  $('students-prev').addEventListener('click', () => { state.studentOffset = Math.max(0, state.studentOffset - state.pageSize); loadStudents(); });
  $('students-next').addEventListener('click', () => { state.studentOffset += state.pageSize; loadStudents(); });
  $('add-student').addEventListener('click', () => openStudentModal(null));
  $('students-body').addEventListener('click', (event) => { const button = event.target.closest('.edit-student'); if (!button) return; const student = state.students.find((s) => String(s.id) === String(button.dataset.id)); if (student) openStudentModal(student); });
  $('student-modal-close').addEventListener('click', closeStudentModal); $('student-cancel').addEventListener('click', closeStudentModal);
  $('student-modal').addEventListener('click', (event) => { if (event.target === $('student-modal')) closeStudentModal(); });
  $('student-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = { id: Number($('student-edit-id').value || 0), studentId: $('student-id').value.trim(), firstName: $('student-first').value.trim(), lastName: $('student-last').value.trim(), barcode: $('student-barcode').value.trim(), grade: $('student-edit-grade').value, active: $('student-active').checked };
    try { await post('/api/library/admin-students', body); closeStudentModal(); toast(body.id ? 'Student updated.' : 'Student added.'); loadStudents(); loadOverview(); } catch (error) { toast(error.message); }
  });

  ['history-search','history-reason','history-from','history-to'].forEach((id) => $(id).addEventListener(id === 'history-search' ? 'input' : 'change', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.historyOffset = 0; loadHistory(); }, 180); }));
  $('history-prev').addEventListener('click', () => { state.historyOffset = Math.max(0, state.historyOffset - state.pageSize); loadHistory(); });
  $('history-next').addEventListener('click', () => { state.historyOffset += state.pageSize; loadHistory(); });
  $('history-export').addEventListener('click', () => {
    const from = $('history-from').value; const to = $('history-to').value;
    const p = new URLSearchParams(); if (from) p.set('from', from); if (to) p.set('to', to || from);
    window.location.href = '/api/library/export-csv?' + p.toString();
  });

  $('generate-pin').addEventListener('click', async () => {
    const name = $('kiosk-name').value.trim(); if (!name) { toast('Enter a device name first.'); $('kiosk-name').focus(); return; }
    try {
      const data = await post('/api/library/kiosk-pairing', { name });
      $('pairing-code').textContent = String(data.pin || '').replace(/(\d{4})(\d{4})/, '$1 $2');
      $('pairing-meta').textContent = 'For ' + data.name + ' · expires ' + fmtTime(data.expiresAt);
      $('pairing').hidden = false;
      loadKiosks();
    } catch (error) { toast(error.message); }
  });
  $('kiosk-body').addEventListener('click', async (event) => {
    const button = event.target.closest('.revoke-kiosk'); if (!button) return;
    if (!confirm('Revoke this kiosk? It will need a new pairing PIN to connect again.')) return;
    try { await post('/api/library/kiosk-revoke', { deviceId: Number(button.dataset.id) }); toast('Kiosk revoked.'); loadKiosks(); loadOverview(); } catch (error) { toast(error.message); }
  });

  function localDateString(date) { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(date); const map = {}; parts.forEach((p) => map[p.type] = p.value); return map.year + '-' + map.month + '-' + map.day; }
  const today = new Date(); const sevenDaysAgo = new Date(today.getTime() - 6*86400000);
  $('history-from').value = localDateString(sevenDaysAgo); $('history-to').value = localDateString(today);

  const initial = location.hash.slice(1); setPage(pageMeta[initial] ? initial : 'overview');
  setInterval(() => { if (state.page === 'current') loadCurrent(); else if (state.page === 'overview') loadOverview(); }, 10000);
</script>
</body>
</html>`;
}
