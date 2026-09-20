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
    let html = `<strong style="color:${CSI.ACCENT_ORANGE};">Cannabinoids:</strong><br>`;
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
        return `<strong style="color:${CSI.ACCENT_ORANGE};">Terpenes:</strong><br>Total: ${CSI.parsePercent(terpenes['Total Terpenes'])}%`;
      }
      return '<strong>Terpenes:</strong><br><span class="csi-muted">Not listed on this page</span>';
    }
    return `<strong style="color:${CSI.ACCENT_ORANGE};">Terpenes:</strong><br>${parts.join(', ')}`;
  }

  function shouldSuppressListingCannabinoidBadges(adapter, cardEl) {
    if (!adapter || !cardEl) return false;
    if (typeof adapter.shouldSuppressListingCannabinoidBadges === 'function') {
      return adapter.shouldSuppressListingCannabinoidBadges(cardEl);
    }
    return false;
  }

  /**
   * Calm "what CannabisSage adds" chip.
   * One line + optional expand. No retailer brand names, no medical/effects claims,
   * no Upgrade button (soft Pro mention only — chemistry is not gated).
   * Same copy on listing and PDP so the chip never names the store.
   */
  const WHAT_SAGE_ADDS = {
    summary: 'Adds chem badges and compare beside the store page',
    detail:
      'Badges, a hover profile, and compare sit beside this menu — they do not replace the store page. Filters, taste-map, and more supported stores are optional Pro tools. Published chemistry stays available without Pro.'
  };

  function buildWhatSageAddsChip() {
    return `<details class="csi-adds-chip" data-csi-adds="1"><summary>${CSI.escapeHtml(
      WHAT_SAGE_ADDS.summary
    )}</summary><p class="csi-adds-detail">${CSI.escapeHtml(WHAT_SAGE_ADDS.detail)}</p></details>`;
  }

  /**
   * Floating PDP header. Chem stays in this panel (never the buy column).
   * Chip lives in the header so it is visible while loading and after render.
   */
  function buildPdpHeader({ showClose = false } = {}) {
    const close = showClose
      ? '<button type="button" class="csi-pdp-close" aria-label="Close">✕</button>'
      : '';
    return `<div class="csi-pdp-header"><div class="csi-pdp-header-row"><strong>CannabisSage</strong>${close}</div>${buildWhatSageAddsChip()}</div>`;
  }

  /**
   * Listing card chips (terp-only when retail already shows THC/CBD on-card).
   * Explainer chip is NOT repeated here — once per listing, in the filter bar.
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
    if (CSI.features?.can?.('dealBadges')) {
      const medianBadge = buildDealVsMedianBadge(product?.belowCategoryMedian);
      if (medianBadge) chips.push(medianBadge);
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

  /**
   * Deal vs category median. Words only in the badge; hover title repeats the
   * scraped price and computed median when both were passed in. No percent-off,
   * no retailer name, no effects language. Empty string when the flag is absent.
   */
  const DEAL_VS_MEDIAN_COPY = {
    badge: 'Below median',
    titleLead: 'Listed price is below the median listed price in this category on this menu.',
    strip: 'Below the median listed price in this category.'
  };

  function formatListedPrice(value) {
    const n = CSI.positivePrice ? CSI.positivePrice(value) : null;
    if (n == null) return '';
    return n.toFixed(2);
  }

  function buildDealVsMedianBadge(flag) {
    if (!flag || !CSI.dealVsCategoryMedian) return '';
    const checked = CSI.dealVsCategoryMedian(flag.price, flag.categoryMedian, flag.sampleCount);
    if (!checked) return '';
    const priceText = formatListedPrice(checked.price);
    const medianText = formatListedPrice(checked.categoryMedian);
    if (!priceText || !medianText) return '';
    const title = `${DEAL_VS_MEDIAN_COPY.titleLead} Listed $${priceText}; median $${medianText} from ${checked.sampleCount} listed prices.`;
    return `<span class="csi-badge csi-badge-deal" data-csi-deal-median="1" title="${CSI.escapeHtml(title)}">${CSI.escapeHtml(DEAL_VS_MEDIAN_COPY.badge)}</span>`;
  }

  function buildDealVsMedianStrip(flag) {
    if (!buildDealVsMedianBadge(flag)) return '';
    return `<p class="csi-deal-median" data-csi-deal-median="1">${CSI.escapeHtml(DEAL_VS_MEDIAN_COPY.strip)}</p>`;
  }

  /**
   * Provenance strip. Labels are generic. Each part is omitted when the
   * adapter did not supply it. "Tested" is only used for a real test date;
   * a packaged/mfg date is labeled Packaged. No retailer names.
   */
  const PROVENANCE_COPY = {
    source: 'Menu source',
    lab: 'Lab',
    tested: 'Tested',
    packaged: 'Packaged'
  };

  function provenanceParts(input) {
    const provenance = CSI.readProvenance ? CSI.readProvenance(input) : null;
    if (!provenance) return [];
    const parts = [];
    if (provenance.source) parts.push(`${PROVENANCE_COPY.source} ${provenance.source}`);
    if (provenance.lab) parts.push(`${PROVENANCE_COPY.lab} ${provenance.lab}`);
    if (provenance.timestamp) {
      if (provenance.timestampKind === 'tested') {
        parts.push(`${PROVENANCE_COPY.tested} ${provenance.timestamp}`);
      } else if (provenance.timestampKind === 'packaged') {
        parts.push(`${PROVENANCE_COPY.packaged} ${provenance.timestamp}`);
      } else {
        parts.push(provenance.timestamp);
      }
    }
    return parts;
  }

  function buildProvenanceStrip(input) {
    const parts = provenanceParts(input);
    if (!parts.length) return '';
    return `<p class="csi-provenance" data-csi-provenance="1">${parts
      .map((part) => `<span>${CSI.escapeHtml(part)}</span>`)
      .join('')}</p>`;
  }

  /**
   * Listing note only when a lab label or a real date is present.
   * A menu-source id alone stays on the PDP strip so cards stay quiet.
   */
  function buildProvenanceListingNote(input) {
    const provenance = CSI.readProvenance ? CSI.readProvenance(input) : null;
    if (!provenance || (!provenance.lab && !provenance.timestamp)) return '';
    return buildProvenanceStrip(provenance).replace(
      'class="csi-provenance"',
      'class="csi-provenance csi-provenance-listing"'
    );
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

  /**
   * Preference match on the floating product panel.
   * Uses the same taste-map object as the popup (saved prefs, or the
   * bundled seed when nothing is saved). No retailer names, no effects claims.
   * Quiet when there are no preferred terpenes or none of them are listed
   * on this product. The existing tasteMap entitlement decides visibility;
   * this copy does not add an upgrade control.
   */
  const PREFERENCE_MATCH_COPY = {
    chip: 'Preference match',
    lead: 'Preferred terpenes on this product',
    avoid: 'Also on your avoid list'
  };

  function preferredTerpeneEntries(tasteMap) {
    const preferred = tasteMap && tasteMap.preferredTerpenes;
    if (!preferred || typeof preferred !== 'object' || Array.isArray(preferred)) return [];
    return Object.entries(preferred).filter(([, weight]) => Number(weight) > 0);
  }

  /**
   * Null when prefs are missing or no preferred terpene is actually listed.
   * A total-terpene figure alone is not overlap. Score under the saved
   * minimum is not a match.
   */
  function summarizePreferenceMatch(product, tasteMap) {
    if (!product || !tasteMap) return null;
    const prefs = preferredTerpeneEntries(tasteMap);
    if (!prefs.length) return null;
    const terpMap = CSI.normalizeTerpeneMap(product.terpenes);
    const overlaps = [];
    prefs.forEach(([rawName, weight]) => {
      const name = CSI.canonicalizeTerpeneName(rawName) || String(rawName).trim();
      if (!name || /total\s*terpenes?/i.test(name)) return;
      const pct = terpMap[name];
      if (!(pct > 0)) return;
      overlaps.push({ name, percentage: pct, weight: Number(weight) });
    });
    if (!overlaps.length) return null;
    const score = CSI.scoreTasteMatch(product, tasteMap);
    if (score == null || !(score > 0)) return null;
    const rawMin = Number(tasteMap.minMatchScore);
    const minMatch = Number.isFinite(rawMin) ? rawMin : 0.35;
    if (score < minMatch) return null;
    const avoid = [];
    const seenAvoid = new Set();
    (Array.isArray(tasteMap.avoidTerpenes) ? tasteMap.avoidTerpenes : []).forEach((raw) => {
      const name = CSI.canonicalizeTerpeneName(raw) || String(raw || '').trim();
      if (!name || seenAvoid.has(name)) return;
      const pct = terpMap[name];
      if (!(pct > 0)) return;
      seenAvoid.add(name);
      avoid.push({ name, percentage: pct });
    });
    overlaps.sort((a, b) => b.percentage - a.percentage || a.name.localeCompare(b.name));
    return { score, minMatch, overlaps, avoid };
  }

  function formatListedPercent(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '';
    return num.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }

  function buildPreferenceMatchPanel(product, tasteMap) {
    if (!CSI.features?.can?.('tasteMap')) return '';
    const summary = summarizePreferenceMatch(product, tasteMap);
    if (!summary) return '';
    const COPY = PREFERENCE_MATCH_COPY;
    const pct = Math.round(summary.score * 100);
    const chips = summary.overlaps
      .map((row) => {
        const shown = formatListedPercent(row.percentage);
        const label = shown ? `${row.name} ${shown}%` : row.name;
        return `<span class="csi-pref-match-chip" data-csi-terp="${CSI.escapeHtml(row.name)}">${CSI.escapeHtml(label)}</span>`;
      })
      .join('');
    const avoid = summary.avoid.length
      ? `<p class="csi-pref-match-avoid">${CSI.escapeHtml(COPY.avoid)}: ${summary.avoid
          .map((row) => CSI.escapeHtml(row.name))
          .join(', ')}</p>`
      : '';
    return `<section class="csi-pref-match" data-csi-pref-match="1"><span class="csi-badge csi-badge-match">${CSI.escapeHtml(
      COPY.chip
    )} ${pct}%</span><p class="csi-pref-match-lead">${CSI.escapeHtml(
      COPY.lead
    )}</p><div class="csi-pref-match-chips">${chips}</div>${avoid}</section>`;
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

  /**
   * Static compare-overlap copy. No retailer names, no medical or effects claims.
   * Overlap ships with free compare — do not add an upgrade gate.
   */
  const TERP_OVERLAP_COPY = {
    title: 'Terpene overlap',
    shared: 'Shared',
    unique: 'Only on one',
    partial: 'On some',
    noneShared: 'No terpenes in common.',
    needAnother: 'Select another pick to see shared and unique terpenes.',
    noneNamed: 'No named terpenes listed for these picks.',
    noneNamedLoaded: 'No named terpenes listed on the picks that loaded.',
    allFailed: 'Could not load chemistry for these picks.',
    notEnoughLoaded: 'Not enough loaded picks to compare terpenes.',
    oneFailed: 'One pick could not be loaded. Overlap uses the picks that did.',
    someFailed: 'Some picks could not be loaded. Overlap uses the picks that did.'
  };

  function namedTerpeneMap(terpenes) {
    const map = CSI.normalizeTerpeneMap(terpenes);
    const named = {};
    Object.entries(map).forEach(([name, pct]) => {
      if (/total\s*terpenes?/i.test(name)) return;
      if (!(pct > 0)) return;
      named[name] = pct;
    });
    return named;
  }

  /**
   * Shared = named terpene listed on every loaded pick.
   * Unique = listed on exactly one loaded pick.
   * On some = listed on more than one, but not all (three-pick tray).
   * Failed fetches are left out of the sets. Total-only rows are not names.
   */
  function summarizeTerpeneOverlap(products) {
    const COPY = TERP_OVERLAP_COPY;
    const list = Array.isArray(products) ? products : [];
    const loaded = list.filter((p) => p && p.status !== 'error');
    const failedCount = list.length - loaded.length;
    const summary = {
      shared: [],
      unique: [],
      partial: [],
      failedCount,
      comparedCount: loaded.length,
      note: ''
    };

    if (list.length < 2) {
      summary.note = COPY.needAnother;
      return summary;
    }
    if (loaded.length < 2) {
      summary.note = loaded.length === 0 ? COPY.allFailed : COPY.notEnoughLoaded;
      return summary;
    }

    const namedMaps = loaded.map((p, i) => ({
      label: String(p.name || '').trim() || `Pick ${i + 1}`,
      map: namedTerpeneMap(p.terpenes)
    }));

    if (!namedMaps.some((m) => Object.keys(m.map).length)) {
      summary.note = failedCount ? COPY.noneNamedLoaded : COPY.noneNamed;
      return summary;
    }

    const names = new Set();
    namedMaps.forEach((m) => Object.keys(m.map).forEach((n) => names.add(n)));
    const total = namedMaps.length;
    Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .forEach((name) => {
        const holders = namedMaps.filter((m) => m.map[name] > 0);
        if (holders.length === total) summary.shared.push(name);
        else if (holders.length === 1) summary.unique.push({ name, label: holders[0].label });
        else summary.partial.push({ name, count: holders.length, total });
      });

    const notes = [];
    if (failedCount === 1) notes.push(COPY.oneFailed);
    else if (failedCount > 1) notes.push(COPY.someFailed);
    if (!summary.shared.length) notes.push(COPY.noneShared);
    summary.note = notes.join(' ');
    return summary;
  }

  function appendOverlapGroup(block, label, chips) {
    if (!chips.length) return;
    const heading = document.createElement('p');
    heading.className = 'csi-terp-overlap-label';
    heading.textContent = label;
    const row = document.createElement('div');
    row.className = 'csi-terp-overlap-chips';
    chips.forEach((chip) => row.appendChild(chip));
    block.appendChild(heading);
    block.appendChild(row);
  }

  function overlapChip(name, where) {
    const chip = document.createElement('span');
    chip.className = 'csi-terp-overlap-chip';
    const nameEl = document.createElement('span');
    nameEl.className = 'csi-terp-overlap-name';
    nameEl.setAttribute('data-csi-terp', name);
    nameEl.textContent = name;
    chip.appendChild(nameEl);
    if (where) {
      const whereEl = document.createElement('span');
      whereEl.className = 'csi-terp-overlap-where';
      whereEl.textContent = ` · ${where}`;
      chip.appendChild(whereEl);
    }
    return chip;
  }

  function renderTerpeneOverlap(container, productData) {
    const COPY = TERP_OVERLAP_COPY;
    const summary = summarizeTerpeneOverlap(productData);
    const block = document.createElement('section');
    block.className = 'csi-terp-overlap';
    block.setAttribute('data-csi-terp-overlap', '1');
    const title = document.createElement('h3');
    title.className = 'csi-terp-overlap-title';
    title.textContent = COPY.title;
    block.appendChild(title);
    if (summary.note) {
      const note = document.createElement('p');
      note.className = 'csi-terp-overlap-note';
      note.textContent = summary.note;
      block.appendChild(note);
    }
    appendOverlapGroup(
      block,
      COPY.shared,
      summary.shared.map((name) => overlapChip(name))
    );
    appendOverlapGroup(
      block,
      COPY.unique,
      summary.unique.map((item) => overlapChip(item.name, item.label))
    );
    appendOverlapGroup(
      block,
      COPY.partial,
      summary.partial.map((item) => overlapChip(item.name, `${item.count} of ${item.total}`))
    );
    container.appendChild(block);
    return summary;
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
      renderTerpeneOverlap(container, productData);
      const table = document.createElement('table');
      const header = document.createElement('tr');
      header.style.cssText = `background:${CSI.ACCENT_ORANGE};color:#fff;`;
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
          p.status === 'error' ? 'Could not load' : p.status === 'empty' ? 'No chem data' : 'OK'
        ),
        { always: true }
      );

      container.appendChild(table);
      CSI.glossary?.wireTerpeneClicks(container);
    }

    return { updateTrayButton, showSidebar };
  }

  CSI.ui = {
    WHAT_SAGE_ADDS,
    TERP_OVERLAP_COPY,
    DEAL_VS_MEDIAN_COPY,
    PROVENANCE_COPY,
    PREFERENCE_MATCH_COPY,
    summarizePreferenceMatch,
    summarizeTerpeneOverlap,
    formatCannabinoids,
    formatTerpenes,
    buildWhatSageAddsChip,
    buildPdpHeader,
    buildDealVsMedianBadge,
    buildDealVsMedianStrip,
    buildProvenanceStrip,
    buildProvenanceListingNote,
    buildPreferenceMatchPanel,
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
