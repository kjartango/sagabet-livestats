import { storage } from './browser.js';

export const DEFAULTS = {
  enabled: true,
  // Which connector to prefer. The other is used automatically if this one
  // refuses; neither needs an account or a key.
  provider: 'sofascore',
  // Only used by the API-Football connector. Keyless sources ignore these.
  apiKey: '',
  apiHost: 'api-sports',
  refreshSeconds: 30,
  // Only look up selections epicbet itself shows a running clock for.
  onlyLive: true,
  showPlayers: true,
  teamStats: ['shotsTotal', 'shotsOn', 'corners', 'fouls', 'yellow', 'possession'],
  playerStats: ['shots', 'shotsOn', 'fouls', 'rating'],
  debug: false,
};

export function loadSettings() {
  return storage.get(DEFAULTS);
}

export function saveSettings(patch) {
  return storage.set(patch);
}
