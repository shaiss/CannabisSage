// ==UserScript==
// @name         Sunnyside Product Insights POC
// @namespace    http://tampermonkey.net/
// @version      0.1.3
// @description  Show terpene and cannabinoid profiles on hover, compare up to 3 products
// @author       You
// @match        https://www.sunnyside.shop/products/flower*
// @include      https://www.sunnyside.shop/products/flower*
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';
    
    // IMMEDIATE TEST - This should appear first if script loads
    console.log('🔍 SUNNYSIDE INSIGHTS: Script file loaded!');
    console.log('🔍 SUNNYSIDE INSIGHTS: URL check:', window.location.href);
    console.log('🔍 SUNNYSIDE INSIGHTS: Should match:', window.location.href.match(/sunnyside\.shop\/products\/flower/));

    // Global state
    const selectedProducts = []; // Max 3 products
    let tooltip = null;
    let sidebar = null;
    let compareButton = null;
    // Removed global fetch guard; allow concurrent product detail requests

    // Sunnyside brand colors
    const SUNNYSIDE_ORANGE = '#FF6B35';
    const SUNNYSIDE_DARK = '#2C3E50';
    const SUCCESS_GREEN = '#1f883d';
    const SECOND_GREEN = '#6e7781';
    const MUTED_GRAY = '#9aa0a6';

    function hasCannabinoidInfo(cannabinoids) {
        if (!cannabinoids || typeof cannabinoids !== 'object') return false;
        return Object.values(cannabinoids).some(value => {
            if (value === null || value === undefined) return false;
            if (typeof value === 'number') return !Number.isNaN(value);
            if (typeof value === 'string') return value.trim().length > 0;
            return true;
        });
    }

    function escapeRegExp(str) {
        return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
            return terpenes.some(item => {
                if (typeof item === 'string') return !/total\s*terpene/i.test(item);
                if (item && typeof item === 'object') {
                    if ('name' in item && typeof item.name === 'string') return true;
                    const keys = Object.keys(item);
                    return keys.some(k => !isTotalOnlyKey(k));
                }
                return false;
            });
        }
        if (typeof terpenes === 'object') {
            const keys = Object.keys(terpenes);
            return keys.some(k => !isTotalOnlyKey(k));
        }
        if (typeof terpenes === 'string') return !/total\s*terpene/i.test(terpenes);
        return false;
    }

    // Canonical terpene names and common synonyms
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
        { name: 'Phellandrene', keys: ['alpha-phellandrene', 'beta-phellandrene', 'phellandrene'] },
    ];

    function canonicalizeTerpeneName(raw) {
        const key = String(raw || '').toLowerCase().replace(/_/g, '-').trim();
        for (const entry of TERPENE_CANON) {
            if (entry.keys.some(k => key.includes(k))) return entry.name;
        }
        return null;
    }

    function parsePercent(value) {
        if (value === null || value === undefined) return null;
        if (typeof value === 'number') return value;
        const str = String(value).trim();
        const m = str.match(/([0-9]+(?:\.[0-9]+)?)/);
        if (m) {
            const num = parseFloat(m[1]);
            if (!Number.isNaN(num)) return num;
        }
        return null;
    }

    function extractTerpenesFromObject(source) {
        const results = [];
        if (!source || typeof source !== 'object') return results;

        const addResult = (name, pct) => {
            if (!name || pct === null || pct === undefined || Number.isNaN(pct)) return;
            const existing = results.find(t => t.name === name);
            if (!existing) results.push({ name, percentage: pct });
            else if (pct > existing.percentage) existing.percentage = pct;
        };

        const scan = (obj, depth = 0) => {
            if (!obj || typeof obj !== 'object' || depth > 3) return;
            if (Array.isArray(obj)) {
                obj.forEach(item => {
                    if (item && typeof item === 'object' && 'name' in item && 'percentage' in item) {
                        const name = canonicalizeTerpeneName(item.name) || String(item.name);
                        const pct = parsePercent(item.percentage);
                        addResult(name, pct);
                    } else {
                        scan(item, depth + 1);
                    }
                });
                return;
            }
            Object.entries(obj).forEach(([k, v]) => {
                const keyLc = String(k).toLowerCase();
                // Direct numeric keys like potency.myrcene = 0.099
                const maybeName = canonicalizeTerpeneName(keyLc);
                if (maybeName) {
                    const pct = parsePercent(v);
                    addResult(maybeName, pct);
                    return;
                }
                // Objects like { name: 'Limonene', percent: 0.37 }
                if (v && typeof v === 'object') {
                    if ('name' in v && ('percentage' in v || 'percent' in v || 'value' in v)) {
                        const name = canonicalizeTerpeneName(v.name) || String(v.name);
                        const pct = parsePercent(v.percentage ?? v.percent ?? v.value);
                        addResult(name, pct);
                        return;
                    }
                }
                // Keys containing 'terp' may contain nested breakdowns
                if (keyLc.includes('terp')) {
                    scan(v, depth + 1);
                } else if (typeof v === 'object') {
                    // Shallow scan other objects as well
                    scan(v, depth + 1);
                }
            });
        };

        scan(source, 0);
        return results.filter(t => t.percentage !== null && t.percentage !== undefined && !Number.isNaN(t.percentage));
    }

    function buildTooltipContent(insights) {
        const cannabinoidsHtml = formatCannabinoids(insights?.cannabinoids);
        const terpenesHtml = formatTerpenes(insights?.terpenes);
        return `${cannabinoidsHtml}<br><br>${terpenesHtml}`;
    }

    function getCachedProductData(buttonElement) {
        if (!buttonElement?.dataset?.sunnysideProductData) return null;
        try {
            return JSON.parse(buttonElement.dataset.sunnysideProductData);
        } catch (error) {
            console.warn('Sunnyside Insights: Failed to parse cached product data', error);
            return null;
        }
    }

    function storeProductData(buttonElement, partialData) {
        if (!buttonElement || !partialData) return;
        let existing = getCachedProductData(buttonElement) || {};

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
                if (partialData.terpenes.length) {
                    merged.terpenes = partialData.terpenes;
                }
            } else if (partialData.terpenes) {
                merged.terpenes = partialData.terpenes;
            }
        }

        if (partialData.url) {
            merged.url = partialData.url;
        }

        try {
            buttonElement.dataset.sunnysideProductData = JSON.stringify(merged);
        } catch (error) {
            console.warn('Sunnyside Insights: Failed to cache product data', error, merged);
        }
    }

    function extractProductData(productObj, fallbackUrl) {
        if (!productObj || typeof productObj !== 'object') return null;

        const slug = productObj.slug || productObj.productSlug || productObj.permalink || productObj.handle;
        const productId = productObj.id || productObj.productId || productObj.slugId || productObj.sku;
        const urlFromProduct = slug ? `https://www.sunnyside.shop/product/${slug.toString().replace(/^\/product\//, '')}`
                                   : (productId ? `https://www.sunnyside.shop/product/${productId}` : undefined);
        const url = urlFromProduct || fallbackUrl;
        
        // Best-effort product name for comparison headers
        const name = productObj.ecomm_display_name || productObj.bt_product_name || productObj.name || productObj.productName || productObj.displayName;

        const cannabinoids = {};
        const sourceCannabinoids = productObj.cannabinoids;
        if (sourceCannabinoids && typeof sourceCannabinoids === 'object') {
            Object.entries(sourceCannabinoids).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    cannabinoids[key.toUpperCase()] = value;
                }
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
            if (value !== undefined && value !== null && !Number.isNaN(value)) {
                cannabinoids[key] = value;
            }
        });

        // Provide totals if present (formatCannabinoids will pick these up as fallbacks)
        const totalTHC = productObj.totalTHC ?? productObj.total_thc ?? potency.totalTHC ?? potency.total_thc ?? productObj.potency_thc_total ?? productObj.bt_potency_thc_total ?? productObj.usable_thc;
        const totalCBD = productObj.totalCBD ?? productObj.total_cbd ?? potency.totalCBD ?? potency.total_cbd ?? productObj.potency_cbd_total ?? productObj.bt_potency_cbd_total ?? productObj.usable_cbd;
        if (totalTHC !== undefined && totalTHC !== null && !Number.isNaN(totalTHC)) {
            cannabinoids.totalTHC = totalTHC;
        }
        if (totalCBD !== undefined && totalCBD !== null && !Number.isNaN(totalCBD)) {
            cannabinoids.totalCBD = totalCBD;
        }

        // Attempt to find detailed terpene breakdown anywhere in the product object
        let terpenes = extractTerpenesFromObject(productObj);
        if (!terpenes || terpenes.length === 0) {
            terpenes = extractTerpenesFromObject(productObj.potency);
        }
        // Otherwise try common top-level properties
        if (!terpenes || (Array.isArray(terpenes) && terpenes.length === 0)) {
            terpenes = productObj.terpenes;
        }
        if (!terpenes || (Array.isArray(terpenes) && !terpenes.length)) {
            terpenes = productObj.terpeneProfile || productObj.terpene_profile || productObj.terpeneBlend;
        }

        // Fallback to total terpenes percentage if breakdown isn't available
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

        if (Object.keys(result).length === 0) return null;
        return result;
    }

    // Helper to create tooltip element
    function createTooltip() {
        if (tooltip) return tooltip;
        
        // Wait for body to exist
        if (!document.body) {
            console.warn('Sunnyside Insights: document.body not ready');
            return null;
        }
        
        tooltip = document.createElement('div');
        tooltip.id = 'sunnyside-insights-tooltip';
        tooltip.style.cssText = `
            position: absolute;
            background: white;
            border: 2px solid ${SUNNYSIDE_ORANGE};
            border-radius: 8px;
            padding: 15px;
            z-index: 10000;
            max-width: 350px;
            display: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            line-height: 1.5;
        `;
        document.body.appendChild(tooltip);
        return tooltip;
    }

    // Show tooltip with content
    function showTooltip(x, y, content) {
        console.log('Sunnyside Insights: showTooltip called at', x, y);
        if (!tooltip) {
            const created = createTooltip();
            if (!created) {
                console.error('Sunnyside Insights: Failed to create tooltip');
                return; // Can't show tooltip if creation failed
            }
        }
        tooltip.innerHTML = content;
        tooltip.style.left = `${x + 15}px`;
        tooltip.style.top = `${y + 15}px`;
        tooltip.style.display = 'block';
        console.log('Sunnyside Insights: Tooltip shown at', tooltip.style.left, tooltip.style.top);
    }

    // Hide tooltip
    function hideTooltip() {
        if (tooltip) {
            tooltip.style.display = 'none';
            tooltip.innerHTML = '';
        }
    }

    // Format cannabinoid data for display
    function formatCannabinoids(data) {
        if (!data || Object.keys(data).length === 0) {
            return '<strong>Cannabinoids:</strong><br>N/A';
        }

        let html = '<strong style="color: ' + SUNNYSIDE_ORANGE + ';">Cannabinoids:</strong><br>';
        const entries = [];

        function addEntry(label, value) {
            if (value === undefined || value === null) return;
            const num = parsePercent(value);
            // Hide zeros (0 or 0.0 etc.)
            if (num !== null) {
                if (num <= 0) return;
                entries.push(`${label}: ${num.toFixed(2)}%`);
                return;
            }
            // Non-numeric fallbacks
            const str = String(value).trim();
            if (!str) return;
            entries.push(`${label}: ${str}`);
        }

        addEntry('THC', data.THC ?? data.thc ?? data.totalTHC ?? data.total_thc ?? data.thcPercent ?? data.thc_percentage);
        addEntry('THCA', data.THCA ?? data.thca ?? data.totalTHCA ?? data.total_thca);
        addEntry('CBD', data.CBD ?? data.cbd ?? data.totalCBD ?? data.total_cbd ?? data.cbdPercent ?? data.cbd_percentage);
        addEntry('CBDA', data.CBDa ?? data.cbda ?? data.totalCBDA ?? data.total_cbda);
        addEntry('CBN', data.CBN ?? data.cbn);
        addEntry('CBG', data.CBG ?? data.cbg);
        addEntry('CBC', data.CBC ?? data.cbc);

        // Also check if data itself is numeric or string
        if (entries.length === 0 && typeof data === 'number') {
            entries.push(`THC: ${data}%`);
        }

        // Check nested total data
        if (entries.length === 0 && data.total) {
            Object.entries(data.total).forEach(([key, value]) => {
                addEntry(key.toUpperCase(), value);
            });
        }

        if (entries.length === 0) {
            return '<strong>Cannabinoids:</strong><br>N/A';
        }

        html += entries.join('<br>');
        return html;
    }

    // Format terpene data for display
    function formatTerpenes(terpenes) {
        if (!terpenes || (Array.isArray(terpenes) && terpenes.length === 0)) {
            return '<strong>Terpenes:</strong><br>N/A';
        }

        let terpeneList = [];

        if (Array.isArray(terpenes)) {
            terpeneList = terpenes.reduce((acc, terp) => {
                // Object format with name/percentage
                if (terp && typeof terp === 'object' && 'name' in terp) {
                    const val = 'percentage' in terp ? terp.percentage : ('value' in terp ? terp.value : ('percent' in terp ? terp.percent : undefined));
                    const num = parsePercent(val);
                    if (num !== null && num > 0) acc.push(`${terp.name}: ${num}%`);
                    return acc;
                }
                // String format – include if it doesn't clearly indicate 0%
                if (typeof terp === 'string') {
                    const num = parsePercent(terp);
                    if (num === null || num > 0) acc.push(terp);
                    return acc;
                }
                // Generic object map
                if (terp && typeof terp === 'object') {
                    const parts = Object.entries(terp)
                        .filter(([_, v]) => {
                            const n = parsePercent(v);
                            return n === null || n > 0; // keep non-numeric or positive values
                        })
                        .map(([k, v]) => {
                            const n = parsePercent(v);
                            return n === null ? `${k}: ${v}` : `${k}: ${n}%`;
                        });
                    if (parts.length) acc.push(parts.join(' '));
                    return acc;
                }
                return acc;
            }, []);
        } else if (typeof terpenes === 'object') {
            terpeneList = Object.entries(terpenes)
                .filter(([_, value]) => {
                    const n = parsePercent(value);
                    return n === null || n > 0; // hide 0%
                })
                .map(([key, value]) => {
                    const n = parsePercent(value);
                    return n === null ? `${key}: ${value}` : `${key}: ${n}%`;
                });
        } else if (typeof terpenes === 'string') {
            const n = parsePercent(terpenes);
            if (n === null || n > 0) terpeneList = [terpenes];
        }

        if (terpeneList.length === 0) {
            return '<strong>Terpenes:</strong><br>N/A';
        }

        return '<strong style="color: ' + SUNNYSIDE_ORANGE + ';">Terpenes:</strong><br>' + 
               terpeneList.join(', ');
    }

    // Extract product URL from button element with click interception
    function getProductUrl(buttonElement) {
        const li = buttonElement.closest('li');
        if (!li) {
            console.log('Sunnyside Insights: Could not find parent <li> element');
            return null;
        }
        
        // Method 1: Check if we've cached the URL from a previous click
        if (buttonElement.dataset.sunnysideUrl) {
            return buttonElement.dataset.sunnysideUrl;
        }
        
        // DEBUG: Log structure for first failed attempt
        if (!buttonElement.dataset.sunnysideDebugged) {
            buttonElement.dataset.sunnysideDebugged = 'true';
            console.log('Sunnyside Insights: DEBUGGING URL EXTRACTION');
            console.log('Button element:', buttonElement);
            console.log('Button attributes:', Array.from(buttonElement.attributes).map(a => `${a.name}="${a.value}"`));
            console.log('Button dataset entries:', Object.entries(buttonElement.dataset));
            console.log('Button onclick function:', buttonElement.onclick ? buttonElement.onclick.toString() : 'none');
            console.log('LI element:', li);
            console.log('LI attributes:', Array.from(li.attributes).map(a => `${a.name}="${a.value}"`));
            console.log('LI dataset entries:', Object.entries(li.dataset));
            console.log('LI outerHTML (first 1200 chars):', li.outerHTML.substring(0, 1200));
            const candidateElements = Array.from(li.querySelectorAll('[data-product-id], [data-sku], [data-id], [href], [role="link"], [aria-label], [data-cy], a, button'));
            console.log('Candidate child elements count:', candidateElements.length);
            console.log('Candidate child elements sample:', candidateElements.slice(0, 10).map(el => ({
                tag: el.tagName,
                classes: el.className,
                attrs: Array.from(el.attributes).map(a => `${a.name}="${a.value}"`).join(' ')
            })));
            console.log('Candidate child element outerHTML snippets:', candidateElements.slice(0, 5).map(el => el.outerHTML.substring(0, 500)));
            console.log('All links in LI:', Array.from(li.querySelectorAll('a')).map(a => a.href || a.getAttribute('href')));
        }
        
        // Method 2: Look for a link element (most reliable)
        // Try multiple selectors
        const linkSelectors = [
            'a[href*="/product/"]',
            'a[href]',
            '[href*="/product/"]',
            'a'
        ];
        
        for (const selector of linkSelectors) {
            const link = li.querySelector(selector);
            if (link) {
                const href = link.getAttribute('href') || link.href;
                if (href && href.includes('/product/')) {
                    const url = href.startsWith('http') ? href : `https://www.sunnyside.shop${href}`;
                    buttonElement.dataset.sunnysideUrl = url;
                    console.log('Sunnyside Insights: Found URL via link:', url);
                    return url;
                }
            }
        }
        
        // Also check if button itself is a link or has href
        if (buttonElement.href && buttonElement.href.includes('/product/')) {
            buttonElement.dataset.sunnysideUrl = buttonElement.href;
            console.log('Sunnyside Insights: Found URL on button itself:', buttonElement.href);
            return buttonElement.href;
        }
        
        const buttonHref = buttonElement.getAttribute('href');
        if (buttonHref && buttonHref.includes('/product/')) {
            const url = buttonHref.startsWith('http') ? buttonHref : `https://www.sunnyside.shop${buttonHref}`;
            buttonElement.dataset.sunnysideUrl = url;
            console.log('Sunnyside Insights: Found URL in button href attr:', url);
            return url;
        }
        
        // Method 3: Check ALL data attributes (including React props)
        const allAttributes = buttonElement.attributes;
        for (let i = 0; i < allAttributes.length; i++) {
            const attr = allAttributes[i];
            const name = attr.name.toLowerCase();
            const value = attr.value;
            
            // Check for product ID patterns
            if (name.includes('product') || name.includes('id') || name.includes('href')) {
                // Look for product ID
                const idMatch = value.match(/\/product\/(\d+)/) || value.match(/(\d{6,})/);
                if (idMatch && idMatch[1]) {
                    const url = `https://www.sunnyside.shop/product/${idMatch[1]}`;
                    buttonElement.dataset.sunnysideUrl = url;
                    return url;
                }
                
                // Check if value is already a URL
                if (value.includes('/product/')) {
                    const url = value.startsWith('http') ? value : `https://www.sunnyside.shop${value}`;
                    buttonElement.dataset.sunnysideUrl = url;
                    return url;
                }
            }
        }
        
        // Method 4: Check React props (often stored in __reactInternalInstance or __reactFiber)
        try {
            const reactKey = Object.keys(buttonElement).find(key => 
                key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
            );
            if (reactKey) {
                console.log('Sunnyside Insights: Found React fiber key', reactKey);
                let fiber = buttonElement[reactKey];
                // Traverse React fiber tree to find props
                for (let i = 0; i < 10 && fiber; i++) {
                    if (fiber.memoizedProps) {
                        console.log('Sunnyside Insights: React fiber props candidate', fiber.memoizedProps);
                        const props = fiber.memoizedProps;
                        // Check common prop names
                        const urlProps = ['href', 'to', 'url', 'productUrl', 'productId', 'id'];
                        for (const prop of urlProps) {
                            if (props[prop]) {
                                const value = props[prop];
                                if (typeof value === 'string') {
                                    if (value.includes('/product/')) {
                                        const url = value.startsWith('http') ? value : `https://www.sunnyside.shop${value}`;
                                        buttonElement.dataset.sunnysideUrl = url;
                                        return url;
                                    }
                                    const idMatch = value.match(/(\d{6,})/);
                                    if (idMatch) {
                                        const url = `https://www.sunnyside.shop/product/${idMatch[1]}`;
                                        buttonElement.dataset.sunnysideUrl = url;
                                        return url;
                                    }
                                }
                            }
                        }
                        // Special handling if product object is present
                        if (props.product) {
                            try {
                                const productObj = props.product;
                                console.log('Sunnyside Insights: Found product object keys', Object.keys(productObj));
                                const extractedData = extractProductData(productObj, buttonElement.dataset.sunnysideUrl);
                                console.log('Sunnyside Insights: product object sample', {
                                    id: productObj.id,
                                    slug: productObj.slug,
                                    sku: productObj.sku,
                                    availableTerpenes: productObj.terpenes,
                                    availableCannabinoids: productObj.cannabinoids,
                                    extracted: extractedData
                                });
                                if (extractedData) {
                                    storeProductData(buttonElement, extractedData);
                                    if (extractedData.url) {
                                        buttonElement.dataset.sunnysideUrl = extractedData.url;
                                        console.log('Sunnyside Insights: Found URL via product object:', extractedData.url);
                                        return extractedData.url;
                                    }
                                }
                            } catch (productError) {
                                console.log('Sunnyside Insights: Error inspecting product object', productError);
                            }
                        }
                    }
                    fiber = fiber.return || fiber._owner;
                }
                // If we traversed to the end without finding, log final fiber
                console.log('Sunnyside Insights: Finished traversing React fiber chain');
            }
        } catch (e) {
            // React props access might fail, continue to next method
            console.log('Sunnyside Insights: React fiber inspection error', e);
        }
        
        // Method 5: Intercept router navigation (for SPAs like React Router)
        if (!window.__sunnysideRouterIntercepted) {
            window.__sunnysideRouterIntercepted = true;
            
            // Intercept history.pushState and replaceState
            const originalPushState = history.pushState;
            const originalReplaceState = history.replaceState;
            
            history.pushState = function(...args) {
                const url = args[2];
                if (url && url.includes('/product/')) {
                    // Find the button that triggered this (if recently clicked)
                    const clickedButton = document.querySelector('button[data-sunnyside-url-setup="true"]:hover, button:active');
                    if (clickedButton) {
                        const fullUrl = url.startsWith('http') ? url : `https://www.sunnyside.shop${url}`;
                        clickedButton.dataset.sunnysideUrl = fullUrl;
                        // Cancel navigation by not calling original
                        return;
                    }
                }
                return originalPushState.apply(this, args);
            };
            
            history.replaceState = function(...args) {
                const url = args[2];
                if (url && url.includes('/product/')) {
                    const clickedButton = document.querySelector('button[data-sunnyside-url-setup="true"]:hover, button:active');
                    if (clickedButton) {
                        const fullUrl = url.startsWith('http') ? url : `https://www.sunnyside.shop${url}`;
                        clickedButton.dataset.sunnysideUrl = fullUrl;
                        return;
                    }
                }
                return originalReplaceState.apply(this, args);
            };
        }
        
        // Method 6: Set up click interceptor to learn URL on first click
        if (!buttonElement.dataset.sunnysideUrlSetup) {
            buttonElement.dataset.sunnysideUrlSetup = 'true';
            
            const clickInterceptor = (e) => {
                console.log('Sunnyside Insights: Click intercepted!', e);
                
                // Try multiple ways to extract URL
                const target = e.target || e.currentTarget;
                
                // Check for href in target or parents
                let current = target;
                for (let i = 0; i < 10 && current; i++) {
                    if (current.href && current.href.includes('/product/')) {
                        buttonElement.dataset.sunnysideUrl = current.href;
                        console.log('Sunnyside Insights: Found URL in click handler:', current.href);
                        e.stopPropagation();
                        e.preventDefault();
                        return;
                    }
                    const hrefAttr = current.getAttribute && current.getAttribute('href');
                    if (hrefAttr && hrefAttr.includes('/product/')) {
                        const url = hrefAttr.startsWith('http') ? hrefAttr : `https://www.sunnyside.shop${hrefAttr}`;
                        buttonElement.dataset.sunnysideUrl = url;
                        console.log('Sunnyside Insights: Found URL in href attr:', url);
                        e.stopPropagation();
                        e.preventDefault();
                        return;
                    }
                    current = current.parentElement;
                }
                
                // Monitor for URL change (navigation happens)
                const startUrl = window.location.href;
                let urlCaptured = false;
                
                const checkUrl = () => {
                    setTimeout(() => {
                        const currentUrl = window.location.href;
                        if (currentUrl !== startUrl && currentUrl.includes('/product/') && !urlCaptured) {
                            urlCaptured = true;
                            buttonElement.dataset.sunnysideUrl = currentUrl;
                            console.log('Sunnyside Insights: Captured URL from navigation:', currentUrl);
                            // Use replaceState to go back without adding to history
                            history.replaceState(null, '', startUrl);
                            // Dispatch a custom event so hover can retry
                            buttonElement.dispatchEvent(new CustomEvent('sunnyside-url-cached'));
                        }
                    }, 100);
                };
                checkUrl();
            };
            
            // Listen in capture phase to catch before other handlers
            buttonElement.addEventListener('click', clickInterceptor, { 
                capture: true, 
                once: false // Allow multiple attempts
            });
            
            // Also listen for our custom event
            buttonElement.addEventListener('sunnyside-url-cached', () => {
                console.log('Sunnyside Insights: URL cached event received');
            });
        }
        
        // Method 7: Try to find product ID in nearby text
        const searchText = li.textContent || '';
        const idPatterns = [
            /\/product\/(\d{6,})/i,
            /product[:\s]*(\d{6,})/i,
        ];
        
        for (const pattern of idPatterns) {
            const match = searchText.match(pattern);
            if (match && match[1]) {
                const url = `https://www.sunnyside.shop/product/${match[1]}`;
                buttonElement.dataset.sunnysideUrl = url;
                return url;
            }
        }
        
        // Method 8: Check aria-label and other attributes
        const ariaLabel = buttonElement.getAttribute('aria-label') || 
                         li.getAttribute('aria-label') ||
                         buttonElement.getAttribute('title');
        if (ariaLabel) {
            const idMatch = ariaLabel.match(/\/product\/(\d+)/) || ariaLabel.match(/product[:\s]+(\d+)/i);
            if (idMatch && idMatch[1]) {
                const url = `https://www.sunnyside.shop/product/${idMatch[1]}`;
                buttonElement.dataset.sunnysideUrl = url;
                return url;
            }
        }
        
        return null;
    }

    // Fetch and parse product detail page
    function fetchProductDetails(url, callback) {
        if (!url) {
            callback({ error: 'Unable to determine product URL' });
            return;
        }
        
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            onload: function(response) {
                try {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(response.responseText, 'text/html');
                    
                    // Extract cannabinoids
                    const cannabinoids = {};
                    
                    // Look for THC/THCA percentages in the page
                    // Try multiple selectors as structure may vary
                    const cannabinoidText = doc.body.textContent || '';
                    
                    // Extract THC percentage (format: "THC: XX.XX%" or "Total THC: XX.XX%")
                    const thcMatch = cannabinoidText.match(/THC[:\s]+(\d+\.?\d*)%/i);
                    if (thcMatch) cannabinoids.THC = thcMatch[1];
                    
                    // Extract THCA percentage
                    const thcaMatch = cannabinoidText.match(/THCA[:\s]+(\d+\.?\d*)%/i);
                    if (thcaMatch) cannabinoids.THCA = thcaMatch[1];
                    
                    // Extract CBD percentage
                    const cbdMatch = cannabinoidText.match(/CBD[:\s]+(\d+\.?\d*)%/i);
                    if (cbdMatch) cannabinoids.CBD = cbdMatch[1];
                    
                    // Extract CBDa percentage
                    const cbdaMatch = cannabinoidText.match(/CBDa[:\s]+(\d+\.?\d*)%/i);
                    if (cbdaMatch) cannabinoids.CBDa = cbdaMatch[1];
                    
                    // Extract terpenes (detailed breakdown)
                    const terpenes = [];
                    const terpeneHeading = Array.from(doc.querySelectorAll('h6, h5, h4')).find(
                        h => h.textContent.trim().toLowerCase() === 'terpenes'
                    );

                    const terpeneSection = terpeneHeading ? terpeneHeading.closest('section, div, article') : null;
                    const sectionText = (terpeneSection ? terpeneSection.innerText : doc.body.innerText || '').trim();

                    // Known terpene names and synonyms mapped to canonical display names
                    const TERPENE_SYNONYMS = [
                        { name: 'Beta-Caryophyllene', synonyms: ['beta-caryophyllene', 'b-caryophyllene', 'beta caryophyllene', 'caryophyllene'] },
                        { name: 'Limonene', synonyms: ['limonene'] },
                        { name: 'Humulene', synonyms: ['humulene'] },
                        { name: 'Linalool', synonyms: ['linalool'] },
                        { name: 'Beta-Myrcene', synonyms: ['beta-myrcene', 'b-myrcene', 'myrcene'] },
                        { name: 'Beta-Pinene', synonyms: ['beta-pinene', 'b-pinene'] },
                        { name: 'Alpha-Pinene', synonyms: ['alpha-pinene', 'a-pinene', 'pinene'] },
                        { name: 'Ocimene', synonyms: ['ocimene'] },
                        { name: 'Terpinolene', synonyms: ['terpinolene'] },
                        { name: 'Nerolidol', synonyms: ['nerolidol'] },
                        { name: 'Bisabolol', synonyms: ['bisabolol'] },
                        { name: 'Caryophyllene Oxide', synonyms: ['caryophyllene oxide', 'caryophyllene-oxide'] },
                        { name: 'Eucalyptol', synonyms: ['eucalyptol'] },
                        { name: 'Camphene', synonyms: ['camphene'] },
                        { name: 'Geraniol', synonyms: ['geraniol'] },
                        { name: 'Valencene', synonyms: ['valencene'] },
                        { name: 'Phellandrene', synonyms: ['alpha-phellandrene', 'beta-phellandrene', 'phellandrene'] },
                    ];

                    // Regex pass over the terpene section (or full document as fallback)
                    TERPENE_SYNONYMS.forEach(({ name, synonyms }) => {
                        const synPattern = synonyms.map(s => escapeRegExp(s)).join('|');
                        const re = new RegExp(`(?:${synPattern})[\n\r\t\s:]*([0-9]+(?:\.[0-9]+)?)%`, 'gi');
                        let m;
                        while ((m = re.exec(sectionText)) !== null) {
                            const pct = parseFloat(m[1]);
                            if (!Number.isNaN(pct)) {
                                const existing = terpenes.find(t => t.name === name);
                                if (!existing) {
                                    terpenes.push({ name, percentage: pct });
                                } else if (pct > existing.percentage) {
                                    existing.percentage = pct;
                                }
                            }
                        }
                    });

                    // DOM proximity fallback: for any element with a percent, try to read a nearby name
                    if (terpenes.length === 0 && terpeneSection) {
                        const percentNodes = Array.from(terpeneSection.querySelectorAll('*')).filter(el => /\d+(?:\.\d+)?%/.test(el.textContent || ''));
                        percentNodes.forEach(node => {
                            const pctMatch = (node.textContent || '').match(/([0-9]+(?:\.[0-9]+)?)%/);
                            if (!pctMatch) return;
                            const pct = parseFloat(pctMatch[1]);
                            const container = node.closest('div, li, p, span') || node.parentElement;
                            if (!container) return;
                            let nameCandidate = '';
                            // Prefer sibling/children text without % and not numeric
                            const texts = Array.from(container.querySelectorAll('*'))
                                .map(el => (el.textContent || '').trim())
                                .filter(t => t && !/%/.test(t) && /[a-zA-Z]/.test(t) && t.length <= 50);
                            if (texts.length) {
                                // pick the longest name-like text
                                nameCandidate = texts.sort((a, b) => b.length - a.length)[0];
                            }
                            if (nameCandidate) {
                                // Normalize capitalization: capitalize words and keep hyphens
                                const normalized = nameCandidate.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
                                const exists = terpenes.find(t => t.name === normalized);
                                if (!exists) terpenes.push({ name: normalized, percentage: pct });
                            }
                        });
                    }

                    // FINAL FALLBACK: parse Total Terpenes from page text if no breakdown found
                    let terpeneResult;
                    if (terpenes.length > 0) {
                        terpeneResult = terpenes;
                    } else {
                        const totalTerpsMatch = (sectionText || cannabinoidText).match(/Total\s*Terpenes\s*:?[\s]*([0-9]+(?:\.[0-9]+)?)%/i);
                        if (totalTerpsMatch) {
                            const totalVal = parseFloat(totalTerpsMatch[1]);
                            if (!Number.isNaN(totalVal)) {
                                terpeneResult = { 'Total Terpenes': totalVal };
                            }
                        }
                    }
                    
                    callback({
                        cannabinoids,
                        terpenes: terpeneResult || terpenes,
                        url
                    });
                } catch (error) {
                    callback({ error: 'Failed to parse product data' });
                }
            },
            onerror: function() {
                callback({ error: 'Failed to fetch product details' });
            }
        });
    }

    // Handle product hover
    function handleProductHover(event, productButton) {
        console.log('Sunnyside Insights: handleProductHover called');

        let cachedProduct = getCachedProductData(productButton);
        const url = getProductUrl(productButton);
        console.log('Sunnyside Insights: Extracted URL:', url);

        // getProductUrl may have cached new product data; re-read if needed
        if (!cachedProduct) {
            cachedProduct = getCachedProductData(productButton);
        }

        const hasCachedCannabinoids = hasCannabinoidInfo(cachedProduct?.cannabinoids);
        const hasCachedTerpenes = hasTerpeneInfo(cachedProduct?.terpenes);
        const hasDetailedTerpenes = hasDetailedTerpeneBreakdown(cachedProduct?.terpenes);
        const hasAnyCachedInsights = hasCachedCannabinoids || hasCachedTerpenes;

        if (hasAnyCachedInsights) {
            const content = buildTooltipContent(cachedProduct);
            showTooltip(event.pageX, event.pageY, content);
        } else {
            showTooltip(event.pageX, event.pageY, '<div style="text-align: center;">Loading...</div>');
        }

        if (!url) {
            console.warn('Sunnyside Insights: Could not extract product URL');
            if (!hasAnyCachedInsights) {
                showTooltip(event.pageX, event.pageY,
                    '<div style="color: orange;">Unable to find product URL. Try clicking the product first.</div>');
            }
            return;
        }

        // Fetch if cannabinoids are missing OR terpene breakdown is not detailed (e.g., only total)
        const shouldFetch = (!hasCachedCannabinoids) || (!hasDetailedTerpenes);
        if (!shouldFetch) {
            return;
        }

        console.log('Sunnyside Insights: Fetching product details from:', url);
        fetchProductDetails(url, (data) => {
            console.log('Sunnyside Insights: Received product data:', data);
            if (data.error) {
                console.error('Sunnyside Insights: Error fetching product:', data.error);
                showTooltip(event.pageX, event.pageY,
                    `<div style="color: red;">${data.error}</div>`);
                return;
            }

            storeProductData(productButton, data);
            const updated = getCachedProductData(productButton) || data;
            const content = buildTooltipContent(updated);
            console.log('Sunnyside Insights: Showing tooltip with content');
            showTooltip(event.pageX, event.pageY, content);
        });
    }

    // Add selection button to product card
    function addSelectionButton(productCard) {
        // Check if button already exists - check both in card and as sibling
        const existingBtn = productCard.querySelector('.sunnyside-select-btn') || 
                           productCard.parentElement?.querySelector('.sunnyside-select-btn');
        if (existingBtn) {
            return;
        }
        
        // Find the product card container (li element)
        const li = productCard.closest('li');
        if (!li) {
            console.warn('Sunnyside Insights: Could not find parent li for button');
            return;
        }
        // Ensure we only add to real product cards, not filter sidebar entries
        if (!isLikelyProductCard(li)) {
            return;
        }
        
        // Check if button already exists in the li
        if (li.querySelector('.sunnyside-select-btn')) {
            return;
        }
        
        const btn = document.createElement('button');
        btn.className = 'sunnyside-select-btn';
        btn.textContent = 'Select';
        btn.style.cssText = `
            margin: 8px auto;
            padding: 6px 12px;
            background: ${SUNNYSIDE_ORANGE};
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            display: block;
            width: auto;
            position: relative;
            z-index: 10;
            transition: background 0.2s;
        `;
        
        btn.addEventListener('mouseenter', () => {
            if (!btn.disabled) {
                btn.style.background = '#e55a2b';
            }
        });
        
        btn.addEventListener('mouseleave', () => {
            if (!btn.disabled) {
                btn.style.background = SUNNYSIDE_ORANGE;
            }
        });
        
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            const url = getProductUrl(productCard);
            if (!url) {
                console.warn('Sunnyside Insights: Could not get URL for selection');
                return;
            }
            
            const index = selectedProducts.findIndex(p => p.url === url);
            
            if (index > -1) {
                // Deselect
                selectedProducts.splice(index, 1);
                btn.textContent = 'Select';
                btn.disabled = false;
                btn.style.background = SUNNYSIDE_ORANGE;
                updateCompareButton();
            } else {
                // Select (max 3)
                if (selectedProducts.length >= 3) {
                    alert('Maximum 3 products can be selected for comparison');
                    return;
                }
                
                // Pull any cached insights already discovered during hover
                const cached = getCachedProductData(productCard) || {};
                
                selectedProducts.push({
                    url: url,
                    name: cached.name || productCard.textContent.trim().split('\n')[1] || 'Product',
                    cannabinoids: cached.cannabinoids || undefined,
                    terpenes: cached.terpenes || undefined
                });
                btn.textContent = 'Selected ✓';
                btn.style.background = '#28a745';
                updateCompareButton();
            }
        });
        
        // Insert button into the li container, after the product button
        try {
            // Append directly to the li to avoid NotFoundError when reference is not a direct child
            li.appendChild(btn);
        } catch (error) {
            console.error('Sunnyside Insights: Error inserting button:', error);
        }
    }

    // Create or update compare button
    function createCompareButton() {
        if (compareButton) {
            updateCompareButton();
            return;
        }
        
        // Wait for body to exist
        if (!document.body) {
            console.warn('Sunnyside Insights: document.body not ready for compare button');
            return;
        }
        
        compareButton = document.createElement('button');
        compareButton.id = 'sunnyside-compare-btn';
        compareButton.textContent = 'Compare (0)';
        compareButton.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 24px;
            background: ${SUNNYSIDE_ORANGE};
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            z-index: 9999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            display: none;
        `;
        
        compareButton.addEventListener('click', showComparisonSidebar);
        document.body.appendChild(compareButton);
    }

    // Update compare button text
    function updateCompareButton() {
        if (!compareButton) return;
        
        const count = selectedProducts.length;
        compareButton.textContent = `Compare (${count})`;
        compareButton.style.display = count > 0 ? 'block' : 'none';
    }

    // Show comparison sidebar
    function showComparisonSidebar() {
        if (selectedProducts.length === 0) return;
        
        // Remove existing sidebar
        if (sidebar) sidebar.remove();
        
        sidebar = document.createElement('div');
        sidebar.id = 'sunnyside-comparison-sidebar';
        sidebar.style.cssText = `
            position: fixed;
            top: 0;
            right: 0;
            width: 500px;
            height: 100vh;
            background: white;
            border-left: 2px solid ${SUNNYSIDE_ORANGE};
            padding: 20px;
            z-index: 10001;
            overflow-y: auto;
            box-shadow: -4px 0 12px rgba(0,0,0,0.15);
        `;
        
        // Header
        const header = document.createElement('div');
        header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;';
        
        const title = document.createElement('h2');
        title.textContent = 'Product Comparison';
        title.style.cssText = `color: ${SUNNYSIDE_DARK}; margin: 0;`;
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: ${SUNNYSIDE_DARK};
            padding: 0;
            width: 30px;
            height: 30px;
        `;
        closeBtn.addEventListener('click', () => sidebar.remove());
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        sidebar.appendChild(header);
        
        // Loading message
        const loadingDiv = document.createElement('div');
        loadingDiv.textContent = 'Loading product data...';
        loadingDiv.id = 'sunnyside-comparison-loading';
        loadingDiv.style.cssText = 'text-align: center; padding: 20px;';
        sidebar.appendChild(loadingDiv);
        
        document.body.appendChild(sidebar);
        
        // Scoped styles for comparison UI
        const style = document.createElement('style');
        style.textContent = `
            #sunnyside-comparison-sidebar .ssi-subheader td { 
                padding: 8px 10px; 
                background: #fafafa; 
                color: #555; 
                font-weight: 600; 
                border-top: 1px solid #eee; 
            }
            #sunnyside-comparison-sidebar .ssi-max { color: ${SUCCESS_GREEN}; font-weight: 700; }
            #sunnyside-comparison-sidebar .ssi-second { color: ${SECOND_GREEN}; font-weight: 600; }
            #sunnyside-comparison-sidebar .ssi-muted { color: ${MUTED_GRAY}; }
        `;
        sidebar.appendChild(style);
        
        // Fetch all product data
        const productData = [];
        let loadedCount = 0;
        
        selectedProducts.forEach((product, index) => {
            fetchProductDetails(product.url, (data) => {
                loadedCount++;
                
                // Merge without clobbering existing cached values
                const merged = { ...product };
                if (data) {
                    if (data.url) merged.url = data.url;
                    if (data.name && !merged.name) merged.name = data.name;
                    if (data.cannabinoids && Object.keys(data.cannabinoids).length > 0) {
                        merged.cannabinoids = { ...(merged.cannabinoids || {}), ...data.cannabinoids };
                    }
                    if (data.terpenes !== undefined) {
                        const existingCount = Array.isArray(merged.terpenes) ? merged.terpenes.length : (merged.terpenes && typeof merged.terpenes === 'object') ? Object.keys(merged.terpenes).length : 0;
                        const incomingCount = Array.isArray(data.terpenes) ? data.terpenes.length : (data.terpenes && typeof data.terpenes === 'object') ? Object.keys(data.terpenes).length : 0;
                        if (incomingCount > 0 || existingCount === 0) {
                            merged.terpenes = data.terpenes;
                        }
                    }
                }
                productData[index] = merged;
                
                if (loadedCount === selectedProducts.length) {
                    displayComparisonTable(productData);
                }
            });
        });
    }
    
    // Heuristic helpers to keep buttons only under product cards
    function isLikelyProductCard(element) {
        let li = null;
        if (!element) return false;
        if (element.tagName === 'LI') li = element; else if (element.closest) li = element.closest('li');
        if (!li) return false;
        // Exclude obvious filter/sidebar containers
        const isInFilter = !!li.closest('aside, [aria-label*="Filter"], [aria-label*="filter"], [class*="filter"], [id*="filter"]');
        if (isInFilter) return false;
        // Positive signals for product cards
        const hasProductLink = !!li.querySelector('a[href*="/product/"], [href*="/product/"]');
        const hasImage = !!li.querySelector('img');
        const text = (li.textContent || '').trim();
        const hasPrice = /\$\s*\d/.test(text);
        return hasProductLink || (hasImage && hasPrice);
    }

    function cleanupSidebarSelectButtons() {
        document.querySelectorAll('.sunnyside-select-btn').forEach(btn => {
            if (!isLikelyProductCard(btn)) {
                btn.remove();
            }
        });
    }

    // Display comparison table
    function displayComparisonTable(productData) {
        // Remove loading message (robust to additional elements like <style>)
        const loadingDiv = sidebar.querySelector('#sunnyside-comparison-loading');
        if (loadingDiv) {
            loadingDiv.remove();
        }
        
        // Create table
        const table = document.createElement('table');
        table.style.cssText = `
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        `;
        
        // Header row
        const headerRow = document.createElement('tr');
        headerRow.style.cssText = `background: ${SUNNYSIDE_ORANGE}; color: white;`;
        
        const emptyHeader = document.createElement('th');
        emptyHeader.textContent = '';
        emptyHeader.style.cssText = 'padding: 10px; text-align: left;';
        headerRow.appendChild(emptyHeader);
        
        productData.forEach(product => {
            const th = document.createElement('th');
            th.textContent = product.name;
            th.style.cssText = 'padding: 10px; text-align: left; font-weight: 600;';
            headerRow.appendChild(th);
        });
        
        table.appendChild(headerRow);
        
        // Cannabinoids section subheader
        const canSep = document.createElement('tr');
        canSep.className = 'ssi-subheader';
        const canTd = document.createElement('td');
        canTd.colSpan = 1 + productData.length;
        canTd.textContent = 'Cannabinoids';
        canSep.appendChild(canTd);
        table.appendChild(canSep);
        
        // Helpers
        const preferredCannabinoids = ['THC', 'THCA', 'CBD', 'CBDA', 'CBN', 'CBG', 'CBC', 'totalTHC', 'totalCBD'];
        const readCannabinoid = (obj, key) => {
            if (!obj) return null;
            switch (key) {
                case 'THC': return obj.THC ?? obj.thc ?? obj.totalTHC ?? obj.total_thc ?? obj.thcPercent ?? obj.thc_percentage;
                case 'THCA': return obj.THCA ?? obj.thca ?? obj.totalTHCA ?? obj.total_thca;
                case 'CBD': return obj.CBD ?? obj.cbd ?? obj.totalCBD ?? obj.total_cbd ?? obj.cbdPercent ?? obj.cbd_percentage;
                case 'CBDA': return obj.CBDA ?? obj.CBDa ?? obj.cbda;
                case 'CBN': return obj.CBN ?? obj.cbn;
                case 'CBG': return obj.CBG ?? obj.cbg;
                case 'CBC': return obj.CBC ?? obj.cbc;
                case 'totalTHC': return obj.totalTHC ?? obj.total_thc ?? obj.usable_thc;
                case 'totalCBD': return obj.totalCBD ?? obj.total_cbd ?? obj.usable_cbd;
                default: return obj[key] ?? obj[key && key.toUpperCase()] ?? obj[key && key.toLowerCase()];
            }
        };
        const formatCell = (v) => {
            if (v === null || v === undefined || v === '') return '-';
            if (typeof v === 'number') return `${v}%`;
            const n = parsePercent(v);
            return n === null ? String(v) : `${n}%`;
        };
        const normalizeTerpenes = (terps) => {
            const map = {};
            if (!terps) return map;
            if (Array.isArray(terps)) {
                terps.forEach(t => {
                    if (t && typeof t === 'object' && t.name !== undefined) {
                        const name = canonicalizeTerpeneName(t.name) || String(t.name);
                        const val = t.percentage ?? t.value ?? t.percent;
                        const num = parsePercent(val);
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
        
        // Build union of cannabinoid keys (preferred order first, then any extras)
        const extraCanna = new Set();
        productData.forEach(p => {
            if (p.cannabinoids) Object.keys(p.cannabinoids).forEach(k => {
                if (!preferredCannabinoids.includes(k)) extraCanna.add(k);
            });
        });
        const cannabinoidRows = [...preferredCannabinoids, ...Array.from(extraCanna).sort()];
        
        // Render cannabinoid rows (skip rows that are all '-' or all 0%)
        cannabinoidRows.forEach(label => {
            const values = productData.map(p => readCannabinoid(p.cannabinoids, label));
            const hasAnyNonZero = values.some(v => {
                const n = parsePercent(v);
                return n !== null && n > 0;
            });
            if (!hasAnyNonZero) return; // hide if all are missing or 0%

            const row = document.createElement('tr');
            row.style.cssText = 'border-bottom: 1px solid #eee;';
            const nameCell = document.createElement('td');
            nameCell.textContent = label;
            nameCell.style.cssText = 'padding: 10px; font-weight: 600;';
            row.appendChild(nameCell);

            const cellRefs = [];
            values.forEach(v => {
                const td = document.createElement('td');
                td.style.cssText = 'padding: 10px;';
                td.textContent = formatCell(v);
                cellRefs.push(td);
                row.appendChild(td);
            });
            table.appendChild(row);

            // Highlight max and second-best; mute zero/N-A
            const nums = values.map(v => {
                const n = parsePercent(v);
                return (n === null || Number.isNaN(n)) ? null : n;
            });
            const positives = nums.filter(n => n !== null && n > 0);
            if (positives.length) {
                const uniq = Array.from(new Set(positives)).sort((a, b) => b - a);
                const max = uniq[0];
                const second = uniq.length > 1 ? uniq[1] : null;
                cellRefs.forEach((td, i) => {
                    const n = nums[i];
                    if (n === null || n === 0) {
                        td.classList.add('ssi-muted');
                        return;
                    }
                    if (n === max) {
                        td.classList.add('ssi-max');
                    } else if (second !== null && n === second) {
                        td.classList.add('ssi-second');
                    }
                });
            } else {
                // All zero or missing
                cellRefs.forEach(td => td.classList.add('ssi-muted'));
            }
        });
        
        // Union of terpene names
        const terpeneMaps = productData.map(p => normalizeTerpenes(p.terpenes));
        const terpeneNamesSet = new Set();
        terpeneMaps.forEach(m => Object.keys(m).forEach(n => terpeneNamesSet.add(n)));
        const terpeneNames = Array.from(terpeneNamesSet).sort((a, b) => a.localeCompare(b));
        
        // Add a separator row for clarity
        if (terpeneNames.length) {
            const sep = document.createElement('tr');
            sep.className = 'ssi-subheader';
            const sepTd = document.createElement('td');
            sepTd.colSpan = 1 + productData.length;
            sepTd.style.cssText = 'padding: 6px 10px; background: #fafafa; font-weight: 600; color: #555;';
            sepTd.textContent = 'Terpenes';
            sep.appendChild(sepTd);
            table.appendChild(sep);
        }
        
        // Render terpene rows (skip rows that are all '-' or all 0%)
        terpeneNames.forEach(name => {
            const vals = productData.map((p, idx) => terpeneMaps[idx][name]);
            const hasAnyNonZero = vals.some(v => {
                const n = parsePercent(v);
                return n !== null && n > 0;
            });
            if (!hasAnyNonZero) return;

            const row = document.createElement('tr');
            const nameCell = document.createElement('td');
            nameCell.textContent = name;
            nameCell.style.cssText = 'padding: 10px; font-weight: 600;';
            row.appendChild(nameCell);

            const cellRefs = [];
            vals.forEach(v => {
                const td = document.createElement('td');
                td.style.cssText = 'padding: 10px;';
                td.textContent = formatCell(v);
                cellRefs.push(td);
                row.appendChild(td);
            });
            table.appendChild(row);

            const nums = vals.map(v => {
                const n = parsePercent(v);
                return (n === null || Number.isNaN(n)) ? null : n;
            });
            const positives = nums.filter(n => n !== null && n > 0);
            if (positives.length) {
                const uniq = Array.from(new Set(positives)).sort((a, b) => b - a);
                const max = uniq[0];
                const second = uniq.length > 1 ? uniq[1] : null;
                cellRefs.forEach((td, i) => {
                    const n = nums[i];
                    if (n === null || n === 0) {
                        td.classList.add('ssi-muted');
                        return;
                    }
                    if (n === max) {
                        td.classList.add('ssi-max');
                    } else if (second !== null && n === second) {
                        td.classList.add('ssi-second');
                    }
                });
            } else {
                cellRefs.forEach(td => td.classList.add('ssi-muted'));
            }
        });
        
        sidebar.appendChild(table);
    }

    // Enhance product cards with hover and selection
    function enhanceProducts() {
        // Prevent running if body doesn't exist
        if (!document.body) {
            console.log('Sunnyside Insights: document.body not ready');
            return;
        }
        // Ensure we don't leave stray buttons in non-product areas
        cleanupSidebarSelectButtons();
        
        // Find all product buttons - try multiple selectors
        let productButtons = document.querySelectorAll('ul[role="region"] li button');
        
        console.log(`Sunnyside Insights: Primary selector found ${productButtons.length} product buttons`);
        
        // If primary selector fails, try alternatives
        if (productButtons.length === 0) {
            const altSelectors = [
                'ul[role="region"] li button',
                'ul li button',
                '[role="region"] button',
                'main ul li button',
                'main button',
                '.product-item button',
                'button[role="button"]'
            ];
            
            for (const selector of altSelectors) {
                const altButtons = document.querySelectorAll(selector);
                console.log(`Sunnyside Insights: Selector "${selector}" found ${altButtons.length} buttons`);
                if (altButtons.length > 0) {
                    productButtons = altButtons;
                    console.log(`Sunnyside Insights: Using selector: ${selector}`);
                    break;
                }
            }
        }
        
        if (productButtons.length === 0) {
            console.warn('Sunnyside Insights: No product buttons found. Page structure may have changed.');
            // Log the page structure for debugging
            const mainContent = document.querySelector('main') || document.querySelector('[role="main"]');
            if (mainContent) {
                console.log('Sunnyside Insights: Main content found, checking structure...');
                const allButtons = mainContent.querySelectorAll('button');
                console.log(`Sunnyside Insights: Found ${allButtons.length} total buttons in main content`);
                if (allButtons.length > 0) {
                    console.log('Sunnyside Insights: First button structure:', allButtons[0]);
                    console.log('Sunnyside Insights: First button parent:', allButtons[0].closest('li'));
                }
            }
            return; // No products found yet
        }
        
        let enhancedCount = 0;
        productButtons.forEach((button, index) => {
            // Skip our own selection buttons
            if (button.classList && button.classList.contains('sunnyside-select-btn')) {
                return;
            }
            // Skip if already enhanced
            if (button.dataset.sunnysideEnhanced === 'true') {
                return;
            }
            // Skip buttons that are not part of a product card (e.g., filter sidebar)
            const li = button.closest('li');
            if (!isLikelyProductCard(li || button)) {
                return;
            }
            
            // Mark as enhanced BEFORE doing anything
            button.dataset.sunnysideEnhanced = 'true';
            enhancedCount++;
            
            // Add hover events
            button.addEventListener('mouseover', (e) => {
                handleProductHover(e, button);
            });
            
            button.addEventListener('mousemove', (e) => {
                if (tooltip && tooltip.style.display !== 'none') {
                    tooltip.style.left = `${e.pageX + 15}px`;
                    tooltip.style.top = `${e.pageY + 15}px`;
                }
            });
            
            button.addEventListener('mouseout', hideTooltip);
            
            // Add selection button ONLY if it doesn't exist
            if (li && !li.querySelector('.sunnyside-select-btn')) {
                addSelectionButton(button);
            }
        });
        
        console.log(`Sunnyside Insights: Enhanced ${enhancedCount} product buttons`);
    }

    // Initialize
    function init() {
        // Debounce timer for MutationObserver to prevent infinite loops
        let mutationTimer = null;
        let isProcessing = false;
        
        function debouncedEnhance() {
            if (isProcessing) return; // Prevent concurrent execution
            
            clearTimeout(mutationTimer);
            mutationTimer = setTimeout(() => {
                isProcessing = true;
                try {
                    enhanceProducts();
                } catch (error) {
                    console.error('Sunnyside Insights: Error in enhanceProducts:', error);
                } finally {
                    isProcessing = false;
                }
            }, 100); // 100ms debounce
        }
        
        // Wait for page to load
        function startEnhancement() {
            console.log('Sunnyside Insights: startEnhancement called, body exists:', !!document.body);
            if (!document.body) {
                // Wait a bit more if body still doesn't exist
                console.log('Sunnyside Insights: Waiting for document.body...');
                setTimeout(startEnhancement, 100);
                return;
            }
            
            console.log('Sunnyside Insights: Body exists, starting enhancement...');
            try {
                enhanceProducts();
                createCompareButton();
                console.log('Sunnyside Insights: Enhancement complete');
            } catch (error) {
                console.error('Sunnyside Insights: Error during initialization:', error);
            }
        }
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startEnhancement);
        } else {
            // Use setTimeout to ensure body exists
            setTimeout(startEnhancement, 0);
        }
        
        // Watch for dynamically loaded products with debouncing
        // Only observe after body exists
        function setupObserver() {
            if (!document.body) {
                setTimeout(setupObserver, 100);
                return;
            }
            
            console.log('Sunnyside Insights: Setting up MutationObserver');
            const observer = new MutationObserver((mutations) => {
                // Only process if mutations are relevant (not our own buttons)
                let hasRelevantChanges = false;
                
                for (const mutation of mutations) {
                    // Skip if all added nodes are our own elements
                    let allOurElements = true;
                    
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === 1) { // Element node
                            const isOurElement = 
                                node.id === 'sunnyside-insights-tooltip' ||
                                node.id === 'sunnyside-compare-btn' ||
                                node.id === 'sunnyside-comparison-sidebar' ||
                                node.id === 'sunnyside-insights-loaded' ||
                                (node.classList && node.classList.contains('sunnyside-select-btn')) ||
                                (node.querySelector && node.querySelector('.sunnyside-select-btn'));
                            
                            if (!isOurElement) {
                                allOurElements = false;
                                break;
                            }
                        } else {
                            // Text nodes or other changes
                            allOurElements = false;
                            break;
                        }
                    }
                    
                    if (!allOurElements) {
                        hasRelevantChanges = true;
                        break;
                    }
                }
                
                if (hasRelevantChanges) {
                    console.log('Sunnyside Insights: DOM mutation detected, debouncing enhancement...');
                    debouncedEnhance();
                }
            });
            
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            console.log('Sunnyside Insights: MutationObserver active');
        }
        
        setupObserver();
    }

    // Add visual indicator that script is loaded
    function addLoadIndicator() {
        if (document.body) {
            const indicator = document.createElement('div');
            indicator.id = 'sunnyside-insights-loaded';
            indicator.textContent = '✓ Sunnyside Insights Loaded';
            indicator.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background: ${SUNNYSIDE_ORANGE};
                color: white;
                padding: 8px 12px;
                border-radius: 4px;
                font-size: 12px;
                z-index: 99999;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            `;
            document.body.appendChild(indicator);
            
            // Remove after 3 seconds
            setTimeout(() => {
                if (indicator && indicator.parentNode) {
                    indicator.remove();
                }
            }, 3000);
        }
    }

    // Start initialization with error handling
    console.log('Sunnyside Insights: Script loaded and starting initialization...');
    console.log('Sunnyside Insights: Current URL:', window.location.href);
    console.log('Sunnyside Insights: Document ready state:', document.readyState);
    
    try {
        init();
        console.log('Sunnyside Insights: Initialization function called');
        
        // Add visual indicator after a short delay
        setTimeout(() => {
            addLoadIndicator();
        }, 1000);
    } catch (error) {
        console.error('Sunnyside Insights: Fatal error during initialization:', error);
    }

})();

