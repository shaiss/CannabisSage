/**
 * MAIN-world bridge: store-specific product extraction + SPA route notify.
 * Strategies: sunnyside (React fiber), zenleaf (React fiber + DOM lab hints).
 */
(function () {
  'use strict';

  const SOURCE = 'cannabis-sage-bridge';

  function readReactProduct(el) {
    if (!el) return null;
    try {
      const reactKey = Object.keys(el).find(
        (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
      );
      if (!reactKey) return null;
      let fiber = el[reactKey];
      for (let i = 0; i < 20 && fiber; i++) {
        const props = fiber.memoizedProps || fiber.pendingProps;
        if (props) {
          if (props.product && typeof props.product === 'object') return props.product;
          if (props.inventoryItem && typeof props.inventoryItem === 'object') {
            const inv = props.inventoryItem;
            if (inv.raw && typeof inv.raw === 'object') return inv.raw;
            if (inv.product) return inv.product;
            if (inv.id || inv.sku) return inv;
          }
          // Zen Leaf / Sweed-style card props
          if (props.labTests || (props.name && props.price != null && (props.sku || props.id))) {
            return props;
          }
        }
        fiber = fiber.return || fiber._owner;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  function parsePrice(text) {
    if (!text) return null;
    const m = String(text).replace(/,/g, '').match(/\$\s*([0-9]+(?:\.[0-9]+)?)/);
    return m ? parseFloat(m[1]) : null;
  }

  function midRange(a, b) {
    if (a == null && b == null) return null;
    if (b == null) return a;
    if (a == null) return b;
    return (Number(a) + Number(b)) / 2;
  }

  function labValue(node) {
    if (!node) return null;
    const v = node.value;
    if (Array.isArray(v) && v.length) {
      const nums = v.map(Number).filter((n) => !Number.isNaN(n));
      if (!nums.length) return null;
      return midRange(Math.min(...nums), Math.max(...nums));
    }
    if (typeof v === 'number') return v;
    const n = parseFloat(v);
    return Number.isNaN(n) ? null : n;
  }

  function summarizeSunnyside(product, hostEl) {
    if (!product || typeof product !== 'object') return null;
    const id = product.id || product.productId || product.sku?.product?.id || product.sku?.id;
    const slug = product.slug || product.productSlug || product.handle;
    const name =
      product.ecomm_display_name ||
      product.bt_product_name ||
      product.name ||
      product.productName ||
      product.displayName ||
      product.sku?.product?.name;
    const potency = product.potency || product.sku?.product?.potency || {};
    const cannabinoids = {};
    const fields = {
      THC: product.thc ?? potency.thc ?? product.potency_thc ?? product.usable_thc,
      THCA: product.thca ?? potency.thca ?? product.potency_thca,
      CBD: product.cbd ?? potency.cbd ?? product.potency_cbd ?? product.usable_cbd,
      CBDA: product.cbda ?? potency.cbda,
      CBN: product.cbn ?? potency.cbn ?? product.usable_cbn,
      CBG: product.cbg ?? potency.cbg ?? product.usable_cbg
    };
    Object.entries(fields).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && !Number.isNaN(v)) cannabinoids[k] = v;
    });

    const host = hostEl || null;
    const hostText = host ? host.textContent || '' : '';
    const price =
      parsePrice(hostText) ||
      parsePrice(product.price) ||
      parsePrice(product.display_price) ||
      parsePrice(product.sku?.price);

    const weightText =
      (hostText.match(/(\d+(?:\.\d+)?\s*(?:g|mg|oz)\b)/i) || [])[1] ||
      product.weight ||
      product.displaySize ||
      null;

    const onSale =
      !!(host && /sale|special|%\s*off/i.test(hostText)) ||
      !!(host && host.querySelector && host.querySelector('s, del, [class*="special" i]')) ||
      !!(product.special || product.on_sale || product.is_special);

    return {
      id: id != null ? String(id) : undefined,
      slug: slug != null ? String(slug) : undefined,
      name: name != null ? String(name) : undefined,
      cannabinoids: Object.keys(cannabinoids).length ? cannabinoids : undefined,
      potency,
      terpenes: product.terpenes,
      price: price || undefined,
      weightText: weightText ? String(weightText) : undefined,
      onSale: !!onSale,
      strategy: 'sunnyside'
    };
  }

  function summarizeZenleaf(product, hostEl) {
    if (!product || typeof product !== 'object') return null;
    const id = product.id || product.productId;
    const name = product.name || product.displayName || product.title;
    const cannabinoids = {};
    const lab = product.labTests || product.lab_tests || {};
    const thc = labValue(lab.displayThc) ?? labValue(lab.thc);
    const cbd = labValue(lab.displayCbd) ?? labValue(lab.cbd);
    const cbn = labValue(lab.cbn);
    const cbg = labValue(lab.cbg);
    if (thc != null) cannabinoids.THC = thc;
    if (cbd != null) cannabinoids.CBD = cbd;
    if (cbn != null) cannabinoids.CBN = cbn;
    if (cbg != null) cannabinoids.CBG = cbg;

    let terpenes;
    const totalTerps = labValue(lab.terpenes);
    if (Array.isArray(product.terpenes) && product.terpenes.length) {
      terpenes = product.terpenes
        .map((t) => {
          if (!t || typeof t !== 'object') return null;
          const n = t.name || t.canonicalName;
          const pct = t.percentage ?? t.value ?? t.percent;
          if (!n || pct == null) return null;
          return { name: String(n), percentage: Number(pct) };
        })
        .filter(Boolean);
    }
    if ((!terpenes || !terpenes.length) && totalTerps != null) {
      terpenes = { 'Total Terpenes': totalTerps };
    }

    const host = hostEl || null;
    const hostText = host ? host.textContent || '' : '';
    const price =
      (product.promoPrice != null ? Number(product.promoPrice) : null) ||
      (product.price != null ? Number(product.price) : null) ||
      parsePrice(hostText);

    const unit = product.unitSize;
    const weightText = unit
      ? `${unit.value}${unit.unitAbbr || ''}`
      : (hostText.match(/(\d+(?:\.\d+)?\s*(?:g|mg|oz)\b)/i) || [])[1] || null;

    const onSale =
      (product.promoPrice != null &&
        product.price != null &&
        Number(product.promoPrice) < Number(product.price)) ||
      !!(host && /\bSale\b|\d+\s*%\s*Off|Currently\s*\$/i.test(hostText));

    // Prefer product page path from nearby link
    let slug;
    const link =
      host?.querySelector?.('a[data-testid="product-card-title-link"]') ||
      host?.querySelector?.('a[href*="/menu/"]');
    if (link) {
      const href = link.getAttribute('href') || link.href;
      if (href) slug = href.startsWith('http') ? new URL(href).pathname : href.split(/[?#]/)[0];
    }

    return {
      id: id != null ? String(id) : undefined,
      slug: slug || undefined,
      name: name != null ? String(name) : undefined,
      cannabinoids: Object.keys(cannabinoids).length ? cannabinoids : undefined,
      terpenes,
      price: price || undefined,
      weightText: weightText ? String(weightText) : undefined,
      onSale: !!onSale,
      strategy: 'zenleaf'
    };
  }

  function detectStrategy() {
    const host = location.hostname.replace(/^www\./, '');
    if (host === 'sunnyside.shop') return 'sunnyside';
    if (host === 'zenleafdispensaries.com') return 'zenleaf';
    return 'sunnyside';
  }

  function summarize(product, hostEl, strategy) {
    if (strategy === 'zenleaf') return summarizeZenleaf(product, hostEl);
    return summarizeSunnyside(product, hostEl);
  }

  function extractListing(marker, strategy) {
    const safeMarker = marker
      ? typeof CSS !== 'undefined' && CSS.escape
        ? CSS.escape(marker)
        : String(marker).replace(/["\\]/g, '')
      : '';
    const el = safeMarker ? document.querySelector(`[data-csi-bridge-id="${safeMarker}"]`) : null;
    let host = el;
    if (strategy === 'zenleaf') {
      host = el?.closest('[data-testid="product-card"]') || el?.closest('[role="listitem"]') || el;
    } else {
      host = el?.closest('[data-cy="ProductListItem"]')?.parentElement || el?.parentElement || el;
    }
    return summarize(readReactProduct(el || host), host, strategy);
  }

  function extractPdp(strategy) {
    const roots =
      strategy === 'zenleaf'
        ? [
            document.querySelector('[data-testid="product-details"]'),
            document.querySelector('main'),
            document.body
          ].filter(Boolean)
        : [
            document.querySelector('[data-cy*="Product"]'),
            document.querySelector('main'),
            document.body
          ].filter(Boolean);

    for (const root of roots) {
      const product = readReactProduct(root);
      if (product && (product.id || product.name || product.labTests)) {
        return summarize(product, root, strategy);
      }
      const kids = root.querySelectorAll('div, section, article');
      for (let i = 0; i < Math.min(kids.length, 100); i++) {
        const p = readReactProduct(kids[i]);
        if (p && (p.id || p.sku || p.labTests)) {
          return summarize(p, kids[i], strategy);
        }
      }
    }
    return null;
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE || data.direction !== 'request') return;

    const { requestId, action, marker, strategy: requested } = data;
    const strategy = requested || detectStrategy();
    let result = null;
    try {
      if (action === 'extractProduct') {
        result = extractListing(marker, strategy);
      } else if (action === 'extractPdp') {
        result = extractPdp(strategy);
      }
    } catch (err) {
      result = { error: String(err && err.message ? err.message : err) };
    }

    window.postMessage(
      {
        source: SOURCE,
        direction: 'result',
        requestId,
        result
      },
      '*'
    );
  });

  (function patchHistory() {
    let lastHref = location.href;
    const notify = () => {
      if (location.href === lastHref) return;
      lastHref = location.href;
      window.postMessage(
        {
          source: SOURCE,
          direction: 'route',
          href: location.href,
          path: location.pathname
        },
        '*'
      );
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
    window.addEventListener('popstate', notify);
    setInterval(notify, 800);
  })();
})();
