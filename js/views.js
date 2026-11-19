/* الشاشات والإجراءات والنماذج */
(function (root) {
  'use strict';
  const RA = root.RA;
  const L = RA.logic;
  const ui = RA.ui;
  const t = RA.i18n.t;
  const esc = ui.esc;
  const S = ui.state;
  const D = () => RA.db;
  let C = { today: '', alerts: [] };

  const byName = (a, b) => a.name.localeCompare(b.name, 'ar', { numeric: true });
  const num = (v) => (L.isNum(v) ? Number(v) : 0);
  const INST_CLS = { paid: 'ok', overdue: 'bad', dueToday: 'warn', dueSoon: 'warn', upcoming: 'info' };
  const UNIT_CLS = { occupied: 'ok', expired: 'warn', reserved: 'info', vacant: 'muted', maintenance: 'muted' };
  const instChip = (st) => ui.chip(INST_CLS[st], t('st_' + st));
  const unitChip = (st) => ui.chip(UNIT_CLS[st], t('us_' + st));
  const alertDays = () => D().settings.alertDays || 7;
  const ic = ui.icon;

  function waBtn(phone, text, label) {
    if (!L.waPhone(phone)) return '';
    return '<a class="btn small ghost" target="_blank" rel="noopener" href="' + esc(L.waLink(phone, text)) + '">' + ic('chat', 16) + ' ' + esc(label || t('wa')) + '</a>';
  }
  const waRemindText = (r) => t('wa_msg', { tenant: r.tenant ? r.tenant.name : '', unit: r.unit ? r.unit.name : '', amount: ui.money(L.remOf(r.inst)), date: ui.fmtDate(r.inst.dueDate) });

  function download(name, text, mime) {
    if (root.__PREVIEW) { ui.toast(t('preview_no_download')); return; }
    if (RA.native.isNative) {
      RA.native.shareFile(name, text).catch(() => ui.toast(t('file_share_fail')));
      return;
    }
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  /* =================== الإطار العام =================== */
  function render(toTop) {
    const d = D();
    C = { today: L.todayISO(), alerts: L.alerts(d, L.todayISO(), d.settings) };
    let html = '';
    switch (S.tab) {
      case 'home': html = viewHome(); break;
      case 'units': html = S.unitId ? viewUnit(S.unitId) : viewUnits(); break;
      case 'pay': html = viewPay(); break;
      case 'bills': html = viewBills(); break;
      case 'more': html = viewMore(); break;
      case 'alerts': html = viewAlerts(); break;
      default: html = viewHome();
    }
    document.getElementById('view').innerHTML = html;
    chrome();
    if (toTop) window.scrollTo(0, 0);
  }
  ui.render = render;

  function chrome() {
    const d = D();
    const b = d.buildings[0];
    document.getElementById('hdTitle').textContent = (b && b.name) || t('app_name');
    const high = C.alerts.filter((a) => a.sev === 'high').length;
    document.getElementById('bellBtn').innerHTML = ic('bell', 22) + (high ? '<span class="badge">' + high + '</span>' : '');
    const tabs = ['home', 'units', 'pay', 'bills', 'more'];
    document.getElementById('tabbar').innerHTML = tabs.map((k) =>
      '<button type="button" class="tab' + (S.tab === k ? ' on' : '') + '" data-act="go" data-tab="' + k + '">' + ic(k, 22) + '<span>' + esc(t('nav_' + k)) + '</span></button>').join('');
  }

  function empty(msg, btn) {
    return '<div class="empty"><p>' + esc(msg) + '</p>' + (btn || '') + '</div>';
  }

  /* =================== الرئيسية =================== */
  function kpi(label, value, sub, tone) {
    return '<div class="kpi ' + (tone || '') + '"><div class="kpi-l">' + esc(label) + '</div><div class="kpi-v">' + esc(value) + '</div>' + (sub ? '<div class="kpi-s">' + esc(sub) + '</div>' : '') + '</div>';
  }

  function chartHTML(st) {
    const max = Math.max(1, ...st.buckets.map((b) => Math.max(b.expected, b.collected)));
    const h = (v) => (v > 0 ? Math.max(3, Math.round((v / max) * 100)) : 0);
    const cols = st.buckets.map((b) =>
      '<div class="bcol" title="' + esc(t('chart_tip', { due: ui.money(b.expected), col: ui.money(b.collected) })) + '"><div class="bars"><div class="bar due" style="height:' + h(b.expected) + '%"></div><div class="bar col" style="height:' + h(b.collected) + '%"></div></div><div class="blabel">' + b.key + '</div></div>').join('');
    return '<div class="chart" role="img" aria-label="' + esc(t('chart_aria')) + '">' + cols + '</div>' +
      '<div class="legend"><span><i class="dot due"></i>' + esc(t('kpi_expected')) + '</span><span><i class="dot col"></i>' + esc(t('kpi_collected')) + '</span></div>';
  }

  function alertText(a) {
    const p = Object.assign({}, a.p);
    p.unit = p.unitName; p.tenant = p.tenantName;
    if (p.amount != null) p.amount = ui.money(p.amount);
    if (p.billType) p.type = t('bt_' + p.billType);
    if (a.type === 'backup') p.date = p.date ? ui.fmtDate(p.date) : t('never');
    return t('al_' + a.type, p);
  }

  function alertRow(a) {
    const cls = { high: 'bad', mid: 'warn', low: 'info' }[a.sev];
    let extra = '';
    if (['overdue', 'dueToday', 'dueSoon'].includes(a.type)) {
      const r = L.flat(D()).find((x) => x.inst.id === a.instId);
      if (r && r.tenant) extra = waBtn(r.tenant.phone, waRemindText(r), t('wa_remind'));
    } else if (a.type === 'backup') {
      extra = '<button type="button" class="btn small ghost" data-act="export" data-what="json">' + ic('download', 16) + ' ' + esc(t('backup_now')) + '</button>';
    } else if (a.type === 'meters') {
      extra = '<button type="button" class="btn small ghost" data-act="addBill">' + ic('plus', 16) + ' ' + esc(t('add_bill')) + '</button>';
    }
    const open = a.unitId ? ' role="button" tabindex="0" data-act="openUnit" data-id="' + a.unitId + '"' : '';
    return '<div class="arow ' + cls + '"><div class="arow-main"' + open + '>' + esc(alertText(a)) + '</div>' + (extra ? '<div class="arow-act">' + extra + '</div>' : '') + '</div>';
  }

  function onboarding() {
    const b = D().buildings[0];
    return '<section class="card hero"><h2>' + esc(t('welcome')) + '</h2><p class="muted">' + esc(t('welcome_p')) + '</p>' +
      '<form data-form="onboard" class="form">' +
      ui.fields([
        { name: 'bName', label: t('f_building'), value: b ? b.name : '', required: true, placeholder: t('f_building_ph') },
        { name: 'apts', label: t('f_apts'), type: 'number', value: 6, min: 0, max: 200, step: 1 },
        { name: 'rooms', label: t('f_rooms'), type: 'number', value: 1, min: 0, max: 200, step: 1 },
      ]) +
      '<button class="btn primary block" type="submit">' + esc(t('start')) + '</button></form>' +
      '<button type="button" class="btn ghost block" data-act="loadDemo">' + esc(t('try_demo')) + '</button></section>';
  }

  function unitCard(u, st) {
    const d = D();
    const s = L.unitState(d, u, C.today);
    const p = st.per[u.id];
    const pct = p.expected > 0 ? Math.min(100, Math.round((p.collected / p.expected) * 100)) : 0;
    const tn = s.contract ? L.tenantOf(d, s.contract.tenantId) : null;
    let tone, label;
    if (s.status === 'vacant' || s.status === 'maintenance') { tone = 'muted'; label = t('us_' + s.status); }
    else if (p.expected === 0) { tone = 'muted'; label = t('perf_none'); }
    else if (p.overdue > 0) { tone = 'bad'; label = t('perf_late'); }
    else if (p.collected >= p.expected - 0.004) { tone = 'ok'; label = t('perf_full'); }
    else { tone = 'ok'; label = t('perf_ok'); }
    const nx = L.unitNext(d, u, C.today, alertDays());
    let foot = '';
    if (nx) {
      foot = nx.status === 'overdue'
        ? '<span class="bad-t">' + esc(t('overdue_days', { n: -nx.days })) + ' · ' + esc(ui.money(L.remOf(nx.r.inst))) + '</span>'
        : esc(t('next_due', { date: ui.fmtDate(nx.r.inst.dueDate), amount: ui.money(L.remOf(nx.r.inst)) }));
    } else if (s.status === 'vacant') {
      const vd = L.vacantDays(d, u, C.today);
      foot = vd == null ? '' : esc(t('vacant_days', { n: vd }));
    } else foot = esc(t('all_paid'));
    const delay = p.avgDelay > 0 ? ' · ' + esc(t('avg_delay', { n: p.avgDelay })) : '';
    return '<div class="card ucard" role="button" tabindex="0" data-act="openUnit" data-id="' + u.id + '">' +
      '<div class="split top"><div><div class="u-name">' + esc(u.name) + '</div><div class="muted small">' + esc(tn ? tn.name : '—') + '</div></div>' + ui.chip(tone, label) + '</div>' +
      '<div class="progress"><div class="fill ' + (p.overdue > 0 ? 'bad' : '') + '" style="width:' + pct + '%"></div></div>' +
      '<div class="split small"><span>' + esc(t('collected')) + ' <b>' + ui.num(p.collected) + '</b></span><span>' + esc(t('remaining')) + ' <b>' + ui.num(p.remaining) + '</b></span></div>' +
      '<div class="foot small muted">' + foot + delay + '</div></div>';
  }

  function viewHome() {
    const d = D();
    if (!d.units.length) return onboarding();
    const yrs = L.years(d, C.today);
    if (S.period !== 'all' && !yrs.includes(S.period)) S.period = L.parse(C.today).y;
    const st = L.stats(d, S.period, C.today);
    const pct = st.expected > 0 ? Math.min(100, Math.round((st.collected / st.expected) * 100)) : 0;
    const occ = L.occupancy(d, C.today);
    const opts = yrs.map((y) => '<option value="' + y + '"' + (S.period === y ? ' selected' : '') + '>' + y + '</option>').join('') +
      '<option value="all"' + (S.period === 'all' ? ' selected' : '') + '>' + esc(t('all_periods')) + '</option>';
    const al = C.alerts.slice(0, 4);
    const units = d.units.slice().sort(byName);
    return (RA.store.isOk() ? '' : '<div class="card warnbox">' + esc(t('storage_off')) + '</div>') +
      '<section class="toolbar"><h2>' + esc(t('overview')) + '</h2><label class="sel"><span class="sr">' + esc(t('period')) + '</span><select data-change="period">' + opts + '</select></label></section>' +
      '<section class="kpis">' +
      kpi(t('kpi_expected'), ui.money(st.expected), '', '') +
      kpi(t('kpi_collected'), ui.money(st.collected), pct + '%', 'ok') +
      kpi(t('kpi_remaining'), ui.money(st.remaining), '', 'info') +
      kpi(t('kpi_overdue'), ui.money(st.overdue), st.overdue > 0 ? t('kpi_overdue_n', { n: st.overdueCount }) : t('kpi_none'), st.overdue > 0 ? 'bad' : '') +
      '</section>' +
      '<section class="card"><div class="split"><strong>' + esc(t('collection_rate')) + '</strong><span class="muted">' + pct + '%</span></div>' +
      '<div class="progress big"><div class="fill" style="width:' + pct + '%"></div></div>' +
      '<div class="split small muted"><span>' + esc(t('occupancy')) + ': ' + occ.occupied + '/' + occ.total + '</span><span>' + occ.rate + '%</span></div></section>' +
      '<section class="card"><h3 class="sec-in">' + esc(S.period === 'all' ? t('by_year') : t('by_month')) + '</h3>' + chartHTML(st) + '</section>' +
      '<section class="card"><div class="split"><h3 class="sec-in">' + esc(t('alerts')) + '</h3>' + (C.alerts.length > 4 ? '<button type="button" class="link" data-act="goAlerts">' + esc(t('see_all')) + ' (' + C.alerts.length + ')</button>' : '') + '</div>' +
      (al.length ? '<div class="alist">' + al.map(alertRow).join('') + '</div>' : '<p class="muted">' + esc(t('no_alerts')) + '</p>') + '</section>' +
      '<h3 class="sec">' + esc(t('units_performance')) + '</h3><section class="grid">' + units.map((u) => unitCard(u, st)).join('') + '</section>';
  }

  /* =================== الوحدات =================== */
  function viewUnits() {
    const d = D();
    const rows = d.units.slice().sort(byName).map((u) => {
      const s = L.unitState(d, u, C.today);
      const tn = s.contract ? L.tenantOf(d, s.contract.tenantId) : null;
      const sub = (tn ? tn.name : t('no_tenant')) + (s.contract && s.status !== 'vacant' ? ' · ' + ui.money(s.contract.annualRent) + ' / ' + t('year') : '');
      return '<div class="row" role="button" tabindex="0" data-act="openUnit" data-id="' + u.id + '"><div class="row-main"><div class="row-title">' + esc(u.name) + '</div><div class="muted small">' + esc(sub) + '</div></div><div class="row-end">' + unitChip(s.status) + ic('chev', 18) + '</div></div>';
    }).join('');
    return '<section class="toolbar"><h2>' + esc(t('units')) + '</h2><button type="button" class="btn primary small" data-act="addUnit">' + ic('plus', 16) + ' ' + esc(t('add_unit')) + '</button></section>' +
      (d.units.length ? '<div class="list">' + rows + '</div>' : empty(t('no_units'), '<button type="button" class="btn primary" data-act="addUnit">' + esc(t('add_unit')) + '</button>'));
  }

  function instRow(r, showUnit) {
    const st = L.instStatus(r.inst, C.today, alertDays());
    const paid = L.paidOf(r.inst);
    const rem = L.remOf(r.inst);
    const n = t('inst_n', { n: r.inst.no, total: r.c.installments.length });
    const title = showUnit ? esc(r.unit ? r.unit.name : '') + (r.tenant ? ' · ' + esc(r.tenant.name) : '') : esc(n);
    const sub = t('due_on', { date: ui.fmtDate(r.inst.dueDate) }) + (showUnit ? ' · ' + n : '');
    let amt = ui.money(r.inst.amount);
    if (st !== 'paid' && paid > 0) amt = t('rem_of', { rem: ui.money(rem), total: ui.num(r.inst.amount) });
    return '<div class="row" role="button" tabindex="0" data-act="openInst" data-c="' + r.c.id + '" data-i="' + r.inst.id + '"><div class="row-main"><div class="row-title">' + title + '</div><div class="muted small">' + esc(sub) + '</div></div>' +
      '<div class="row-end col"><div class="amt">' + esc(amt) + '</div><div>' + instChip(st) + (paid > 0 && st !== 'paid' ? ui.chip('info', t('st_partial')) : '') + '</div></div></div>';
  }

  function kv(k, v) { return '<div class="kv-i"><dt>' + esc(k) + '</dt><dd>' + v + '</dd></div>'; }

  function viewUnit(id) {
    const d = D();
    const u = L.unitOf(d, id);
    if (!u) { S.unitId = null; return viewUnits(); }
    const stt = L.unitState(d, u, C.today);
    const c = stt.contract;
    const tn = c ? L.tenantOf(d, c.tenantId) : null;
    const hist = d.contracts.filter((x) => x.unitId === id && (!c || x.id !== c.id)).sort((a, b) => b.start.localeCompare(a.start));
    let h = '<div class="toolbar"><button type="button" class="btn ghost small" data-act="backUnits">' + ic('back', 16) + ' ' + esc(t('back')) + '</button>' +
      '<button type="button" class="btn ghost small" data-act="editUnit" data-id="' + id + '">' + ic('edit', 16) + ' ' + esc(t('edit')) + '</button></div>';
    h += '<section class="card"><div class="split"><h2>' + esc(u.name) + '</h2>' + unitChip(stt.status) + '</div><dl class="kv">' +
      kv(t('f_kind'), esc(t('kind_' + (u.kind || 'apartment')))) + (u.floor ? kv(t('f_floor'), esc(u.floor)) : '') + (u.rooms ? kv(t('f_rooms_n'), esc(u.rooms)) : '') +
      (u.electricMeter ? kv(t('f_emeter'), '<span class="ltr">' + esc(u.electricMeter) + '</span>') : '') + (u.waterMeter ? kv(t('f_wmeter'), '<span class="ltr">' + esc(u.waterMeter) + '</span>') : '') +
      (u.notes ? kv(t('f_notes'), esc(u.notes)) : '') + '</dl></section>';

    if (c) {
      const end = L.contractEnd(c);
      h += '<section class="card"><div class="split"><h3 class="sec-in">' + esc(t('contract')) + '</h3>' + ui.chip(c.terminatedAt ? 'muted' : 'info', t('cs_' + L.contractStatus(c, C.today))) + '</div>';
      h += '<div class="tenantbox"><div><div class="u-name">' + esc(tn ? tn.name : '—') + '</div>' + (tn && tn.phone ? '<div class="muted small ltr">' + esc(tn.phone) + '</div>' : '') + '</div><div class="btn-row tight">' +
        (tn && tn.phone ? '<a class="btn small ghost" href="tel:' + esc(tn.phone) + '">' + ic('phone', 16) + ' ' + esc(t('call')) + '</a>' + waBtn(tn.phone, '', t('wa')) : '') + '</div></div>';
      h += '<dl class="kv">' + kv(t('f_start'), esc(ui.fmtDate(c.start))) + kv(t('f_end'), esc(ui.fmtDate(end))) +
        kv(t('f_rent'), esc(ui.money(c.annualRent))) + kv(t('f_freq'), esc(t('freq_' + c.freq))) +
        (c.deposit ? kv(t('f_deposit'), esc(ui.money(c.deposit))) : '') + (c.ejarNo ? kv(t('f_ejar'), '<span class="ltr">' + esc(c.ejarNo) + '</span>') : '') + '</dl>';
      h += '<div class="btn-row"><button type="button" class="btn small ghost" data-act="editContract" data-id="' + c.id + '">' + ic('edit', 16) + ' ' + esc(t('edit_contract')) + '</button>';
      if (!c.terminatedAt) {
        h += '<button type="button" class="btn small ghost" data-act="renewContract" data-id="' + c.id + '">' + esc(t('renew')) + '</button>' +
          '<button type="button" class="btn small ghost danger-t" data-act="endContract" data-id="' + c.id + '">' + esc(t('end_contract')) + '</button>';
      }
      h += '</div></section>';
      h += '<h3 class="sec">' + esc(t('schedule')) + '</h3><div class="list">' + c.installments.map((i) => instRow({ inst: i, c, unit: u, tenant: tn }, false)).join('') + '</div>';
    } else {
      h += '<section class="card center"><p class="muted">' + esc(t('vacant_msg')) + '</p><button type="button" class="btn primary" data-act="addContract" data-id="' + id + '">' + ic('plus', 16) + ' ' + esc(t('new_contract')) + '</button></section>';
    }
    if (c && stt.status !== 'vacant') {
      h += '<div class="btn-row"><button type="button" class="btn small ghost" data-act="addContract" data-id="' + id + '">' + ic('plus', 16) + ' ' + esc(t('new_contract')) + '</button></div>';
    }
    if (hist.length) {
      h += '<h3 class="sec">' + esc(t('history')) + '</h3><div class="list">' + hist.map((x) => {
        const tt = L.tenantOf(d, x.tenantId);
        const unpaid = x.installments.reduce((s, i) => s + L.remOf(i), 0);
        return '<div class="row" role="button" tabindex="0" data-act="editContract" data-id="' + x.id + '"><div class="row-main"><div class="row-title">' + esc(tt ? tt.name : '—') + '</div><div class="muted small">' + esc(ui.fmtDate(x.start)) + ' ← ' + esc(ui.fmtDate(x.terminatedAt || L.contractEnd(x))) + '</div></div><div class="row-end col">' + (unpaid > 0.004 ? ui.chip('bad', t('unpaid_left', { amt: ui.money(unpaid) })) : '') + ui.chip('muted', t('cs_' + L.contractStatus(x, C.today))) + '</div></div>';
      }).join('') + '</div>';
    }
    const ub = d.bills.filter((b) => b.unitId === id).sort((a, b) => b.period.localeCompare(a.period)).slice(0, 5);
    h += '<div class="split top"><h3 class="sec">' + esc(t('unit_bills')) + '</h3><button type="button" class="btn small ghost" data-act="addBill" data-unit="' + id + '">' + ic('plus', 16) + ' ' + esc(t('add_bill')) + '</button></div>';
    h += ub.length ? '<div class="list">' + ub.map((b) => billRow(b, false)).join('') + '</div>' : '<p class="muted">' + esc(t('no_bills')) + '</p>';
    return h;
  }

  /* =================== الدفعات =================== */
  function viewPay() {
    const d = D();
    const rows = L.flat(d).map((r) => Object.assign({ st: L.instStatus(r.inst, C.today, alertDays()) }, r));
    const f = S.payFilter;
    const filters = {
      open: (r) => r.st !== 'paid',
      overdue: (r) => r.st === 'overdue',
      soon: (r) => r.st === 'dueToday' || r.st === 'dueSoon',
      paid: (r) => r.st === 'paid',
      all: () => true,
    };
    const chips = ['open', 'overdue', 'soon', 'paid', 'all'].map((k) => {
      const n = rows.filter(filters[k]).length;
      return '<button type="button" class="fchip' + (f === k ? ' on' : '') + '" data-act="payFilter" data-f="' + k + '">' + esc(t('pf_' + k)) + ' <span class="cnt">' + n + '</span></button>';
    }).join('');
    let list = rows.filter(filters[f]);
    if (f === 'paid') list.sort((a, b) => L.lastPayDate(b.inst).localeCompare(L.lastPayDate(a.inst)));
    else if (f === 'all') list.sort((a, b) => b.inst.dueDate.localeCompare(a.inst.dueDate));
    else list.sort((a, b) => a.inst.dueDate.localeCompare(b.inst.dueDate));
    const total = list.reduce((s, r) => s + (f === 'paid' ? L.paidOf(r.inst) : L.remOf(r.inst)), 0);
    return '<section class="toolbar"><h2>' + esc(t('payments')) + '</h2></section><div class="fchips">' + chips + '</div>' +
      (list.length ? '<div class="split sumline"><span class="muted">' + esc(f === 'paid' ? t('total_paid') : t('total_remaining')) + '</span><b>' + esc(ui.money(total)) + '</b></div><div class="list">' + list.map((r) => instRow(r, true)).join('') + '</div>' : empty(t('no_payments')));
  }

  function methodOpts() {
    return ['cash', 'transfer', 'check', 'sadad', 'other'].map((m) => ({ value: m, label: t('m_' + m) }));
  }

  function openInst(cid, iid) {
    const d = D();
    const c = d.contracts.find((x) => x.id === cid);
    const inst = c && c.installments.find((x) => x.id === iid);
    if (!inst) return;
    const unit = L.unitOf(d, c.unitId);
    const tenant = L.tenantOf(d, c.tenantId);
    const st = L.instStatus(inst, L.todayISO(), alertDays());
    const rem = L.remOf(inst);
    const r = { inst, c, unit, tenant };
    let h = ui.sheetHead(t('inst_title', { unit: unit ? unit.name : '', n: inst.no }));
    h += '<dl class="kv">' + kv(t('f_tenant'), esc(tenant ? tenant.name : '—')) + kv(t('due'), esc(ui.fmtDate(inst.dueDate))) + kv(t('amount'), esc(ui.money(inst.amount))) +
      kv(t('paid'), esc(ui.money(L.paidOf(inst)))) + kv(t('remaining'), '<b>' + esc(ui.money(rem)) + '</b>') + kv(t('status'), instChip(st)) + '</dl>';
    if (inst.payments.length) {
      h += '<h4 class="sec-in">' + esc(t('pay_log')) + '</h4><div class="list tight">' + inst.payments.map((p) =>
        '<div class="row static"><div class="row-main"><div class="row-title">' + esc(ui.money(p.amount)) + '</div><div class="muted small">' + esc(ui.fmtDate(p.date)) + ' · ' + esc(t('m_' + (p.method || 'cash'))) + (p.receiptNo ? ' · ' + esc(p.receiptNo) : '') + (p.note ? ' · ' + esc(p.note) : '') + '</div></div>' +
        '<div class="row-end"><button type="button" class="iconbtn" data-act="receipt" data-c="' + cid + '" data-i="' + iid + '" data-p="' + p.id + '" aria-label="' + esc(t('receipt')) + '">' + ic('file', 18) + '</button>' +
        '<button type="button" class="iconbtn" data-act="deletePayment" data-c="' + cid + '" data-i="' + iid + '" data-p="' + p.id + '" aria-label="' + esc(t('delete')) + '">' + ic('trash', 18) + '</button></div></div>').join('') + '</div>';
    }
    if (rem > 0.004) {
      h += '<h4 class="sec-in">' + esc(t('record_payment')) + '</h4><form class="form" data-form="payment" data-c="' + cid + '" data-i="' + iid + '">' +
        ui.fields([
          { name: 'amount', label: t('amount'), type: 'number', step: '0.01', min: 0, value: rem, required: true },
          { name: 'date', label: t('pay_date'), type: 'date', value: L.todayISO(), required: true },
          { name: 'method', label: t('method'), type: 'select', options: methodOpts(), value: 'transfer' },
          { name: 'note', label: t('f_notes'), type: 'text' },
        ]) + '<button class="btn primary block" type="submit">' + esc(t('save_payment')) + '</button></form>';
      if (tenant) h += '<div class="btn-row">' + waBtn(tenant.phone, waRemindText(r), t('wa_remind')) + '</div>';
    }
    ui.openModal(h);
  }

  function openReceipt(cid, iid, pid) {
    const d = D();
    const c = d.contracts.find((x) => x.id === cid);
    const inst = c && c.installments.find((x) => x.id === iid);
    const p = inst && inst.payments.find((x) => x.id === pid);
    if (!p) return;
    const unit = L.unitOf(d, c.unitId);
    const tenant = L.tenantOf(d, c.tenantId);
    const b = d.buildings[0];
    const who = d.settings.ownerName || (b && b.name) || '';
    const left = L.remOf(inst);
    const row = (k, v) => '<tr><th>' + esc(k) + '</th><td>' + v + '</td></tr>';
    ui._receiptText = t('receipt_text', { no: p.receiptNo || '—', date: ui.fmtDate(p.date), tenant: tenant ? tenant.name : '', amount: ui.money(p.amount), unit: unit ? unit.name : '', n: inst.no, total: c.installments.length, left: ui.money(left) });
    let h = ui.sheetHead(t('receipt'));
    h += '<div class="receipt"><div class="r-head"><div class="r-title">' + esc(t('receipt_title')) + '</div><div class="r-no">' + esc(t('receipt_no')) + ': <span class="ltr">' + esc(p.receiptNo || '—') + '</span></div></div>' +
      '<div class="r-date muted">' + esc(t('pay_date')) + ': ' + esc(ui.fmtDate(p.date)) + '</div><table class="r-tbl">' +
      row(t('received_from'), esc(tenant ? tenant.name : '—')) + row(t('the_sum'), '<b>' + esc(ui.money(p.amount)) + '</b>') +
      row(t('for_what'), esc(t('receipt_for', { unit: unit ? unit.name : '', n: inst.no, total: c.installments.length, date: ui.fmtDate(inst.dueDate) }))) +
      row(t('method'), esc(t('m_' + (p.method || 'cash')))) + row(t('left_of_inst'), esc(ui.money(left))) + '</table>' +
      '<div class="r-sign"><div>' + esc(t('receiver')) + ': ' + esc(who) + '</div><div>' + esc(t('signature')) + ': ____________</div></div></div>';
    const wa = tenant ? waBtn(tenant.phone, t('wa_receipt', { tenant: tenant.name, amount: ui.money(p.amount), unit: unit ? unit.name : '', no: p.receiptNo || '' }), t('wa_send')) : '';
    h += '<div class="btn-row no-print"><button type="button" class="btn primary" data-act="printReceipt">' + esc(t(RA.native.isNative ? 'share' : 'print')) + '</button>' + wa +
      '<button type="button" class="btn ghost" data-act="openInst" data-c="' + cid + '" data-i="' + iid + '">' + esc(t('back')) + '</button></div>';
    ui.openModal(h, 'receipt-sheet');
  }

  /* =================== الفواتير =================== */
  function billRow(b, showUnit) {
    const d = D();
    const u = L.unitOf(d, b.unitId);
    const cons = L.billCons(b);
    const flag = L.billFlag(d, b);
    const sub = ui.fmtMonth(b.period) + (cons != null ? ' · ' + t('cons', { n: ui.num(cons) }) : '') + ' · ' + t('payer_' + b.paidBy);
    return '<div class="row" role="button" tabindex="0" data-act="editBill" data-id="' + b.id + '"><div class="row-main"><div class="row-title">' + (showUnit ? esc(u ? u.name : '') + ' · ' : '') + esc(t('bt_' + b.type)) + '</div><div class="muted small">' + esc(sub) + '</div></div>' +
      '<div class="row-end col"><div class="amt">' + esc(ui.money(b.amount)) + '</div><div>' + (b.paid ? ui.chip('ok', t('bill_paid')) : ui.chip('warn', t('bill_unpaid'))) + (flag ? ui.chip('bad', t('high_use')) : '') + '</div></div></div>';
  }

  function viewBills() {
    const d = D();
    const f = S.billFilter;
    const flt = { all: () => true, unpaid: (b) => !b.paid, water: (b) => b.type === 'water', electric: (b) => b.type === 'electric' };
    const chips = ['all', 'unpaid', 'water', 'electric'].map((k) => '<button type="button" class="fchip' + (f === k ? ' on' : '') + '" data-act="billFilter" data-f="' + k + '">' + esc(t('bf_' + k)) + ' <span class="cnt">' + d.bills.filter(flt[k]).length + '</span></button>').join('');
    const list = d.bills.filter(flt[f]).sort((a, b) => b.period.localeCompare(a.period));
    const unpaidSum = d.bills.filter((b) => !b.paid).reduce((s, b) => s + num(b.amount), 0);
    return '<section class="toolbar"><h2>' + esc(t('bills')) + '</h2><button type="button" class="btn primary small" data-act="addBill">' + ic('plus', 16) + ' ' + esc(t('add_bill')) + '</button></section><div class="fchips">' + chips + '</div>' +
      (d.bills.length ? '<div class="split sumline"><span class="muted">' + esc(t('bills_unpaid_total')) + '</span><b>' + esc(ui.money(unpaidSum)) + '</b></div>' : '') +
      (list.length ? '<div class="list">' + list.map((b) => billRow(b, true)).join('') + '</div>' : empty(t('no_bills')));
  }

  function lastReading(unitId, type, exceptId) {
    const bs = D().bills.filter((b) => b.unitId === unitId && b.type === type && b.id !== exceptId && L.isNum(b.currReading)).sort((a, b) => b.period.localeCompare(a.period));
    return bs.length ? bs[0].currReading : '';
  }

  function openBill(id, unitId) {
    const d = D();
    if (!d.units.length) { ui.toast(t('err_no_units')); return; }
    const b = id ? d.bills.find((x) => x.id === id) : null;
    const uid0 = b ? b.unitId : unitId || d.units.slice().sort(byName)[0].id;
    const v = b ? Object.assign({}, b) : { unitId: uid0, type: 'water', period: L.todayISO().slice(0, 7), prevReading: lastReading(uid0, 'water'), currReading: '', amount: '', paidBy: 'tenant', paid: false };
    let h = ui.sheetHead(t(b ? 'edit_bill' : 'add_bill'));
    h += '<form class="form" data-form="bill" data-id="' + (id || '') + '">' + ui.fields([
      { name: 'unitId', label: t('f_unit'), type: 'select', options: d.units.slice().sort(byName).map((u) => ({ value: u.id, label: u.name })), value: v.unitId },
      { name: 'type', label: t('f_bill_type'), type: 'select', options: [{ value: 'water', label: t('bt_water') }, { value: 'electric', label: t('bt_electric') }], value: v.type },
      { name: 'period', label: t('f_period'), type: 'month', value: v.period, required: true },
      { name: 'prevReading', label: t('f_prev'), type: 'number', step: 'any', value: v.prevReading },
      { name: 'currReading', label: t('f_curr'), type: 'number', step: 'any', value: v.currReading },
      { name: 'amount', label: t('f_bill_amount'), type: 'number', step: '0.01', min: 0, value: v.amount, required: true },
      { name: 'paidBy', label: t('f_payer'), type: 'select', options: [{ value: 'tenant', label: t('payer_tenant') }, { value: 'owner', label: t('payer_owner') }], value: v.paidBy },
      { name: 'paid', label: t('bill_paid'), type: 'checkbox', value: v.paid },
      { name: 'note', label: t('f_notes'), type: 'text', value: v.note || '' },
    ]) + '<div class="btn-row"><button class="btn primary" type="submit">' + esc(t('save')) + '</button>' +
      (b ? '<button type="button" class="btn ghost danger-t" data-act="deleteBill" data-id="' + id + '">' + esc(t('delete')) + '</button>' : '') + '</div></form>';
    ui.openModal(h);
    const f = document.querySelector('#modalRoot form');
    ['unitId', 'type'].forEach((n) => { if (f.elements[n]) f.elements[n].setAttribute('data-change', 'billSrc'); });
  }

  /* =================== التنبيهات =================== */
  function viewAlerts() {
    const groups = [['high', t('sev_high')], ['mid', t('sev_mid')], ['low', t('sev_low')]];
    const body = groups.map(([k, label]) => {
      const list = C.alerts.filter((a) => a.sev === k);
      return list.length ? '<h3 class="sec">' + esc(label) + ' <span class="cnt">' + list.length + '</span></h3><div class="alist">' + list.map(alertRow).join('') + '</div>' : '';
    }).join('');
    return '<section class="toolbar"><h2>' + esc(t('alerts')) + '</h2></section>' + (C.alerts.length ? body : empty(t('no_alerts')));
  }

  /* =================== المزيد =================== */
  function viewMore() {
    const d = D();
    const s = d.settings;
    const b = d.buildings[0];
    const tenants = d.tenants.slice().sort(byName);
    const rows = tenants.map((x) => {
      const cs = d.contracts.filter((c) => c.tenantId === x.id);
      const cur = cs.map((c) => ({ c, s: L.contractStatus(c, C.today) })).find((o) => o.s === 'active' || o.s === 'expired');
      const u = cur ? L.unitOf(d, cur.c.unitId) : null;
      return '<div class="row" role="button" tabindex="0" data-act="editTenant" data-id="' + x.id + '"><div class="row-main"><div class="row-title">' + esc(x.name) + '</div><div class="muted small">' + esc(u ? u.name : t('no_active')) + (x.phone ? ' · ' : '') + (x.phone ? '<span class="ltr">' + esc(x.phone) + '</span>' : '') + '</div></div><div class="row-end">' + ic('chev', 18) + '</div></div>';
    }).join('');
    const exp = ['payments', 'contracts', 'units', 'tenants', 'bills'].map((k) => '<button type="button" class="btn small ghost" data-act="export" data-what="' + k + '">' + ic('download', 16) + ' ' + esc(t('x_' + k)) + '</button>').join('');
    return '<section class="toolbar"><h2>' + esc(t('nav_more')) + '</h2></section>' +
      (RA.store.isOk() ? '' : '<div class="card warnbox">' + esc(t('storage_off')) + '</div>') +
      '<section class="card"><h3 class="sec-in">' + esc(t('settings')) + '</h3><form class="form" data-form="settings">' + ui.fields([
        { name: 'bName', label: t('f_building'), value: b ? b.name : '' },
        { name: 'ownerName', label: t('f_owner'), value: s.ownerName, hint: t('f_owner_hint') },
        { name: 'lang', label: t('f_lang'), type: 'select', value: s.lang, options: [{ value: 'ar', label: t('lang_ar') }, { value: 'en', label: t('lang_en') }] },
        { name: 'currency', label: t('f_currency'), value: s.currency },
        { name: 'alertDays', label: t('f_alert_days'), type: 'number', min: 1, max: 60, step: 1, value: s.alertDays },
        { name: 'hijri', label: t('f_hijri'), type: 'checkbox', value: s.hijri },
        { name: 'theme', label: t('f_theme'), type: 'select', value: s.theme, options: [{ value: 'auto', label: t('theme_auto') }, { value: 'light', label: t('theme_light') }, { value: 'dark', label: t('theme_dark') }] },
      ].concat(RA.native.isNative ? [
        { name: 'notify', label: t('f_notify'), type: 'checkbox', value: s.notify },
        { name: 'notifyHour', label: t('f_notify_hour'), type: 'number', min: 5, max: 21, step: 1, value: s.notifyHour },
      ] : [])) + (RA.native.isNative ? '' : '<p class="muted small">' + esc(t('notify_web_note')) + '</p>') + '<button class="btn primary" type="submit">' + esc(t('save')) + '</button></form></section>' +
      '<section class="card"><div class="split"><h3 class="sec-in">' + esc(t('tenants')) + '</h3><button type="button" class="btn small ghost" data-act="addTenant">' + ic('plus', 16) + ' ' + esc(t('add')) + '</button></div>' +
      (rows ? '<div class="list tight">' + rows + '</div>' : '<p class="muted">' + esc(t('no_tenants')) + '</p>') + '</section>' +
      '<section class="card"><h3 class="sec-in">' + esc(t('export')) + '</h3><p class="muted small">' + esc(t('export_hint')) + '</p><div class="btn-row">' + exp + '</div></section>' +
      '<section class="card"><h3 class="sec-in">' + esc(t('backup')) + '</h3><p class="muted small">' + esc(t('backup_hint')) + ' ' + esc(t('last_backup')) + ': ' + esc(s.lastBackup ? ui.fmtDate(s.lastBackup) : t('never')) + '</p>' +
      '<div class="btn-row"><button type="button" class="btn primary small" data-act="export" data-what="json">' + ic('download', 16) + ' ' + esc(t('backup_now')) + '</button>' +
      '<button type="button" class="btn small ghost" data-act="importPick">' + ic('upload', 16) + ' ' + esc(t('restore')) + '</button></div>' +
      '<input type="file" id="importFile" accept="application/json,.json" hidden></section>' +
      '<section class="card"><h3 class="sec-in">' + esc(t('data')) + '</h3><div class="btn-row"><button type="button" class="btn small ghost" data-act="loadDemo">' + esc(t('load_demo')) + '</button>' +
      '<button type="button" class="btn small ghost danger-t" data-act="resetAll">' + esc(t('reset_all')) + '</button></div></section>' +
      '<p class="muted small center">' + esc(t('storage_note')) + '</p>';
  }

  /* =================== النماذج المنبثقة =================== */
  function openUnit(id) {
    const d = D();
    const u = id ? L.unitOf(d, id) : null;
    const v = u || { name: '', kind: 'apartment', floor: '', rooms: '', electricMeter: '', waterMeter: '', maintenance: false, notes: '' };
    const kinds = ['apartment', 'room', 'shop', 'other'].map((k) => ({ value: k, label: t('kind_' + k) }));
    ui.openModal(ui.sheetHead(t(u ? 'edit_unit' : 'add_unit')) + '<form class="form" data-form="unit" data-id="' + (id || '') + '">' + ui.fields([
      { name: 'name', label: t('f_unit_name'), value: v.name, required: true, placeholder: t('f_unit_ph') },
      { name: 'kind', label: t('f_kind'), type: 'select', options: kinds, value: v.kind },
      { name: 'floor', label: t('f_floor'), value: v.floor },
      { name: 'rooms', label: t('f_rooms_n'), type: 'number', min: 0, step: 1, value: v.rooms },
      { name: 'electricMeter', label: t('f_emeter'), value: v.electricMeter, ltr: true },
      { name: 'waterMeter', label: t('f_wmeter'), value: v.waterMeter, ltr: true },
      { name: 'maintenance', label: t('f_maint'), type: 'checkbox', value: v.maintenance },
      { name: 'notes', label: t('f_notes'), type: 'textarea', value: v.notes },
    ]) + '<div class="btn-row"><button class="btn primary" type="submit">' + esc(t('save')) + '</button>' + (u ? '<button type="button" class="btn ghost danger-t" data-act="deleteUnit" data-id="' + id + '">' + esc(t('delete')) + '</button>' : '') + '</div></form>');
  }

  function tenantFields(v, prefix) {
    const p = prefix || '';
    const n = (k) => p ? p + k.charAt(0).toUpperCase() + k.slice(1) : k;
    return [
      { name: n('name'), label: t('f_tenant_name'), value: v.name || '', required: !prefix },
      { name: n('phone'), label: t('f_phone'), type: 'tel', value: v.phone || '', placeholder: '05xxxxxxxx' },
      { name: n('nationalId'), label: t('f_nid'), value: v.nationalId || '', ltr: true },
      { name: n('emergencyPhone'), label: t('f_emg'), type: 'tel', value: v.emergencyPhone || '' },
      { name: n('iban'), label: t('f_iban'), value: v.iban || '', ltr: true, placeholder: 'SA..', hint: t('f_iban_hint') },
    ];
  }

  function openTenant(id) {
    const d = D();
    const x = id ? L.tenantOf(d, id) : null;
    ui.openModal(ui.sheetHead(t(x ? 'edit_tenant' : 'add_tenant')) + '<form class="form" data-form="tenant" data-id="' + (id || '') + '">' +
      ui.fields(tenantFields(x || {}).concat([{ name: 'notes', label: t('f_notes'), type: 'textarea', value: x ? x.notes : '' }])) +
      '<div class="btn-row"><button class="btn primary" type="submit">' + esc(t('save')) + '</button>' + (x ? '<button type="button" class="btn ghost danger-t" data-act="deleteTenant" data-id="' + id + '">' + esc(t('delete')) + '</button>' : '') + '</div></form>');
  }

  function freqOpts() { return ['monthly', 'quarterly', 'semiannual', 'annual'].map((k) => ({ value: k, label: t('freq_' + k) })); }

  function contractPreviewText(f) {
    const o = ui.readForm(f);
    const rent = Number(o.annualRent), months = Number(o.months);
    if (!(rent > 0) || !(months >= 1) || !o.start) return t('preview_empty');
    const s = L.genSchedule({ start: o.start, months, annualRent: rent, freq: o.freq });
    const total = s.reduce((a, i) => a + i.amount, 0);
    return t('preview', { n: s.length, amt: ui.money(s[0].amount), total: ui.money(total), end: ui.fmtDate(L.addDays(L.addMonths(o.start, Math.round(months)), -1)) });
  }

  function openContract(unitId, id, pre) {
    const d = D();
    const c = id ? d.contracts.find((x) => x.id === id) : null;
    const locked = !!(c && c.installments.some((i) => i.payments.length));
    const v = c ? { tenantId: c.tenantId, ejarNo: c.ejarNo, start: c.start, months: c.months, annualRent: c.annualRent, freq: c.freq, deposit: c.deposit || '', notes: c.notes }
      : Object.assign({ tenantId: '', ejarNo: '', start: L.todayISO(), months: 12, annualRent: '', freq: 'monthly', deposit: '', notes: '' }, pre || {});
    const tenOpts = [{ value: '', label: t('new_tenant_opt') }].concat(d.tenants.slice().sort(byName).map((x) => ({ value: x.id, label: x.name })));
    const u = L.unitOf(d, unitId || (c && c.unitId));
    let h = ui.sheetHead(t(c ? 'edit_contract' : 'new_contract') + ' · ' + (u ? u.name : ''));
    h += '<form class="form" data-form="contract" data-unit="' + (u ? u.id : '') + '" data-id="' + (id || '') + '" data-oninput="contract">';
    h += ui.fields([{ name: 'tenantId', label: t('f_tenant'), type: 'select', options: tenOpts, value: v.tenantId }]).replace('<select ', '<select data-change="tenantId" ');
    const tf = tenantFields({}, 't');
    h += '<div id="newTenantGroup"' + (v.tenantId ? ' hidden' : '') + '>' + ui.fields(tf.slice(0, 2)) +
      '<details class="more-fields"><summary>' + esc(t('more_tenant_data')) + '</summary><div class="form">' + ui.fields(tf.slice(2)) + '</div></details></div>';
    if (locked) h += '<p class="note">' + esc(t('locked_note')) + '</p>';
    h += ui.fields([
      { name: 'start', label: t('f_start'), type: 'date', value: v.start, required: true, disabled: locked },
      { name: 'months', label: t('f_months'), type: 'number', min: 1, max: 120, step: 1, value: v.months, required: true, disabled: locked },
      { name: 'annualRent', label: t('f_rent_year') + ' (' + ui.cur() + ')', type: 'number', min: 0, step: '0.01', value: v.annualRent, required: true, disabled: locked },
      { name: 'freq', label: t('f_freq'), type: 'select', options: freqOpts(), value: v.freq, disabled: locked },
      { name: 'deposit', label: t('f_deposit') + ' (' + ui.cur() + ')', type: 'number', min: 0, step: '0.01', value: v.deposit },
      { name: 'ejarNo', label: t('f_ejar'), value: v.ejarNo, ltr: true },
      { name: 'notes', label: t('f_notes'), type: 'textarea', value: v.notes },
    ]);
    if (!locked) {
      h += '<div class="preview" id="ctPreview"></div>';
      h += ui.fields([{ name: 'markPast', label: t('f_mark_past'), type: 'checkbox', value: v.start < L.todayISO(), hint: t('f_mark_past_hint') }]);
    }
    h += '<div class="btn-row"><button class="btn primary" type="submit">' + esc(t('save')) + '</button>' + (c ? '<button type="button" class="btn ghost danger-t" data-act="deleteContract" data-id="' + id + '">' + esc(t('delete')) + '</button>' : '') + '</div></form>';
    ui.openModal(h);
    const f = document.querySelector('#modalRoot form');
    const pv = document.getElementById('ctPreview');
    if (pv) pv.textContent = contractPreviewText(f);
    if (f.elements.start && !f.elements.start.disabled) f.elements.start.setAttribute('data-change', 'startChg');
  }

  /* =================== المعالجات: الإجراءات =================== */
  const A = ui.actions;
  A.go = (ds) => { S.tab = ds.tab; S.unitId = null; render(true); };
  A.goAlerts = () => { S.tab = 'alerts'; S.unitId = null; render(true); };
  A.openUnit = (ds) => { ui.closeModal(); S.tab = 'units'; S.unitId = ds.id; render(true); };
  A.backUnits = () => { S.unitId = null; render(true); };
  A.closeModal = () => ui.closeModal();
  A.confirmNo = () => ui.closeConfirm();
  A.confirmYes = () => { const f = ui._confirmYes; ui.closeConfirm(); if (f) f(); };
  A.payFilter = (ds) => { S.payFilter = ds.f; render(); };
  A.billFilter = (ds) => { S.billFilter = ds.f; render(); };
  A.addUnit = () => openUnit();
  A.editUnit = (ds) => openUnit(ds.id);
  A.addTenant = () => openTenant();
  A.editTenant = (ds) => openTenant(ds.id);
  A.addContract = (ds) => openContract(ds.id);
  A.editContract = (ds) => openContract(null, ds.id);
  A.renewContract = (ds) => {
    const c = D().contracts.find((x) => x.id === ds.id);
    if (!c) return;
    openContract(c.unitId, null, { tenantId: c.tenantId, start: L.addDays(L.contractEnd(c), 1), months: c.months, annualRent: c.annualRent, freq: c.freq, deposit: c.deposit || '' });
  };
  A.endContract = (ds) => {
    ui.openModal(ui.sheetHead(t('end_contract')) + '<form class="form" data-form="terminate" data-id="' + ds.id + '">' + ui.fields([
      { name: 'date', label: t('f_end_date'), type: 'date', value: L.todayISO(), required: true, hint: t('end_hint') },
    ]) + '<button class="btn danger" type="submit">' + esc(t('end_contract')) + '</button></form>');
  };
  A.openInst = (ds) => openInst(ds.c, ds.i);
  A.receipt = (ds) => openReceipt(ds.c, ds.i, ds.p);
  A.printReceipt = () => {
    if (root.__PREVIEW) { ui.toast(t('preview_no_download')); return; }
    if (RA.native.isNative) { RA.native.shareText(ui._receiptText).catch(() => ui.toast(t('file_share_fail'))); return; }
    try { window.print(); } catch (e) { ui.toast(t('print_fail')); }
  };
  A.deletePayment = (ds) => ui.confirm(t('confirm_del_pay'), () => {
    const c = D().contracts.find((x) => x.id === ds.c);
    const i = c && c.installments.find((x) => x.id === ds.i);
    if (i) i.payments = i.payments.filter((p) => p.id !== ds.p);
    ui.save(); render(); openInst(ds.c, ds.i);
  });
  A.addBill = (ds) => { ui.closeModal(); openBill(null, ds && ds.unit); };
  A.editBill = (ds) => openBill(ds.id);
  A.deleteBill = (ds) => ui.confirm(t('confirm_del'), () => { D().bills = D().bills.filter((b) => b.id !== ds.id); ui.save(); ui.closeModal(); render(); });
  A.deleteUnit = (ds) => {
    if (D().contracts.some((c) => c.unitId === ds.id)) { ui.toast(t('err_unit_has_contracts')); return; }
    ui.confirm(t('confirm_del'), () => { D().units = D().units.filter((u) => u.id !== ds.id); D().bills = D().bills.filter((b) => b.unitId !== ds.id); ui.save(); ui.closeModal(); S.unitId = null; render(); });
  };
  A.deleteTenant = (ds) => {
    if (D().contracts.some((c) => c.tenantId === ds.id)) { ui.toast(t('err_tenant_has_contracts')); return; }
    ui.confirm(t('confirm_del'), () => { D().tenants = D().tenants.filter((x) => x.id !== ds.id); ui.save(); ui.closeModal(); render(); });
  };
  A.deleteContract = (ds) => ui.confirm(t('confirm_del_contract'), () => { D().contracts = D().contracts.filter((c) => c.id !== ds.id); ui.save(); ui.closeModal(); render(); });

  // قاعدة بيانات فارغة مع الإبقاء على تفضيلات المستخدم (اللغة، المظهر، العملة...)
  function freshDB() {
    const base = RA.store.defaultDB();
    const keep = Object.assign({}, D().settings);
    base.settings = Object.assign(base.settings, keep, { receiptSeq: 0, lastBackup: '', ownerName: '' });
    return base;
  }

  A.loadDemo = () => {
    const go = () => {
      const base = freshDB();
      L.makeDemo(base, L.todayISO(), base.settings.lang);
      RA.store.replace(base);
      ui.save(); S.tab = 'home'; S.unitId = null; S.period = L.parse(L.todayISO()).y;
      RA.applyPrefs(); render(true); ui.toast(t('demo_loaded'));
    };
    if (D().units.length || D().contracts.length) ui.confirm(t('confirm_demo'), go, t('yes_replace')); else go();
  };
  A.resetAll = () => ui.confirm(t('confirm_reset'), () => {
    RA.store.replace(freshDB()); ui.save(); S.tab = 'home'; S.unitId = null; RA.applyPrefs(); render(true); ui.toast(t('data_cleared'));
  });
  A.importPick = () => { const el = document.getElementById('importFile'); if (el) el.click(); };

  ui.importText = (text) => {
    let obj = null;
    try { obj = JSON.parse(text); } catch (e) { /* ignore */ }
    if (!RA.store.validImport(obj)) { ui.toast(t('err_import')); return; }
    ui.confirm(t('confirm_import'), () => { RA.store.replace(obj); ui.save(); RA.applyPrefs(); S.tab = 'home'; S.unitId = null; render(true); ui.toast(t('import_ok')); }, t('yes_replace'));
  };

  A.export = (ds) => {
    const d = D();
    const k = ds.what;
    const ymd = L.todayISO();
    if (k === 'json') {
      d.settings.lastBackup = ymd; ui.save();
      download('rental-backup-' + ymd + '.json', JSON.stringify(d, null, 2), 'application/json');
      ui.toast(t('backup_done')); render();
      return;
    }
    const U = (id) => { const u = L.unitOf(d, id); return u ? u.name : ''; };
    const T = (id) => { const x = L.tenantOf(d, id); return x ? x.name : ''; };
    let rows = [];
    if (k === 'payments') {
      rows.push([t('f_unit'), t('f_tenant'), t('inst_no'), t('inst_total'), t('due'), t('amount'), t('paid'), t('remaining'), t('status'), t('last_pay'), t('receipts')]);
      L.flat(d).sort((a, b) => a.inst.dueDate.localeCompare(b.inst.dueDate)).forEach((r) => {
        const st = L.instStatus(r.inst, ymd, alertDays());
        rows.push([r.unit ? r.unit.name : '', r.tenant ? r.tenant.name : '', r.inst.no, r.c.installments.length, r.inst.dueDate, r.inst.amount, L.paidOf(r.inst), L.remOf(r.inst), t('st_' + st), r.inst.payments.length ? L.lastPayDate(r.inst) : '', r.inst.payments.map((p) => p.receiptNo).filter(Boolean).join(' ')]);
      });
    } else if (k === 'contracts') {
      rows.push([t('f_unit'), t('f_tenant'), t('f_ejar'), t('f_start'), t('f_end'), t('f_months'), t('f_rent_year'), t('f_freq'), t('f_deposit'), t('status'), t('f_end_date')]);
      d.contracts.forEach((c) => rows.push([U(c.unitId), T(c.tenantId), c.ejarNo, c.start, L.contractEnd(c), c.months, c.annualRent, t('freq_' + c.freq), c.deposit || 0, t('cs_' + L.contractStatus(c, ymd)), c.terminatedAt || '']));
    } else if (k === 'units') {
      rows.push([t('f_unit_name'), t('f_kind'), t('f_floor'), t('f_rooms_n'), t('f_emeter'), t('f_wmeter'), t('status'), t('f_tenant')]);
      d.units.slice().sort(byName).forEach((u) => { const s = L.unitState(d, u, ymd); rows.push([u.name, t('kind_' + (u.kind || 'apartment')), u.floor, u.rooms, u.electricMeter, u.waterMeter, t('us_' + s.status), s.contract ? T(s.contract.tenantId) : '']); });
    } else if (k === 'tenants') {
      rows.push([t('f_tenant_name'), t('f_phone'), t('f_nid'), t('f_emg'), t('f_iban'), t('f_unit')]);
      d.tenants.slice().sort(byName).forEach((x) => { const c = d.contracts.find((cc) => cc.tenantId === x.id && L.contractStatus(cc, ymd) === 'active'); rows.push([x.name, x.phone, x.nationalId, x.emergencyPhone, x.iban, c ? U(c.unitId) : '']); });
    } else if (k === 'bills') {
      rows.push([t('f_unit'), t('f_bill_type'), t('f_period'), t('f_prev'), t('f_curr'), t('cons_col'), t('f_bill_amount'), t('f_payer'), t('bill_paid'), t('pay_date')]);
      d.bills.slice().sort((a, b) => b.period.localeCompare(a.period)).forEach((b) => rows.push([U(b.unitId), t('bt_' + b.type), b.period, b.prevReading, b.currReading, L.billCons(b) == null ? '' : L.billCons(b), b.amount, t('payer_' + b.paidBy), b.paid ? t('yes') : t('no'), b.paidDate || '']));
    }
    download('rental-' + k + '-' + ymd + '.csv', L.toCSV(rows), 'text/csv;charset=utf-8');
    ui.toast(t('export_done'));
  };

  /* =================== المعالجات: النماذج =================== */
  const F = ui.forms;
  const done = (msg) => { ui.save(); ui.closeModal(); render(); if (msg) ui.toast(t(msg)); };

  F.onboard = (f, v) => {
    const d = D();
    d.buildings[0].name = v.bName || '';
    const apts = Math.max(0, Math.min(200, Math.floor(num(v.apts))));
    const rooms = Math.max(0, Math.min(200, Math.floor(num(v.rooms))));
    if (!apts && !rooms) { ui.toast(t('err_units_zero')); return; }
    const mk = (name, kind) => ({ id: L.uid(), ownerId: d.owners[0].id, buildingId: d.buildings[0].id, name, floor: '', kind, rooms: '', electricMeter: '', waterMeter: '', maintenance: false, notes: '' });
    for (let i = 1; i <= apts; i++) d.units.push(mk(t('apt_n', { n: i }), 'apartment'));
    for (let i = 1; i <= rooms; i++) d.units.push(mk(rooms === 1 ? t('room_one') : t('room_n', { n: i }), 'room'));
    ui.save(); render(); ui.toast(t('units_created'));
  };

  F.unit = (f, v, ds) => {
    const d = D();
    if (!v.name) { ui.toast(t('err_name')); return; }
    const dup = d.units.some((u) => u.name === v.name && u.id !== ds.id);
    if (dup) { ui.toast(t('err_dup_unit')); return; }
    const data = { name: v.name, kind: v.kind, floor: v.floor, rooms: v.rooms, electricMeter: v.electricMeter, waterMeter: v.waterMeter, maintenance: !!v.maintenance, notes: v.notes };
    if (ds.id) Object.assign(L.unitOf(d, ds.id), data);
    else d.units.push(Object.assign({ id: L.uid(), ownerId: d.owners[0].id, buildingId: d.buildings[0].id }, data));
    done('saved');
  };

  F.tenant = (f, v, ds) => {
    const d = D();
    if (!v.name) { ui.toast(t('err_name')); return; }
    const data = { name: v.name, phone: v.phone, nationalId: v.nationalId, emergencyPhone: v.emergencyPhone, iban: v.iban, notes: v.notes };
    if (ds.id) Object.assign(L.tenantOf(d, ds.id), data);
    else d.tenants.push(Object.assign({ id: L.uid(), ownerId: d.owners[0].id }, data));
    done('saved');
  };

  function overlaps(d, unitId, start, months, exceptId) {
    const end = L.addDays(L.addMonths(start, months), -1);
    return d.contracts.some((c) => c.unitId === unitId && c.id !== exceptId && (c.terminatedAt || L.contractEnd(c)) >= start && c.start <= end);
  }

  F.contract = (f, v, ds) => {
    const d = D();
    const existing = ds.id ? d.contracts.find((x) => x.id === ds.id) : null;
    const locked = !!(existing && existing.installments.some((i) => i.payments.length));
    const unitId = existing ? existing.unitId : ds.unit;
    let tenantId = v.tenantId;
    if (!tenantId && !v.tName) { ui.toast(t('err_tenant_name')); return; }
    const start = locked ? existing.start : v.start;
    const months = locked ? existing.months : Math.round(num(v.months));
    const rent = locked ? existing.annualRent : num(v.annualRent);
    const freq = locked ? existing.freq : v.freq;
    if (!start) { ui.toast(t('err_start')); return; }
    if (!(months >= 1)) { ui.toast(t('err_months')); return; }
    if (!(rent > 0)) { ui.toast(t('err_rent')); return; }
    if (!locked && overlaps(d, unitId, start, months, existing && existing.id)) { ui.toast(t('err_overlap')); return; }
    if (!tenantId) {
      const ten = { id: L.uid(), ownerId: d.owners[0].id, name: v.tName, phone: v.tPhone || '', nationalId: v.tNationalId || '', emergencyPhone: v.tEmergencyPhone || '', iban: v.tIban || '', notes: '' };
      d.tenants.push(ten); tenantId = ten.id;
    }
    let c = existing;
    if (!c) {
      c = { id: L.uid(), ownerId: d.owners[0].id, unitId, tenantId, ejarNo: '', start, months, annualRent: rent, freq, deposit: 0, terminatedAt: null, notes: '', installments: [] };
      d.contracts.push(c);
    }
    c.tenantId = tenantId; c.ejarNo = v.ejarNo; c.deposit = num(v.deposit); c.notes = v.notes;
    if (!locked) {
      c.start = start; c.months = months; c.annualRent = rent; c.freq = freq;
      c.installments = L.genSchedule({ start, months, annualRent: rent, freq });
      if (v.markPast) L.markPastPaid(c, L.todayISO(), t('prev_note'));
    }
    S.tab = 'units'; S.unitId = c.unitId;
    done('saved');
  };

  F.terminate = (f, v, ds) => {
    const c = D().contracts.find((x) => x.id === ds.id);
    if (!c || !v.date) return;
    L.terminate(c, v.date);
    done('contract_ended');
  };

  F.payment = (f, v, ds) => {
    const d = D();
    const c = d.contracts.find((x) => x.id === ds.c);
    const i = c && c.installments.find((x) => x.id === ds.i);
    if (!i) return;
    const amt = L.r2(num(v.amount));
    if (!(amt > 0)) { ui.toast(t('err_amount')); return; }
    if (amt > L.remOf(i) + 0.005) { ui.toast(t('err_amount_over')); return; }
    if (!v.date) return;
    const p = { id: L.uid(), date: v.date, amount: amt, method: v.method, receiptNo: L.nextReceipt(d.settings, v.date), note: v.note };
    i.payments.push(p);
    ui.save(); render(); ui.toast(t('payment_saved'));
    openReceipt(ds.c, ds.i, p.id);
  };

  F.bill = (f, v, ds) => {
    const d = D();
    if (!v.period) { ui.toast(t('err_period')); return; }
    const amount = L.r2(num(v.amount));
    const data = {
      unitId: v.unitId, type: v.type, period: v.period,
      prevReading: L.isNum(v.prevReading) ? Number(v.prevReading) : null, currReading: L.isNum(v.currReading) ? Number(v.currReading) : null,
      amount, paidBy: v.paidBy, paid: !!v.paid, paidDate: v.paid ? L.todayISO() : '', note: v.note,
    };
    if (ds.id) { const b = d.bills.find((x) => x.id === ds.id); const wasPaid = b.paid; Object.assign(b, data); if (wasPaid && b.paid) b.paidDate = b.paidDate || L.todayISO(); }
    else d.bills.push(Object.assign({ id: L.uid(), ownerId: d.owners[0].id }, data));
    done('saved');
  };

  F.settings = (f, v) => {
    const d = D();
    d.buildings[0].name = v.bName;
    const s = d.settings;
    const DEF_CUR = { ar: 'ر.س', en: 'SAR' };
    const prevLang = s.lang;
    s.lang = v.lang === 'en' ? 'en' : 'ar';
    s.ownerName = v.ownerName;
    s.currency = v.currency || DEF_CUR[s.lang];
    if (s.lang !== prevLang && s.currency === DEF_CUR[prevLang]) s.currency = DEF_CUR[s.lang];
    s.alertDays = Math.max(1, Math.min(60, Math.floor(num(v.alertDays)) || 7));
    s.hijri = !!v.hijri; s.theme = v.theme;
    if (RA.native.isNative) {
      s.notify = !!v.notify;
      s.notifyHour = Math.max(5, Math.min(21, Math.floor(num(v.notifyHour)) || 9));
    }
    ui.save(); RA.applyPrefs(); render(); ui.toast(t('saved'));
    if (RA.native.isNative && s.notify) {
      RA.native.ensurePermission().then((r) => { if (r === 'denied') ui.toast(t('notify_denied')); RA.native.sync(); });
    }
  };

  // زر الرجوع في الأندرويد: يغلق الأعلى أول، وآخر شي يخرج من التطبيق
  ui.handleBack = () => {
    const cf = document.getElementById('confirmRoot');
    if (cf && cf.firstChild) { ui.closeConfirm(); return true; }
    const mr = document.getElementById('modalRoot');
    if (mr && mr.firstChild) { ui.closeModal(); return true; }
    if (S.tab === 'units' && S.unitId) { S.unitId = null; render(true); return true; }
    if (S.tab !== 'home') { S.tab = 'home'; S.unitId = null; render(true); return true; }
    return false;
  };

  /* =================== تغييرات وإدخال مباشر =================== */
  ui.changes.period = (el) => { S.period = el.value === 'all' ? 'all' : Number(el.value); render(); };
  ui.changes.tenantId = (el) => { const g = document.getElementById('newTenantGroup'); if (g) g.hidden = el.value !== ''; };
  ui.changes.startChg = (el) => { const m = el.form && el.form.elements.markPast; if (m && el.value) m.checked = el.value < L.todayISO(); };
  ui.changes.billSrc = (el) => {
    const f = el.form;
    if (!f || f.dataset.id) return;
    const prev = lastReading(f.elements.unitId.value, f.elements.type.value, '');
    f.elements.prevReading.value = prev === '' ? '' : prev;
  };
  ui.inputs.contract = (f) => { const pv = document.getElementById('ctPreview'); if (pv) pv.textContent = contractPreviewText(f); };
})(typeof window !== 'undefined' ? window : globalThis);
