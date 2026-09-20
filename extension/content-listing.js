/**
 * Listing page controller — badges, filters, sort, hover, compare tray.
 */
(function () {
  'use strict';
  const CSI = globalThis.CSI;
  if (!CSI) {
    console.error('CannabisSage: core not loaded');
    return;
  }

  const state = {
    selection: [],
    tasteMap: null,
    filters: { ...CSI.storage.DEFAULT_FILTERS },
    cardMeta: new WeakMap()
  };

  let mutationObserver = null;
  let enhanceTimer = null;
  let isEnhancing = false;
  let lastPath = location.pathname;
  let tray = null;
  let filterBar = null;
  let storageListener = null;
  let active = false;

  function getSelection() {
    return state.selection;
  }
  function setSelection(list) {
    state.selection = list.slice(0, CSI.MAX_COMPARE);
  }
  async function persist() {
    await CSI.storage.saveCompare(state.selection);
  }

  function findProductCards() {
    const adapter = CSI.registry?.getActiveAdapter?.();
    if (adapter?.findProductCards) return adapter.findProductCards();
    return [];
  }

  function isLikelyProductCard(element) {
    const adapter = CSI.registry?.getActiveAdapter?.();
    if (adapter?.isLikelyProductCard) return adapter.isLikelyProductCard(element);
    return false;
  }

  function cardHost(cardEl) {
    const adapter = CSI.registry?.getActiveAdapter?.();
    if (adapter?.cardHost) return adapter.cardHost(cardEl);
    return cardEl;
  }

  function ensureBadgeRow(cardEl) {
    const host = cardHost(cardEl);
    let row = host.querySelector(':scope > .csi-badge-row');
    if (!row) {
      row = document.createElement('div');
      row.className = 'csi-badge-row';
      host.appendChild(row);
    }
    return row;
  }

  function renderBadges(cardEl, product, status) {
    const row = ensureBadgeRow(cardEl);
    const adapter = CSI.registry?.getActiveAdapter?.();
    const minMatch = state.tasteMap?.minMatchScore ?? 0.35;
    const chips = CSI.ui.buildListingBadgeChips({
      product,
      status,
      cardEl,
      adapter,
      tasteMap: state.tasteMap,
      minMatch
    });
    row.innerHTML = chips.join('');
    CSI.glossary?.wireTerpeneClicks(row);
  }

  async function enrichCard(cardEl, opts = {}) {
    const { forceFetch = false } = opts;
    let product = CSI.getElementProduct(cardEl) || {};
    renderBadges(cardEl, product, 'loading');

    const url = await CSI.resolveProductUrl(cardEl);
    product = CSI.getElementProduct(cardEl) || product;

    // Listing price / sale / optional on-card chem from adapter
    const host = cardHost(cardEl);
    const hints = CSI.registry?.getActiveAdapter?.()?.parseListingHints?.(cardEl) || {};
    const price = product.price ?? hints.price ?? CSI.parsePrice(host.textContent || '');
    const onSale = product.onSale || hints.onSale || CSI.detectSale(host);
    const weightGrams = CSI.parseWeightGrams(
      product.weightText || hints.weightText || host.textContent || ''
    );
    if (price != null) product.price = price;
    product.onSale = onSale;
    if (hints.weightText && !product.weightText) product.weightText = hints.weightText;
    if (hints.cannabinoids) {
      product.cannabinoids = { ...(hints.cannabinoids || {}), ...(product.cannabinoids || {}) };
    }
    if (hints.terpenes && !CSI.hasTerpeneInfo(product.terpenes)) {
      product.terpenes = hints.terpenes;
    }

    const needsFetch =
      forceFetch ||
      !CSI.hasCannabinoidInfo(product.cannabinoids) ||
      !CSI.hasDetailedTerpeneBreakdown(product.terpenes);

    if (url && needsFetch) {
      const data = await CSI.fetchProductDetails(url);
      if (data.error) {
        product = { ...product, url, error: data.error, status: 'error' };
        CSI.storeElementProduct(cardEl, product);
        renderBadges(cardEl, product, 'error');
        return product;
      }
      product = {
        ...product,
        url: data.url || url,
        name: data.name || product.name,
        cannabinoids: { ...(product.cannabinoids || {}), ...(data.cannabinoids || {}) },
        terpenes: data.terpenes || product.terpenes,
        price: data.price ?? product.price,
        status: data.status || 'ok'
      };
    } else if (!url) {
      product = { ...product, status: 'error', error: 'Unable to find product URL' };
      renderBadges(cardEl, product, 'error');
      return product;
    }

    if (CSI.features?.can?.('tasteMap') && state.tasteMap) {
      product.matchScore = CSI.scoreTasteMatch(product, state.tasteMap);
    }
    if (CSI.features?.can?.('dealBadges')) {
      product.dollarsPerMg = weightGrams
        ? CSI.dollarsPerMgThc(product.price, product.cannabinoids, weightGrams)
        : null;
    } else {
      product.dollarsPerMg = null;
    }
    const empty =
      !CSI.hasCannabinoidInfo(product.cannabinoids) && !CSI.hasTerpeneInfo(product.terpenes);
    product.status = empty ? 'empty' : product.status || 'ok';
    CSI.storeElementProduct(cardEl, product);
    renderBadges(cardEl, product, product.status);
    return product;
  }

  function normalizeCompareUrl(raw) {
    if (!raw) return '';
    try {
      const u = new URL(raw, location.origin);
      return `${u.origin}${u.pathname.replace(/\/$/, '')}`;
    } catch {
      return String(raw).split(/[?#]/)[0].replace(/\/$/, '');
    }
  }

  function isUrlSelected(url) {
    const norm = normalizeCompareUrl(url);
    if (!norm) return false;
    return state.selection.some((p) => normalizeCompareUrl(p.url) === norm);
  }

  function syncSelectButtonForCard(cardEl) {
    const host = cardHost(cardEl);
    const btn = host?.querySelector?.('.cannabis-sage-select-btn');
    if (!btn) return;
    const url = cardEl.dataset.csiUrl;
    if (url && isUrlSelected(url)) {
      btn.textContent = 'Selected ✓';
      btn.classList.add('is-selected');
    } else {
      btn.textContent = 'Compare Select';
      btn.classList.remove('is-selected');
    }
  }

  function addSelectionButton(cardEl) {
    const host = cardHost(cardEl);
    if (host.querySelector('.cannabis-sage-select-btn')) {
      syncSelectButtonForCard(cardEl);
      return;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cannabis-sage-select-btn';
    btn.textContent = 'Compare Select';
    btn.title = 'CannabisSage: select for comparison';

    const syncLabel = () => syncSelectButtonForCard(cardEl);
    syncLabel();
    // Restore after URL is known (reload: dataset.csiUrl may be empty at mount)
    CSI.resolveProductUrl(cardEl)
      .then(() => syncLabel())
      .catch(() => {});

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      btn.disabled = true;
      const url = await CSI.resolveProductUrl(cardEl);
      let product = CSI.getElementProduct(cardEl) || {};
      if (!CSI.hasCannabinoidInfo(product.cannabinoids)) {
        product = (await enrichCard(cardEl)) || product;
      }
      btn.disabled = false;
      if (!url) {
        btn.textContent = 'Unavailable';
        setTimeout(syncLabel, 1500);
        return;
      }

      const norm = normalizeCompareUrl(url);
      const index = state.selection.findIndex((p) => normalizeCompareUrl(p.url) === norm);
      if (index > -1) {
        state.selection.splice(index, 1);
      } else {
        if (state.selection.length >= CSI.MAX_COMPARE) {
          alert(`Maximum ${CSI.MAX_COMPARE} products can be selected for comparison`);
          syncLabel();
          return;
        }
        state.selection.push({
          url: normalizeCompareUrl(url) || url,
          name: product.name || (cardEl.textContent || '').trim().split('\n').filter(Boolean)[0] || 'Product',
          cannabinoids: product.cannabinoids,
          terpenes: product.terpenes,
          price: product.price,
          onSale: product.onSale,
          matchScore: product.matchScore
        });
      }
      await persist();
      syncLabel();
      tray.updateTrayButton();
    });

    host.appendChild(btn);
  }

  async function handleHover(event, cardEl) {
    let product = CSI.getElementProduct(cardEl);
    CSI.ui.showTooltip(event.pageX, event.pageY, CSI.ui.buildTooltipContent({ status: 'loading' }));

    if (!product || !CSI.hasCannabinoidInfo(product.cannabinoids)) {
      product = await enrichCard(cardEl);
    } else if (!product.matchScore && state.tasteMap) {
      product.matchScore = CSI.scoreTasteMatch(product, state.tasteMap);
    }

    CSI.ui.showTooltip(
      event.pageX,
      event.pageY,
      CSI.ui.buildTooltipContent(product, {
        matchScore: CSI.features?.can?.('tasteMap') ? product?.matchScore : null
      })
    );
  }

  function cardPassesFilters(cardEl) {
    const product = CSI.getElementProduct(cardEl);
    const f = state.filters;
    if (!product) return true; // keep visible until loaded; apply after enrich

    if (f.minThc != null && f.minThc !== '') {
      const thc = CSI.readThcPercent(product.cannabinoids);
      if (thc == null || thc < Number(f.minThc)) return false;
    }
    if (f.mustIncludeTerpene) {
      const name = CSI.canonicalizeTerpeneName(f.mustIncludeTerpene) || f.mustIncludeTerpene;
      const map = CSI.normalizeTerpeneMap(product.terpenes);
      if (!(map[name] > 0)) return false;
    }
    if (f.excludeTerpene) {
      const name = CSI.canonicalizeTerpeneName(f.excludeTerpene) || f.excludeTerpene;
      const map = CSI.normalizeTerpeneMap(product.terpenes);
      if (map[name] > 0) return false;
    }
    if (f.maxDollarsPerMg != null && f.maxDollarsPerMg !== '') {
      if (product.dollarsPerMg == null || product.dollarsPerMg > Number(f.maxDollarsPerMg)) return false;
    }
    return true;
  }

  function applyFiltersAndSort() {
    const cards = findProductCards();
    const hosts = cards.map((c) => ({ card: c, host: cardHost(c) }));

    const filtersOn = CSI.features?.can?.('filters');
    const sortOn = CSI.features?.can?.('sort');

    // Filter visibility
    hosts.forEach(({ card, host }) => {
      const pass = filtersOn ? cardPassesFilters(card) : true;
      host.classList.toggle('csi-filtered-out', !pass);
      host.style.display = pass ? '' : 'none';
    });

    const sortBy = sortOn ? state.filters.sortBy || 'default' : 'default';
    if (sortBy === 'default') return;

    // Sort visible hosts within shared parent
    const byParent = new Map();
    hosts.forEach((item) => {
      if (item.host.classList.contains('csi-filtered-out')) return;
      const parent = item.host.parentElement;
      if (!parent) return;
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent).push(item);
    });

    byParent.forEach((items, parent) => {
      const scored = items.map((item) => {
        const p = CSI.getElementProduct(item.card) || {};
        let score = 0;
        if (sortBy === 'thca') score = CSI.readThcaPercent(p.cannabinoids) ?? CSI.readThcPercent(p.cannabinoids) ?? -1;
        else if (sortBy === 'totalTerps') score = CSI.totalTerpenes(p.terpenes) ?? -1;
        else if (sortBy === 'matchScore') score = p.matchScore ?? -1;
        return { ...item, score };
      });
      scored.sort((a, b) => b.score - a.score);
      scored.forEach(({ host }) => parent.appendChild(host));
    });
  }

  function ensureFilterBar() {
    if (filterBar || !document.body) return;
    const pro = CSI.features?.hasPro?.();
    const storeName = CSI.registry?.getActiveAdapter?.()?.displayName || '';
    filterBar = document.createElement('div');
    filterBar.id = 'csi-filter-bar';
    filterBar.innerHTML = `
      <div class="csi-filter-title">CannabisSage${
        storeName ? ` · ${CSI.escapeHtml(storeName)}` : ''
      }${pro ? ' · Pro' : ' · Free'}</div>
      ${
        pro
          ? `
      <label>Min THC% <input type="number" step="0.1" min="0" id="csi-min-thc" placeholder="—"></label>
      <label>Must terpene <input type="text" id="csi-must-terp" placeholder="e.g. Limonene" list="csi-terp-list"></label>
      <label>Exclude <input type="text" id="csi-excl-terp" placeholder="terpene" list="csi-terp-list"></label>
      <label>Max $/mg <input type="number" step="0.01" min="0" id="csi-max-dpm" placeholder="—"></label>
      <label>Sort
        <select id="csi-sort">
          <option value="default">Default</option>
          <option value="thca">THCA / THC</option>
          <option value="totalTerps">Total terpenes</option>
          <option value="matchScore">Taste-map match</option>
        </select>
      </label>
      <button type="button" id="csi-apply-filters">Apply</button>
      <button type="button" id="csi-reset-filters">Reset</button>
      <datalist id="csi-terp-list">
        ${CSI.TERPENE_CANON.map((t) => `<option value="${t.name}"></option>`).join('')}
      </datalist>`
          : `<span class="csi-filter-locked">Filters, sort & taste-map are Pro. <button type="button" id="csi-upgrade-btn" class="csi-upgrade-inline">Upgrade</button></span>`
      }
    `;
    document.body.appendChild(filterBar);

    filterBar.querySelector('#csi-upgrade-btn')?.addEventListener('click', () => {
      CSI.entitlement?.openUpgrade?.();
    });

    if (!pro) return;

    const syncInputs = () => {
      filterBar.querySelector('#csi-min-thc').value = state.filters.minThc ?? '';
      filterBar.querySelector('#csi-must-terp').value = state.filters.mustIncludeTerpene || '';
      filterBar.querySelector('#csi-excl-terp').value = state.filters.excludeTerpene || '';
      filterBar.querySelector('#csi-max-dpm').value = state.filters.maxDollarsPerMg ?? '';
      filterBar.querySelector('#csi-sort').value = state.filters.sortBy || 'default';
    };
    syncInputs();

    filterBar.querySelector('#csi-apply-filters').addEventListener('click', async () => {
      state.filters = {
        minThc: filterBar.querySelector('#csi-min-thc').value,
        mustIncludeTerpene: filterBar.querySelector('#csi-must-terp').value.trim(),
        excludeTerpene: filterBar.querySelector('#csi-excl-terp').value.trim(),
        maxDollarsPerMg: filterBar.querySelector('#csi-max-dpm').value,
        sortBy: filterBar.querySelector('#csi-sort').value
      };
      await CSI.storage.saveFilters(state.filters);
      applyFiltersAndSort();
    });
    filterBar.querySelector('#csi-reset-filters').addEventListener('click', async () => {
      state.filters = { ...CSI.storage.DEFAULT_FILTERS };
      await CSI.storage.saveFilters(state.filters);
      syncInputs();
      applyFiltersAndSort();
    });
  }

  async function enhanceProducts() {
    if (!document.body) return;
    ensureFilterBar();
    const cards = findProductCards();
    CSI.log(`listing cards: ${cards.length}`);
    let n = 0;
    for (const card of cards) {
      if (card.dataset.csiEnhanced === 'true') {
        // still refresh select label / filters
        continue;
      }
      if (!isLikelyProductCard(card)) continue;
      card.dataset.csiEnhanced = 'true';
      n += 1;

      card.addEventListener('mouseover', (e) => handleHover(e, card));
      card.addEventListener('mousemove', (e) => {
        const tip = document.getElementById('cannabis-sage-tooltip');
        if (tip && tip.style.display !== 'none') {
          tip.style.left = `${e.pageX + 15}px`;
          tip.style.top = `${e.pageY + 15}px`;
        }
      });
      card.addEventListener('mouseout', (e) => {
        if (e.relatedTarget && card.contains(e.relatedTarget)) return;
        CSI.ui.hideTooltip();
      });

      addSelectionButton(card);
      // Fire-and-forget enrichment for badges; re-sync compare label once URL is known
      enrichCard(card).then(() => {
        syncSelectButtonForCard(card);
        applyFiltersAndSort();
      });
    }
    CSI.log(`newly enhanced: ${n}`);
    // Re-sync all buttons against persisted selection (covers cards skipped as already enhanced)
    findProductCards().forEach((card) => syncSelectButtonForCard(card));
    tray.updateTrayButton();
    applyFiltersAndSort();
  }

  function scheduleEnhance() {
    if (isEnhancing) return;
    clearTimeout(enhanceTimer);
    enhanceTimer = setTimeout(async () => {
      isEnhancing = true;
      try {
        await enhanceProducts();
      } catch (e) {
        CSI.error('enhance failed', e);
      } finally {
        isEnhancing = false;
      }
    }, 150);
  }

  function setupObserver() {
    if (!document.body || mutationObserver) return;
    mutationObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          const id = node.id || '';
          if (id.startsWith('cannabis-sage') || id.startsWith('csi-') || node.classList?.contains('cannabis-sage-select-btn')) {
            continue;
          }
          scheduleEnhance();
          return;
        }
      }
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
  }

  function onListingPathChange() {
    const adapter = CSI.registry?.refreshActiveAdapter?.() || CSI.registry?.getActiveAdapter?.();
    if (!adapter || adapter.routeMode(location.pathname) !== 'listing') return;
    if (location.pathname !== lastPath) {
      CSI.log('listing SPA path', lastPath, '->', location.pathname);
      lastPath = location.pathname;
      document.querySelectorAll('[data-csi-enhanced="true"]').forEach((el) => {
        delete el.dataset.csiEnhanced;
      });
      document.querySelectorAll('.csi-badge-row, .cannabis-sage-select-btn').forEach((n) => n.remove());
    }
    scheduleEnhance();
  }

  function teardownListing() {
    active = false;
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    clearTimeout(enhanceTimer);
    document.getElementById('csi-filter-bar')?.remove();
    document.getElementById('csi-store-gate')?.remove();
    filterBar = null;
    document.querySelectorAll('.csi-badge-row, .cannabis-sage-select-btn').forEach((n) => n.remove());
    document.querySelectorAll('[data-csi-enhanced="true"]').forEach((el) => {
      delete el.dataset.csiEnhanced;
    });
    // Keep compare tray across PDP
  }

  function showStoreGateBanner() {
    document.getElementById('csi-store-gate')?.remove();
    const el = document.createElement('div');
    el.id = 'csi-store-gate';
    el.innerHTML = `
      <strong>CannabisSage Pro</strong>
      <span>Multi-store coverage requires Pro.</span>
      <button type="button" id="csi-store-upgrade">Upgrade</button>
    `;
    document.body.appendChild(el);
    el.querySelector('#csi-store-upgrade')?.addEventListener('click', () => {
      CSI.entitlement?.openUpgrade?.();
    });
  }

  async function startListing() {
    if (active) {
      onListingPathChange();
      return;
    }
    active = true;
    await CSI.entitlement?.refreshIsPro?.();
    CSI.log(
      `listing start v${CSI.VERSION}`,
      CSI.registry?.getActiveAdapter?.()?.id || 'no-adapter',
      location.href
    );

    if (!CSI.features?.canUseActiveStore?.()) {
      showStoreGateBanner();
      active = false;
      return;
    }
    document.getElementById('csi-store-gate')?.remove();

    await CSI.storage.pruneExpiredCache();
    state.selection = await CSI.storage.loadCompare();
    state.tasteMap = CSI.features?.can?.('tasteMap') ? await CSI.storage.loadTasteMap() : null;
    state.filters = await CSI.storage.loadFilters();
    await CSI.glossary.ensureGlossary();

    if (!tray) {
      tray = CSI.ui.createCompareTrayController({
        getSelection,
        setSelection,
        persist,
        get tasteMap() {
          return state.tasteMap;
        }
      });
    }

    lastPath = location.pathname;
    const start = () => {
      if (!document.body) {
        setTimeout(start, 50);
        return;
      }
      scheduleEnhance();
      setupObserver();
      tray.updateTrayButton();
    };
    start();

    if (!storageListener) {
      storageListener = (changes, area) => {
        if (area !== 'local' || !active) return;
        if (changes.csi_taste_map) {
          CSI.storage.loadTasteMap().then((m) => {
            state.tasteMap = m;
            document.querySelectorAll('[data-csi-enhanced="true"]').forEach((card) => {
              const p = CSI.getElementProduct(card);
              if (!p) return;
              p.matchScore = CSI.scoreTasteMatch(p, state.tasteMap);
              CSI.storeElementProduct(card, p);
              renderBadges(card, p, p.status || 'ok');
            });
            applyFiltersAndSort();
          });
        }
        if (changes.csi_compare) {
          CSI.storage.loadCompare().then((list) => {
            state.selection = list;
            tray?.updateTrayButton();
          });
        }
      };
      chrome.storage.onChanged.addListener(storageListener);
    }
  }

  CSI.routes = CSI.routes || {};
  CSI.routes.startListing = startListing;
  CSI.routes.teardownListing = teardownListing;
  CSI.routes.onSameRoute = (mode) => {
    if (mode === 'listing') onListingPathChange();
  };
})();
