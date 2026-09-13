// Classic content script whose only job is to pull in the ES-module entrypoint.
// Content scripts can't be declared as modules, but dynamic import() works
// (Chrome 111+, Firefox 128+, Safari 16.4+).
(async () => {
  const api = globalThis.browser || globalThis.chrome;
  try {
    await import(api.runtime.getURL('content/content.js'));
  } catch (e) {
    console.error('[sagabet-livestats] failed to load content module', e);
  }
})();
