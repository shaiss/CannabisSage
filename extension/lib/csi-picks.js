/**
 * Pro “Picks for you” — filter then rank from the local taste profile
 * and already-cached menu rows. No network. Profile stays off the host page.
 */
(function (global) {
  'use strict';
  const CSI = global.CSI;
  if (!CSI) throw new Error('CSI core missing');

  const FEATURE_ID = 'picksForYou';
  const MAX_PICKS = 8;
  /** Soft rank add-ons after chem match; must not outrank a clearly stronger chem. */
  const RANK_REBUY_BOOST = 0.1;
  const RANK_LOYAL_BRAND_BOOST = 0.05;
  const SIZE_GRAMS = Object.freeze({
    '1g': 1,
    '3.5g': 3.5,
    '7g': 7,
    '14g': 14,
    '28g': 28
  });
  const SIZE_TOLERANCE = 0.12;

  const COPY = Object.freeze({
    title: 'Picks for you',
    hint: 'Pro. Ranks already-cached listings from your home and secondary stores using your local taste profile. Listed chemistry and price only — not a guarantee what’s still on the shelf.',
    listedNote: 'Listed, not guaranteed.',
    locked:
      'Picks for you is a Pro tool. It reads your local taste profile and already-cached menus — no new fetches.',
    upgrade: 'Upgrade',
    profileOff:
      'Turn on your local taste profile and save home or secondary stores, then visit a supported menu so listings can cache.',
    noStores: 'Set a home store (and optional secondary stores) in your local taste profile.',
    noCache:
      'No cached menu data yet for your profile stores. Open a supported menu in those stores so CannabisSage can save listed chem locally.',
    noMatches:
      'Nothing in the local cache matched your forms, sizes, ratio, brands, deal preference, and budget. Browse more listings or loosen the profile filters.',
    emptyTitle: 'No picks yet',
    refresh: 'Refresh picks',
    chemLiked: 'Listed liked terpene',
    chemAvoidClear: 'Avoid terpenes not listed',
    chemAvoidHit: 'Lists an avoid terpene',
    priceListed: 'Listed price',
    priceSale: 'Sale listed',
    priceBelowMedian: 'Below menu median',
    priceBudget: 'Within trip budget',
    priceOverBudget: 'Over trip budget',
    matchedForm: 'Matched form',
    matchedSize: 'Matched size',
    matchedRatio: 'Matched cannabinoid ratio',
    matchedBand: 'Matched THC band',
    rebuy: 'Marked re-buy',
    storeUnknown: 'Supported store',
    cacheAge: 'Cached'
  });

  function emptyResult(status, extra) {
    return {
      status,
      picks: [],
      featureId: FEATURE_ID,
      ...(extra || {})
    };
  }

  function profileStoreIds(profile) {
    if (!profile || profile.enabled !== true) return [];
    const out = [];
    const seen = new Set();
    [profile.homeStore, ...(profile.secondaryStores || [])].forEach((id) => {
      if (typeof id !== 'string' || !id) return;
      if (seen.has(id)) return;
      seen.add(id);
      out.push(id);
    });
    return out;
  }

  function productSizeKey(product) {
    const grams = CSI.parseWeightGrams?.(product && product.weightText);
    if (!(grams > 0)) return null;
    let best = null;
    Object.entries(SIZE_GRAMS).forEach(([key, target]) => {
      const rel = Math.abs(grams - target) / target;
      if (rel > SIZE_TOLERANCE) return;
      if (!best || rel < best.rel) best = { key, rel };
    });
    return best ? best.key : null;
  }

  function readCbdPercent(cannabinoids) {
    return CSI.parsePercent?.(
      cannabinoids?.CBD ?? cannabinoids?.cbd ?? cannabinoids?.totalCBD ?? cannabinoids?.total_cbd
    );
  }

  function readCbgPercent(cannabinoids) {
    return CSI.parsePercent?.(cannabinoids?.CBG ?? cannabinoids?.cbg ?? cannabinoids?.totalCBG);
  }

  function productRatioKey(product) {
    const thc = CSI.readListedThcPercent?.(product && product.cannabinoids);
    const cbd = readCbdPercent(product && product.cannabinoids);
    const cbg = readCbgPercent(product && product.cannabinoids);
    const thcN = thc != null && thc > 0 ? thc : 0;
    const cbdN = cbd != null && cbd > 0 ? cbd : 0;
    const cbgN = cbg != null && cbg > 0 ? cbg : 0;
    if (!(thcN > 0 || cbdN > 0 || cbgN > 0)) return null;
    if (cbgN >= 5 && cbgN >= Math.max(thcN, cbdN) * 0.5) return 'cbg-forward';
    if (cbdN >= 1 && thcN > 0) {
      const denom = Math.max(thcN, cbdN);
      if (Math.abs(thcN - cbdN) / denom <= 0.35) return 'balanced';
      if (cbdN > thcN) return 'cbd-forward';
    }
    if (cbdN > 0 && !(thcN > 0)) return 'cbd-forward';
    if (thcN > 0) return 'thc-forward';
    return null;
  }

  function productPotencyBand(product) {
    const thc = CSI.readListedThcPercent?.(product && product.cannabinoids);
    if (!(thc > 0)) return null;
    if (thc < 15) return 'under-15';
    if (thc < 25) return '15-25';
    return '25-plus';
  }

  function brandSkipped(profile, product) {
    const brand = CSI.profile?.normalizeBrandLabel?.(String((product && product.brand) || ''));
    if (!brand) return false;
    const key = brand.toLowerCase();
    return (profile.brandAvoid || []).some((b) => String(b).toLowerCase() === key);
  }

  function brandLoyalHit(profile, product) {
    const brand = CSI.profile?.normalizeBrandLabel?.(String((product && product.brand) || ''));
    if (!brand) return false;
    const key = brand.toLowerCase();
    return (profile.brandLoyal || []).some((b) => String(b).toLowerCase() === key);
  }

  function netListedPrice(product) {
    return CSI.positivePrice?.(product && product.price) ?? null;
  }

  function medianForEntry(entry, mediansByHost) {
    if (!mediansByHost || !entry) return null;
    const host = cacheHost(entry.url);
    const snap = host && mediansByHost[host];
    if (!snap || !snap.categories) return null;
    const categoryKey =
      (entry.data && entry.data.categoryKey) || entry.categoryKey || null;
    if (!categoryKey || !snap.categories[categoryKey]) return null;
    const stats = snap.categories[categoryKey];
    const median = CSI.positivePrice?.(stats && stats.median);
    const sampleCount = Number(stats && stats.sampleCount);
    if (median == null) return null;
    if (!Number.isFinite(sampleCount) || sampleCount < (CSI.MIN_CATEGORY_PRICE_SAMPLE || 3)) {
      return null;
    }
    return { median, sampleCount };
  }

  function cacheHost(url) {
    try {
      return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
      return null;
    }
  }

  function formatCacheAge(fetchedAt, now) {
    const ts = Number(fetchedAt);
    if (!Number.isFinite(ts) || ts <= 0) return '';
    const mins = Math.max(0, Math.floor(((Number(now) || Date.now()) - ts) / 60000));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 48) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function allowlistedUrl(url) {
    return !!CSI.profile?.productKeyFromUrl?.(url);
  }

  function buildTasteMapFromProfile(profile) {
    const preferredTerpenes = {};
    (profile.likedTerpenes || []).forEach((name) => {
      preferredTerpenes[name] = 0.85;
    });
    return {
      preferredTerpenes,
      avoidTerpenes: Array.isArray(profile.avoidTerpenes) ? profile.avoidTerpenes.slice() : [],
      preferHighTotalTerps: false,
      minMatchScore: 0
    };
  }

  function chemReasons(product, profile, chemScore) {
    const reasons = [];
    const terpMap = CSI.normalizeTerpeneMap?.(product.terpenes) || {};
    const likedHit = [];
    (profile.likedTerpenes || []).forEach((name) => {
      const pct = terpMap[name];
      if (pct != null && pct > 0) likedHit.push(name);
    });
    if (likedHit.length) {
      reasons.push(`${COPY.chemLiked}: ${likedHit.join(', ')}`);
    }
    const avoidHit = [];
    (profile.avoidTerpenes || []).forEach((name) => {
      const pct = terpMap[name];
      if (pct != null && pct > 0.05) avoidHit.push(name);
    });
    if (avoidHit.length) {
      reasons.push(`${COPY.chemAvoidHit}: ${avoidHit.join(', ')}`);
    } else if ((profile.avoidTerpenes || []).length) {
      reasons.push(COPY.chemAvoidClear);
    }
    if (chemScore != null && Number.isFinite(chemScore)) {
      reasons.push(`Chem match ${Math.round(chemScore * 100)}%`);
    }
    return reasons;
  }

  function priceReasons(product, profile, medianInfo, price) {
    const reasons = [];
    if (price != null) {
      reasons.push(`${COPY.priceListed}: $${price.toFixed(2)}`);
    }
    if (product && product.onSale) reasons.push(COPY.priceSale);
    if (medianInfo && price != null && price < medianInfo.median) {
      reasons.push(`${COPY.priceBelowMedian}: $${medianInfo.median.toFixed(2)}`);
    }
    if (profile.tripBudgetUsd != null && price != null) {
      if (price <= profile.tripBudgetUsd) {
        reasons.push(`${COPY.priceBudget}: $${profile.tripBudgetUsd}`);
      } else {
        reasons.push(`${COPY.priceOverBudget}: $${profile.tripBudgetUsd}`);
      }
    }
    return reasons;
  }

  function passesHardFilters(entry, profile, opts) {
    const product = entry && entry.data && typeof entry.data === 'object' ? entry.data : null;
    if (!product || product.status === 'error' || product.status === 'empty') {
      return { ok: false, reason: 'bad_row' };
    }
    const url = entry.url || product.url;
    if (!allowlistedUrl(url)) return { ok: false, reason: 'host' };

    const storeIds = opts && opts.storeIds;
    const adapterId =
      entry.adapterId || product.adapterId || (CSI.adapterIdFromUrl && CSI.adapterIdFromUrl(url));
    if (storeIds && storeIds.length && (!adapterId || !storeIds.includes(adapterId))) {
      return { ok: false, reason: 'store' };
    }

    if (brandSkipped(profile, product)) return { ok: false, reason: 'brand' };

    const flag = CSI.profile?.flagForProduct?.(profile, url);
    if (flag === 'never') return { ok: false, reason: 'never' };

    if ((profile.forms || []).length) {
      const form = CSI.productFormKey?.(product, url);
      if (!form || !profile.forms.includes(form)) return { ok: false, reason: 'form' };
    }

    if ((profile.sizes || []).length) {
      const size = productSizeKey(product);
      if (!size || !profile.sizes.includes(size)) return { ok: false, reason: 'size' };
    }

    if (profile.cannabinoidRatio) {
      const ratio = productRatioKey(product);
      if (!ratio || ratio !== profile.cannabinoidRatio) return { ok: false, reason: 'ratio' };
    }

    if (profile.potencyBandThc) {
      const band = productPotencyBand(product);
      if (!band || band !== profile.potencyBandThc) return { ok: false, reason: 'band' };
    }

    const price = netListedPrice(product);
    const dealTier = profile.dealTier || 'any';
    if (dealTier === 'sale') {
      if (!product.onSale) return { ok: false, reason: 'deal_sale' };
    } else if (dealTier === 'below-median') {
      const medianInfo = medianForEntry(entry, opts && opts.mediansByHost);
      if (!medianInfo || price == null || !(price < medianInfo.median)) {
        return { ok: false, reason: 'deal_median' };
      }
    }

    if (profile.tripBudgetUsd != null) {
      if (price == null || price > profile.tripBudgetUsd) return { ok: false, reason: 'budget' };
    }

    return { ok: true, product, url, adapterId, price, flag };
  }

  /**
   * Filter by form / size / ratio / band / skip brands / never-again / deal / budget,
   * then rank by chem match with re-buy / keep-brand as soft boosts, then net listed
   * price. Explainable reasons on each pick.
   */
  function rankPicks(input) {
    const opts = input || {};
    const isPro = opts.isPro === true || !!(CSI.features?.can?.(FEATURE_ID));
    if (!isPro) {
      return emptyResult('locked', { message: COPY.locked });
    }

    const profile = opts.profile;
    if (!profile || profile.enabled !== true || !CSI.profile?.isStoredProfile?.(profile)) {
      return emptyResult('profile_off', { message: COPY.profileOff });
    }

    const storeIds = profileStoreIds(profile);
    if (!storeIds.length) {
      return emptyResult('no_stores', { message: COPY.noStores });
    }

    const entries = Array.isArray(opts.cacheEntries) ? opts.cacheEntries : [];
    const storeEntries = entries.filter((row) => {
      if (!row || !row.url) return false;
      const adapterId =
        row.adapterId ||
        (row.data && row.data.adapterId) ||
        (CSI.adapterIdFromUrl && CSI.adapterIdFromUrl(row.url));
      return adapterId && storeIds.includes(adapterId);
    });
    if (!storeEntries.length) {
      return emptyResult('no_cache', { message: COPY.noCache });
    }

    const tasteMap = buildTasteMapFromProfile(profile);
    const now = Number.isFinite(opts.now) ? opts.now : Date.now();
    const scored = [];

    storeEntries.forEach((entry) => {
      const gate = passesHardFilters(entry, profile, {
        storeIds,
        mediansByHost: opts.mediansByHost
      });
      if (!gate.ok) return;

      const product = { ...gate.product, url: gate.url, price: gate.product.price };
      const chemScore = CSI.scoreTasteMatch?.(product, tasteMap);
      const chem = chemScore == null ? 0 : chemScore;
      const price = gate.price;
      const medianInfo = medianForEntry(entry, opts.mediansByHost);
      const filterReasons = [];
      const form = CSI.productFormKey?.(product, gate.url);
      const size = productSizeKey(product);
      const ratio = productRatioKey(product);
      const band = productPotencyBand(product);
      if (form && (profile.forms || []).includes(form)) {
        filterReasons.push(`${COPY.matchedForm}: ${form}`);
      }
      if (size && (profile.sizes || []).includes(size)) {
        filterReasons.push(`${COPY.matchedSize}: ${size}`);
      }
      if (ratio && profile.cannabinoidRatio === ratio) {
        filterReasons.push(`${COPY.matchedRatio}: ${CSI.profile.COPY.ratioLabels[ratio] || ratio}`);
      }
      if (band && profile.potencyBandThc === band) {
        filterReasons.push(
          `${COPY.matchedBand}: ${CSI.profile.COPY.potencyLabels[band] || band}`
        );
      }
      if (gate.flag === 'rebuy') filterReasons.push(COPY.rebuy);

      const reasons = [
        ...filterReasons,
        ...chemReasons(product, profile, chemScore),
        ...priceReasons(product, profile, medianInfo, price)
      ];

      const storeLabel =
        (CSI.adapterDisplayName && CSI.adapterDisplayName(gate.adapterId)) ||
        gate.adapterId ||
        COPY.storeUnknown;

      scored.push({
        url: gate.url,
        name: product.name ? String(product.name) : '',
        brand: product.brand || '',
        adapterId: gate.adapterId,
        storeLabel,
        fetchedAt: entry.fetchedAt || null,
        cacheAgeLabel: formatCacheAge(entry.fetchedAt, now),
        price,
        onSale: !!product.onSale,
        chemScore: chem,
        rebuy: gate.flag === 'rebuy',
        loyalBrand: brandLoyalHit(profile, product),
        reasons,
        listedNote: COPY.listedNote,
        cannabinoids: product.cannabinoids,
        terpenes: product.terpenes
      });
    });

    if (!scored.length) {
      return emptyResult('no_matches', { message: COPY.noMatches });
    }

    scored.sort((a, b) => {
      const as =
        a.chemScore +
        (a.rebuy ? RANK_REBUY_BOOST : 0) +
        (a.loyalBrand ? RANK_LOYAL_BRAND_BOOST : 0);
      const bs =
        b.chemScore +
        (b.rebuy ? RANK_REBUY_BOOST : 0) +
        (b.loyalBrand ? RANK_LOYAL_BRAND_BOOST : 0);
      if (bs !== as) return bs - as;
      const ap = a.price == null ? Number.POSITIVE_INFINITY : a.price;
      const bp = b.price == null ? Number.POSITIVE_INFINITY : b.price;
      if (ap !== bp) return ap - bp;
      return (a.name || '').localeCompare(b.name || '') || a.url.localeCompare(b.url);
    });

    const maxRaw = Number(opts.max);
    const max = Number.isFinite(maxRaw) ? Math.max(0, maxRaw) : MAX_PICKS;
    return {
      status: 'ok',
      featureId: FEATURE_ID,
      picks: scored.slice(0, max),
      storeIds,
      listedNote: COPY.listedNote
    };
  }

  /**
   * Load profile + TTL cache + optional category medians. Never fetches menus.
   */
  async function loadAndRank(opts) {
    const options = opts || {};
    const isPro =
      options.isPro === true ||
      !!(CSI.features?.can?.(FEATURE_ID));
    if (!isPro) return emptyResult('locked', { message: COPY.locked });

    const profile =
      options.profile ||
      (CSI.storage?.loadTasteProfile ? await CSI.storage.loadTasteProfile() : { enabled: false });
    const cacheEntries =
      options.cacheEntries ||
      (CSI.storage?.listPdpCache ? await CSI.storage.listPdpCache() : []);

    let mediansByHost = options.mediansByHost || null;
    if (!mediansByHost && CSI.storage?.loadCategoryMedians) {
      mediansByHost = {};
      const hosts = new Set();
      (cacheEntries || []).forEach((row) => {
        const host = cacheHost(row && row.url);
        if (host) hosts.add(host);
      });
      for (const host of hosts) {
        const snap = await CSI.storage.loadCategoryMedians(host);
        if (snap) mediansByHost[host] = snap;
      }
    }

    return rankPicks({
      profile,
      cacheEntries,
      mediansByHost,
      isPro: true,
      now: options.now,
      max: options.max
    });
  }

  CSI.picks = {
    FEATURE_ID,
    MAX_PICKS,
    SIZE_GRAMS,
    COPY,
    profileStoreIds,
    productSizeKey,
    productRatioKey,
    productPotencyBand,
    passesHardFilters,
    netListedPrice,
    formatCacheAge,
    allowlistedUrl,
    rankPicks,
    loadAndRank
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
