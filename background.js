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
  loadAndApplyRules();
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
    const blockedSites = result.blockedSites || [];
    if (isUrlBlocked(url, blockedSites)) {
      redirectToBlockedPage(tabId, url);
    }
  });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function loadAndApplyRules() {
  chrome.storage.sync.get(["blockedSites"], (result) => {
    const blockedSites = result.blockedSites || [];
    if (blockedSites.length > 0) {
      updateBlockingRules(blockedSites);
    }
  });
}

function isUrlBlocked(url, blockedSites) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace(/^www\./, "");
    const pathname = urlObj.pathname;

    return blockedSites.some((site) => {
      if (site.includes("/")) {
        const [siteDomain, ...pathParts] = site.split("/");
        const sitePath = "/" + pathParts.join("/");

        const domainMatches =
          hostname === siteDomain ||
          hostname === `www.${siteDomain}` ||
          hostname.endsWith(`.${siteDomain}`);

        return domainMatches && pathname.startsWith(sitePath);
      }

      return (
        hostname === site ||
        hostname === `www.${site}` ||
        hostname.endsWith(`.${site}`)
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

function createBlockingRules(sites) {
  return sites.flatMap((site, index) => {
    const baseRule = {
      id: index * 2 + 1,
      priority: 1,
      action: { type: "block" },
      condition: {
        urlFilter: site.includes("/") ? `||${site}*` : `||${site}`,
        resourceTypes: ["main_frame"],
      },
    };

    const wwwRule = {
      ...baseRule,
      id: index * 2 + 2,
      condition: {
        ...baseRule.condition,
        urlFilter: site.includes("/") ? `||www.${site}*` : `||www.${site}`,
      },
    };

    return [baseRule, wwwRule];
  });
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
