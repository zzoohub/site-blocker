/**
 * Website Blocker - Background Service Worker
 *
 * Manages website blocking using:
 * 1. declarativeNetRequest API - Network-level blocking
 * 2. tabs API - Catches cached pages and edge cases
 */

// ============================================================================
// INITIALIZATION
// ============================================================================

chrome.runtime.onInstalled.addListener(() => {
  migrateStorageAndApplyRules();
});

loadAndApplyRules();

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "updateRules") {
    updateBlockingRules(request.sites);
  }
});

// ============================================================================
// TAB MONITORING
// ============================================================================

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== "loading") return;

  const url = changeInfo.url || tab.url;
  if (!url || url.startsWith("chrome-extension://")) return;

  chrome.storage.sync.get(["blockedSites"], (result) => {
    const blockedSites = migrateBlockedSites(result.blockedSites || []);
    if (isUrlBlocked(url, blockedSites)) {
      redirectToBlockedPage(tabId, url);
    }
  });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Migrate old string format to new object format
 * Old: ["youtube.com", "facebook.com"]
 * New: [{ pattern: "youtube.com", isRegex: false }, ...]
 */
function migrateBlockedSites(sites) {
  if (!Array.isArray(sites)) return [];

  return sites.map((site) => {
    if (typeof site === "string") {
      return { pattern: site, isRegex: false };
    }
    return site;
  });
}

/**
 * Migrate storage on install/update and apply rules
 */
function migrateStorageAndApplyRules() {
  chrome.storage.sync.get(["blockedSites"], (result) => {
    const sites = result.blockedSites || [];

    // Check if migration is needed (any string items)
    const needsMigration = sites.some((site) => typeof site === "string");

    if (needsMigration) {
      const migratedSites = migrateBlockedSites(sites);
      chrome.storage.sync.set({ blockedSites: migratedSites }, () => {
        if (migratedSites.length > 0) {
          updateBlockingRules(migratedSites);
        }
      });
    } else {
      if (sites.length > 0) {
        updateBlockingRules(sites);
      }
    }
  });
}

function loadAndApplyRules() {
  chrome.storage.sync.get(["blockedSites"], (result) => {
    const blockedSites = migrateBlockedSites(result.blockedSites || []);
    if (blockedSites.length > 0) {
      updateBlockingRules(blockedSites);
    }
  });
}

/**
 * Check if a URL should be blocked
 * Handles both regular URL patterns and regex patterns
 * For regex patterns, URL is decoded before matching to handle encoded characters
 */
function isUrlBlocked(url, blockedSites) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace(/^www\./, "");
    const pathname = urlObj.pathname;

    // Decode URL for regex matching (handles %ED%95%9C%EA%B8%80 -> 한글)
    let decodedUrl;
    try {
      decodedUrl = decodeURIComponent(url);
    } catch {
      // If decoding fails, use original URL
      decodedUrl = url;
    }

    return blockedSites.some((site) => {
      if (site.isRegex) {
        // Regex pattern matching on decoded URL
        try {
          const regex = new RegExp(site.pattern, "i");
          return regex.test(decodedUrl);
        } catch {
          // Invalid regex, skip
          return false;
        }
      }

      // Regular URL pattern matching (existing logic)
      const pattern = site.pattern;

      if (pattern.includes("/")) {
        const [siteDomain, ...pathParts] = pattern.split("/");
        const sitePath = "/" + pathParts.join("/");

        const domainMatches =
          hostname === siteDomain ||
          hostname === `www.${siteDomain}` ||
          hostname.endsWith(`.${siteDomain}`);

        return domainMatches && pathname.startsWith(sitePath);
      }

      return (
        hostname === pattern ||
        hostname === `www.${pattern}` ||
        hostname.endsWith(`.${pattern}`)
      );
    });
  } catch {
    return false;
  }
}

function redirectToBlockedPage(tabId, url) {
  const blockedPageUrl = chrome.runtime.getURL(
    `blocked.html?url=${encodeURIComponent(url)}`
  );
  chrome.tabs.update(tabId, { url: blockedPageUrl });
}

/**
 * Create blocking rules for declarativeNetRequest API
 * Regular patterns use urlFilter, regex patterns use regexFilter
 */
function createBlockingRules(sites) {
  const rules = [];
  let ruleId = 1;

  sites.forEach((site) => {
    if (site.isRegex) {
      // Regex pattern - use regexFilter
      // Note: regexFilter uses RE2 syntax and works on raw URLs (not decoded)
      // For Korean character matching in encoded URLs, tab monitoring handles it
      rules.push({
        id: ruleId++,
        priority: 1,
        action: { type: "block" },
        condition: {
          regexFilter: site.pattern,
          resourceTypes: ["main_frame"],
        },
      });
    } else {
      // Regular URL pattern - use urlFilter (existing logic)
      const pattern = site.pattern;

      rules.push({
        id: ruleId++,
        priority: 1,
        action: { type: "block" },
        condition: {
          urlFilter: pattern.includes("/") ? `||${pattern}*` : `||${pattern}`,
          resourceTypes: ["main_frame"],
        },
      });

      // Add www variant
      rules.push({
        id: ruleId++,
        priority: 1,
        action: { type: "block" },
        condition: {
          urlFilter: pattern.includes("/")
            ? `||www.${pattern}*`
            : `||www.${pattern}`,
          resourceTypes: ["main_frame"],
        },
      });
    }
  });

  return rules;
}

function updateBlockingRules(sites) {
  const rules = createBlockingRules(sites);
  updateDynamicRules(rules);
  updateSessionRules(rules);
}

function updateDynamicRules(newRules) {
  chrome.declarativeNetRequest.getDynamicRules((existingRules) => {
    const ruleIds = existingRules.map((rule) => rule.id);
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: ruleIds,
      addRules: newRules,
    });
  });
}

function updateSessionRules(newRules) {
  chrome.declarativeNetRequest.getSessionRules((existingRules) => {
    const ruleIds = existingRules.map((rule) => rule.id);
    const sessionRules = newRules.map((rule) => ({
      ...rule,
      id: rule.id + 1000,
    }));

    chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: ruleIds,
      addRules: sessionRules,
    });
  });
}
