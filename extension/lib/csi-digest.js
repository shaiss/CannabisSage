/**
 * Pro restock and deal digest for items saved on this device.
 * Observations come from menus the shopper already opened. No network.
 * At most one digest every 24 hours. The popup is the surface.
 */
(function (global) {
  'use strict';
  const CSI = global.CSI;
  if (!CSI) throw new Error('CSI core missing');

  const FEATURE_ID = 'savedItemDigest';
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MAX_SAVED = 40;
  const STORAGE_KEY = 'csi_saved_watch';

  const COPY = Object.freeze({
    title: 'Restock and deal digest',
    hint: 'Pro. One digest a day for products you save on this device. It uses listed price, sale, and stock from menus you open. Nothing is checked in the background.',
    locked:
      'Restock and deal alerts are a Pro tool. Saved items stay on this device. You get one digest a day, not separate pings.',
    upgrade: 'Upgrade',
    noSaved:
      'Save a product on a supported menu. Later visits you browse can show a restock, a lower listed price, or a new deal.',
    quiet: 'No restocks, price drops, or new deals on your saved items since the last digest.',
    listedNote: 'Listed, not guaranteed.',
    restock: 'Back in stock',
    priceDrop: 'Listed price dropped',
    saleListed: 'Sale listed',
    belowMedian: 'Below the median listed price in this category.',
    open: 'Open product',
    savedHeading: 'Saved on this device',
    save: 'Save',
    saved: 'Saved',
    remove: 'Remove',
    listFull: 'Saved list is full',
    productFallback: 'Saved product',
    saveTitle: 'Saved on this device. Restock and deal digest is a Pro tool.'
  });

  const OUT_OF_STOCK_RE = /\b(sold[\s-]*out|out\s+of\s+stock)\b/i;

  function emptyWatch() {
    return { items: [], byUrl: {}, lastIssuedAt: null, issued: null };
  }

  function cleanName(value) {
    const name = String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    if (!name || /^https?:/i.test(name)) return '';
    return name;
  }

  function money(value) {
    const cents = Math.round(Number(value) * 100);
    if (!Number.isFinite(cents)) return '';
    return (cents / 100).toFixed(2);
  }

  function allowlistedUrl(url) {
    const key = CSI.profile?.productKeyFromUrl?.(url);
    return key || '';
  }

  /**
   * Explicit sold-out phrasing only. Unknown stays null — never a guessed stock state.
   * @returns {false|null}
   */
  function readListedStock(text) {
    const raw = String(text || '');
    if (!raw.trim()) return null;
    if (OUT_OF_STOCK_RE.test(raw)) return false;
    return null;
  }

  /**
   * A listed positive price with no sold-out phrase counts as in stock.
   * Sold-out phrasing wins even when a price is still on the card.
   * @returns {true|false|null}
   */
  function inStockFromListed(input) {
    const src = input || {};
    const signal = readListedStock(src.text);
    if (signal === false) return false;
    if (CSI.positivePrice?.(src.price) != null) return true;
    return null;
  }

  /**
   * Tri-state below-median. Null when price, median, or sample size is missing.
   * @returns {true|false|null}
   */
  function belowMedianState(price, categoryMedian, sampleCount) {
    const p = CSI.positivePrice?.(price);
    const m = CSI.positivePrice?.(categoryMedian);
    const n = Number(sampleCount);
    if (p == null || m == null) return null;
    if (!Number.isFinite(n) || n < (CSI.MIN_CATEGORY_PRICE_SAMPLE || 3)) return null;
    return p < m;
  }

  function normalizeObservation(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const price = CSI.positivePrice?.(src.price) ?? null;
    let belowMedian = null;
    if (src.belowMedian === true) belowMedian = true;
    else if (src.belowMedian === false) belowMedian = false;
    let inStock = null;
    if (src.inStock === true) inStock = true;
    else if (src.inStock === false) inStock = false;
    const seenAt = Number(src.seenAt);
    return {
      price,
      onSale: src.onSale === true,
      belowMedian,
      inStock,
      name: cleanName(src.name),
      seenAt: Number.isFinite(seenAt) && seenAt > 0 ? seenAt : null
    };
  }

  function baselineFromObservation(obs) {
    return {
      priceAtDigest: obs.price,
      onSaleAtDigest: obs.onSale === true,
      belowMedianAtDigest: obs.belowMedian === true ? true : obs.belowMedian === false ? false : null,
      outSinceDigest: obs.inStock === false,
      offSaleSinceDigest: obs.onSale === false,
      aboveMedianSinceDigest: obs.belowMedian === false,
      latest: obs
    };
  }

  function applyObservation(record, observation) {
    const obs = normalizeObservation(observation);
    if (!record || typeof record !== 'object' || !record.latest) return baselineFromObservation(obs);
    return {
      priceAtDigest: record.priceAtDigest ?? null,
      onSaleAtDigest: record.onSaleAtDigest === true,
      belowMedianAtDigest:
        record.belowMedianAtDigest === true ? true : record.belowMedianAtDigest === false ? false : null,
      outSinceDigest: record.outSinceDigest === true || obs.inStock === false,
      offSaleSinceDigest: record.offSaleSinceDigest === true || obs.onSale === false,
      aboveMedianSinceDigest: record.aboveMedianSinceDigest === true || obs.belowMedian === false,
      latest: obs
    };
  }

  function sameCommercialObservation(record, observation) {
    if (!record || !record.latest) return false;
    const next = normalizeObservation(observation);
    const prev = normalizeObservation(record.latest);
    return (
      prev.price === next.price &&
      prev.onSale === next.onSale &&
      prev.belowMedian === next.belowMedian &&
      prev.inStock === next.inStock &&
      prev.name === next.name
    );
  }

  function diffRecord(record) {
    const latest = record && record.latest ? normalizeObservation(record.latest) : null;
    if (!latest) return null;
    const kinds = [];
    const restock = record.outSinceDigest === true && latest.inStock === true;
    if (restock) kinds.push('restock');
    const from = CSI.positivePrice?.(record.priceAtDigest) ?? null;
    const to = latest.price;
    const priceDrop = from != null && to != null && Math.round(to * 100) < Math.round(from * 100);
    if (priceDrop) kinds.push('priceDrop');
    const saleListed =
      latest.onSale === true && (record.onSaleAtDigest === false || record.offSaleSinceDigest === true);
    const belowMedian =
      latest.belowMedian === true &&
      (record.belowMedianAtDigest === false || record.aboveMedianSinceDigest === true);
    if (saleListed || belowMedian) kinds.push('deal');
    if (!kinds.length) return null;
    return {
      kinds,
      priceFrom: priceDrop ? from : null,
      priceTo: priceDrop ? to : null,
      saleListed: !!saleListed,
      belowMedian: !!belowMedian,
      seenAt: latest.seenAt
    };
  }

  function commitRecord(record) {
    if (!record || !record.latest) return record;
    const latest = normalizeObservation(record.latest);
    return {
      priceAtDigest: latest.price != null ? latest.price : record.priceAtDigest ?? null,
      onSaleAtDigest: latest.onSale === true,
      belowMedianAtDigest:
        latest.belowMedian === true ? true : latest.belowMedian === false ? false : record.belowMedianAtDigest ?? null,
      outSinceDigest: latest.inStock === false,
      offSaleSinceDigest: latest.onSale === false,
      aboveMedianSinceDigest: latest.belowMedian === false,
      latest
    };
  }

  function reasons(item) {
    const kinds = Array.isArray(item && item.kinds) ? item.kinds : [];
    const out = [];
    if (kinds.includes('restock')) out.push(COPY.restock);
    if (kinds.includes('priceDrop') && item.priceFrom != null && item.priceTo != null) {
      out.push(`${COPY.priceDrop} from $${money(item.priceFrom)} to $${money(item.priceTo)}`);
    }
    if (kinds.includes('deal')) {
      if (item.saleListed) out.push(COPY.saleListed);
      if (item.belowMedian) out.push(COPY.belowMedian);
    }
    return out;
  }

  function savedByUrl(savedItems) {
    const map = new Map();
    (Array.isArray(savedItems) ? savedItems : []).forEach((item) => {
      const url = allowlistedUrl(item && item.url);
      if (!url || map.has(url)) return;
      map.set(url, item);
    });
    return map;
  }

  function rowFromDiff(url, saved, diff) {
    const name = cleanName(saved && saved.name) || cleanName(diff && diff.name) || COPY.productFallback;
    return {
      url,
      name,
      kinds: diff.kinds.slice(),
      priceFrom: diff.priceFrom,
      priceTo: diff.priceTo,
      saleListed: !!diff.saleListed,
      belowMedian: !!diff.belowMedian,
      seenAt: diff.seenAt || null
    };
  }

  function currentRows(savedItems, byUrl) {
    const rows = [];
    savedByUrl(savedItems).forEach((saved, url) => {
      const diff = diffRecord(byUrl && byUrl[url]);
      if (!diff) return;
      rows.push(rowFromDiff(url, saved, diff));
    });
    return rows;
  }

  function filterIssued(issued, savedItems) {
    if (!issued || !Array.isArray(issued.items)) return [];
    const allowed = savedByUrl(savedItems);
    return issued.items
      .map((item) => {
        const url = allowlistedUrl(item && item.url);
        if (!url || !allowed.has(url)) return null;
        const saved = allowed.get(url);
        const kinds = Array.isArray(item.kinds) ? item.kinds.filter((k) => k === 'restock' || k === 'priceDrop' || k === 'deal') : [];
        if (!kinds.length) return null;
        return {
          url,
          name: cleanName(saved.name) || cleanName(item.name) || COPY.productFallback,
          kinds,
          priceFrom: CSI.positivePrice?.(item.priceFrom) ?? null,
          priceTo: CSI.positivePrice?.(item.priceTo) ?? null,
          saleListed: item.saleListed === true,
          belowMedian: item.belowMedian === true,
          seenAt: Number(item.seenAt) > 0 ? Number(item.seenAt) : null
        };
      })
      .filter(Boolean);
  }

  function viewFor(status, extra) {
    return {
      status,
      featureId: FEATURE_ID,
      items: [],
      message: '',
      issuedAt: null,
      ...(extra || {})
    };
  }

  /**
   * Pure digest decision. commit:true freezes a new digest when the 24h window
   * is open and at least one saved item changed. An empty check does not use the slot.
   */
  function evaluate(input) {
    const src = input || {};
    const now = Number(src.now);
    const clock = Number.isFinite(now) && now > 0 ? now : 0;
    const savedItems = Array.isArray(src.savedItems) ? src.savedItems : [];
    const digest = normalizeWatch(src.digest || src.watch || emptyWatch());
    const isPro = src.isPro === true;
    const commit = src.commit === true;

    if (!isPro) {
      return { view: viewFor('locked', { message: COPY.locked }), digest, persist: false };
    }
    if (!savedByUrl(savedItems).size) {
      return { view: viewFor('empty', { message: COPY.noSaved }), digest, persist: false };
    }

    const lastIssuedAt = Number(digest.lastIssuedAt);
    const withinCap = Number.isFinite(lastIssuedAt) && lastIssuedAt > 0 && clock - lastIssuedAt < DAY_MS;
    if (withinCap) {
      const items = filterIssued(digest.issued, savedItems);
      if (items.length) {
        return {
          view: viewFor('digest', { items, issuedAt: lastIssuedAt, message: COPY.listedNote }),
          digest,
          persist: false
        };
      }
      return { view: viewFor('quiet', { message: COPY.quiet }), digest, persist: false };
    }

    const items = currentRows(savedItems, digest.byUrl);
    if (!items.length || !commit || !clock) {
      if (!items.length) return { view: viewFor('quiet', { message: COPY.quiet }), digest, persist: false };
      return {
        view: viewFor('digest', { items, message: COPY.listedNote }),
        digest,
        persist: false
      };
    }

    const byUrl = { ...(digest.byUrl || {}) };
    savedByUrl(savedItems).forEach((_saved, url) => {
      if (byUrl[url]) byUrl[url] = commitRecord(byUrl[url]);
    });
    const next = {
      items: digest.items,
      byUrl,
      lastIssuedAt: clock,
      issued: { issuedAt: clock, items }
    };
    return {
      view: viewFor('digest', { items, issuedAt: clock, message: COPY.listedNote }),
      digest: next,
      persist: true
    };
  }

  function badgeCount(view) {
    if (!view || view.status !== 'digest' || !Array.isArray(view.items)) return 0;
    return view.items.length;
  }

  function normalizeWatch(raw) {
    const base = emptyWatch();
    if (!raw || typeof raw !== 'object') return base;
    const items = [];
    const seen = new Set();
    const incoming = Array.isArray(raw.items) ? raw.items : [];
    for (let i = 0; i < incoming.length && items.length < MAX_SAVED; i += 1) {
      const item = incoming[i];
      const url = allowlistedUrl(item && item.url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const savedAt = Number(item.savedAt);
      items.push({
        url,
        name: cleanName(item.name) || COPY.productFallback,
        adapterId: typeof item.adapterId === 'string' ? item.adapterId.slice(0, 32) : '',
        savedAt: Number.isFinite(savedAt) && savedAt > 0 ? savedAt : null
      });
    }
    const byUrl = {};
    items.forEach((item) => {
      const rec = raw.byUrl && raw.byUrl[item.url];
      if (!rec || typeof rec !== 'object' || !rec.latest) return;
      byUrl[item.url] = {
        priceAtDigest: CSI.positivePrice?.(rec.priceAtDigest) ?? null,
        onSaleAtDigest: rec.onSaleAtDigest === true,
        belowMedianAtDigest:
          rec.belowMedianAtDigest === true ? true : rec.belowMedianAtDigest === false ? false : null,
        outSinceDigest: rec.outSinceDigest === true,
        offSaleSinceDigest: rec.offSaleSinceDigest === true,
        aboveMedianSinceDigest: rec.aboveMedianSinceDigest === true,
        latest: normalizeObservation(rec.latest)
      };
    });
    const lastIssuedAt = Number(raw.lastIssuedAt);
    const issuedItems = filterIssued(raw.issued, items);
    return {
      items: items.slice(0, MAX_SAVED),
      byUrl,
      lastIssuedAt: Number.isFinite(lastIssuedAt) && lastIssuedAt > 0 ? lastIssuedAt : null,
      issued: issuedItems.length ? { issuedAt: Number(raw.issued && raw.issued.issuedAt) || lastIssuedAt, items: issuedItems } : null
    };
  }

  function syncBadge(count) {
    const n = Math.max(0, Math.min(99, Number(count) || 0));
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
      chrome.runtime.sendMessage({ type: 'CSI_SET_DIGEST_BADGE', count: n }, () => {
        void chrome.runtime?.lastError;
      });
    } catch {
      /* popup and content both tolerate a missing action badge */
    }
  }

  CSI.digest = {
    FEATURE_ID,
    DAY_MS,
    MAX_SAVED,
    STORAGE_KEY,
    COPY,
    emptyWatch,
    cleanName,
    allowlistedUrl,
    readListedStock,
    inStockFromListed,
    belowMedianState,
    normalizeObservation,
    applyObservation,
    sameCommercialObservation,
    diffRecord,
    commitRecord,
    reasons,
    evaluate,
    badgeCount,
    normalizeWatch,
    syncBadge
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
