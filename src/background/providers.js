// Connector registry.
//
// Both providers are keyless and cover the same canonical vocabulary, so they
// are interchangeable — which is the point. If one starts refusing requests,
// the other takes over without the user touching anything.
import * as sofascore from './sofascore.js';
import * as fotmob from './fotmob.js';
import * as apiFootball from './api-football.js';

export const PROVIDERS = { sofascore, fotmob, 'api-football': apiFootball };
export const PROVIDER_IDS = Object.keys(PROVIDERS);
export const DEFAULT_PROVIDER = 'sofascore';

export function getProvider(name) {
  return PROVIDERS[name] || PROVIDERS[DEFAULT_PROVIDER];
}

/**
 * The preferred provider first, then the others as fallbacks — skipping any
 * that isn't usable, so an unconfigured keyed provider is never attempted.
 */
export function providerChain(preferred, cfg) {
  const first = getProvider(preferred);
  const rest = PROVIDER_IDS.map((k) => PROVIDERS[k]).filter((p) => p !== first);
  return [first, ...rest].filter((p) => p.isConfigured(cfg));
}
