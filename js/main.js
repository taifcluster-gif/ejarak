/* نقطة التشغيل وربط الأحداث */
(function (root) {
  'use strict';
  const RA = root.RA;
  const ui = RA.ui;

  RA.applyTheme = function () {
    const th = RA.db && RA.db.settings.theme;
    const el = document.documentElement;
    if (th === 'light' || th === 'dark') el.setAttribute('data-theme', th);
    else el.removeAttribute('data-theme');
  };

  // اللغة والاتجاه: العربية من اليمين لليسار، والإنجليزية العكس
  RA.applyLang = function () {
    const l = RA.db && RA.db.settings.lang === 'en' ? 'en' : 'ar';
    RA.i18n.setLang(l);
    const el = document.documentElement;
    el.lang = l;
    el.dir = l === 'ar' ? 'rtl' : 'ltr';
    document.title = RA.i18n.t('app_name');
    const bell = document.getElementById('bellBtn');
    if (bell) bell.setAttribute('aria-label', RA.i18n.t('alerts'));
    const nav = document.getElementById('tabbar');
    if (nav) nav.setAttribute('aria-label', RA.i18n.t('navigation'));
    RA.ui.resetFmts();
  };

  RA.applyPrefs = function () { RA.applyTheme(); RA.applyLang(); };

  function bind() {
    document.addEventListener('click', (e) => {
      const bd = e.target.closest('[data-close]');
      if (bd && e.target === bd) { ui.closeModal(); return; }
      const bc = e.target.closest('[data-close-confirm]');
      if (bc && e.target === bc) { ui.closeConfirm(); return; }
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const h = ui.actions[el.dataset.act];
      if (h) { e.preventDefault(); h(el.dataset, el); }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (document.getElementById('confirmRoot').firstChild) ui.closeConfirm(); else ui.closeModal(); return; }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"]')) {
        e.preventDefault(); e.target.click();
      }
    });

    document.addEventListener('submit', (e) => {
      const f = e.target.closest('form[data-form]');
      if (!f) return;
      e.preventDefault();
      const h = ui.forms[f.dataset.form];
      if (h) h(f, ui.readForm(f), f.dataset);
    });

    document.addEventListener('change', (e) => {
      const el = e.target;
      if (el.id === 'importFile' && el.files && el.files[0]) {
        const rd = new FileReader();
        rd.onload = () => ui.importText(String(rd.result));
        rd.readAsText(el.files[0]);
        el.value = '';
        return;
      }
      const key = el.getAttribute && el.getAttribute('data-change');
      if (key && ui.changes[key]) ui.changes[key](el);
      const f = el.closest && el.closest('form[data-oninput]');
      if (f && ui.inputs[f.dataset.oninput]) ui.inputs[f.dataset.oninput](f);
    });

    document.addEventListener('input', (e) => {
      const f = e.target.closest && e.target.closest('form[data-oninput]');
      if (f && ui.inputs[f.dataset.oninput]) ui.inputs[f.dataset.oninput](f);
    });
  }

  async function start() {
    await RA.store.init();
    // نسخة المعاينة فقط: تفتح ببيانات تجريبية لو ما فيه بيانات محفوظة
    if (root.__AUTO_DEMO && !RA.db.units.length) { RA.logic.makeDemo(RA.db, RA.logic.todayISO(), RA.db.settings.lang); await RA.store.save(); }
    RA.applyPrefs();
    bind();
    ui.render();
    RA.native.init();
    if (!RA.native.isNative && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
