(async function () {
  'use strict';

  const DEFAULTS = {
    preferredTerpenes: {
      Limonene: 0.95,
      Terpinolene: 0.85,
      'Beta-Myrcene': 0.75,
      Linalool: 0.8,
      'Beta-Caryophyllene': 0.7,
      'Alpha-Pinene': 0.55,
      Humulene: 0.4,
      Ocimene: 0.35
    },
    avoidTerpenes: [],
    minMatchScore: 0.32,
    preferHighTotalTerps: true
  };

  const prefList = document.getElementById('pref-list');
  const avoidInput = document.getElementById('avoid-input');
  const minMatch = document.getElementById('min-match');
  const preferTerps = document.getElementById('prefer-terps');
  const status = document.getElementById('status');

  function showStatus(msg) {
    status.hidden = false;
    status.textContent = msg;
    setTimeout(() => {
      status.hidden = true;
    }, 1600);
  }

  function addPrefRow(name = '', weight = 0.5) {
    const row = document.createElement('div');
    row.className = 'pref-row';
    row.innerHTML = `
      <input type="text" class="pref-name" placeholder="Terpene" value="${name}" />
      <input type="number" class="pref-weight" min="0" max="1" step="0.1" value="${weight}" />
      <button type="button" class="pref-remove" title="Remove">×</button>
    `;
    row.querySelector('.pref-remove').addEventListener('click', () => row.remove());
    prefList.appendChild(row);
  }

  function readForm() {
    const preferredTerpenes = {};
    prefList.querySelectorAll('.pref-row').forEach((row) => {
      const name = row.querySelector('.pref-name').value.trim();
      const weight = Number(row.querySelector('.pref-weight').value);
      if (!name) return;
      preferredTerpenes[name] = Number.isFinite(weight) ? Math.max(0, Math.min(1, weight)) : 0.5;
    });
    const avoidTerpenes = avoidInput.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      preferredTerpenes,
      avoidTerpenes,
      minMatchScore: Number(minMatch.value) || 0.35,
      preferHighTotalTerps: preferTerps.checked
    };
  }

  function fillForm(map) {
    prefList.innerHTML = '';
    const prefs = map.preferredTerpenes || {};
    Object.entries(prefs).forEach(([name, weight]) => addPrefRow(name, weight));
    if (!Object.keys(prefs).length) addPrefRow('Limonene', 0.9);
    avoidInput.value = (map.avoidTerpenes || []).join(', ');
    minMatch.value = map.minMatchScore ?? 0.35;
    preferTerps.checked = !!map.preferHighTotalTerps;
  }

  async function load() {
    const data = await chrome.storage.local.get(['csi_taste_map']);
    if (data.csi_taste_map) fillForm(data.csi_taste_map);
    else {
      try {
        const res = await fetch(chrome.runtime.getURL('data/default-taste-map.json'));
        fillForm(res.ok ? await res.json() : DEFAULTS);
      } catch {
        fillForm(DEFAULTS);
      }
    }
  }

  document.getElementById('add-pref').addEventListener('click', () => addPrefRow());
  document.getElementById('save').addEventListener('click', async () => {
    await chrome.storage.local.set({ csi_taste_map: readForm() });
    showStatus('Saved');
  });
  document.getElementById('reset').addEventListener('click', async () => {
    fillForm(DEFAULTS);
    await chrome.storage.local.set({ csi_taste_map: DEFAULTS });
    showStatus('Defaults restored');
  });

  load();
})();
