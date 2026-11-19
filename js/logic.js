/* منطق العقود والدفعات والتنبيهات — بدون أي اعتماد على الواجهة (قابل للاختبار) */
(function (root) {
  'use strict';
  const RA = (root.RA = root.RA || {});

  // عدد الأشهر بين كل دفعة وأخرى
  const FREQ = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };

  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const isNum = (v) => v !== '' && v != null && !isNaN(Number(v));
  const pad = (n) => String(n).padStart(2, '0');

  function uid() {
    try {
      if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    } catch (e) { /* ignore */ }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /* ---------- التواريخ (نص ISO: YYYY-MM-DD) ---------- */
  const iso = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
  function todayISO() {
    const d = new Date();
    return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  function parse(s) {
    const a = String(s).split('-').map(Number);
    return { y: a[0], m: a[1], d: a[2] };
  }
  function utc(s) { const p = parse(s); return Date.UTC(p.y, p.m - 1, p.d); }
  function diffDays(a, b) { return Math.round((utc(a) - utc(b)) / 86400000); } // a - b
  function addDays(s, n) {
    const t = new Date(utc(s) + n * 86400000);
    return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  function addMonths(s, n) {
    const p = parse(s);
    let m = p.m - 1 + n;
    const y = p.y + Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return iso(y, m + 1, Math.min(p.d, last));
  }

  /* ---------- العقود والدفعات ---------- */
  function genSchedule(o) {
    const step = FREQ[o.freq] || 12;
    const months = Math.max(1, Math.round(Number(o.months)) || 12);
    const n = Math.ceil(months / step);
    const total = r2((Number(o.annualRent) * months) / 12);
    const base = Math.floor((total / n) * 100) / 100;
    const list = [];
    let sum = 0;
    for (let k = 0; k < n; k++) {
      const amt = k === n - 1 ? r2(total - sum) : base;
      sum = r2(sum + amt);
      list.push({ id: uid(), no: k + 1, dueDate: addMonths(o.start, k * step), amount: amt, payments: [] });
    }
    return list;
  }

  const contractEnd = (c) => addDays(addMonths(c.start, c.months), -1);

  function contractStatus(c, today) {
    if (c.terminatedAt) return 'ended';
    if (today < c.start) return 'upcoming';
    if (today > contractEnd(c)) return 'expired';
    return 'active';
  }

  const paidOf = (i) => r2((i.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0));
  const remOf = (i) => Math.max(0, r2(i.amount - paidOf(i)));
  const lastPayDate = (i) => (i.payments || []).reduce((m, p) => (p.date > m ? p.date : m), i.dueDate);

  function instStatus(i, today, alertDays) {
    if (remOf(i) <= 0.004) return 'paid';
    const d = diffDays(i.dueDate, today);
    if (d < 0) return 'overdue';
    if (d === 0) return 'dueToday';
    if (d <= (alertDays || 7)) return 'dueSoon';
    return 'upcoming';
  }

  const tenantOf = (db, id) => db.tenants.find((x) => x.id === id);
  const unitOf = (db, id) => db.units.find((x) => x.id === id);

  function flat(db) {
    const out = [];
    for (const c of db.contracts) {
      const unit = unitOf(db, c.unitId);
      const tenant = tenantOf(db, c.tenantId);
      for (const inst of c.installments) out.push({ inst, c, unit, tenant });
    }
    return out;
  }

  function unitState(db, u, today) {
    const cs = db.contracts.filter((c) => c.unitId === u.id);
    const by = (s) => cs.filter((c) => contractStatus(c, today) === s);
    const act = by('active')[0];
    if (act) return { status: 'occupied', contract: act };
    const exp = by('expired').sort((a, b) => contractEnd(b).localeCompare(contractEnd(a)))[0];
    if (exp) return { status: 'expired', contract: exp };
    const up = by('upcoming').sort((a, b) => a.start.localeCompare(b.start))[0];
    if (u.maintenance) return { status: 'maintenance', contract: up || null };
    if (up) return { status: 'reserved', contract: up };
    return { status: 'vacant', contract: null };
  }

  function vacantDays(db, u, today) {
    const ends = db.contracts.filter((c) => c.unitId === u.id).map((c) => c.terminatedAt || contractEnd(c));
    if (!ends.length) return null;
    const last = ends.reduce((m, e) => (e > m ? e : m), ends[0]);
    return Math.max(0, diffDays(today, last));
  }

  // أقرب دفعة غير مسددة للوحدة
  function unitNext(db, u, today, alertDays) {
    const rows = flat(db)
      .filter((r) => r.c.unitId === u.id && remOf(r.inst) > 0.004)
      .sort((a, b) => a.inst.dueDate.localeCompare(b.inst.dueDate));
    if (!rows.length) return null;
    const r = rows[0];
    return { r, status: instStatus(r.inst, today, alertDays), days: diffDays(r.inst.dueDate, today) };
  }

  function occupancy(db, today) {
    const total = db.units.length;
    let occ = 0;
    for (const u of db.units) {
      const s = unitState(db, u, today).status;
      if (s === 'occupied' || s === 'expired') occ++;
    }
    return { occupied: occ, total, rate: total ? Math.round((occ / total) * 100) : 0 };
  }

  function years(db, today) {
    const set = new Set([parse(today).y]);
    for (const r of flat(db)) set.add(parse(r.inst.dueDate).y);
    return Array.from(set).sort((a, b) => a - b);
  }

  // period: رقم سنة أو 'all'
  function stats(db, period, today) {
    const rows = flat(db).filter((r) => period === 'all' || parse(r.inst.dueDate).y === period);
    const T = { expected: 0, collected: 0, remaining: 0, overdue: 0, overdueCount: 0 };
    const per = {};
    db.units.forEach((u) => (per[u.id] = { expected: 0, collected: 0, remaining: 0, overdue: 0, maxLate: 0, delays: [] }));
    const bucket = {};
    for (const r of rows) {
      const a = r.inst.amount;
      const p = Math.min(paidOf(r.inst), a);
      const rem = remOf(r.inst);
      const late = rem > 0.004 && r.inst.dueDate < today;
      T.expected += a; T.collected += p; T.remaining += rem;
      if (late) { T.overdue += rem; T.overdueCount++; }
      const u = per[r.c.unitId];
      if (u) {
        u.expected += a; u.collected += p; u.remaining += rem;
        if (late) { u.overdue += rem; u.maxLate = Math.max(u.maxLate, diffDays(today, r.inst.dueDate)); }
        if (rem <= 0.004) u.delays.push(Math.max(0, diffDays(lastPayDate(r.inst), r.inst.dueDate)));
      }
      const pd = parse(r.inst.dueDate);
      const key = period === 'all' ? pd.y : pd.m;
      const b = (bucket[key] = bucket[key] || { key, expected: 0, collected: 0 });
      b.expected += a; b.collected += p;
    }
    let buckets;
    if (period === 'all') buckets = Object.values(bucket).sort((a, b) => a.key - b.key);
    else buckets = Array.from({ length: 12 }, (_, i) => bucket[i + 1] || { key: i + 1, expected: 0, collected: 0 });
    for (const k of Object.keys(T)) T[k] = r2(T[k]);
    for (const id in per) {
      const u = per[id];
      ['expected', 'collected', 'remaining', 'overdue'].forEach((k) => (u[k] = r2(u[k])));
      u.avgDelay = u.delays.length ? Math.round(u.delays.reduce((a, b) => a + b, 0) / u.delays.length) : 0;
    }
    buckets.forEach((b) => { b.expected = r2(b.expected); b.collected = r2(b.collected); });
    return Object.assign({}, T, { per, buckets });
  }

  /* ---------- الفواتير والعدادات ---------- */
  function billCons(b) {
    return isNum(b.currReading) && isNum(b.prevReading) ? r2(Number(b.currReading) - Number(b.prevReading)) : null;
  }
  function billFlag(db, b) {
    const c = billCons(b);
    if (c == null) return false;
    const hist = db.bills
      .filter((x) => x.id !== b.id && x.unitId === b.unitId && x.type === b.type && x.period < b.period && billCons(x) != null)
      .sort((a, z) => z.period.localeCompare(a.period))
      .slice(0, 6)
      .map(billCons);
    if (hist.length < 3) return false;
    const avg = hist.reduce((s, x) => s + x, 0) / hist.length;
    return avg > 0 && c > avg * 1.5;
  }

  /* ---------- التنبيهات ---------- */
  const TYPE_ORDER = { overdue: 0, dueToday: 1, expired: 2, dueSoon: 3, expiring: 4, bill: 5, vacant: 6, vacant0: 6, meters: 7, backup: 8 };

  function alerts(db, today, settings) {
    const ad = (settings && settings.alertDays) || 7;
    const out = [];
    for (const r of flat(db)) {
      const st = instStatus(r.inst, today, ad);
      if (st === 'paid' || st === 'upcoming') continue;
      const days = diffDays(r.inst.dueDate, today);
      out.push({
        key: 'i' + r.inst.id, sev: st === 'dueSoon' ? 'mid' : 'high', type: st,
        unitId: r.c.unitId, contractId: r.c.id, instId: r.inst.id, sort: days,
        p: { unitName: r.unit ? r.unit.name : '', tenantName: r.tenant ? r.tenant.name : '', amount: remOf(r.inst), days: Math.abs(days), date: r.inst.dueDate },
      });
    }
    const curPeriod = today.slice(0, 7);
    let missingMeters = 0;
    for (const u of db.units) {
      const s = unitState(db, u, today);
      const tn = s.contract && tenantOf(db, s.contract.tenantId) ? tenantOf(db, s.contract.tenantId).name : '';
      if (s.status === 'occupied') {
        const left = diffDays(contractEnd(s.contract), today);
        if (left <= 90) {
          out.push({ key: 'x' + s.contract.id, sev: left <= 30 ? 'high' : left <= 60 ? 'mid' : 'low', type: 'expiring', unitId: u.id, contractId: s.contract.id, sort: left, p: { unitName: u.name, tenantName: tn, days: left } });
        }
        if (!db.bills.some((b) => b.unitId === u.id && b.period === curPeriod)) missingMeters++;
      } else if (s.status === 'expired') {
        const since = diffDays(today, contractEnd(s.contract));
        out.push({ key: 'e' + s.contract.id, sev: 'high', type: 'expired', unitId: u.id, contractId: s.contract.id, sort: -since, p: { unitName: u.name, tenantName: tn, days: since } });
        if (!db.bills.some((b) => b.unitId === u.id && b.period === curPeriod)) missingMeters++;
      } else if (s.status === 'vacant') {
        const vd = vacantDays(db, u, today);
        out.push({ key: 'v' + u.id, sev: 'low', type: vd == null ? 'vacant0' : 'vacant', unitId: u.id, sort: vd == null ? 0 : -vd, p: { unitName: u.name, days: vd } });
      }
    }
    for (const b of db.bills) {
      if (!b.paid && b.paidBy === 'tenant') {
        const u = unitOf(db, b.unitId);
        out.push({ key: 'b' + b.id, sev: 'mid', type: 'bill', unitId: b.unitId, billId: b.id, sort: 0, p: { unitName: u ? u.name : '', billType: b.type, amount: Number(b.amount) || 0 } });
      }
    }
    if (parse(today).d >= 25 && missingMeters > 0) {
      out.push({ key: 'meters', sev: 'low', type: 'meters', sort: 0, p: { count: missingMeters } });
    }
    if (db.contracts.length && (!settings.lastBackup || diffDays(today, settings.lastBackup) > 30)) {
      out.push({ key: 'backup', sev: 'low', type: 'backup', sort: 0, p: { date: settings.lastBackup || '' } });
    }
    const rank = { high: 0, mid: 1, low: 2 };
    out.sort((a, b) => rank[a.sev] - rank[b.sev] || (TYPE_ORDER[a.type] - TYPE_ORDER[b.type]) || a.sort - b.sort);
    return out;
  }

  /* ---------- عمليات مساعدة ---------- */
  function nextReceipt(settings, date) {
    settings.receiptSeq = (settings.receiptSeq || 0) + 1;
    return 'R-' + parse(date).y + '-' + String(settings.receiptSeq).padStart(4, '0');
  }

  // تسجيل الدفعات التي حل موعدها قبل اليوم كمسددة (للعقود القائمة)
  function markPastPaid(c, today, note) {
    for (const i of c.installments) {
      if (i.dueDate < today && remOf(i) > 0.004) {
        i.payments.push({ id: uid(), date: i.dueDate, amount: remOf(i), method: 'cash', receiptNo: '', note: note || '' });
      }
    }
  }

  // إنهاء عقد: تُحذف الدفعات المستقبلية التي لم يُدفع منها شيء
  function terminate(c, date) {
    c.terminatedAt = date;
    c.installments = c.installments.filter((i) => i.dueDate <= date || (i.payments && i.payments.length));
  }

  function waPhone(p) {
    let d = String(p || '').replace(/[٠-٩]/g, (ch) => String(ch.charCodeAt(0) - 1632)).replace(/[^\d]/g, '');
    if (!d) return '';
    if (d.startsWith('00')) d = d.slice(2);
    else if (d.startsWith('05') && d.length === 10) d = '966' + d.slice(1);
    else if (d.startsWith('5') && d.length === 9) d = '966' + d;
    return d;
  }
  const waLink = (phone, text) => 'https://wa.me/' + waPhone(phone) + '?text=' + encodeURIComponent(text);

  function toCSV(rows) {
    const esc = (v) => {
      v = v == null ? '' : String(v);
      if (/^[=@]/.test(v)) v = "'" + v;
      return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
  }

  /* ---------- بيانات تجريبية ---------- */
  const DEMO = {
    ar: {
      building: 'عمارة الورود (تجريبي)', owner: 'المالك (تجريبي)', apt: (n) => 'شقة ' + n, room: 'غرفة الحوش', ground: 'أرضي',
      people: ['أحمد العتيبي', 'خالد الحربي', 'محمد الزهراني', 'سعيد القحطاني', 'فهد الشمري', 'عبدالله الغامدي', 'يوسف الدوسري'],
    },
    en: {
      building: 'Al Wurood Building (sample)', owner: 'Owner (sample)', apt: (n) => 'Apartment ' + n, room: 'Yard room', ground: 'Ground',
      people: ['Ahmed Alotaibi', 'Khaled Alharbi', 'Mohammed Alzahrani', 'Saeed Alqahtani', 'Fahad Alshammari', 'Abdullah Alghamdi', 'Yousef Aldosari'],
    },
  };

  function makeDemo(db, today, lang) {
    const N = DEMO[lang] || DEMO.ar;
    const own = db.owners[0].id;
    const b = db.buildings[0];
    b.name = N.building;
    db.settings.ownerName = N.owner;
    const mk = (name, floor, kind, rooms, i) => ({ id: uid(), ownerId: own, buildingId: b.id, name, floor, kind, rooms, electricMeter: 'E-' + (1000 + i), waterMeter: 'W-' + (2000 + i), maintenance: false, notes: '' });
    const units = [1, 2, 3, 4, 5, 6].map((n, i) => mk(N.apt(n), String(Math.floor(i / 2) + 1), 'apartment', 3, i + 1));
    units.push(mk(N.room, N.ground, 'room', 1, 7));
    db.units = units;
    const tenants = N.people.map((name, i) => ({ id: uid(), ownerId: own, name, phone: '050000000' + (i + 1), nationalId: '', emergencyPhone: '', iban: '', notes: '' }));
    db.tenants = tenants;
    db.contracts = [];
    db.bills = [];
    const addC = (ui, ti, start, months, rent, freq, opts) => {
      opts = opts || {};
      const c = { id: uid(), ownerId: own, unitId: units[ui].id, tenantId: tenants[ti].id, ejarNo: opts.ejar || '', start, months, annualRent: rent, freq, deposit: opts.deposit || 0, terminatedAt: null, notes: '', installments: genSchedule({ start, months, annualRent: rent, freq }) };
      db.contracts.push(c);
      return c;
    };
    const pay = (c, k, amount) => {
      const i = c.installments[k];
      const a = amount == null ? i.amount : amount;
      i.payments.push({ id: uid(), date: i.dueDate, amount: r2(a), method: 'transfer', receiptNo: nextReceipt(db.settings, i.dueDate), note: '' });
    };
    const payDue = (c, except) => {
      const idx = c.installments.map((i, k) => (i.dueDate <= today ? k : -1)).filter((k) => k >= 0);
      idx.slice(0, idx.length - (except || 0)).forEach((k) => pay(c, k));
    };
    const c1 = addC(0, 0, addMonths(today, -8), 12, 24000, 'monthly', { ejar: '10300001', deposit: 2000 });
    payDue(c1, 2);
    const c2 = addC(1, 1, addDays(addMonths(today, -6), 5), 12, 36000, 'semiannual', { ejar: '10300002' });
    pay(c2, 0);
    const c3 = addC(2, 2, addMonths(today, -10), 12, 30000, 'annual', { ejar: '10300003' });
    pay(c3, 0);
    const c4 = addC(3, 3, addMonths(today, -4), 12, 40000, 'quarterly', { ejar: '10300004' });
    pay(c4, 0);
    pay(c4, 1, 5000);
    const c5 = addC(4, 4, addMonths(today, -12), 12, 28000, 'quarterly');
    payDue(c5, 0);
    terminate(c5, addDays(today, -50));
    const c6 = addC(5, 5, addMonths(today, -3), 12, 18000, 'monthly', { ejar: '10300006' });
    payDue(c6, 0);
    const c7 = addC(6, 6, addMonths(today, -5), 12, 9000, 'monthly');
    payDue(c7, 0);
    const bill = (ui, type, ago, prev, curr, amount, paid) => {
      db.bills.push({ id: uid(), ownerId: own, unitId: units[ui].id, type, period: addMonths(today, -ago).slice(0, 7), prevReading: prev, currReading: curr, amount, paidBy: 'tenant', paid, paidDate: paid ? today : '', note: '' });
    };
    bill(0, 'water', 4, 100, 112, 30, true);
    bill(0, 'water', 3, 112, 124, 30, true);
    bill(0, 'water', 2, 124, 137, 32.5, true);
    bill(0, 'water', 1, 137, 149, 30, true);
    bill(0, 'water', 0, 149, 190, 102.5, false);
    bill(1, 'water', 1, 300, 311, 27.5, true);
    bill(2, 'electric', 1, 5200, 5480, 190, false);
    return db;
  }

  /* ---------- خطة الإشعارات المجدولة ----------
     الدالة نقية: تأخذ البيانات والوقت الحالي وتُرجع قائمة بما يجب جدولته. تُجدول من جديد عند كل تغيير،
     فالدفعة التي تنسدد تختفي إشعاراتها تلقائياً. now = { date: 'YYYY-MM-DD', hour: 0-23 } */
  function hashId(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
    return (h % 2000000000) + 1; // رقم صحيح موجب يناسب Android
  }

  function notificationPlan(db, now, settings, tr, opts) {
    opts = opts || {};
    const hour = Number.isInteger(settings.notifyHour) ? settings.notifyHour : 9;
    const horizon = opts.horizonDays || 90;
    const max = opts.max || 60;
    const ad = settings.alertDays || 7;
    const today = now.date;
    const lastDay = addDays(today, horizon);
    const money = opts.money || ((n) => String(n));
    const out = [];
    const push = (key, date, h, title, body) => {
      if (date > lastDay) return;
      if (date < today || (date === today && h <= now.hour)) return;
      out.push({ key, id: hashId(key), date, hour: h, title, body });
    };

    for (const r of flat(db)) {
      const rem = remOf(r.inst);
      if (rem <= 0.004) continue;
      const base = { unit: r.unit ? r.unit.name : '', tenant: r.tenant ? r.tenant.name : '', amount: money(rem) };
      const T = tr('n_t_pay');
      const due = r.inst.dueDate;
      push('s' + r.inst.id, addDays(due, -ad), hour, T, tr('n_soon', Object.assign({ days: ad }, base)));
      push('d' + r.inst.id, due, hour, T, tr('n_today', base));
      push('l1' + r.inst.id, addDays(due, 1), hour, T, tr('n_late', Object.assign({ days: 1 }, base)));
      push('l7' + r.inst.id, addDays(due, 7), hour, T, tr('n_late', Object.assign({ days: 7 }, base)));
    }

    for (const c of db.contracts) {
      if (c.terminatedAt) continue;
      const end = contractEnd(c);
      const unit = unitOf(db, c.unitId);
      const ten = tenantOf(db, c.tenantId);
      const p = { unit: unit ? unit.name : '', tenant: ten ? ten.name : '' };
      [60, 30, 7].forEach((d) => push('x' + d + c.id, addDays(end, -d), hour, tr('n_t_contract'), tr('n_expiring', Object.assign({ days: d }, p))));
    }

    const occupied = db.units.some((u) => unitState(db, u, today).status === 'occupied');
    if (occupied) {
      const pr = parse(today);
      let date = iso(pr.y, pr.m, 25);
      if (date <= today) date = addMonths(iso(pr.y, pr.m, 1), 1).slice(0, 8) + '25';
      push('m' + date, date, hour + 1 > 23 ? 23 : hour + 1, tr('n_t_meters'), tr('n_meters'));
    }

    out.sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour || a.key.localeCompare(b.key));
    return out.slice(0, max);
  }

  RA.logic = { SCHEMA: 1, notificationPlan, hashId, FREQ, r2, isNum, uid, pad, todayISO, parse, diffDays, addDays, addMonths, genSchedule, contractEnd, contractStatus, paidOf, remOf, instStatus, lastPayDate, tenantOf, unitOf, flat, unitState, vacantDays, unitNext, occupancy, years, stats, billCons, billFlag, alerts, nextReceipt, markPastPaid, terminate, waPhone, waLink, toCSV, makeDemo };
  if (typeof module !== 'undefined' && module.exports) module.exports = RA.logic;
})(typeof window !== 'undefined' ? window : globalThis);
