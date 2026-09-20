/**
 * CannabisSage content script
 * Runs on Sunnyside product listing pages (/products/*).
 */
(function () {
  'use strict';

  const VERSION = '1.0.0';
  const MAX_COMPARE = 3;
  const SUNNYSIDE_ORANGE = '#FF6B35';
  const SUNNYSIDE_DARK = '#2C3E50';

  const DEBUG =
    (typeof localStorage !== 'undefined' && localStorage.getItem('cannabisSageDebug') === '1') ||
    (typeof location !== 'undefined' && /[?&]cannabisSageDebug=1(?:&|$)/.test(location.search));

  function log(...args) {
    if (DEBUG) console.log('CannabisSage:', ...args);
  }

  function warn(...args) {
    if (DEBUG) console.warn('CannabisSage:', ...args);
  }

  function error(...args) {
    // Always surface real failures lightly; still avoid noisy POC spam.
    console.error('CannabisSage:', ...args);
  }

  /** Escape untrusted strings before inserting into extension UI HTML. */
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const selectedProducts = [];
  let tooltip = null;
  let sidebar = null;
  let compareButton = null;
  let lastListingPath = location.pathname;
  let mutationObserver = null;
  let enhanceTimer = null;
  let isEnhancing = false;

  const TERPENE_CANON = [
    { name: 'Beta-Caryophyllene', keys: ['beta-caryophyllene', 'b-caryophyllene', 'beta caryophyllene', 'caryophyllene'] },
    { name: 'Limonene', keys: ['limonene'] },
    { name: 'Humulene', keys: ['humulene'] },
    { name: 'Linalool', keys: ['linalool'] },
    { name: 'Beta-Myrcene', keys: ['beta-myrcene', 'b-myrcene', 'myrcene'] },
    { name: 'Beta-Pinene', keys: ['beta-pinene', 'b-pinene'] },
    { name: 'Alpha-Pinene', keys: ['alpha-pinene', 'a-pinene', 'pinene'] },
    { name: 'Ocimene', keys: ['ocimene'] },
    { name: 'Terpinolene', keys: ['terpinolene'] },
    { name: 'Nerolidol', keys: ['nerolidol'] },
    { name: 'Bisabolol', keys: ['bisabolol'] },
    { name: 'Caryophyllene Oxide', keys: ['caryophyllene oxide', 'caryophyllene-oxide'] },
    { name: 'Eucalyptol', keys: ['eucalyptol'] },
    { name: 'Camphene', keys: ['camphene'] },
    { name: 'Geraniol', keys: ['geraniol'] },
    { name: 'Valencene', keys: ['valencene'] },
    { name: 'Phellandrene', keys: ['alpha-phellandrene', 'beta-phellandrene', 'phellandrene'] }
  ];

  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function canonicalizeTerpeneName(raw) {
    const key = String(raw || '').toLowerCase().replace(/_/g, '-').trim();
    for (const entry of TERPENE_CANON) {
      if (entry.keys.some((k) => key.includes(k))) return entry.name;
    }
    return null;
  }

  function parsePercent(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isNaN(value) ? null : value;
    const m = String(value).trim().match(/([0-9]+(?:\.[0-9]+)?)/);
    if (!m) return null;
    const num = parseFloat(m[1]);
    return Number.isNaN(num) ? null : num;
  }

  function hasCannabinoidInfo(cannabinoids) {
    if (!cannabinoids || typeof cannabinoids !== 'object') return false;
    return Object.values(cannabinoids).some((value) => {
      if (value === null || value === undefined) return false;
      if (typeof value === 'number') return !Number.isNaN(value);
      if (typeof value === 'string') return value.trim().length > 0;
      return true;
    });
  }

  function hasTerpeneInfo(terpenes) {
    if (!terpenes) return false;
    if (Array.isArray(terpenes)) return terpenes.length > 0;
    if (typeof terpenes === 'object') return Object.keys(terpenes).length > 0;
    if (typeof terpenes === 'string') return terpenes.trim().length > 0;
    return false;
  }

  function hasDetailedTerpeneBreakdown(terpenes) {
    if (!terpenes) return false;
    const isTotalOnlyKey = (key) => /total\s*terpene/i.test(key);
    if (Array.isArray(terpenes)) {
      if (terpenes.length === 0) return false;
      return terpenes.some((item) => {
        if (typeof item === 'string') return !/total\s*terpene/i.test(item);
        if (item && typeof item === 'object') {
          if ('name' in item && typeof item.name === 'string') return true;
          return Object.keys(item).some((k) => !isTotalOnlyKey(k));
        }
        return false;
      });
    }
    if (typeof terpenes === 'object') {
      return Object.keys(terpenes).some((k) => !isTotalOnlyKey(k));
    }
    if (typeof terpenes === 'string') return !/total\s*terpene/i.test(terpenes);
    return false;
  }

  function extractTerpenesFromObject(source) {
    const results = [];
    if (!source || typeof source !== 'object') return results;

    const addResult = (name, pct) => {
      if (!name || pct === null || pct === undefined || Number.isNaN(pct)) return;
      const existing = results.find((t) => t.name === name);
      if (!existing) results.push({ name, percentage: pct });
      else if (pct > existing.percentage) existing.percentage = pct;
    };

    const scan = (obj, depth = 0) => {
      if (!obj || typeof obj !== 'object' || depth > 3) return;
      if (Array.isArray(obj)) {
        obj.forEach((item) => {
          if (item && typeof item === 'object' && 'name' in item && 'percentage' in item) {
            const name = canonicalizeTerpeneName(item.name) || String(item.name);
            addResult(name, parsePercent(item.percentage));
          } else {
            scan(item, depth + 1);
          }
        });
        return;
      }
      Object.entries(obj).forEach(([k, v]) => {
        const keyLc = String(k).toLowerCase();
        const maybeName = canonicalizeTerpeneName(keyLc);
        if (maybeName) {
          addResult(maybeName, parsePercent(v));
          return;
        }
        if (v && typeof v === 'object') {
          if ('name' in v && ('percentage' in v || 'percent' in v || 'value' in v)) {
            const name = canonicalizeTerpeneName(v.name) || String(v.name);
            addResult(name, parsePercent(v.percentage ?? v.percent ?? v.value));
            return;
          }
          scan(v, depth + 1);
        }
      });
    };

    scan(source, 0);
    return results.filter((t) => t.percentage !== null && t.percentage !== undefined && !Number.isNaN(t.percentage));
  }

  function getCachedProductData(el) {
    if (!el?.dataset?.csiProductData) return null;
    try {
      return JSON.parse(el.dataset.csiProductData);
    } catch (e) {
      warn('Failed to parse cached product data', e);
      return null;
    }
  }

  function storeProductData(el, partialData) {
    if (!el || !partialData) return;
    const existing = getCachedProductData(el) || {};
    const merged = {
      ...existing,
      ...partialData,
      cannabinoids: {
        ...(existing.cannabinoids || {}),
        ...(partialData.cannabinoids || {})
      }
    };

    if (partialData.terpenes !== undefined) {
      if (Array.isArray(partialData.terpenes)) {
        if (partialData.terpenes.length) merged.terpenes = partialData.terpenes;
      } else if (partialData.terpenes) {
        merged.terpenes = partialData.terpenes;
      }
    }

    if (partialData.url) merged.url = partialData.url;

    try {
      el.dataset.csiProductData = JSON.stringify(merged);
    } catch (e) {
      warn('Failed to cache product data', e);
    }
  }

  function buildProductUrl(idOrSlug) {
    if (!idOrSlug) return null;
    const cleaned = String(idOrSlug).replace(/^\/product\//, '').replace(/^\//, '');
    if (!cleaned) return null;
    return `https://www.sunnyside.shop/product/${cleaned}`;
  }

  function extractProductData(productObj, fallbackUrl) {
    if (!productObj || typeof productObj !== 'object') return null;

    const slug = productObj.slug || productObj.productSlug || productObj.permalink || productObj.handle;
    const productId = productObj.id || productObj.productId || productObj.slugId || productObj.sku;
    const url = buildProductUrl(slug) || buildProductUrl(productId) || fallbackUrl;
    const name =
      productObj.ecomm_display_name ||
      productObj.bt_product_name ||
      productObj.name ||
      productObj.productName ||
      productObj.displayName;

    const cannabinoids = {};
    const sourceCannabinoids = productObj.cannabinoids;
    if (sourceCannabinoids && typeof sourceCannabinoids === 'object') {
      Object.entries(sourceCannabinoids).forEach(([key, value]) => {
        if (value !== undefined && value !== null) cannabinoids[key.toUpperCase()] = value;
      });
    }

    const potency = productObj.potency || {};
    const cannabinoidFields = {
      THC: productObj.thc ?? potency.thc ?? productObj.potency_thc ?? productObj.bt_potency_thc ?? productObj.thcPercent ?? productObj.thc_percentage,
      THCA: productObj.thca ?? potency.thca ?? productObj.potency_thca ?? productObj.bt_potency_thca,
      CBD: productObj.cbd ?? potency.cbd ?? productObj.potency_cbd ?? productObj.bt_potency_cbd ?? productObj.cbdPercent ?? productObj.cbd_percentage,
      CBDA: productObj.cbda ?? potency.cbda ?? productObj.potency_cbda ?? productObj.bt_potency_cbda,
      CBN: productObj.cbn ?? potency.cbn ?? productObj.potency_cbn ?? productObj.bt_potency_cbn,
      CBG: productObj.cbg ?? potency.cbg ?? productObj.potency_cbg ?? productObj.bt_potency_cbg,
      CBC: productObj.cbc ?? potency.cbc ?? productObj.potency_cbc ?? productObj.bt_potency_cbc
    };

    Object.entries(cannabinoidFields).forEach(([key, value]) => {
      if (value !== undefined && value !== null && !Number.isNaN(value)) cannabinoids[key] = value;
    });

    const totalTHC = productObj.totalTHC ?? productObj.total_thc ?? potency.totalTHC ?? potency.total_thc ?? productObj.potency_thc_total ?? productObj.bt_potency_thc_total ?? productObj.usable_thc;
    const totalCBD = productObj.totalCBD ?? productObj.total_cbd ?? potency.totalCBD ?? potency.total_cbd ?? productObj.potency_cbd_total ?? productObj.bt_potency_cbd_total ?? productObj.usable_cbd;
    if (totalTHC !== undefined && totalTHC !== null && !Number.isNaN(totalTHC)) cannabinoids.totalTHC = totalTHC;
    if (totalCBD !== undefined && totalCBD !== null && !Number.isNaN(totalCBD)) cannabinoids.totalCBD = totalCBD;

    let terpenes = extractTerpenesFromObject(productObj);
    if (!terpenes.length) terpenes = extractTerpenesFromObject(productObj.potency);
    if (!terpenes.length) terpenes = productObj.terpenes;
    if (!terpenes || (Array.isArray(terpenes) && !terpenes.length)) {
      terpenes = productObj.terpeneProfile || productObj.terpene_profile || productObj.terpeneBlend;
    }
    if (!terpenes || (Array.isArray(terpenes) && !terpenes.length)) {
      const totalTerps = productObj.potency_terps ?? potency.terps ?? productObj.bt_potency_terps;
      if (totalTerps !== undefined && totalTerps !== null && !Number.isNaN(totalTerps)) {
        terpenes = { 'Total Terpenes': totalTerps };
      }
    }

    const result = {};
    if (url) result.url = url;
    if (name) result.name = String(name);
    if (Object.keys(cannabinoids).length) result.cannabinoids = cannabinoids;
    if (terpenes !== undefined) result.terpenes = terpenes;
    return Object.keys(result).length ? result : null;
  }

  function formatCannabinoids(data) {
    if (!data || Object.keys(data).length === 0) {
      return '<strong>Cannabinoids:</strong><br>Not listed';
    }

    let html = `<strong style="color: ${SUNNYSIDE_ORANGE};">Cannabinoids:</strong><br>`;
    const entries = [];

    function addEntry(label, value) {
      if (value === undefined || value === null) return;
      const num = parsePercent(value);
      if (num !== null) {
        if (num <= 0) return;
        entries.push(`${escapeHtml(label)}: ${num.toFixed(2)}%`);
        return;
      }
      const str = String(value).trim();
      if (!str) return;
      entries.push(`${escapeHtml(label)}: ${escapeHtml(str)}`);
    }

    addEntry('THC', data.THC ?? data.thc ?? data.totalTHC ?? data.total_thc ?? data.thcPercent ?? data.thc_percentage);
    addEntry('THCA', data.THCA ?? data.thca ?? data.totalTHCA ?? data.total_thca);
    addEntry('CBD', data.CBD ?? data.cbd ?? data.totalCBD ?? data.total_cbd ?? data.cbdPercent ?? data.cbd_percentage);
    addEntry('CBDA', data.CBDa ?? data.CBDA ?? data.cbda ?? data.totalCBDA ?? data.total_cbda);
    addEntry('CBN', data.CBN ?? data.cbn);
    addEntry('CBG', data.CBG ?? data.cbg);
    addEntry('CBC', data.CBC ?? data.cbc);

    if (entries.length === 0 && data.total) {
      Object.entries(data.total).forEach(([key, value]) => addEntry(key.toUpperCase(), value));
    }

    if (entries.length === 0) return '<strong>Cannabinoids:</strong><br>Not listed';
    html += entries.join('<br>');
    return html;
  }

  function formatTerpenes(terpenes) {
    if (!terpenes || (Array.isArray(terpenes) && terpenes.length === 0)) {
      return '<strong>Terpenes:</strong><br>Not listed';
    }

    let terpeneList = [];

    if (Array.isArray(terpenes)) {
      terpeneList = terpenes.reduce((acc, terp) => {
        if (terp && typeof terp === 'object' && 'name' in terp) {
          const val = terp.percentage ?? terp.value ?? terp.percent;
          const num = parsePercent(val);
          if (num !== null && num > 0) acc.push(`${escapeHtml(terp.name)}: ${num}%`);
          return acc;
        }
        if (typeof terp === 'string') {
          const num = parsePercent(terp);
          if (num === null || num > 0) acc.push(escapeHtml(terp));
          return acc;
        }
        if (terp && typeof terp === 'object') {
          const parts = Object.entries(terp)
            .filter(([, v]) => {
              const n = parsePercent(v);
              return n === null || n > 0;
            })
            .map(([k, v]) => {
              const n = parsePercent(v);
              return n === null ? `${escapeHtml(k)}: ${escapeHtml(v)}` : `${escapeHtml(k)}: ${n}%`;
            });
          if (parts.length) acc.push(parts.join(' '));
        }
        return acc;
      }, []);
    } else if (typeof terpenes === 'object') {
      terpeneList = Object.entries(terpenes)
        .filter(([, value]) => {
          const n = parsePercent(value);
          return n === null || n > 0;
        })
        .map(([key, value]) => {
          const n = parsePercent(value);
          return n === null ? `${escapeHtml(key)}: ${escapeHtml(value)}` : `${escapeHtml(key)}: ${n}%`;
        });
    } else if (typeof terpenes === 'string') {
      const n = parsePercent(terpenes);
      if (n === null || n > 0) terpeneList = [escapeHtml(terpenes)];
    }

    if (terpeneList.length === 0) return '<strong>Terpenes:</strong><br>Not listed';
    return `<strong style="color: ${SUNNYSIDE_ORANGE};">Terpenes:</strong><br>${terpeneList.join(', ')}`;
  }

  function buildTooltipContent(insights) {
    return `${formatCannabinoids(insights?.cannabinoids)}<br><br>${formatTerpenes(insights?.terpenes)}`;
  }

  function readReactProduct(el) {
    try {
      const reactKey = Object.keys(el).find(
        (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
      );
      if (!reactKey) return null;
      let fiber = el[reactKey];
      for (let i = 0; i < 12 && fiber; i++) {
        const props = fiber.memoizedProps || fiber.pendingProps;
        if (props) {
          if (props.product && typeof props.product === 'object') return props.product;
          if (props.inventoryItem && typeof props.inventoryItem === 'object') {
            // Inventory model may wrap product
            const inv = props.inventoryItem;
            if (inv.product) return inv.product;
            if (inv.id || inv.sku) return inv;
          }
          if (props.href && String(props.href).includes('/product/')) {
            return { id: String(props.href).split('/product/')[1]?.split(/[?#]/)[0] };
          }
        }
        fiber = fiber.return || fiber._owner;
      }
    } catch (e) {
      warn('React inspection failed', e);
    }
    return null;
  }

  function getProductUrl(cardEl) {
    if (!cardEl) return null;
    if (cardEl.dataset.csiUrl) return cardEl.dataset.csiUrl;

    // Prefer React product object (current Sunnyside SPA)
    const productObj = readReactProduct(cardEl);
    if (productObj) {
      const extracted = extractProductData(productObj, cardEl.dataset.csiUrl);
      if (extracted) {
        storeProductData(cardEl, extracted);
        if (extracted.url) {
          cardEl.dataset.csiUrl = extracted.url;
          return extracted.url;
        }
      }
    }

    const root = cardEl.closest('[data-cy="ProductListItem"]') || cardEl.closest('li') || cardEl.parentElement || cardEl;

    const linkSelectors = ['a[href*="/product/"]', '[href*="/product/"]', 'a[href]'];
    for (const selector of linkSelectors) {
      const link = root.querySelector?.(selector);
      if (!link) continue;
      const href = link.getAttribute('href') || link.href;
      if (href && href.includes('/product/')) {
        const url = href.startsWith('http') ? href.split(/[?#]/)[0] : `https://www.sunnyside.shop${href.split(/[?#]/)[0]}`;
        cardEl.dataset.csiUrl = url;
        return url;
      }
    }

    const attrCandidates = [cardEl, root];
    for (const node of attrCandidates) {
      if (!node?.attributes) continue;
      for (const attr of Array.from(node.attributes)) {
        const value = attr.value || '';
        if (value.includes('/product/')) {
          const match = value.match(/\/product\/([^/?#\s"']+)/);
          if (match) {
            const url = buildProductUrl(match[1]);
            cardEl.dataset.csiUrl = url;
            return url;
          }
        }
        if (/product|id|sku/i.test(attr.name)) {
          const idMatch = value.match(/(\d{5,})/);
          if (idMatch) {
            const url = buildProductUrl(idMatch[1]);
            cardEl.dataset.csiUrl = url;
            return url;
          }
        }
      }
    }

    return null;
  }

  function parseProductHtml(html, url) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const cannabinoids = {};
    const cannabinoidText = doc.body?.textContent || '';

    const thcMatch = cannabinoidText.match(/THC[:\s]+(\d+\.?\d*)%/i);
    if (thcMatch) cannabinoids.THC = thcMatch[1];
    const thcaMatch = cannabinoidText.match(/THCA[:\s]+(\d+\.?\d*)%/i);
    if (thcaMatch) cannabinoids.THCA = thcaMatch[1];
    const cbdMatch = cannabinoidText.match(/CBD[:\s]+(\d+\.?\d*)%/i);
    if (cbdMatch) cannabinoids.CBD = cbdMatch[1];
    const cbdaMatch = cannabinoidText.match(/CBDa[:\s]+(\d+\.?\d*)%/i);
    if (cbdaMatch) cannabinoids.CBDa = cbdaMatch[1];

    // Prefer JSON embedded in the page when present (SPA shells may have little HTML text)
    try {
      const scripts = Array.from(doc.querySelectorAll('script'));
      for (const script of scripts) {
        const text = script.textContent || '';
        if (!/potency|terpene|thc/i.test(text)) continue;
        // Look for product-like JSON blobs with an id and potency keys
        const jsonCandidates = text.match(/\{[^{}]{0,200}"(?:id|sku)"[^{}]{0,2000}\}/g) || [];
        for (const candidate of jsonCandidates.slice(0, 20)) {
          try {
            const obj = JSON.parse(candidate);
            const extracted = extractProductData(obj, url);
            if (extracted && (hasCannabinoidInfo(extracted.cannabinoids) || hasTerpeneInfo(extracted.terpenes))) {
              return { ...extracted, url };
            }
          } catch {
            /* ignore partial JSON */
          }
        }
      }
    } catch (e) {
      warn('Embedded JSON parse skipped', e);
    }

    const terpenes = [];
    const terpeneHeading = Array.from(doc.querySelectorAll('h6, h5, h4, h3')).find(
      (h) => h.textContent.trim().toLowerCase() === 'terpenes'
    );
    const terpeneSection = terpeneHeading ? terpeneHeading.closest('section, div, article') : null;
    const sectionText = (terpeneSection ? terpeneSection.innerText : doc.body?.innerText || '').trim();

    TERPENE_CANON.forEach(({ name, keys }) => {
      const synPattern = keys.map((s) => escapeRegExp(s)).join('|');
      const re = new RegExp(`(?:${synPattern})[\\n\\r\\t\\s:]*([0-9]+(?:\\.[0-9]+)?)%`, 'gi');
      let m;
      while ((m = re.exec(sectionText)) !== null) {
        const pct = parseFloat(m[1]);
        if (Number.isNaN(pct)) continue;
        const existing = terpenes.find((t) => t.name === name);
        if (!existing) terpenes.push({ name, percentage: pct });
        else if (pct > existing.percentage) existing.percentage = pct;
      }
    });

    if (terpenes.length === 0 && terpeneSection) {
      const percentNodes = Array.from(terpeneSection.querySelectorAll('*')).filter((el) =>
        /\d+(?:\.\d+)?%/.test(el.textContent || '')
      );
      percentNodes.forEach((node) => {
        const pctMatch = (node.textContent || '').match(/([0-9]+(?:\.[0-9]+)?)%/);
        if (!pctMatch) return;
        const pct = parseFloat(pctMatch[1]);
        const container = node.closest('div, li, p, span') || node.parentElement;
        if (!container) return;
        const texts = Array.from(container.querySelectorAll('*'))
          .map((el) => (el.textContent || '').trim())
          .filter((t) => t && !/%/.test(t) && /[a-zA-Z]/.test(t) && t.length <= 50);
        if (!texts.length) return;
        const nameCandidate = texts.sort((a, b) => b.length - a.length)[0];
        const normalized = nameCandidate
          .split(/\s+/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');
        if (!terpenes.find((t) => t.name === normalized)) {
          terpenes.push({ name: normalized, percentage: pct });
        }
      });
    }

    let terpeneResult;
    if (terpenes.length > 0) {
      terpeneResult = terpenes;
    } else {
      const totalTerpsMatch = (sectionText || cannabinoidText).match(/Total\s*Terpenes\s*:?[\s]*([0-9]+(?:\.[0-9]+)?)%/i);
      if (totalTerpsMatch) {
        const totalVal = parseFloat(totalTerpsMatch[1]);
        if (!Number.isNaN(totalVal)) terpeneResult = { 'Total Terpenes': totalVal };
      }
    }

    // Page title as name fallback
    const title = doc.querySelector('h1')?.textContent?.trim() || doc.title?.split('|')[0]?.trim();

    return {
      cannabinoids,
      terpenes: terpeneResult || terpenes,
      url,
      name: title || undefined
    };
  }

  function fetchProductDetails(url) {
    return new Promise((resolve) => {
      if (!url) {
        resolve({ error: 'Unable to determine product URL' });
        return;
      }

      try {
        chrome.runtime.sendMessage({ type: 'FETCH_PRODUCT_HTML', url }, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message || 'Extension messaging failed' });
            return;
          }
          if (!response || !response.ok) {
            resolve({ error: (response && response.error) || 'Failed to fetch product details' });
            return;
          }
          try {
            resolve(parseProductHtml(response.html, response.finalUrl || url));
          } catch (e) {
            warn('Parse error', e);
            resolve({ error: 'Failed to parse product data' });
          }
        });
      } catch (e) {
        resolve({ error: e.message || 'Failed to request product details' });
      }
    });
  }

  function createTooltip() {
    if (tooltip) return tooltip;
    if (!document.body) return null;
    tooltip = document.createElement('div');
    tooltip.id = 'cannabis-sage-tooltip';
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function showTooltip(x, y, content) {
    if (!tooltip && !createTooltip()) return;
    tooltip.innerHTML = content;
    tooltip.style.left = `${x + 15}px`;
    tooltip.style.top = `${y + 15}px`;
    tooltip.style.display = 'block';
  }

  function hideTooltip() {
    if (tooltip) {
      tooltip.style.display = 'none';
      tooltip.innerHTML = '';
    }
  }

  async function handleProductHover(event, cardEl) {
    let cachedProduct = getCachedProductData(cardEl);
    const url = getProductUrl(cardEl);
    if (!cachedProduct) cachedProduct = getCachedProductData(cardEl);

    const hasCachedCannabinoids = hasCannabinoidInfo(cachedProduct?.cannabinoids);
    const hasCachedTerpenes = hasTerpeneInfo(cachedProduct?.terpenes);
    const hasDetailedTerpenes = hasDetailedTerpeneBreakdown(cachedProduct?.terpenes);
    const hasAnyCachedInsights = hasCachedCannabinoids || hasCachedTerpenes;

    if (hasAnyCachedInsights) {
      showTooltip(event.pageX, event.pageY, buildTooltipContent(cachedProduct));
    } else {
      showTooltip(event.pageX, event.pageY, '<div style="text-align: center;">Loading…</div>');
    }

    if (!url) {
      if (!hasAnyCachedInsights) {
        showTooltip(
          event.pageX,
          event.pageY,
          '<div style="color: #b45309;">Unable to find product URL for this card.</div>'
        );
      }
      return;
    }

    const shouldFetch = !hasCachedCannabinoids || !hasDetailedTerpenes;
    if (!shouldFetch) return;

    log('Fetching', url);
    const data = await fetchProductDetails(url);
    if (data.error) {
      if (!hasAnyCachedInsights) {
        showTooltip(event.pageX, event.pageY, `<div style="color: #b91c1c;">${escapeHtml(data.error)}</div>`);
      }
      return;
    }

    // Guard empty parse results
    if (!hasCannabinoidInfo(data.cannabinoids) && !hasTerpeneInfo(data.terpenes)) {
      if (!hasAnyCachedInsights) {
        showTooltip(
          event.pageX,
          event.pageY,
          '<div>No cannabinoid or terpene details were found for this product.</div>'
        );
      }
      return;
    }

    storeProductData(cardEl, data);
    const updated = getCachedProductData(cardEl) || data;
    showTooltip(event.pageX, event.pageY, buildTooltipContent(updated));
  }

  function isLikelyProductCard(element) {
    if (!element) return false;
    if (element.matches?.('[data-cy="ProductListItem"]')) return true;
    if (element.closest?.('[data-cy="ProductListItem"]')) return true;

    const isInFilter = !!element.closest?.(
      'aside, [aria-label*="Filter" i], [aria-label*="filter"], [class*="filter" i], [id*="filter" i]'
    );
    if (isInFilter) return false;

    const root = element.closest?.('li') || element;
    const hasProductLink = !!root.querySelector?.('a[href*="/product/"], [href*="/product/"]');
    const hasImage = !!root.querySelector?.('img');
    const text = (root.textContent || '').trim();
    const hasPrice = /\$\s*\d/.test(text);
    return hasProductLink || (hasImage && hasPrice);
  }

  function findProductCards() {
    const primary = Array.from(document.querySelectorAll('[data-cy="ProductListItem"]'));
    if (primary.length) return primary;

    // Fallbacks for structural changes
    const fallbacks = [
      'main .cursor-pointer.border-radius-6',
      'ul[role="region"] li button',
      'main ul li button',
      'main [class*="product"] a[href*="/product/"]'
    ];

    for (const selector of fallbacks) {
      try {
        const nodes = Array.from(document.querySelectorAll(selector)).filter(isLikelyProductCard);
        if (nodes.length) {
          log('Using fallback selector', selector, nodes.length);
          return nodes;
        }
      } catch {
        /* invalid selector */
      }
    }
    return [];
  }

  function addSelectionButton(cardEl) {
    const host =
      cardEl.closest('[data-cy="ProductListItem"]')?.parentElement ||
      cardEl.closest('li') ||
      cardEl.parentElement ||
      cardEl;

    if (!host || host.querySelector('.cannabis-sage-select-btn')) return;
    if (!isLikelyProductCard(cardEl)) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cannabis-sage-select-btn';
    btn.textContent = 'Select';

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      const url = getProductUrl(cardEl);
      if (!url) {
        warn('Could not get URL for selection');
        btn.textContent = 'Unavailable';
        setTimeout(() => {
          btn.textContent = 'Select';
        }, 1500);
        return;
      }

      const index = selectedProducts.findIndex((p) => p.url === url);
      if (index > -1) {
        selectedProducts.splice(index, 1);
        btn.textContent = 'Select';
        btn.classList.remove('is-selected');
        updateCompareButton();
        return;
      }

      if (selectedProducts.length >= MAX_COMPARE) {
        alert(`Maximum ${MAX_COMPARE} products can be selected for comparison`);
        return;
      }

      const cached = getCachedProductData(cardEl) || {};
      const nameFromDom = (cardEl.textContent || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)[0];

      selectedProducts.push({
        url,
        name: cached.name || nameFromDom || 'Product',
        cannabinoids: cached.cannabinoids,
        terpenes: cached.terpenes
      });
      btn.textContent = 'Selected ✓';
      btn.classList.add('is-selected');
      updateCompareButton();
    });

    try {
      host.appendChild(btn);
    } catch (e) {
      error('Error inserting select button', e);
    }
  }

  function createCompareButton() {
    if (compareButton) {
      updateCompareButton();
      return;
    }
    if (!document.body) return;
    compareButton = document.createElement('button');
    compareButton.type = 'button';
    compareButton.id = 'cannabis-sage-compare-btn';
    compareButton.textContent = 'Compare (0)';
    compareButton.addEventListener('click', showComparisonSidebar);
    document.body.appendChild(compareButton);
  }

  function updateCompareButton() {
    if (!compareButton) return;
    const count = selectedProducts.length;
    compareButton.textContent = `Compare (${count})`;
    compareButton.style.display = count > 0 ? 'block' : 'none';
  }

  function showComparisonSidebar() {
    if (selectedProducts.length === 0) return;
    if (sidebar) sidebar.remove();

    sidebar = document.createElement('div');
    sidebar.id = 'cannabis-sage-comparison-sidebar';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;';

    const title = document.createElement('h2');
    title.textContent = 'Product Comparison';
    title.style.cssText = `color:${SUNNYSIDE_DARK};margin:0;font-size:1.25rem;`;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Close comparison');
    closeBtn.style.cssText =
      'background:none;border:none;font-size:24px;cursor:pointer;color:#2C3E50;padding:0;width:30px;height:30px;';
    closeBtn.addEventListener('click', () => sidebar.remove());

    header.appendChild(title);
    header.appendChild(closeBtn);
    sidebar.appendChild(header);

    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'cannabis-sage-comparison-loading';
    loadingDiv.textContent = 'Loading product data…';
    loadingDiv.style.cssText = 'text-align:center;padding:20px;';
    sidebar.appendChild(loadingDiv);
    document.body.appendChild(sidebar);

    const productData = [];
    let loadedCount = 0;

    selectedProducts.forEach(async (product, index) => {
      const data = await fetchProductDetails(product.url);
      loadedCount += 1;

      const merged = { ...product };
      if (data && !data.error) {
        if (data.url) merged.url = data.url;
        if (data.name && !merged.name) merged.name = data.name;
        if (data.cannabinoids && Object.keys(data.cannabinoids).length > 0) {
          merged.cannabinoids = { ...(merged.cannabinoids || {}), ...data.cannabinoids };
        }
        if (data.terpenes !== undefined) {
          const existingCount = Array.isArray(merged.terpenes)
            ? merged.terpenes.length
            : merged.terpenes && typeof merged.terpenes === 'object'
              ? Object.keys(merged.terpenes).length
              : 0;
          const incomingCount = Array.isArray(data.terpenes)
            ? data.terpenes.length
            : data.terpenes && typeof data.terpenes === 'object'
              ? Object.keys(data.terpenes).length
              : 0;
          if (incomingCount > 0 || existingCount === 0) merged.terpenes = data.terpenes;
        }
      } else if (data?.error) {
        merged.fetchError = data.error;
      }
      productData[index] = merged;

      if (loadedCount === selectedProducts.length) {
        displayComparisonTable(productData);
      }
    });
  }

  function displayComparisonTable(productData) {
    const loadingDiv = sidebar?.querySelector('#cannabis-sage-comparison-loading');
    if (loadingDiv) loadingDiv.remove();
    if (!sidebar) return;

    const table = document.createElement('table');
    const headerRow = document.createElement('tr');
    headerRow.style.cssText = `background:${SUNNYSIDE_ORANGE};color:white;`;
    const emptyHeader = document.createElement('th');
    emptyHeader.textContent = '';
    headerRow.appendChild(emptyHeader);

    productData.forEach((product) => {
      const th = document.createElement('th');
      th.textContent = product.name || 'Product';
      th.style.fontWeight = '600';
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);

    const canSep = document.createElement('tr');
    canSep.className = 'csi-subheader';
    const canTd = document.createElement('td');
    canTd.colSpan = 1 + productData.length;
    canTd.textContent = 'Cannabinoids';
    canSep.appendChild(canTd);
    table.appendChild(canSep);

    const preferredCannabinoids = ['THC', 'THCA', 'CBD', 'CBDA', 'CBN', 'CBG', 'CBC', 'totalTHC', 'totalCBD'];
    const readCannabinoid = (obj, key) => {
      if (!obj) return null;
      switch (key) {
        case 'THC':
          return obj.THC ?? obj.thc ?? obj.totalTHC ?? obj.total_thc ?? obj.thcPercent ?? obj.thc_percentage;
        case 'THCA':
          return obj.THCA ?? obj.thca ?? obj.totalTHCA ?? obj.total_thca;
        case 'CBD':
          return obj.CBD ?? obj.cbd ?? obj.totalCBD ?? obj.total_cbd ?? obj.cbdPercent ?? obj.cbd_percentage;
        case 'CBDA':
          return obj.CBDA ?? obj.CBDa ?? obj.cbda;
        case 'CBN':
          return obj.CBN ?? obj.cbn;
        case 'CBG':
          return obj.CBG ?? obj.cbg;
        case 'CBC':
          return obj.CBC ?? obj.cbc;
        case 'totalTHC':
          return obj.totalTHC ?? obj.total_thc ?? obj.usable_thc;
        case 'totalCBD':
          return obj.totalCBD ?? obj.total_cbd ?? obj.usable_cbd;
        default:
          return obj[key] ?? obj[key?.toUpperCase?.()] ?? obj[key?.toLowerCase?.()];
      }
    };

    const formatCell = (v) => {
      if (v === null || v === undefined || v === '') return '—';
      if (typeof v === 'number') return `${v}%`;
      const n = parsePercent(v);
      return n === null ? String(v) : `${n}%`;
    };

    const normalizeTerpenes = (terps) => {
      const map = {};
      if (!terps) return map;
      if (Array.isArray(terps)) {
        terps.forEach((t) => {
          if (t && typeof t === 'object' && t.name !== undefined) {
            const name = canonicalizeTerpeneName(t.name) || String(t.name);
            const num = parsePercent(t.percentage ?? t.value ?? t.percent);
            if (name && num !== null) map[name] = num;
          } else if (typeof t === 'string') {
            const name = canonicalizeTerpeneName(t) || t;
            const num = parsePercent(t);
            if (name && num !== null) map[name] = num;
          }
        });
        return map;
      }
      if (typeof terps === 'object') {
        Object.entries(terps).forEach(([k, v]) => {
          const name = canonicalizeTerpeneName(k) || k;
          const num = parsePercent(v);
          if (name && num !== null) map[name] = num;
        });
        return map;
      }
      if (typeof terps === 'string') {
        const num = parsePercent(terps);
        if (num !== null) map['Total Terpenes'] = num;
      }
      return map;
    };

    const extraCanna = new Set();
    productData.forEach((p) => {
      if (p.cannabinoids) {
        Object.keys(p.cannabinoids).forEach((k) => {
          if (!preferredCannabinoids.includes(k)) extraCanna.add(k);
        });
      }
    });
    const cannabinoidRows = [...preferredCannabinoids, ...Array.from(extraCanna).sort()];

    cannabinoidRows.forEach((label) => {
      const values = productData.map((p) => readCannabinoid(p.cannabinoids, label));
      const hasAnyNonZero = values.some((v) => {
        const n = parsePercent(v);
        return n !== null && n > 0;
      });
      if (!hasAnyNonZero) return;

      const row = document.createElement('tr');
      row.style.borderBottom = '1px solid #eee';
      const nameCell = document.createElement('td');
      nameCell.textContent = label;
      nameCell.style.fontWeight = '600';
      row.appendChild(nameCell);

      const cellRefs = [];
      values.forEach((v) => {
        const td = document.createElement('td');
        td.textContent = formatCell(v);
        cellRefs.push(td);
        row.appendChild(td);
      });
      table.appendChild(row);

      const nums = values.map((v) => {
        const n = parsePercent(v);
        return n === null || Number.isNaN(n) ? null : n;
      });
      const positives = nums.filter((n) => n !== null && n > 0);
      if (positives.length) {
        const uniq = Array.from(new Set(positives)).sort((a, b) => b - a);
        const max = uniq[0];
        const second = uniq.length > 1 ? uniq[1] : null;
        cellRefs.forEach((td, i) => {
          const n = nums[i];
          if (n === null || n === 0) td.classList.add('csi-muted');
          else if (n === max) td.classList.add('csi-max');
          else if (second !== null && n === second) td.classList.add('csi-second');
        });
      } else {
        cellRefs.forEach((td) => td.classList.add('csi-muted'));
      }
    });

    const terpeneMaps = productData.map((p) => normalizeTerpenes(p.terpenes));
    const terpeneNamesSet = new Set();
    terpeneMaps.forEach((m) => Object.keys(m).forEach((n) => terpeneNamesSet.add(n)));
    const terpeneNames = Array.from(terpeneNamesSet).sort((a, b) => a.localeCompare(b));

    if (terpeneNames.length) {
      const sep = document.createElement('tr');
      sep.className = 'csi-subheader';
      const sepTd = document.createElement('td');
      sepTd.colSpan = 1 + productData.length;
      sepTd.textContent = 'Terpenes';
      sep.appendChild(sepTd);
      table.appendChild(sep);
    }

    terpeneNames.forEach((name) => {
      const vals = productData.map((_, idx) => terpeneMaps[idx][name]);
      const hasAnyNonZero = vals.some((v) => {
        const n = parsePercent(v);
        return n !== null && n > 0;
      });
      if (!hasAnyNonZero) return;

      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      nameCell.textContent = name;
      nameCell.style.fontWeight = '600';
      row.appendChild(nameCell);

      const cellRefs = [];
      vals.forEach((v) => {
        const td = document.createElement('td');
        td.textContent = formatCell(v);
        cellRefs.push(td);
        row.appendChild(td);
      });
      table.appendChild(row);

      const nums = vals.map((v) => {
        const n = parsePercent(v);
        return n === null || Number.isNaN(n) ? null : n;
      });
      const positives = nums.filter((n) => n !== null && n > 0);
      if (positives.length) {
        const uniq = Array.from(new Set(positives)).sort((a, b) => b - a);
        const max = uniq[0];
        const second = uniq.length > 1 ? uniq[1] : null;
        cellRefs.forEach((td, i) => {
          const n = nums[i];
          if (n === null || n === 0) td.classList.add('csi-muted');
          else if (n === max) td.classList.add('csi-max');
          else if (second !== null && n === second) td.classList.add('csi-second');
        });
      } else {
        cellRefs.forEach((td) => td.classList.add('csi-muted'));
      }
    });

    // Show fetch errors if any product failed entirely
    const failed = productData.filter((p) => p.fetchError && !hasCannabinoidInfo(p.cannabinoids) && !hasTerpeneInfo(p.terpenes));
    if (failed.length) {
      const note = document.createElement('p');
      note.style.cssText = 'margin-top:16px;color:#b45309;font-size:13px;';
      note.textContent = `Some products could not be loaded: ${failed.map((p) => p.name || p.url).join(', ')}`;
      sidebar.appendChild(note);
    }

    if (!table.querySelector('tr:nth-child(3)')) {
      const empty = document.createElement('p');
      empty.textContent = 'No comparable cannabinoid or terpene values were available for the selected products.';
      sidebar.appendChild(empty);
    }

    sidebar.appendChild(table);
  }

  function cleanupStaleSelectButtons() {
    document.querySelectorAll('.cannabis-sage-select-btn').forEach((btn) => {
      const card = btn.closest('[data-cy="ProductListItem"]') || btn.parentElement;
      if (!isLikelyProductCard(card || btn)) btn.remove();
    });
  }

  function enhanceProducts() {
    if (!document.body) return;
    cleanupStaleSelectButtons();

    const cards = findProductCards();
    log(`Found ${cards.length} product cards`);
    if (!cards.length) return;

    let enhancedCount = 0;
    cards.forEach((card) => {
      if (card.dataset.csiEnhanced === 'true') return;
      if (!isLikelyProductCard(card)) return;

      card.dataset.csiEnhanced = 'true';
      enhancedCount += 1;

      card.addEventListener('mouseover', (e) => {
        handleProductHover(e, card);
      });
      card.addEventListener('mousemove', (e) => {
        if (tooltip && tooltip.style.display !== 'none') {
          tooltip.style.left = `${e.pageX + 15}px`;
          tooltip.style.top = `${e.pageY + 15}px`;
        }
      });
      card.addEventListener('mouseout', (e) => {
        // Avoid flicker when moving within the card
        if (e.relatedTarget && card.contains(e.relatedTarget)) return;
        hideTooltip();
      });

      addSelectionButton(card);
    });

    log(`Enhanced ${enhancedCount} cards`);
  }

  function scheduleEnhance() {
    if (isEnhancing) return;
    clearTimeout(enhanceTimer);
    enhanceTimer = setTimeout(() => {
      isEnhancing = true;
      try {
        enhanceProducts();
        createCompareButton();
      } catch (e) {
        error('enhanceProducts failed', e);
      } finally {
        isEnhancing = false;
      }
    }, 120);
  }

  function isOurNode(node) {
    if (!node || node.nodeType !== 1) return false;
    const id = node.id || '';
    return (
      id.startsWith('cannabis-sage-') ||
      (node.classList && node.classList.contains('cannabis-sage-select-btn')) ||
      (node.querySelector && node.querySelector('.cannabis-sage-select-btn, [id^="cannabis-sage-"]'))
    );
  }

  function setupMutationObserver() {
    if (!document.body || mutationObserver) return;
    mutationObserver = new MutationObserver((mutations) => {
      let relevant = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) {
            relevant = true;
            break;
          }
          if (!isOurNode(node)) {
            relevant = true;
            break;
          }
        }
        if (relevant) break;
      }
      if (relevant) scheduleEnhance();
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
  }

  function onSpaNavigation() {
    const path = location.pathname;
    if (!path.startsWith('/products/')) {
      hideTooltip();
      return;
    }
    if (path !== lastListingPath) {
      log('SPA navigation', lastListingPath, '->', path);
      lastListingPath = path;
      // Clear enhancement marks so cards on the new listing get wired
      document.querySelectorAll('[data-csi-enhanced="true"]').forEach((el) => {
        delete el.dataset.csiEnhanced;
      });
      document.querySelectorAll('.cannabis-sage-select-btn').forEach((btn) => btn.remove());
      selectedProducts.length = 0;
      updateCompareButton();
      if (sidebar) {
        sidebar.remove();
        sidebar = null;
      }
      hideTooltip();
    }
    scheduleEnhance();
  }

  function patchHistoryForSpa() {
    if (window.__cannabisSageHistoryPatched) return;
    window.__cannabisSageHistoryPatched = true;

    const notify = () => {
      // Defer so location is updated
      setTimeout(onSpaNavigation, 0);
    };

    const wrap = (methodName) => {
      const original = history[methodName];
      history[methodName] = function (...args) {
        const result = original.apply(this, args);
        notify();
        return result;
      };
    };

    wrap('pushState');
    wrap('replaceState');
    window.addEventListener('popstate', onSpaNavigation);
  }

  function addLoadIndicator() {
    if (!DEBUG || !document.body) return;
    if (document.getElementById('cannabis-sage-loaded')) return;
    const indicator = document.createElement('div');
    indicator.id = 'cannabis-sage-loaded';
    indicator.textContent = `CannabisSage v${VERSION}`;
    document.body.appendChild(indicator);
    setTimeout(() => indicator.remove(), 2500);
  }

  function init() {
    log(`init v${VERSION}`, location.href);
    patchHistoryForSpa();

    const start = () => {
      if (!document.body) {
        setTimeout(start, 50);
        return;
      }
      scheduleEnhance();
      setupMutationObserver();
      addLoadIndicator();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  }

  init();
})();
