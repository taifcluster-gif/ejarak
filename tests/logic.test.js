/* اختبارات المنطق: node tests/logic.test.js (أو npm test) */
const assert = require('assert');
const path = require('path');
const L = require(path.join(__dirname, '..', 'js', 'logic.js'));

const mkdb = () => ({ settings: { alertDays: 7, receiptSeq: 0, lastBackup: '', notifyHour: 9 }, owners: [{ id: 'o' }], buildings: [{ id: 'b' }], units: [], tenants: [], contracts: [], bills: [] });
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('✔', name); };

ok('جدولة: كل 3 أشهر = 4 دفعات والمجموع صحيح', () => {
  const s = L.genSchedule({ start: '2026-01-31', months: 12, annualRent: 30000, freq: 'quarterly' });
  assert.equal(s.length, 4); assert.equal(s[0].amount, 7500); assert.equal(s[1].dueDate, '2026-04-30');
});
ok('جدولة: شهري، نصف سنوي، سنوي', () => {
  const m = L.genSchedule({ start: '2026-01-01', months: 12, annualRent: 10000, freq: 'monthly' });
  assert.equal(m.length, 12); assert.equal(L.r2(m.reduce((a, i) => a + i.amount, 0)), 10000);
  assert.equal(L.genSchedule({ start: '2026-01-01', months: 12, annualRent: 30000, freq: 'semiannual' }).length, 2);
  assert.equal(L.genSchedule({ start: '2026-01-01', months: 12, annualRent: 30000, freq: 'annual' }).length, 1);
});
ok('تواريخ: نهاية العقد ونهاية الشهر', () => {
  assert.equal(L.contractEnd({ start: '2026-01-01', months: 12 }), '2026-12-31');
  assert.equal(L.addMonths('2026-01-31', 1), '2026-02-28');
});
ok('واتساب: تنسيق رقم الجوال السعودي', () => {
  assert.equal(L.waPhone('0551234567'), '966551234567');
  assert.equal(L.waPhone('+966 55 123 4567'), '966551234567');
});
ok('CSV: حماية من حقن الصيغ والاقتباس', () => {
  const c = L.toCSV([['a', 'b,c'], ['=x', '"q"']]);
  assert.ok(c.includes("'=x")); assert.ok(c.includes('"""q"""'));
});

const today = '2026-11-18';
const db = mkdb();
L.makeDemo(db, today, 'ar');

ok('إحصائيات: المتوقع = المحصّل + المتبقي', () => {
  const st = L.stats(db, 2026, today);
  assert.ok(Math.abs(st.expected - st.collected - st.remaining) < 0.01);
});
ok('الوحدات: الإشغال والشاغر', () => {
  assert.deepEqual(L.occupancy(db, today), { occupied: 6, total: 7, rate: 86 });
});
ok('التنبيهات: متأخر ويستحق اليوم وفاتورة', () => {
  const types = L.alerts(db, today, db.settings).map((a) => a.type);
  ['overdue', 'dueToday', 'dueSoon', 'expiring', 'bill', 'vacant'].forEach((t) => assert.ok(types.includes(t), t));
});
ok('فواتير: كشف الاستهلاك المرتفع', () => {
  assert.equal(L.billFlag(db, db.bills[4]), true);
});
ok('بيانات تجريبية بالإنجليزي', () => {
  const e = mkdb(); L.makeDemo(e, today, 'en');
  assert.equal(e.units[0].name, 'Apartment 1'); assert.equal(e.units[6].name, 'Yard room');
});

const tr = (k, p) => k + (p ? ':' + JSON.stringify(p) : '');
ok('إشعارات: لا شي في الماضي ولا يتجاوز الأفق والحد', () => {
  const plan = L.notificationPlan(db, { date: today, hour: 8 }, db.settings, tr, { horizonDays: 90, max: 60 });
  assert.ok(plan.length > 0 && plan.length <= 60);
  plan.forEach((p) => { assert.ok(p.date >= today); assert.ok(p.date <= L.addDays(today, 90)); assert.ok(Number.isInteger(p.id) && p.id > 0); });
  const ids = new Set(plan.map((p) => p.id)); assert.equal(ids.size, plan.length, 'IDs فريدة');
});
ok('إشعارات: الدفعة المسددة ما يجيها إشعار', () => {
  const e = mkdb(); const c = { id: 'c1', unitId: 'u1', tenantId: 't1', start: '2026-11-01', months: 12, annualRent: 12000, freq: 'monthly', terminatedAt: null, installments: L.genSchedule({ start: '2026-11-01', months: 12, annualRent: 12000, freq: 'monthly' }) };
  e.units = [{ id: 'u1', name: 'U1' }]; e.tenants = [{ id: 't1', name: 'T1' }]; e.contracts = [c];
  const before = L.notificationPlan(e, { date: '2026-11-20', hour: 8 }, e.settings, tr).filter((p) => p.key.endsWith(c.installments[1].id));
  assert.ok(before.length > 0);
  c.installments[1].payments.push({ id: 'p', date: '2026-11-20', amount: 1000, method: 'cash' });
  const after = L.notificationPlan(e, { date: '2026-11-20', hour: 8 }, e.settings, tr).filter((p) => p.key.endsWith(c.installments[1].id));
  assert.equal(after.length, 0);
});
ok('إشعارات: نفس اليوم بعد ساعة التذكير ما يتجدول', () => {
  const e = mkdb(); const c = { id: 'c1', unitId: 'u1', tenantId: 't1', start: '2026-11-20', months: 12, annualRent: 12000, freq: 'monthly', terminatedAt: null, installments: L.genSchedule({ start: '2026-11-20', months: 12, annualRent: 12000, freq: 'monthly' }) };
  e.units = [{ id: 'u1', name: 'U1' }]; e.tenants = [{ id: 't1', name: 'T1' }]; e.contracts = [c];
  const late = L.notificationPlan(e, { date: '2026-11-20', hour: 15 }, e.settings, tr).filter((p) => p.key === 'd' + c.installments[0].id);
  assert.equal(late.length, 0);
  const early = L.notificationPlan(e, { date: '2026-11-20', hour: 6 }, e.settings, tr).filter((p) => p.key === 'd' + c.installments[0].id);
  assert.equal(early.length, 1);
});
ok('إشعارات: تذكير القراءات يوم 25 القادم', () => {
  const plan = L.notificationPlan(db, { date: '2026-11-18', hour: 8 }, db.settings, tr);
  const m = plan.find((p) => p.key.startsWith('m'));
  assert.ok(m && m.date === '2026-11-25');
  const plan2 = L.notificationPlan(db, { date: '2026-11-26', hour: 8 }, db.settings, tr);
  assert.equal(plan2.find((p) => p.key.startsWith('m')).date, '2026-12-25');
});

console.log('\nتمت ' + n + ' اختبارات بنجاح');
