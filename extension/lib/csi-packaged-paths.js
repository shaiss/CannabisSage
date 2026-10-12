/**
 * Exact packaged paths content scripts may request via CSI_FETCH_PACKAGED.
 * Single source of truth for the service worker (importScripts) and content
 * scripts (manifest js) — keep lists from drifting.
 */
(function (global) {
  'use strict';

  const CSI_PACKAGED_RESOURCE_PATHS = Object.freeze([
    'data/default-taste-map.json',
    'data/terpene-glossary.json',
    'data/config.json',
    'content.css'
  ]);

  global.CSI_PACKAGED_RESOURCE_PATHS = CSI_PACKAGED_RESOURCE_PATHS;
  global.CSI_PACKAGED_RESOURCE_ALLOWLIST = new Set(CSI_PACKAGED_RESOURCE_PATHS);
})(typeof globalThis !== 'undefined' ? globalThis : this);
