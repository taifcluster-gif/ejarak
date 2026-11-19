/* طبقة التخزين — اليوم تخزين محلي على الجهاز. لنقل التطبيق لقاعدة بيانات سحابية لاحقاً:
   اكتب adapter جديد فيه load() و save(db) (يرجعان Promise) ثم استدعِ RA.store.use(adapter). */
(function (root) {
  'use strict';
  const RA = (root.RA = root.RA || {});
  const L = RA.logic;
  const SCHEMA = 1;
  const KEY = 'rental_app_db';

  const LocalStore = {
    name: 'local',
    async load() {
      try {
        const s = root.localStorage.getItem(KEY);
        return s ? JSON.parse(s) : null;
      } catch (e) { return null; }
    },
    async save(db) {
      try { root.localStorage.setItem(KEY, JSON.stringify(db)); return true; } catch (e) { return false; }
    },
  };

  function defaultSettings() {
    return { lang: 'ar', hijri: false, currency: 'ر.س', alertDays: 7, ownerName: '', receiptSeq: 0, theme: 'auto', lastBackup: '', notify: true, notifyHour: 9, notifyAsked: false };
  }

  function defaultDB() {
    const ownerId = L.uid();
    return {
      schema: SCHEMA,
      settings: defaultSettings(),
      owners: [{ id: ownerId, name: '' }],
      buildings: [{ id: L.uid(), ownerId, name: '', address: '' }],
      units: [], tenants: [], contracts: [], bills: [],
    };
  }

  // ترقية البيانات القديمة: MIGRATIONS[n] تحوّل من الإصدار n إلى n+1
  const MIGRATIONS = {};
  function migrate(db) {
    db.schema = db.schema || 1;
    while (db.schema < SCHEMA) {
      const fn = MIGRATIONS[db.schema];
      if (fn) fn(db);
      db.schema++;
    }
    return db;
  }

  function normalize(db) {
    const d = defaultDB();
    const out = Object.assign({}, d, db);
    out.settings = Object.assign(defaultSettings(), db.settings || {});
    ['owners', 'buildings', 'units', 'tenants', 'contracts', 'bills'].forEach((k) => { if (!Array.isArray(out[k])) out[k] = d[k] || []; });
    if (!out.owners.length) out.owners = d.owners;
    if (!out.buildings.length) out.buildings = [{ id: L.uid(), ownerId: out.owners[0].id, name: '', address: '' }];
    out.contracts.forEach((c) => { if (!Array.isArray(c.installments)) c.installments = []; c.installments.forEach((i) => { if (!Array.isArray(i.payments)) i.payments = []; }); });
    return out;
  }

  function validImport(o) {
    return o && typeof o === 'object' && Array.isArray(o.units) && Array.isArray(o.contracts) && Array.isArray(o.tenants);
  }

  let adapter = LocalStore;
  let ok = true;

  RA.store = {
    SCHEMA,
    use(a) { adapter = a; },
    adapterName() { return adapter.name; },
    async init() {
      const raw = await adapter.load();
      RA.db = raw ? migrate(normalize(raw)) : defaultDB();
      return RA.db;
    },
    async save() { ok = await adapter.save(RA.db); return ok; },
    isOk() { return ok; },
    defaultDB, defaultSettings, validImport,
    replace(obj) { RA.db = migrate(normalize(obj)); return RA.db; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
