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

  const CSI = globalThis.CSI;
  const prefList = document.getElementById('pref-list');
  const avoidInput = document.getElementById('avoid-input');
  const minMatch = document.getElementById('min-match');
  const preferTerps = document.getElementById('prefer-terps');
  const status = document.getElementById('status');
  const licenseStatus = document.getElementById('license-status');
  const licenseKeyInput = document.getElementById('license-key');
  const tasteProNote = document.getElementById('taste-pro-note');
  const deactivateBtn = document.getElementById('deactivate');

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

  function setTasteEnabled(allowed) {
    const tasteIsPro = !!CSI.features?.PRO_FEATURES?.tasteMap;
    if (allowed) {
      tasteProNote.textContent = 'Applied on listings and product pages.';
      return;
    }
    tasteProNote.textContent = tasteIsPro
      ? 'Saved locally. Map match on listings and product pages requires Pro.'
      : 'Saved locally. Map match on listings and product pages follows your taste-map prefs.';
  }

  async function refreshLicenseUi() {
    await CSI.entitlement.validateRemote().catch(() => null);
    const rec = await CSI.entitlement.readStored();
    const pro = CSI.entitlement.isPro();
    if (pro && rec) {
      const exp = rec.expiresAt ? new Date(rec.expiresAt).toLocaleDateString() : 'current period';
      licenseStatus.textContent = `Pro active${rec.email ? ` · ${rec.email}` : ''} · through ${exp}`;
      licenseKeyInput.value = rec.licenseKey || '';
      deactivateBtn.hidden = false;
    } else if (rec?.licenseKey) {
      licenseStatus.textContent = `License saved but inactive (${rec.status || 'expired'}).`;
      licenseKeyInput.value = rec.licenseKey;
      deactivateBtn.hidden = false;
    } else {
      licenseStatus.textContent = 'Free plan — hover, badges, compare, product detail.';
      deactivateBtn.hidden = true;
    }
    setTasteEnabled(!!CSI.features?.can?.('tasteMap'));
    await loadPicksUi();
  }

  async function loadTaste() {
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

  const STORE_LABELS = {
    sunnyside: 'Sunnyside',
    zenleaf: 'Zen Leaf',
    terravida: 'TerraVida (Zen Leaf Malvern)'
  };

  function fillSelect(el, entries, selected, includeBlank) {
    el.innerHTML = '';
    if (includeBlank) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Not set';
      el.appendChild(opt);
    }
    entries.forEach(([value, label]) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      if (value === selected) opt.selected = true;
      el.appendChild(opt);
    });
  }

  function fillChecks(container, items, selected) {
    const on = new Set(selected || []);
    container.innerHTML = '';
    items.forEach(({ id, label }) => {
      const wrap = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = id;
      if (on.has(id)) input.checked = true;
      wrap.appendChild(input);
      wrap.appendChild(document.createTextNode(` ${label}`));
      container.appendChild(wrap);
    });
  }

  function readChecks(container) {
    return [...container.querySelectorAll('input:checked')].map((el) => el.value);
  }

  function setProfileEnabled(on) {
    document.getElementById('profile-enable').checked = !!on;
    document.getElementById('profile-fields').disabled = !on;
  }

  async function listedBrands(profile) {
    const entries = (await CSI.storage.listPdpCache?.()) || [];
    const fromCache = CSI.profile.brandsFromCacheEntries(entries);
    const extra = [...(profile.brandLoyal || []), ...(profile.brandAvoid || [])];
    const seen = new Set(fromCache.map((b) => b.toLowerCase()));
    extra.forEach((b) => {
      if (b && !seen.has(b.toLowerCase())) {
        fromCache.push(b);
        seen.add(b.toLowerCase());
      }
    });
    return fromCache.sort((a, b) => a.localeCompare(b));
  }

  function fillProfileForm(profile, brands) {
    const stored = CSI.profile.isStoredProfile(profile);
    const enabled = !!(profile && profile.enabled);
    setProfileEnabled(enabled);
    // Reload stored fields even when disabled so re-enable is not a blank rewrite.
    const p = stored ? profile : CSI.profile.emptyEnabled();
    fillChecks(
      document.getElementById('profile-forms'),
      CSI.profile.FORMS.map((id) => ({ id, label: id })),
      p.forms
    );
    fillChecks(
      document.getElementById('profile-sizes'),
      CSI.profile.SIZES.map((id) => ({ id, label: id })),
      p.sizes
    );
    fillSelect(
      document.getElementById('profile-ratio'),
      CSI.profile.RATIOS.map((id) => [id, CSI.profile.COPY.ratioLabels[id]]),
      p.cannabinoidRatio,
      true
    );
    fillSelect(
      document.getElementById('profile-potency'),
      CSI.profile.POTENCY_BANDS.map((id) => [id, CSI.profile.COPY.potencyLabels[id]]),
      p.potencyBandThc,
      true
    );
    const terps = CSI.profile.terpeneIds().map((id) => ({ id, label: id }));
    fillChecks(document.getElementById('profile-liked'), terps, p.likedTerpenes);
    fillChecks(document.getElementById('profile-avoid'), terps, p.avoidTerpenes);
    document.getElementById('profile-budget').value = p.tripBudgetUsd || '';
    fillSelect(
      document.getElementById('profile-home'),
      CSI.profile.STORE_IDS.map((id) => [id, STORE_LABELS[id] || id]),
      p.homeStore,
      true
    );
    fillChecks(
      document.getElementById('profile-secondary'),
      CSI.profile.STORE_IDS.map((id) => ({ id, label: STORE_LABELS[id] || id })),
      p.secondaryStores
    );
    const brandItems = brands.map((id) => ({ id, label: id }));
    fillChecks(document.getElementById('profile-brand-loyal'), brandItems, p.brandLoyal);
    fillChecks(document.getElementById('profile-brand-avoid'), brandItems, p.brandAvoid);
    document.getElementById('profile-brands-empty').hidden = brands.length > 0;
    fillSelect(
      document.getElementById('profile-deal'),
      CSI.profile.DEAL_TIERS.map((id) => [id, CSI.profile.COPY.dealLabels[id]]),
      p.dealTier || 'any',
      false
    );
  }

  function readProfileForm() {
    const enabled = document.getElementById('profile-enable').checked;
    const budgetRaw = document.getElementById('profile-budget').value;
    return {
      enabled,
      forms: readChecks(document.getElementById('profile-forms')),
      sizes: readChecks(document.getElementById('profile-sizes')),
      cannabinoidRatio: document.getElementById('profile-ratio').value || null,
      potencyBandThc: document.getElementById('profile-potency').value || null,
      likedTerpenes: readChecks(document.getElementById('profile-liked')),
      avoidTerpenes: readChecks(document.getElementById('profile-avoid')),
      tripBudgetUsd: budgetRaw === '' ? null : Number(budgetRaw),
      homeStore: document.getElementById('profile-home').value || null,
      secondaryStores: readChecks(document.getElementById('profile-secondary')),
      brandLoyal: readChecks(document.getElementById('profile-brand-loyal')),
      brandAvoid: readChecks(document.getElementById('profile-brand-avoid')),
      dealTier: document.getElementById('profile-deal').value || 'any'
    };
  }

  async function loadProfileUi() {
    const profile = await CSI.storage.loadTasteProfile();
    const brandSource = CSI.profile.isStoredProfile(profile)
      ? profile
      : { brandLoyal: [], brandAvoid: [] };
    const brands = await listedBrands(brandSource);
    fillProfileForm(profile, brands);
  }

  document.getElementById('profile-enable').addEventListener('change', (e) => {
    document.getElementById('profile-fields').disabled = !e.target.checked;
  });
  document.getElementById('profile-save').addEventListener('click', async () => {
    const raw = readProfileForm();
    const existing = await CSI.storage.loadTasteProfile();
    if (CSI.profile.isStoredProfile(existing) && existing.boughtBefore) {
      raw.boughtBefore = existing.boughtBefore;
    }
    // Uncheck + Save: keep stored fields with enabled:false (including boughtBefore).
    if (!raw.enabled && CSI.profile.isStoredProfile(existing)) {
      const saved = await CSI.storage.saveTasteProfile({ ...existing, enabled: false });
      if (!saved.ok) {
        showStatus(saved.error || 'Invalid profile');
        return;
      }
      await loadProfileUi();
      await loadPicksUi();
      showStatus('Profile off — data kept until Delete');
      return;
    }
    const saved = await CSI.storage.saveTasteProfile(raw);
    if (!saved.ok) {
      showStatus(saved.error || 'Invalid profile');
      return;
    }
    await loadProfileUi();
    await loadPicksUi();
    if (saved.value.enabled) showStatus('Profile saved');
    else if (CSI.profile.isStoredProfile(saved.value)) showStatus('Profile off — data kept until Delete');
    else showStatus('Nothing stored until you turn it on');
  });
  document.getElementById('profile-export').addEventListener('click', async () => {
    const dumped = await CSI.storage.exportTasteProfile();
    const out = document.getElementById('profile-export-out');
    if (!dumped.ok) {
      out.hidden = true;
      showStatus(dumped.error || 'Nothing to export');
      return;
    }
    out.hidden = false;
    out.value = dumped.json;
    showStatus('Exported below');
  });
  document.getElementById('profile-delete').addEventListener('click', async () => {
    await CSI.storage.deleteTasteProfile();
    document.getElementById('profile-export-out').hidden = true;
    await loadProfileUi();
    await loadPicksUi();
    showStatus('Profile deleted');
  });

  function escapeHtml(value) {
    return CSI.escapeHtml ? CSI.escapeHtml(value) : String(value ?? '');
  }

  function renderPicksResult(result) {
    const lockedEl = document.getElementById('picks-locked');
    const emptyEl = document.getElementById('picks-empty');
    const listEl = document.getElementById('picks-list');
    const disclaimer = document.getElementById('picks-disclaimer');
    const statusEl = document.getElementById('picks-status');
    lockedEl.hidden = true;
    emptyEl.hidden = true;
    listEl.hidden = true;
    listEl.innerHTML = '';
    disclaimer.hidden = true;
    statusEl.hidden = true;

    if (!result || result.status === 'locked') {
      lockedEl.hidden = false;
      return;
    }

    if (result.status !== 'ok') {
      emptyEl.hidden = false;
      document.getElementById('picks-empty-title').textContent =
        (CSI.picks && CSI.picks.COPY && CSI.picks.COPY.emptyTitle) || 'No picks yet';
      document.getElementById('picks-empty-body').textContent =
        (result && result.message) ||
        (CSI.picks && CSI.picks.COPY && CSI.picks.COPY.profileOff) ||
        '';
      return;
    }

    const picks = Array.isArray(result.picks) ? result.picks : [];
    if (!picks.length) {
      emptyEl.hidden = false;
      document.getElementById('picks-empty-title').textContent =
        (CSI.picks && CSI.picks.COPY && CSI.picks.COPY.emptyTitle) || 'No picks yet';
      document.getElementById('picks-empty-body').textContent =
        (CSI.picks && CSI.picks.COPY && CSI.picks.COPY.noMatches) || '';
      return;
    }

    listEl.hidden = false;
    disclaimer.hidden = false;
    picks.forEach((pick) => {
      const li = document.createElement('li');
      li.className = 'picks-item';
      const title = escapeHtml(pick.name || 'Listed product');
      const store = escapeHtml(pick.storeLabel || '');
      const age = escapeHtml(pick.cacheAgeLabel || '');
      const href = CSI.picks.allowlistedUrl(pick.url) ? escapeHtml(pick.url) : '';
      const reasons = (pick.reasons || [])
        .map((r) => `<li>${escapeHtml(r)}</li>`)
        .join('');
      const link = href
        ? `<a class="picks-open" href="${href}" target="_blank" rel="noopener noreferrer">Open listing</a>`
        : '';
      li.innerHTML = `
        <div class="picks-item-head">
          <strong class="picks-name">${title}</strong>
          ${link}
        </div>
        <p class="picks-meta">${store}${age ? ` · Cached ${age}` : ''}</p>
        <ul class="picks-reasons">${reasons}</ul>
        <p class="picks-listed-note">${escapeHtml(pick.listedNote || CSI.picks.COPY.listedNote)}</p>
      `;
      listEl.appendChild(li);
    });
  }

  async function loadPicksUi() {
    if (!CSI.picks) return;
    const isPro = !!CSI.features?.can?.(CSI.picks.FEATURE_ID);
    if (!isPro) {
      renderPicksResult({ status: 'locked' });
      return;
    }
    const result = await CSI.picks.loadAndRank({ isPro: true });
    renderPicksResult(result);
  }

  document.getElementById('picks-upgrade').addEventListener('click', () => {
    CSI.entitlement.openUpgrade();
  });
  document.getElementById('picks-refresh').addEventListener('click', async () => {
    await loadPicksUi();
    showStatus('Picks refreshed');
  });

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

  document.getElementById('upgrade').addEventListener('click', () => CSI.entitlement.openUpgrade());
  document.getElementById('manage').addEventListener('click', () => CSI.entitlement.openManage());
  document.getElementById('activate').addEventListener('click', async () => {
    try {
      await CSI.entitlement.activate(licenseKeyInput.value);
      showStatus('Activated');
      await refreshLicenseUi();
    } catch (e) {
      showStatus(e.message || 'Activation failed');
    }
  });
  document.getElementById('deactivate').addEventListener('click', async () => {
    await CSI.entitlement.clearStored();
    licenseKeyInput.value = '';
    showStatus('License removed');
    await refreshLicenseUi();
  });

  await loadTaste();
  await loadProfileUi();
  await refreshLicenseUi();
})();
