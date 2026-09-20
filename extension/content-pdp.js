/**
 * Product detail page (PDP) panel.
 */
(function () {
  'use strict';
  const CSI = globalThis.CSI;
  if (!CSI) return;

  const BRIDGE_SOURCE = 'cannabis-sage-bridge';
  let active = false;

  function requestPdpBridge(timeoutMs = 1000) {
    return new Promise((resolve) => {
      const requestId = `csi-pdp-${Date.now()}`;
      const onMessage = (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.source !== BRIDGE_SOURCE || data.direction !== 'result') return;
        if (data.requestId !== requestId) return;
        window.removeEventListener('message', onMessage);
        clearTimeout(timer);
        resolve(data.result || null);
      };
      const timer = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        resolve(null);
      }, timeoutMs);
      window.addEventListener('message', onMessage);
      window.postMessage(
        { source: BRIDGE_SOURCE, direction: 'request', requestId, action: 'extractPdp' },
        '*'
      );
    });
  }

  async function loadProfile() {
    const url = location.href.split(/[?#]/)[0];
    let product = {};

    let bridge = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      bridge = await requestPdpBridge();
      if (bridge && !bridge.error && (bridge.id || bridge.cannabinoids || bridge.name)) break;
      await new Promise((r) => setTimeout(r, 350));
    }
    if (bridge && !bridge.error) {
      const extracted = CSI.extractProductData(
        {
          id: bridge.id,
          slug: bridge.slug,
          name: bridge.name,
          cannabinoids: bridge.cannabinoids,
          potency: bridge.potency,
          terpenes: bridge.terpenes
        },
        url
      );
      product = { ...(extracted || {}), price: bridge.price, onSale: bridge.onSale, weightText: bridge.weightText };
    }

    const needsFetch =
      !CSI.hasCannabinoidInfo(product.cannabinoids) || !CSI.hasDetailedTerpeneBreakdown(product.terpenes);

    if (needsFetch) {
      const data = await CSI.fetchProductDetails(url);
      if (data.error) {
        return { ...product, url, status: 'error', error: data.error };
      }
      product = {
        ...product,
        url: data.url || url,
        name: data.name || product.name || document.querySelector('h1')?.textContent?.trim(),
        cannabinoids: { ...(product.cannabinoids || {}), ...(data.cannabinoids || {}) },
        terpenes: data.terpenes || product.terpenes,
        price: data.price ?? product.price ?? CSI.parsePrice(document.body.innerText),
        status: data.status || 'ok'
      };
    }

    const empty =
      !CSI.hasCannabinoidInfo(product.cannabinoids) && !CSI.hasTerpeneInfo(product.terpenes);
    product.status = empty ? 'empty' : product.status || 'ok';
    product.url = product.url || url;
    product.name = product.name || document.querySelector('h1')?.textContent?.trim() || 'Product';
    product.onSale = product.onSale || CSI.detectSale(document.body);
    product.price = product.price ?? CSI.parsePrice(document.body.innerText);
    const weightGrams = CSI.parseWeightGrams(product.weightText || document.body.innerText);
    product.dollarsPerMg = weightGrams
      ? CSI.dollarsPerMgThc(product.price, product.cannabinoids, weightGrams)
      : null;

    const taste = await CSI.storage.loadTasteMap();
    product.matchScore = CSI.scoreTasteMatch(product, taste);
    return product;
  }

  function applyPdpPanelBox(el) {
    if (!el) return;
    el.style.cssText = [
      'position:fixed',
      'top:72px',
      'right:12px',
      'left:auto',
      'width:min(340px, calc(100vw - 24px))',
      'max-height:calc(100vh - 96px)',
      'overflow-y:auto',
      'z-index:2147483646',
      'background:#fff',
      'border:3px solid #ff6b35',
      'border-radius:10px',
      'padding:12px 14px',
      'box-shadow:0 12px 32px rgba(0,0,0,.28)',
      'font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      'color:#2c3e50',
      'display:block',
      'visibility:visible',
      'opacity:1',
      'pointer-events:auto',
      'transform:none',
      'box-sizing:border-box'
    ].join(';');
  }

  function renderPanel(product) {
    document.querySelectorAll('#csi-pdp-panel,[data-csi-pdp]').forEach((n) => n.remove());
    const panel = document.createElement('div');
    panel.id = 'csi-pdp-panel';
    panel.setAttribute('data-csi-pdp', '1');
    applyPdpPanelBox(panel);

    let body = '';
    if (product.status === 'error') {
      body = `<div class="csi-status csi-status-error">${CSI.escapeHtml(product.error || 'Failed to load profile')}</div>`;
    } else if (product.status === 'empty') {
      body = `<div class="csi-status csi-status-empty">No cannabinoid or terpene details were published for this product.</div>`;
    } else {
      body = CSI.ui.buildTooltipContent(product, { matchScore: product.matchScore });
    }

    const dealBits = [];
    if (product.onSale) dealBits.push('<span class="csi-badge csi-badge-deal">Sale</span>');
    if (product.dollarsPerMg != null) {
      dealBits.push(`<span class="csi-badge csi-badge-deal">≈ $${product.dollarsPerMg.toFixed(3)}/mg THC*</span>`);
    }
    if (product.matchScore != null && product.matchScore >= 0.35) {
      dealBits.push(`<span class="csi-badge csi-badge-match">Map match ${Math.round(product.matchScore * 100)}%</span>`);
    }

    panel.innerHTML = `
      <div class="csi-pdp-header">
        <strong>CannabisSage</strong>
        <button type="button" class="csi-pdp-close" aria-label="Close">✕</button>
      </div>
      <div class="csi-pdp-deals">${dealBits.join(' ')}</div>
      <div class="csi-pdp-body">${body}</div>
      <div class="csi-pdp-actions">
        <button type="button" class="csi-pdp-compare">Add to compare</button>
      </div>
      <p class="csi-pdp-footnote">* $/mg uses listed price and estimated THC% × package weight when available. Not medical advice.</p>
    `;
    document.documentElement.appendChild(panel);
    CSI.glossary?.wireTerpeneClicks(panel);

    panel.querySelector('.csi-pdp-close').addEventListener('click', () => panel.remove());
    panel.querySelector('.csi-pdp-compare').addEventListener('click', async () => {
      const list = await CSI.storage.loadCompare();
      if (list.some((p) => p.url === product.url)) {
        panel.querySelector('.csi-pdp-compare').textContent = 'Already selected';
        return;
      }
      if (list.length >= CSI.MAX_COMPARE) {
        alert(`Maximum ${CSI.MAX_COMPARE} products in compare tray`);
        return;
      }
      list.push({
        url: product.url,
        name: product.name,
        cannabinoids: product.cannabinoids,
        terpenes: product.terpenes,
        price: product.price,
        onSale: product.onSale,
        matchScore: product.matchScore
      });
      await CSI.storage.saveCompare(list);
      panel.querySelector('.csi-pdp-compare').textContent = 'Added ✓';
    });
  }

  function teardownPdp() {
    active = false;
    document.getElementById('csi-pdp-panel')?.remove();
  }

  async function startPdp() {
    if (active) {
      // Re-entered same PDP mode (e.g. product→product SPA): refresh panel
      document.getElementById('csi-pdp-panel')?.remove();
    }
    active = true;
    CSI.log(`pdp start v${CSI.VERSION}`, location.href);
    await CSI.glossary.ensureGlossary();

    const mount = () => {
      if (!document.body) {
        setTimeout(mount, 50);
        return;
      }
      if (!active || !location.pathname.startsWith('/product/')) return;
      document.getElementById('csi-pdp-panel')?.remove();
      const loading = document.createElement('div');
      loading.id = 'csi-pdp-panel';
      loading.setAttribute('data-csi-pdp', '1');
      applyPdpPanelBox(loading);
      loading.innerHTML = `<div class="csi-pdp-header"><strong>CannabisSage</strong></div><div class="csi-status csi-status-loading">Loading profile…</div>`;
      (document.documentElement || document.body).appendChild(loading);
      loadProfile()
        .then((product) => {
          if (!active) return;
          renderPanel(product);
        })
        .catch((e) => {
          CSI.error(e);
          if (active) renderPanel({ status: 'error', error: e.message || 'Unexpected error' });
        });
    };
    mount();
  }

  CSI.routes = CSI.routes || {};
  CSI.routes.startPdp = startPdp;
  CSI.routes.teardownPdp = teardownPdp;
})();
