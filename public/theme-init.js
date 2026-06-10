// Resolve theme before paint to avoid flash of wrong theme.
// Mirror logic in ThemeProvider; keep the storage key in sync with
// THEME_STORAGE_KEY and the default with THEME_DEFAULT in
// src/shared/theme/const.ts.
// Externalised from an inline <script> so the production CSP can stay
// strict (script-src 'self') without 'unsafe-inline' or a content hash.
(function () {
  var theme = 'light';
  try {
    var stored = localStorage.getItem('polybet-theme');
    if (stored === 'light' || stored === 'dark') {
      theme = stored;
    }
  } catch (_e) {
    // localStorage may be unavailable (private mode, sandbox) — fall through to default.
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
