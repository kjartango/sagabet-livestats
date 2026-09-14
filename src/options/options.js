import { loadSettings, saveSettings, DEFAULTS } from '../common/settings.js';
import { sendMessage } from '../common/browser.js';
import { TEAM_STATS, PLAYER_STATS } from '../background/stat-keys.js';
import { PROVIDERS } from '../background/providers.js';

const $ = (id) => document.getElementById(id);
let settings = { ...DEFAULTS };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

/** Checkbox grid over a stat vocabulary; selection is kept in canonical order. */
function statPicker(containerId, vocabulary, settingKey) {
  const chosen = new Set(settings[settingKey]);
  const groups = new Map();
  for (const s of vocabulary) {
    const g = s.group || '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(s);
  }

  const container = $(containerId);
  const frag = document.createDocumentFragment();

  for (const [group, items] of groups) {
    if (group) frag.append(el('h3', '', group));
    const grid = el('div', 'grid');
    for (const s of items) {
      const label = el('label');
      const box = el('input');
      box.type = 'checkbox';
      box.dataset.key = s.key;
      box.checked = chosen.has(s.key);
      label.append(box, el('span', '', s.label));
      grid.append(label);
    }
    frag.append(grid);
  }
  container.replaceChildren(frag);

  for (const box of container.querySelectorAll('input')) {
    box.addEventListener('change', () => {
      const picked = new Set([...container.querySelectorAll('input:checked')].map((b) => b.dataset.key));
      persist({ [settingKey]: vocabulary.map((s) => s.key).filter((k) => picked.has(k)) });
    });
  }
}

let savedTimer;
async function persist(patch) {
  settings = { ...settings, ...patch };
  await saveSettings(patch);
  $('saved').hidden = false;
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { $('saved').hidden = true; }, 1200);
}

/** The key fields only matter for a provider that needs one. */
function syncKeyPanel() {
  const provider = PROVIDERS[$('provider').value];
  const needsKey = !!provider?.needsKey;
  $('keyPanel').hidden = !needsKey;
  if (needsKey) updateBudgetHint();
}

function updateBudgetHint() {
  const perDay = Math.round((24 * 60 * 60) / Math.max(15, settings.refreshSeconds));
  $('budgetHint').textContent =
    `At ${settings.refreshSeconds}s, a continuously open bets page would use up to ~${perDay} `
    + 'requests/day, plus two per live match you hold a bet on. The free plan allows 100/day — '
    + 'raise the interval, or close the bets modal when you are not watching it.';
}

async function init() {
  settings = await loadSettings();

  $('provider').replaceChildren(...Object.values(PROVIDERS).map((p) => {
    const opt = el('option', '', p.label);
    opt.value = p.id;
    return opt;
  }));
  $('provider').value = settings.provider;
  $('apiKey').value = settings.apiKey;
  $('apiHost').value = settings.apiHost;
  $('enabled').checked = settings.enabled;
  $('onlyLive').checked = settings.onlyLive;
  $('showPlayers').checked = settings.showPlayers;
  $('debug').checked = settings.debug;
  $('refreshSeconds').value = settings.refreshSeconds;

  syncKeyPanel();
  statPicker('teamStats', TEAM_STATS, 'teamStats');
  statPicker('playerStats', PLAYER_STATS, 'playerStats');

  $('enabled').addEventListener('change', (e) => persist({ enabled: e.target.checked }));
  $('onlyLive').addEventListener('change', (e) => persist({ onlyLive: e.target.checked }));
  $('showPlayers').addEventListener('change', (e) => persist({ showPlayers: e.target.checked }));
  $('debug').addEventListener('change', (e) => persist({ debug: e.target.checked }));
  $('provider').addEventListener('change', async (e) => {
    await persist({ provider: e.target.value });
    syncKeyPanel();
    await sendMessage({ type: 'CLEAR_CACHE' });
  });
  $('apiKey').addEventListener('change', async (e) => {
    await persist({ apiKey: e.target.value.trim() });
    await sendMessage({ type: 'CLEAR_CACHE' });
  });
  $('apiHost').addEventListener('change', async (e) => {
    await persist({ apiHost: e.target.value });
    await sendMessage({ type: 'CLEAR_CACHE' });
  });
  $('reveal').addEventListener('click', () => {
    const f = $('apiKey');
    f.type = f.type === 'password' ? 'text' : 'password';
  });
  $('refreshSeconds').addEventListener('change', (e) => {
    const v = Math.min(900, Math.max(15, Number(e.target.value) || 30));
    e.target.value = v;
    persist({ refreshSeconds: v }).then(syncKeyPanel);
  });

  $('test').addEventListener('click', async () => {
    const out = $('testResult');
    out.className = 'result';
    out.textContent = 'Checking…';
    await sendMessage({ type: 'CLEAR_CACHE' });
    const res = await sendMessage({ type: 'GET_STATS', bets: [] });
    if (res?.error) {
      out.className = 'result err';
      out.textContent = res.error;
    } else {
      out.className = 'result ok';
      out.textContent = `Connected to ${res.meta.providerLabel}.`;
    }
  });
}

init();
