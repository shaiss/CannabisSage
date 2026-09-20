/**
 * Terpene glossary (factual aroma notes + disclaimer).
 */
(function (global) {
  'use strict';
  const CSI = global.CSI;
  if (!CSI) throw new Error('CSI core missing');

  const FALLBACK = {
    disclaimer:
      'These notes describe commonly discussed aroma associations for terpenes found in cannabis flower and extracts. They are not medical advice, and individual experiences vary.',
    entries: {
      'Beta-Myrcene': 'Often associated with earthy, musky, or herbal aroma.',
      Limonene: 'Often associated with citrus aroma.',
      'Beta-Caryophyllene': 'Often associated with peppery or spicy aroma.',
      Linalool: 'Often associated with floral or lavender-like aroma.',
      Humulene: 'Often associated with hoppy or woody aroma.',
      'Alpha-Pinene': 'Often associated with pine aroma.',
      'Beta-Pinene': 'Often associated with pine or resinous aroma.',
      Terpinolene: 'Often associated with fresh, herbal, or fruity aroma.',
      Ocimene: 'Often associated with sweet, herbal, or woody aroma.',
      Nerolidol: 'Often associated with woody or floral aroma.',
      Bisabolol: 'Often associated with light floral aroma.',
      Eucalyptol: 'Often associated with minty or camphor aroma.',
      Camphene: 'Often associated with camphor or fir-like aroma.',
      Geraniol: 'Often associated with rose-like or fruity aroma.',
      Valencene: 'Often associated with citrus or wood aroma.',
      Phellandrene: 'Often associated with minty or citrus-pepper aroma.',
      'Caryophyllene Oxide': 'Often associated with woody or spicy aroma.'
    }
  };

  let glossary = FALLBACK;
  let loaded = false;

  async function ensureGlossary() {
    if (loaded) return glossary;
    try {
      const url = chrome.runtime.getURL('data/terpene-glossary.json');
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        glossary = {
          disclaimer: json.disclaimer || FALLBACK.disclaimer,
          entries: { ...FALLBACK.entries, ...(json.entries || {}) }
        };
      }
    } catch (e) {
      CSI.log('glossary load fallback', e);
    }
    loaded = true;
    return glossary;
  }

  function noteFor(name) {
    const canon = CSI.canonicalizeTerpeneName(name) || name;
    const entries = glossary.entries || {};
    return entries[canon] || entries[name] || null;
  }

  function showGlossaryPopover(anchorEl, terpeneName) {
    ensureGlossary().then(() => {
      document.querySelectorAll('.csi-glossary-pop').forEach((n) => n.remove());
      const note = noteFor(terpeneName);
      const pop = document.createElement('div');
      pop.className = 'csi-glossary-pop';
      pop.setAttribute('role', 'dialog');
      const title = CSI.canonicalizeTerpeneName(terpeneName) || terpeneName;
      pop.innerHTML = `
        <div class="csi-glossary-title">${CSI.escapeHtml(title)}</div>
        <div class="csi-glossary-body">${CSI.escapeHtml(note || 'No glossary note available for this terpene.')}</div>
        <div class="csi-glossary-disclaimer">${CSI.escapeHtml(glossary.disclaimer)}</div>
        <button type="button" class="csi-glossary-close">Close</button>
      `;
      document.body.appendChild(pop);
      const rect = anchorEl.getBoundingClientRect?.() || { left: 40, bottom: 80 };
      pop.style.left = `${Math.min(window.innerWidth - 320, Math.max(8, rect.left))}px`;
      pop.style.top = `${Math.min(window.innerHeight - 160, rect.bottom + 8 + windowY)}px`;
      pop.querySelector('.csi-glossary-close').addEventListener('click', () => pop.remove());
      setTimeout(() => {
        const dismiss = (e) => {
          if (!pop.contains(e.target)) {
            pop.remove();
            document.removeEventListener('click', dismiss, true);
          }
        };
        document.addEventListener('click', dismiss, true);
      }, 0);
    });
  }

  function wireTerpeneClicks(root) {
    if (!root) return;
    root.querySelectorAll('[data-csi-terp]').forEach((el) => {
      if (el.dataset.csiTerpWired) return;
      el.dataset.csiTerpWired = '1';
      el.style.cursor = 'pointer';
      el.title = 'Tap for aroma note (not medical advice)';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showGlossaryPopover(el, el.getAttribute('data-csi-terp') || el.textContent);
      });
    });
  }

  CSI.glossary = {
    ensureGlossary,
    noteFor,
    showGlossaryPopover,
    wireTerpeneClicks,
    getDisclaimer: () => glossary.disclaimer
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
