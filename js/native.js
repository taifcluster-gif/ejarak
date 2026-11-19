/* طبقة تطبيق الأندرويد (Capacitor): إشعارات مجدولة، مشاركة الملفات، زر الرجوع.
   في المتصفح العادي كل الدوال لا تفعل شيئاً، والتطبيق يشتغل كما هو. */
(function (root) {
  'use strict';
  const RA = (root.RA = root.RA || {});
  const L = RA.logic;
  const t = (k, p) => RA.i18n.t(k, p);

  const cap = root.Capacitor;
  const isNative = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  const cache = {};

  function plugin(name) {
    if (!isNative) return null;
    if (cache[name] === undefined) {
      let p = null;
      try { p = (cap.Plugins && cap.Plugins[name]) || (cap.registerPlugin ? cap.registerPlugin(name) : null); } catch (e) { p = null; }
      cache[name] = p;
    }
    return cache[name];
  }

  /* ---------- مشاركة الملفات (بديل التنزيل المباشر الذي لا يعمل داخل WebView) ---------- */
  async function shareFile(name, text) {
    const FS = plugin('Filesystem');
    const SH = plugin('Share');
    if (!FS || !SH) throw new Error('plugins missing');
    const w = await FS.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
    await SH.share({ title: name, url: w.uri, dialogTitle: name });
  }

  async function shareText(text) {
    const SH = plugin('Share');
    if (!SH) throw new Error('plugins missing');
    await SH.share({ text, dialogTitle: t('receipt') });
  }

  /* ---------- الإشعارات ---------- */
  async function ensurePermission() {
    const LN = plugin('LocalNotifications');
    if (!LN) return 'unsupported';
    try {
      let p = await LN.checkPermissions();
      if (p.display === 'prompt' || p.display === 'prompt-with-rationale') p = await LN.requestPermissions();
      return p.display;
    } catch (e) { return 'denied'; }
  }

  let timer = null;
  let running = false;
  let again = false;

  async function doSync() {
    const LN = plugin('LocalNotifications');
    if (!LN || !RA.db) return;
    if (running) { again = true; return; }
    running = true;
    try {
      const s = RA.db.settings;
      // نسأل عن الإذن مرة واحدة فقط، لما يصير عند المستخدم عقد
      if (s.notify && !s.notifyAsked && RA.db.contracts.length) {
        s.notifyAsked = true;
        await RA.store.save();
        await ensurePermission();
      }
      const perm = await LN.checkPermissions();
      const pend = await LN.getPending();
      if (pend.notifications && pend.notifications.length) {
        await LN.cancel({ notifications: pend.notifications.map((n) => ({ id: n.id })) });
      }
      if (!s.notify || perm.display !== 'granted') return;
      try { await LN.createChannel({ id: 'rent', name: t('notif_channel'), importance: 4, visibility: 1 }); } catch (e) { /* موجودة */ }
      const d = new Date();
      const plan = L.notificationPlan(RA.db, { date: L.todayISO(), hour: d.getHours() }, s, t, { money: RA.ui.money });
      if (!plan.length) return;
      await LN.schedule({
        notifications: plan.map((p) => {
          const a = p.date.split('-').map(Number);
          return { id: p.id, title: p.title, body: p.body, channelId: 'rent', schedule: { at: new Date(a[0], a[1] - 1, a[2], p.hour, 0, 0), allowWhileIdle: true } };
        }),
      });
    } catch (e) { /* الإشعارات ميزة مساعدة، ما نوقف التطبيق بسببها */ }
    running = false;
    if (again) { again = false; sync(); }
  }

  function sync() {
    if (!isNative) return;
    clearTimeout(timer);
    timer = setTimeout(doSync, 800);
  }

  /* ---------- التشغيل ---------- */
  function init() {
    if (!isNative) return;
    const App = plugin('App');
    if (App) {
      App.addListener('backButton', () => { if (!(RA.ui.handleBack && RA.ui.handleBack())) App.exitApp(); });
      App.addListener('appStateChange', (st) => { if (st && st.isActive) { RA.ui.render(); sync(); } });
    }
    sync();
  }

  RA.native = { isNative, shareFile, shareText, ensurePermission, sync, init };
})(typeof window !== 'undefined' ? window : globalThis);
