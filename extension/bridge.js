/**
 * MAIN-world bridge: read React product props for the isolated content script.
 * Communicates via window.postMessage (reliable across extension worlds).
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

  function summarizeProduct(product) {
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

    return {
      id: id != null ? String(id) : undefined,
      slug: slug != null ? String(slug) : undefined,
      name: name != null ? String(name) : undefined,
      cannabinoids: Object.keys(cannabinoids).length ? cannabinoids : undefined,
      potency,
      terpenes: product.terpenes
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
        const target = marker ? document.querySelector(`[data-csi-bridge-id="${marker}"]`) : null;
        result = summarizeProduct(readReactProduct(target));
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
