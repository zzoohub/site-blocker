/**
 * Shared utilities for Site Blocker
 */

// -- Constants ----------------------------------------------------------------

const STORAGE_KEY = "blockedSites";
const MESSAGE_UPDATE_RULES = "updateRules";
const SESSION_RULE_ID_OFFSET = 1000;

function faviconUrl(domain, size) {
  const sizeParam = size ? `sz=${size}&` : "";
  return `https://www.google.com/s2/favicons?${sizeParam}domain=${domain}`;
}

// -- Storage Helpers ----------------------------------------------------------

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
 * callback receives (sites, needsMigration):
 *   sites          — migrated array of { pattern, isRegex } objects
 *   needsMigration — true if raw storage contained legacy string entries
 */
function getBlockedSites(callback) {
  chrome.storage.sync.get([STORAGE_KEY], (result) => {
    const raw = result[STORAGE_KEY] || [];
    const sites = migrateBlockedSites(raw);
    const needsMigration = raw.some((s) => typeof s === "string");
    callback(sites, needsMigration);
  });
}
