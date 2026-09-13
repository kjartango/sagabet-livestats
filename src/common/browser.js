// Cross-browser WebExtension shim.
// Chrome exposes `chrome` with callbacks (MV3 also supports promises);
// Firefox and Safari expose a promise-based `browser`.
export const ext = (typeof globalThis.browser !== 'undefined' && globalThis.browser.runtime)
  ? globalThis.browser
  : globalThis.chrome;

export const isFirefox = typeof globalThis.browser !== 'undefined'
  && typeof globalThis.chrome === 'undefined';

export function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    try {
      const maybe = ext.runtime.sendMessage(msg, (res) => {
        const err = ext.runtime.lastError;
        if (err) reject(new Error(err.message));
        else resolve(res);
      });
      // Firefox/Safari return a promise and ignore the callback.
      if (maybe && typeof maybe.then === 'function') maybe.then(resolve, reject);
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
