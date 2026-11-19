/* أدوات الواجهة: تنسيق، أيقونات، نوافذ، نماذج */
(function (root) {
  'use strict';
  const RA = (root.RA = root.RA || {});
  const L = RA.logic;
  const t = RA.i18n.t;

  const ui = (RA.ui = {
    state: { tab: 'home', unitId: null, period: new Date().getFullYear(), payFilter: 'open', billFilter: 'all' },
    actions: {}, forms: {}, changes: {}, inputs: {},
  });

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (ui.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]));

  /* ---------- أرقام وتواريخ ---------- */
  const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  ui.cur = () => (RA.db && RA.db.settings.currency) || 'ر.س';
  ui.num = (n) => nf.format(L.r2(n));
  ui.money = (n) => ui.num(n) + ' ' + ui.cur();

  let gf = null, hf = null, mf = null;
  ui.resetFmts = () => { gf = hf = mf = null; };
  function fmts() {
    if (gf) return;
    const en = RA.i18n.getLang() === 'en';
    const loc = en ? 'en-GB' : 'ar-SA';
    try {
      gf = new Intl.DateTimeFormat(loc + '-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
      hf = new Intl.DateTimeFormat(loc + '-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
      mf = new Intl.DateTimeFormat(loc + '-u-ca-gregory-nu-latn', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    } catch (e) {
      gf = { format: (d) => d.toISOString().slice(0, 10) };
      hf = gf; mf = { format: (d) => d.toISOString().slice(0, 7) };
    }
  }
  const asDate = (s) => { const p = L.parse(s); return new Date(Date.UTC(p.y, p.m - 1, p.d, 12)); };
  ui.fmtDate = (s) => {
    if (!s) return '—';
    fmts();
    const d = asDate(s);
    let out = gf.format(d);
    if (RA.db && RA.db.settings.hijri) { try { out += ' · ' + hf.format(d); } catch (e) { /* ignore */ } }
    return out;
  };
  ui.fmtMonth = (period) => { if (!period) return '—'; fmts(); return mf.format(asDate(period + '-01')); };

  /* ---------- أيقونات ---------- */
  const ICONS = {
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    units: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    pay: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
    bills: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    back: '<polyline points="9 18 15 12 9 6"/>',
    chev: '<polyline points="15 18 9 12 15 6"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    bolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  };
  ui.icon = (n, s) => {
    s = s || 20;
    const cls = n === 'back' || n === 'chev' ? ' class="dir-ic"' : '';
    return '<svg' + cls + ' width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || '') + '</svg>';
  };

  ui.chip = (cls, text) => '<span class="chip ' + cls + '">' + esc(text) + '</span>';

  /* ---------- إشعار صغير ---------- */
  let toastTimer = null;
  ui.toast = (msg) => {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  };

  /* ---------- النوافذ ---------- */
  ui.openModal = (html, cls) => {
    const r = document.getElementById('modalRoot');
    r.innerHTML = '<div class="backdrop" data-close="1"><div class="sheet ' + (cls || '') + '" role="dialog" aria-modal="true">' + html + '</div></div>';
    document.body.classList.add('modal-open');
  };
  ui.closeModal = () => {
    const r = document.getElementById('modalRoot');
    if (r) r.innerHTML = '';
    document.body.classList.remove('modal-open');
  };
  ui.sheetHead = (title) =>
    '<div class="sheet-head"><h3>' + esc(title) + '</h3><button type="button" class="iconbtn" data-act="closeModal" aria-label="' + esc(t('close')) + '">' + ui.icon('x', 20) + '</button></div>';

  // نافذة تأكيد داخلية (بدل confirm الذي قد يُحجب)
  ui._confirmYes = null;
  ui.confirm = (msg, onYes, yesLabel) => {
    const r = document.getElementById('confirmRoot');
    ui._confirmYes = onYes;
    r.innerHTML =
      '<div class="backdrop top" data-close-confirm="1"><div class="sheet small" role="alertdialog" aria-modal="true"><p class="confirm-msg">' + esc(msg) + '</p><div class="btn-row"><button type="button" class="btn danger" data-act="confirmYes">' +
      esc(yesLabel || t('yes_delete')) + '</button><button type="button" class="btn ghost" data-act="confirmNo">' + esc(t('cancel')) + '</button></div></div></div>';
  };
  ui.closeConfirm = () => { document.getElementById('confirmRoot').innerHTML = ''; ui._confirmYes = null; };

  /* ---------- النماذج ---------- */
  ui.field = (f, v) => {
    const raw = v && v[f.name] != null ? v[f.name] : f.value != null ? f.value : '';
    const id = 'f_' + f.name;
    const req = f.required ? ' required' : '';
    const dis = f.disabled ? ' disabled' : '';
    const hint = f.hint ? '<div class="hint">' + esc(f.hint) + '</div>' : '';
    if (f.type === 'checkbox') {
      return '<div class="field ' + (f.cls || '') + '"><label class="check"><input type="checkbox" id="' + id + '" name="' + f.name + '"' + (raw ? ' checked' : '') + dis + '><span>' + esc(f.label) + '</span></label>' + hint + '</div>';
    }
    let input;
    if (f.type === 'select') {
      input = '<select id="' + id + '" name="' + f.name + '"' + req + dis + '>' +
        f.options.map((o) => '<option value="' + esc(o.value) + '"' + (String(o.value) === String(raw) ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') + '</select>';
    } else if (f.type === 'textarea') {
      input = '<textarea id="' + id + '" name="' + f.name + '" rows="2"' + req + dis + '>' + esc(raw) + '</textarea>';
    } else {
      const ltr = ['number', 'date', 'month', 'tel'].includes(f.type) || f.ltr;
      input = '<input id="' + id + '" name="' + f.name + '" type="' + (f.type || 'text') + '" value="' + esc(raw) + '"' +
        (ltr ? ' class="ltr"' : '') +
        (f.step ? ' step="' + f.step + '"' : '') + (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '') +
        (f.type === 'number' ? ' inputmode="decimal"' : '') + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + req + dis + ' autocomplete="off">';
    }
    return '<div class="field ' + (f.cls || '') + '"' + (f.gid ? ' id="' + f.gid + '"' : '') + '><label for="' + id + '">' + esc(f.label) + (f.required ? ' <b class="req">*</b>' : '') + '</label>' + input + hint + '</div>';
  };
  ui.fields = (list, v) => list.map((f) => ui.field(f, v)).join('');

  ui.readForm = (form) => {
    const o = {};
    for (const el of form.elements) {
      if (!el.name || el.disabled) continue;
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
      else o[el.name] = typeof el.value === 'string' ? el.value.trim() : el.value;
    }
    return o;
  };

  ui.save = () => {
    const p = RA.store.save();
    if (RA.native) RA.native.sync();
    return p;
  };
})(typeof window !== 'undefined' ? window : globalThis);
