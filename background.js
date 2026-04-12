/**
 * Site Blocker - Background Service Worker
 *
 * Two blocking layers:
 * 1. declarativeNetRequest — network-level blocking
 * 2. tabs.onUpdated — catches cached pages and edge cases
 */

importScripts("shared.js");

// -- Initialization & Events ---------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  loadAndApplyRules({ persistMigration: true });
});
loadAndApplyRules();

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === MESSAGE_UPDATE_RULES) {
    updateBlockingRules(request.sites);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== "loading") return;

  const url = changeInfo.url || tab.url;
  if (!url || url.startsWith("chrome-extension://")) return;

  getBlockedSites((sites) => {
    if (isUrlBlocked(url, sites)) {
      redirectToBlockedPage(tabId, url);
    }
  });
});

// -- Storage -------------------------------------------------------------------

/**
 * Load sites from storage and apply blocking rules.
 * With persistMigration: true, saves migrated data back to storage (on install/update only).
 */
function loadAndApplyRules({ persistMigration = false } = {}) {
  chrome.storage.sync.get([STORAGE_KEY], (result) => {
    const raw = result[STORAGE_KEY] || [];
    const sites = migrateBlockedSites(raw);

    if (sites.length === 0) return;

    const needsSave =
      persistMigration && raw.some((s) => typeof s === "string");
    if (needsSave) {
      chrome.storage.sync.set({ [STORAGE_KEY]: sites }, () =>
        updateBlockingRules(sites)
      );
    } else {
      updateBlockingRules(sites);
    }
  });
}

// -- URL Matching --------------------------------------------------------------

function isUrlBlocked(url, blockedSites) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace(/^www\./, "");
    const decodedUrl = tryDecode(url);

    return blockedSites.some((site) =>
      site.isRegex
        ? matchesRegex(decodedUrl, site.pattern)
        : matchesUrlPattern(hostname, urlObj.pathname, site.pattern)
    );
  } catch {
    return false;
  }
}

function matchesRegex(url, pattern) {
  try {
    return new RegExp(pattern, "i").test(url);
  } catch {
    return false;
  }
}

function matchesUrlPattern(hostname, pathname, pattern) {
  if (pattern.includes("/")) {
    const [domain, ...pathParts] = pattern.split("/");
    return (
      matchesDomain(hostname, domain) &&
      pathname.startsWith("/" + pathParts.join("/"))
    );
  }
  return matchesDomain(hostname, pattern);
}

function matchesDomain(hostname, domain) {
  return (
    hostname === domain ||
    hostname === `www.${domain}` ||
    hostname.endsWith(`.${domain}`)
  );
}

function tryDecode(url) {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

function redirectToBlockedPage(tabId, url) {
  const blockedPageUrl = chrome.runtime.getURL(
    `blocked.html?url=${encodeURIComponent(url)}`
  );
  chrome.tabs.update(tabId, { url: blockedPageUrl });
}

// -- Blocking Rules ------------------------------------------------------------

function blockRule(id, condition) {
  return {
    id,
    priority: 1,
    action: { type: "block" },
    condition: { ...condition, resourceTypes: ["main_frame"] },
  };
}

function createBlockingRules(sites) {
  const rules = [];
  let id = 1;

  for (const site of sites) {
    if (site.isRegex) {
      rules.push(blockRule(id++, { regexFilter: site.pattern }));
      continue;
    }

    const hasPath = site.pattern.includes("/");
    const suffix = hasPath ? "*" : "";

    rules.push(blockRule(id++, { urlFilter: `||${site.pattern}${suffix}` }));
    rules.push(
      blockRule(id++, { urlFilter: `||www.${site.pattern}${suffix}` })
    );
  }

  return rules;
}

function updateBlockingRules(sites) {
  const rules = createBlockingRules(sites);

  // Dynamic rules persist across browser restarts
  chrome.declarativeNetRequest.getDynamicRules((existing) => {
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map((r) => r.id),
      addRules: rules,
    });
  });

  // Session rules are active until the browser closes
  chrome.declarativeNetRequest.getSessionRules((existing) => {
    chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: existing.map((r) => r.id),
      addRules: rules.map((r) => ({ ...r, id: r.id + SESSION_RULE_ID_OFFSET })),
    });
  });
}
