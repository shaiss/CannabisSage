/**
 * Shared UI: tooltips, compare tray/sidebar, export, formatters.
 */
(function (global) {
  'use strict';
  const CSI = global.CSI;
  if (!CSI) throw new Error('CSI core missing');

  function formatCannabinoids(data) {
    if (!data || Object.keys(data).length === 0) {
      return '<strong>Cannabinoids:</strong><br><span class="csi-muted">Not listed on this page</span>';
    }
    let html = `<strong style="color:${CSI.SUNNYSIDE_ORANGE};">Cannabinoids:</strong><br>`;
    const entries = [];
    const add = (label, value) => {
      if (value == null) return;
      const num = CSI.parsePercent(value);
      if (num !== null) {
        if (num <= 0) return;
        entries.push(`${CSI.escapeHtml(label)}: ${num.toFixed(2)}%`);
        return;
      }
      const str = String(value).trim();
      if (str) entries.push(`${CSI.escapeHtml(label)}: ${CSI.escapeHtml(str)}`);
    };
    add('THC', data.THC ?? data.thc ?? data.totalTHC);
    add('THCA', data.THCA ?? data.thca);
    add('CBD', data.CBD ?? data.cbd ?? data.totalCBD);
    add('CBDA', data.CBDa ?? data.CBDA ?? data.cbda);
    add('CBN', data.CBN ?? data.cbn);
    add('CBG', data.CBG ?? data.cbg);
    add('CBC', data.CBC ?? data.cbc);
    if (!entries.length) {
      return '<strong>Cannabinoids:</strong><br><span class="csi-muted">Not listed on this page</span>';
    }
    html += entries.join('<br>');
    return html;
  }

  function formatTerpenes(terpenes) {
    if (!terpenes || (Array.isArray(terpenes) && !terpenes.length)) {
      return '<strong>Terpenes:</strong><br><span class="csi-muted">Not listed on this page</span>';
    }
    const map = CSI.normalizeTerpeneMap(terpenes);
    const parts = Object.entries(map)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(
        ([k, v]) =>
          `<span class="csi-terp-chip" data-csi-terp="${CSI.escapeHtml(k)}">${CSI.escapeHtml(k)}: ${v}%</span>`
      );
    if (!parts.length) {
      if (typeof terpenes === 'object' && terpenes['Total Terpenes'] != null) {
        return `<strong style="color:${CSI.SUNNYSIDE_ORANGE};">Terpenes:</strong><br>Total: ${CSI.parsePercent(terpenes['Total Terpenes'])}%`;
      }
      return '<strong>Terpenes:</strong><br><span class="csi-muted">Not listed on this page</span>';
    }
    return `<strong style="color:${CSI.SUNNYSIDE_ORANGE};">Terpenes:</strong><br>${parts.join(', ')}`;
  }

  function shouldSuppressListingCannabinoidBadges(adapter, cardEl) {
    if (!adapter || !cardEl) return false;
    if (typeof adapter.shouldSuppressListingCannabinoidBadges === 'function') {
      return adapter.shouldSuppressListingCannabinoidBadges(cardEl);
    }
    return false;
  }

  /**
   * Listing card chips (terp gap on Sunnyside when retail already shows THC/CBD).
   */
  function buildListingBadgeChips({ product, status, cardEl, adapter, tasteMap, minMatch = 0.35 }) {
    const chips = [];
    const thc = CSI.readThcPercent(product?.cannabinoids);
    const cbd = CSI.parsePercent(product?.cannabinoids?.CBD ?? product?.cannabinoids?.cbd);
    const top = CSI.topTerpene(product?.terpenes);
    const suppressCann = shouldSuppressListingCannabinoidBadges(adapter, cardEl);
    const match = product?.matchScore;

    if (status === 'loading') {
      chips.push(`<span class="csi-badge csi-badge-loading">Loading…</span>`);
    } else if (status === 'error') {
      chips.push(
        `<span class="csi-badge csi-badge-error" title="${CSI.escapeHtml(product?.error || 'Fetch failed')}">Chem unavailable</span>`
      );
    } else {
      const hasVisibleChem =
        !!top || (!suppressCann && (thc != null || (cbd != null && cbd > 0)));
      if (status === 'empty' || !hasVisibleChem) {
        chips.push(`<span class="csi-badge csi-badge-empty">No chem data</span>`);
      } else {
        if (!suppressCann) {
          if (thc != null) {
            chips.push(`<span class="csi-badge csi-badge-thc">THC ${thc.toFixed(1)}%</span>`);
          }
          if (cbd != null && cbd > 0) {
            chips.push(`<span class="csi-badge csi-badge-thc">CBD ${cbd.toFixed(1)}%</span>`);
          }
        }
        if (top) {
          chips.push(
            `<span class="csi-badge csi-badge-terp" data-csi-terp="${CSI.escapeHtml(top.name)}">${CSI.escapeHtml(top.name)}</span>`
          );
        }
      }
    }

    if (CSI.features?.can?.('tasteMap') && match != null && match >= minMatch) {
      chips.push(
        `<span class="csi-badge csi-badge-match" title="Taste-map match ${Math.round(match * 100)}%">Map match</span>`
      );
    }
    if (CSI.features?.can?.('dealBadges') && product?.onSale) {
      chips.push(`<span class="csi-badge csi-badge-deal">Sale</span>`);
    }
    if (CSI.features?.can?.('dealBadges') && product?.dollarsPerMg != null) {
      chips.push(`<span class="csi-badge csi-badge-deal">$${product.dollarsPerMg.toFixed(2)}/mg</span>`);
    }
    return chips;
  }

  function buildTooltipContent(insights, extra = {}) {
    if (!insights) {
      return `<div class="csi-status csi-status-error">No product data available.</div>`;
    }
    if (insights.status === 'loading') {
      return `<div class="csi-status csi-status-loading">Loading profile…</div>`;
    }
    if (insights.status === 'error' || insights.error) {
      return `<div class="csi-status csi-status-error">${CSI.escapeHtml(insights.error || 'Could not load product details.')}</div>`;
    }
    if (insights.status === 'empty') {
      return `<div class="csi-status csi-status-empty">No cannabinoid or terpene details were published for this product.</div>`;
    }
    let html = `${formatCannabinoids(insights.cannabinoids)}<br><br>${formatTerpenes(insights.terpenes)}`;
    if (extra.matchScore != null) {
      html += `<br><br><strong>Taste-map match:</strong> ${Math.round(extra.matchScore * 100)}%`;
    }
    if (insights.onSale) html += `<br><span class="csi-deal">On sale</span>`;
    if (insights.dollarsPerMg != null) {
      html += `<br><span class="csi-deal">≈ $${insights.dollarsPerMg.toFixed(3)}/mg THC*</span>`;
    }
    return html;
  }

  let tooltipEl = null;
  function ensureTooltip() {
    if (tooltipEl) return tooltipEl;
    if (!document.body) return null;
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'cannabis-sage-tooltip';
    document.body.appendChild(tooltipEl);
    return tooltipEl;
  }

  function showTooltip(x, y, content) {
    const tip = ensureTooltip();
    if (!tip) return;
    tip.innerHTML = content;
    tip.style.left = `${x + 15}px`;
    tip.style.top = `${y + 15}px`;
    tip.style.display = 'block';
    CSI.glossary?.wireTerpeneClicks(tip);
  }

  function hideTooltip() {
    if (tooltipEl) {
      tooltipEl.style.display = 'none';
      tooltipEl.innerHTML = '';
    }
  }

  function exportCompareJson(products) {
    return JSON.stringify(products, null, 2);
  }

  function exportCompareCsv(products) {
    const rows = [['name', 'url', 'THC', 'THCA', 'CBD', 'top_terpene', 'total_terpenes', 'match_score', 'price', 'on_sale']];
    products.forEach((p) => {
      const top = CSI.topTerpene(p.terpenes);
      rows.push([
        p.name || '',
        p.url || '',
        CSI.readThcPercent(p.cannabinoids) ?? '',
        CSI.readThcaPercent(p.cannabinoids) ?? '',
        CSI.parsePercent(p.cannabinoids?.CBD ?? p.cannabinoids?.cbd) ?? '',
        top ? top.name : '',
        CSI.totalTerpenes(p.terpenes) ?? '',
        p.matchScore != null ? p.matchScore : '',
        p.price ?? '',
        p.onSale ? 'yes' : ''
      ]);
    });
    return rows
      .map((r) =>
        r
          .map((cell) => {
            const s = String(cell ?? '');
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(',')
      )
      .join('\n');
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        return true;
      } catch {
        return false;
      } finally {
        ta.remove();
      }
    }
  }

  function createCompareTrayController(state) {
    // state: { getSelection, setSelection, persist, tasteMap }
    let trayBtn = null;
    let sidebar = null;

    function updateTrayButton() {
      if (!document.body) return;
      if (!trayBtn) {
        trayBtn = document.createElement('div');
        trayBtn.id = 'csi-compare-tray';
        trayBtn.innerHTML = `
          <button type="button" class="csi-tray-compare">Compare (0)</button>
          <button type="button" class="csi-tray-clear" title="Clear all selections">Clear</button>
        `;
        document.body.appendChild(trayBtn);
        trayBtn.querySelector('.csi-tray-compare').addEventListener('click', () => showSidebar());
        trayBtn.querySelector('.csi-tray-clear').addEventListener('click', async () => {
          state.setSelection([]);
          await state.persist();
          updateTrayButton();
          document.querySelectorAll('.cannabis-sage-select-btn.is-selected').forEach((btn) => {
            btn.classList.remove('is-selected');
            btn.textContent = 'Compare Select';
          });
          if (sidebar) {
            sidebar.remove();
            sidebar = null;
          }
        });
      }
      const count = state.getSelection().length;
      trayBtn.querySelector('.csi-tray-compare').textContent = `Compare (${count})`;
      trayBtn.style.display = count > 0 ? 'flex' : 'none';
    }

    async function showSidebar() {
      const selected = state.getSelection();
      if (!selected.length) return;
      if (sidebar) sidebar.remove();

      sidebar = document.createElement('div');
      sidebar.id = 'cannabis-sage-comparison-sidebar';
      sidebar.innerHTML = `
        <div class="csi-sidebar-header">
          <h2>Product Comparison</h2>
          <div class="csi-sidebar-actions">
            ${
              CSI.features?.can?.('exportCompare')
                ? `<button type="button" class="csi-export-json" title="Copy JSON">JSON</button>
            <button type="button" class="csi-export-csv" title="Copy CSV">CSV</button>`
                : `<button type="button" class="csi-export-locked" title="Pro feature">Export (Pro)</button>`
            }
            <button type="button" class="csi-sidebar-close" aria-label="Close">✕</button>
          </div>
        </div>
        <div id="cannabis-sage-comparison-loading" class="csi-status csi-status-loading">Loading product data…</div>
      `;
      document.body.appendChild(sidebar);
      sidebar.querySelector('.csi-sidebar-close').addEventListener('click', () => {
        sidebar.remove();
        sidebar = null;
      });

      const productData = [];
      let loaded = 0;

      const finalize = () => {
        const loading = sidebar.querySelector('#cannabis-sage-comparison-loading');
        if (loading) loading.remove();
        renderTable(sidebar, productData, state.tasteMap);
        const exportJson = sidebar.querySelector('.csi-export-json');
        const exportCsv = sidebar.querySelector('.csi-export-csv');
        const exportLocked = sidebar.querySelector('.csi-export-locked');
        exportJson?.addEventListener('click', async () => {
          const ok = await copyText(exportCompareJson(productData));
          exportJson.textContent = ok ? 'Copied' : 'Failed';
          setTimeout(() => (exportJson.textContent = 'JSON'), 1200);
        });
        exportCsv?.addEventListener('click', async () => {
          const ok = await copyText(exportCompareCsv(productData));
          exportCsv.textContent = ok ? 'Copied' : 'Failed';
          setTimeout(() => (exportCsv.textContent = 'CSV'), 1200);
        });
        exportLocked?.addEventListener('click', () => CSI.entitlement?.openUpgrade?.());
      };

      selected.forEach(async (product, index) => {
        const data = await CSI.fetchProductDetails(product.url);
        loaded += 1;
        const merged = { ...product };
        if (data && !data.error) {
          Object.assign(merged, {
            url: data.url || merged.url,
            name: data.name || merged.name,
            cannabinoids: { ...(merged.cannabinoids || {}), ...(data.cannabinoids || {}) },
            terpenes: data.terpenes || merged.terpenes,
            price: data.price ?? merged.price,
            status: data.status || 'ok'
          });
        } else {
          merged.fetchError = data?.error || 'Fetch failed';
          merged.status = 'error';
        }
        if (state.tasteMap) {
          merged.matchScore = CSI.scoreTasteMatch(merged, state.tasteMap);
        }
        productData[index] = merged;
        if (loaded === selected.length) finalize();
      });
    }

    function renderTable(container, productData, tasteMap) {
      const table = document.createElement('table');
      const header = document.createElement('tr');
      header.style.cssText = `background:${CSI.SUNNYSIDE_ORANGE};color:#fff;`;
      header.appendChild(document.createElement('th'));
      productData.forEach((p) => {
        const th = document.createElement('th');
        th.textContent = p.name || 'Product';
        header.appendChild(th);
      });
      table.appendChild(header);

      const addSection = (label) => {
        const tr = document.createElement('tr');
        tr.className = 'csi-subheader';
        const td = document.createElement('td');
        td.colSpan = 1 + productData.length;
        td.textContent = label;
        tr.appendChild(td);
        table.appendChild(tr);
      };

      const addRow = (label, values, opts = {}) => {
        const hasAny = values.some((v) => {
          if (v == null || v === '' || v === '—') return false;
          const n = CSI.parsePercent(v);
          return n === null ? true : n > 0;
        });
        if (!hasAny && !opts.always) return;
        const tr = document.createElement('tr');
        const nameCell = document.createElement('td');
        nameCell.textContent = label;
        nameCell.style.fontWeight = '600';
        if (opts.terpene) nameCell.setAttribute('data-csi-terp', label);
        tr.appendChild(nameCell);
        values.forEach((v) => {
          const td = document.createElement('td');
          td.textContent = v == null || v === '' ? '—' : String(v);
          tr.appendChild(td);
        });
        table.appendChild(tr);
      };

      addSection('Cannabinoids');
      ['THC', 'THCA', 'CBD', 'CBDA', 'CBN', 'CBG'].forEach((key) => {
        addRow(
          key,
          productData.map((p) => {
            const raw =
              key === 'THC'
                ? CSI.readThcPercent(p.cannabinoids)
                : key === 'THCA'
                  ? CSI.readThcaPercent(p.cannabinoids)
                  : CSI.parsePercent(p.cannabinoids?.[key] ?? p.cannabinoids?.[key.toLowerCase()]);
            return raw != null ? `${raw}%` : '—';
          })
        );
      });

      const terpMaps = productData.map((p) => CSI.normalizeTerpeneMap(p.terpenes));
      const names = new Set();
      terpMaps.forEach((m) => Object.keys(m).forEach((n) => names.add(n)));
      if (names.size) {
        addSection('Terpenes (tap name for aroma note)');
        Array.from(names)
          .sort()
          .forEach((name) => {
            addRow(
              name,
              productData.map((_, i) => {
                const v = terpMaps[i][name];
                return v != null && v > 0 ? `${v}%` : '—';
              }),
              { terpene: true }
            );
          });
      }

      addSection('Meta');
      addRow(
        'Taste-map match',
        productData.map((p) =>
          p.matchScore != null ? `${Math.round(p.matchScore * 100)}%` : '—'
        ),
        { always: true }
      );
      addRow(
        'Price',
        productData.map((p) => (p.price != null ? `$${p.price}` : '—')),
        { always: true }
      );
      addRow(
        'On sale',
        productData.map((p) => (p.onSale ? 'Yes' : '—')),
        { always: true }
      );
      addRow(
        'Status',
        productData.map((p) =>
          p.status === 'error' ? p.fetchError || 'Error' : p.status === 'empty' ? 'No chem data' : 'OK'
        ),
        { always: true }
      );

      const failed = productData.filter((p) => p.status === 'error');
      if (failed.length) {
        const note = document.createElement('p');
        note.className = 'csi-status csi-status-error';
        note.textContent = `Some products could not be loaded: ${failed.map((p) => p.name || p.url).join(', ')}`;
        container.appendChild(note);
      }

      container.appendChild(table);
      CSI.glossary?.wireTerpeneClicks(container);
    }

    return { updateTrayButton, showSidebar };
  }

  CSI.ui = {
    formatCannabinoids,
    formatTerpenes,
    buildListingBadgeChips,
    buildTooltipContent,
    showTooltip,
    hideTooltip,
    exportCompareJson,
    exportCompareCsv,
    copyText,
    createCompareTrayController
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
