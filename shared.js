/**
 * Shared utilities for Site Blocker
 */

/**
 * Convert legacy storage format (plain strings) to current format (objects).
 * "youtube.com" → { pattern: "youtube.com", isRegex: false }
 */
function migrateBlockedSites(sites) {
  if (!Array.isArray(sites)) return [];
  return sites.map((site) =>
    typeof site === "string" ? { pattern: site, isRegex: false } : site
  );
}

/**
 * Load blocked sites from storage, auto-migrating legacy format.
 */
function getBlockedSites(callback) {
  chrome.storage.sync.get(["blockedSites"], (result) => {
    callback(migrateBlockedSites(result.blockedSites || []));
  });
}
