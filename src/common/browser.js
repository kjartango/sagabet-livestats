// Cross-browser WebExtension shim.
// Chrome exposes `chrome` with callbacks (MV3 also supports promises);
// Firefox and Safari expose a promise-based `browser`.
export const ext = (typeof globalThis.browser !== 'undefined' && globalThis.browser.runtime)
  ? globalThis.browser
  : globalThis.chrome;

export const isFirefox = typeof globalThis.browser !== 'undefined'
  && typeof globalThis.chrome === 'undefined';

/**
 * One promise-returning sendMessage across all three engines.
 *
 * Firefox and Safari take `sendMessage(message, options)` — passing a callback
 * as the second argument throws "Incorrect argument types". Chrome MV3 also
 * returns a promise when called with one argument, so the promise form is tried
 * first everywhere and the callback form is only a fallback for older engines.
 */
export function sendMessage(msg) {
  try {
    const maybe = ext.runtime.sendMessage(msg);
    if (maybe && typeof maybe.then === 'function') return maybe;
  } catch {
    // Fall through to the callback form.
  }
  return new Promise((resolve, reject) => {
    try {
      ext.runtime.sendMessage(msg, (res) => {
        const err = ext.runtime.lastError;
        if (err) reject(new Error(err.message));
        else resolve(res);
      });
    } catch (e) {
      reject(e);
    }
  });
}

export const storage = {
  async get(defaults) {
    const res = await ext.storage.local.get(defaults);
    return { ...defaults, ...res };
  },
  async set(values) {
    return ext.storage.local.set(values);
  },
};
