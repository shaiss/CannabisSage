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
    await loadDigestUi();
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
    terravida: 'TerraVida (Zen Leaf Malvern)',
    curaleaf: 'Curaleaf King of Prussia',
    iheartjane: 'RISE / Beyond Hello',
    dutchie: 'Liberty Norristown',
    shopd: 'Trulieve Limerick'
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
    const extra = [
      ...(profile.brandLoves || profile.brandLoyal || []),
      ...(profile.brandAvoids || profile.brandAvoid || [])
    ];
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
    // Popup chips stay on productFormKey-compatible FORMS; detailed FORMAT_IDS stay via import.
    const formatIds = CSI.profile.formatIds(p).filter((id) => CSI.profile.FORMS.includes(id));
    fillChecks(
      document.getElementById('profile-forms'),
      CSI.profile.FORMS.map((id) => ({ id, label: id })),
      formatIds
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
    const budgetMax = CSI.profile.budgetMax(p);
    document.getElementById('profile-budget').value = budgetMax != null ? budgetMax : '';
    const watched = Array.isArray(p.watchedStores) ? p.watchedStores : [];
    fillSelect(
      document.getElementById('profile-home'),
      CSI.profile.STORE_IDS.map((id) => [id, STORE_LABELS[id] || id]),
      watched[0] || null,
      true
    );
    fillChecks(
      document.getElementById('profile-secondary'),
      CSI.profile.STORE_IDS.map((id) => ({ id, label: STORE_LABELS[id] || id })),
      watched.slice(1)
    );
    const brandItems = brands.map((id) => ({ id, label: id }));
    fillChecks(document.getElementById('profile-brand-loyal'), brandItems, p.brandLoves || []);
    fillChecks(document.getElementById('profile-brand-avoid'), brandItems, p.brandAvoids || []);
    document.getElementById('profile-brands-empty').hidden = brands.length > 0;
    fillSelect(
      document.getElementById('profile-deal'),
      CSI.profile.DEAL_TIERS.map((id) => [id, CSI.profile.COPY.dealLabels[id]]),
      p.dealTier || 'any',
      false
    );
  }

  /**
   * Build a save payload from the popup controls, preserving every schema-v2
   * field the current UI does not edit (goals, slots, budget.min, etc.).
   */
  function readProfileForm(existing) {
    const enabled = document.getElementById('profile-enable').checked;
    const budgetRaw = document.getElementById('profile-budget').value;
    const home = document.getElementById('profile-home').value || null;
    const secondary = readChecks(document.getElementById('profile-secondary'));
    const watchedStores = [];
    const seen = new Set();
    [home, ...secondary].forEach((id) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      watchedStores.push(id);
    });

    const base = CSI.profile.isStoredProfile(existing) ? existing : CSI.profile.emptyEnabled();
    const uiFormatIds = readChecks(document.getElementById('profile-forms'));
    const existingFormats = Array.isArray(base.formats) ? base.formats : [];
    const preservedDetailed = existingFormats.filter(
      (f) => f && typeof f.id === 'string' && !CSI.profile.FORMS.includes(f.id)
    );
    const fromUi = uiFormatIds.map((id) => {
      const prev = existingFormats.find((f) => f && f.id === id);
      return { id, slot: prev && prev.slot != null ? prev.slot : null };
    });
    const formats = [...fromUi, ...preservedDetailed];

    const prevMin =
      base.budget && base.budget.min != null && Number.isInteger(Number(base.budget.min))
        ? Number(base.budget.min)
        : null;
    let budget = null;
    if (budgetRaw !== '') {
      const max = Number(budgetRaw);
      let min = prevMin;
      // UI only edits max; drop a hidden min that would make normalize reject the save.
      if (min != null && Number.isInteger(max) && min > max) min = null;
      budget = { min, max, currency: 'USD' };
    } else if (prevMin != null) {
      // Clearing max must not wipe an unedited minimum-only budget.
      budget = { min: prevMin, max: null, currency: 'USD' };
    }

    return {
      ...base,
      enabled,
      formats,
      sizes: readChecks(document.getElementById('profile-sizes')),
      cannabinoidRatio: document.getElementById('profile-ratio').value || null,
      potencyBandThc: document.getElementById('profile-potency').value || null,
      likedTerpenes: readChecks(document.getElementById('profile-liked')),
      avoidTerpenes: readChecks(document.getElementById('profile-avoid')),
      budget,
      watchedStores,
      brandLoves: readChecks(document.getElementById('profile-brand-loyal')),
      brandAvoids: readChecks(document.getElementById('profile-brand-avoid')),
      dealTier: document.getElementById('profile-deal').value || 'any'
    };
  }

  async function loadProfileUi() {
    const profile = await CSI.storage.loadTasteProfile();
    const brandSource = CSI.profile.isStoredProfile(profile)
      ? profile
      : { brandLoves: [], brandAvoids: [] };
    const brands = await listedBrands(brandSource);
    fillProfileForm(profile, brands);
  }

  document.getElementById('profile-enable').addEventListener('change', (e) => {
    document.getElementById('profile-fields').disabled = !e.target.checked;
  });
  document.getElementById('profile-save').addEventListener('click', async () => {
    const existing = await CSI.storage.loadTasteProfile();
    const raw = readProfileForm(existing);
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

  let pendingImport = null;
  let importPreviewSeq = 0;

  function hideImportPreview() {
    importPreviewSeq += 1;
    pendingImport = null;
    const preview = document.getElementById('profile-import-preview');
    const diff = document.getElementById('profile-import-diff');
    const fileInput = document.getElementById('profile-import-file');
    const applyBtn = document.getElementById('profile-import-confirm');
    preview.hidden = true;
    diff.textContent = '';
    if (applyBtn) applyBtn.disabled = true;
    if (fileInput) fileInput.value = '';
  }

  function showImportPreview(preview) {
    pendingImport = {
      value: preview.value,
      basisUpdatedAt: preview.currentUpdatedAt == null ? null : preview.currentUpdatedAt
    };
    const box = document.getElementById('profile-import-preview');
    const diff = document.getElementById('profile-import-diff');
    const applyBtn = document.getElementById('profile-import-confirm');
    diff.textContent = (preview.lines || []).join('\n') || 'No field changes.';
    box.hidden = false;
    if (applyBtn) applyBtn.disabled = false;
  }

  document.getElementById('profile-import').addEventListener('click', () => {
    document.getElementById('profile-import-file').click();
  });
  document.getElementById('profile-import-file').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const seq = ++importPreviewSeq;
    pendingImport = null;
    const applyBtn = document.getElementById('profile-import-confirm');
    if (applyBtn) applyBtn.disabled = true;
    document.getElementById('profile-import-preview').hidden = true;
    document.getElementById('profile-import-diff').textContent = '';

    const maxBytes = CSI.profile?.MAX_IMPORT_BYTES || 64 * 1024;
    if (typeof file.size === 'number' && file.size > maxBytes) {
      if (seq !== importPreviewSeq) return;
      hideImportPreview();
      showStatus('Import exceeds size cap');
      return;
    }

    let text;
    try {
      text = await file.text();
    } catch {
      if (seq !== importPreviewSeq) return;
      hideImportPreview();
      showStatus('Could not read file');
      return;
    }
    if (seq !== importPreviewSeq) return;
    const preview = await CSI.storage.previewTasteProfileImport(text);
    if (seq !== importPreviewSeq) return;
    if (!preview.ok) {
      hideImportPreview();
      showStatus(preview.error || 'Invalid import');
      return;
    }
    showImportPreview(preview);
    showStatus('Review import changes, then Apply');
  });
  document.getElementById('profile-import-confirm').addEventListener('click', async () => {
    if (!pendingImport || !pendingImport.value) {
      showStatus('Nothing to import');
      return;
    }
    // If the stored profile changed after preview, re-diff and require confirmation again.
    const current =
      (CSI.storage.peekTasteProfile
        ? await CSI.storage.peekTasteProfile()
        : await CSI.storage.loadTasteProfile()) || { enabled: false };
    const currentUpdatedAt = CSI.profile.isStoredProfile(current) ? current.updatedAt : null;
    if (currentUpdatedAt !== pendingImport.basisUpdatedAt) {
      const diff = CSI.profile.diffProfiles(current, pendingImport.value);
      showImportPreview({
        value: pendingImport.value,
        currentUpdatedAt,
        lines: CSI.profile.formatDiffLines(diff)
      });
      showStatus('Stored profile changed — review again, then Apply');
      return;
    }
    const saved = await CSI.storage.importTasteProfile(pendingImport.value);
    if (!saved.ok) {
      showStatus(saved.error || 'Import failed');
      return;
    }
    hideImportPreview();
    document.getElementById('profile-export-out').hidden = true;
    await loadProfileUi();
    await loadPicksUi();
    showStatus(
      saved.value.enabled ? 'Profile imported' : 'Profile imported (off — data kept until Delete)'
    );
  });
  document.getElementById('profile-import-cancel').addEventListener('click', () => {
    hideImportPreview();
    showStatus('Import cancelled');
  });

  document.getElementById('profile-delete').addEventListener('click', async () => {
    await CSI.storage.deleteTasteProfile();
    document.getElementById('profile-export-out').hidden = true;
    hideImportPreview();
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

  let picksLoadVersion = 0;

  async function loadPicksUi() {
    const requestVersion = ++picksLoadVersion;
    if (!CSI.picks) return;
    const isPro = !!CSI.features?.can?.(CSI.picks.FEATURE_ID);
    if (!isPro) {
      renderPicksResult({ status: 'locked' });
      return;
    }
    const result = await CSI.picks.loadAndRank({ isPro: true });
    if (requestVersion !== picksLoadVersion) return;
    renderPicksResult(result);
  }

  function renderDigestResult(view, savedItems) {
    const lockedEl = document.getElementById('digest-locked');
    const statusEl = document.getElementById('digest-status');
    const listEl = document.getElementById('digest-list');
    const disclaimer = document.getElementById('digest-disclaimer');
    const savedWrap = document.getElementById('digest-saved');
    const savedList = document.getElementById('digest-saved-list');
    lockedEl.hidden = true;
    statusEl.hidden = true;
    listEl.hidden = true;
    listEl.innerHTML = '';
    disclaimer.hidden = true;
    savedWrap.hidden = true;
    savedList.innerHTML = '';

    const copy = (CSI.digest && CSI.digest.COPY) || {};
    if (!view || view.status === 'locked') {
      lockedEl.hidden = false;
    } else if (view.status === 'digest' && Array.isArray(view.items) && view.items.length) {
      listEl.hidden = false;
      disclaimer.hidden = false;
      view.items.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'digest-item';
        const href = CSI.digest.allowlistedUrl(item.url) ? escapeHtml(item.url) : '';
        const lines = (CSI.digest.reasons(item) || []).map((line) => `<li>${escapeHtml(line)}</li>`).join('');
        const link = href
          ? `<a class="digest-open" href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(copy.open || 'Open product')}</a>`
          : '';
        li.innerHTML = `
          <div class="digest-item-head">
            <strong class="digest-name">${escapeHtml(item.name || copy.productFallback || 'Saved product')}</strong>
            ${link}
          </div>
          <ul class="digest-reasons">${lines}</ul>
        `;
        listEl.appendChild(li);
      });
    } else {
      statusEl.hidden = false;
      statusEl.textContent = (view && view.message) || copy.quiet || '';
    }

    const saved = Array.isArray(savedItems) ? savedItems : [];
    if (saved.length) {
      savedWrap.hidden = false;
      saved.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'digest-saved-item';
        const href = CSI.digest.allowlistedUrl(item.url) ? escapeHtml(item.url) : '';
        const link = href
          ? `<a class="digest-open" href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(copy.open || 'Open product')}</a>`
          : '';
        li.innerHTML = `
          <div class="digest-saved-head">
            <span class="digest-name">${escapeHtml(item.name || copy.productFallback || 'Saved product')}</span>
            ${link}
            <button type="button" class="digest-remove" data-url="${escapeHtml(item.url)}">${escapeHtml(copy.remove || 'Remove')}</button>
          </div>
        `;
        savedList.appendChild(li);
      });
    }
    CSI.digest?.syncBadge?.(view && view.status === 'digest' ? CSI.digest.badgeCount(view) : 0);
  }

  async function loadDigestUi() {
    if (!CSI.digest || !CSI.storage?.commitSavedDigest) return;
    const savedItems = await CSI.storage.loadSavedItems();
    const isPro = !!CSI.features?.can?.(CSI.digest.FEATURE_ID);
    if (!isPro) {
      renderDigestResult({ status: 'locked', message: CSI.digest.COPY.locked }, savedItems);
      return;
    }
    try {
      const result = await CSI.storage.commitSavedDigest(Date.now(), { isPro: true });
      renderDigestResult(result && result.view, (result && result.watch && result.watch.items) || savedItems);
    } catch (e) {
      renderDigestResult(
        {
          status: 'error',
          message: (e && e.message) || 'Saved-watch write failed'
        },
        savedItems
      );
    }
  }

  document.getElementById('digest-upgrade').addEventListener('click', () => {
    CSI.entitlement.openUpgrade();
  });
  document.getElementById('digest-saved-list').addEventListener('click', async (event) => {
    const btn = event.target.closest('.digest-remove');
    if (!btn) return;
    try {
      await CSI.storage.removeSavedItem(btn.getAttribute('data-url'));
      await loadDigestUi();
    } catch (e) {
      const savedItems = await CSI.storage.loadSavedItems().catch(() => []);
      renderDigestResult(
        {
          status: 'error',
          message: (e && e.message) || 'Saved-watch write failed'
        },
        savedItems
      );
    }
  });

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
