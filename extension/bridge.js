/**
 * MAIN-world bridge: React product props + listing price/sale/weight hints.
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
      for (let i = 0; i < 16 && fiber; i++) {
        const props = fiber.memoizedProps || fiber.pendingProps;
        if (props) {
          if (props.product && typeof props.product === 'object') return props.product;
          if (props.inventoryItem && typeof props.inventoryItem === 'object') {
            const inv = props.inventoryItem;
            if (inv.raw && typeof inv.raw === 'object') return inv.raw;
            if (inv.product) return inv.product;
            if (inv.id || inv.sku) return inv;
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

  function summarizeProduct(product, hostEl) {
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
      onSale: !!onSale
    };
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE || data.direction !== 'request') return;

    const { requestId, action, marker } = data;
    let result = null;
    try {
      if (action === 'extractProduct') {
        const safeMarker = marker
          ? typeof CSS !== 'undefined' && CSS.escape
            ? CSS.escape(marker)
            : String(marker).replace(/["\\]/g, '')
          : '';
        const el = safeMarker ? document.querySelector(`[data-csi-bridge-id="${safeMarker}"]`) : null;
        const host = el?.closest('[data-cy="ProductListItem"]')?.parentElement || el?.parentElement || el;
        result = summarizeProduct(readReactProduct(el), host);
      } else if (action === 'extractPdp') {
        // Walk from main product root
        const roots = [
          document.querySelector('[data-cy*="Product"]'),
          document.querySelector('main'),
          document.body
        ].filter(Boolean);
        for (const root of roots) {
          const product = readReactProduct(root);
          if (product && (product.id || product.name)) {
            result = summarizeProduct(product, root);
            break;
          }
          // Deep scan children with react fibers (limited)
          const kids = root.querySelectorAll('div, section, article');
          for (let i = 0; i < Math.min(kids.length, 80); i++) {
            const p = readReactProduct(kids[i]);
            if (p && (p.id || p.sku)) {
              result = summarizeProduct(p, kids[i]);
              break;
            }
          }
          if (result) break;
        }
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
})();
