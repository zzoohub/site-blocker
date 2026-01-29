document.addEventListener("DOMContentLoaded", () => {
  loadBlockedSites();

  document.getElementById("addBtn").addEventListener("click", addWebsite);
  document.getElementById("websiteInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") addWebsite();
  });

  // Update placeholder based on regex mode
  document.getElementById("regexMode").addEventListener("change", (e) => {
    const input = document.getElementById("websiteInput");
    if (e.target.checked) {
      input.placeholder = "Enter regex (e.g., youtube\\.com.*[가-힣])";
    } else {
      input.placeholder = "Enter website (e.g., youtube.com)";
    }
    clearError();
  });

  document.getElementById("websiteInput").addEventListener("input", clearError);
});

// ============================================================================
// WEBSITE MANAGEMENT
// ============================================================================

function addWebsite() {
  const input = document.getElementById("websiteInput");
  const regexMode = document.getElementById("regexMode").checked;
  const rawValue = input.value.trim();

  if (!rawValue) return;

  // Validate regex if in regex mode
  if (regexMode) {
    if (!isValidRegex(rawValue)) {
      showError("Invalid regex pattern");
      return;
    }
  }

  const site = regexMode
    ? { pattern: rawValue, isRegex: true }
    : { pattern: normalizeDomain(rawValue), isRegex: false };

  chrome.storage.sync.get(["blockedSites"], (result) => {
    const blockedSites = migrateBlockedSites(result.blockedSites || []);

    // Check for duplicates
    const isDuplicate = blockedSites.some(
      (s) => s.pattern === site.pattern && s.isRegex === site.isRegex
    );

    if (isDuplicate) {
      input.value = "";
      clearError();
      return;
    }

    blockedSites.push(site);
    saveBlockedSites(blockedSites, () => {
      input.value = "";
      clearError();
      loadBlockedSites();
    });
  });
}

function removeSite(index) {
  chrome.storage.sync.get(["blockedSites"], (result) => {
    const blockedSites = migrateBlockedSites(result.blockedSites || []);
    blockedSites.splice(index, 1);
    saveBlockedSites(blockedSites, loadBlockedSites);
  });
}

// ============================================================================
// UI RENDERING
// ============================================================================

function loadBlockedSites() {
  chrome.storage.sync.get(["blockedSites"], (result) => {
    const blockedSites = migrateBlockedSites(result.blockedSites || []);
    const container = document.getElementById("blockedSites");

    // Clear container
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    if (blockedSites.length === 0) {
      const emptyMessage = document.createElement("p");
      emptyMessage.style.color = "#999";
      emptyMessage.textContent = "No blocked websites yet";
      container.appendChild(emptyMessage);
      return;
    }

    blockedSites.forEach((site, index) => {
      container.appendChild(createBlockedSiteElement(site, index));
    });
  });
}

function createBlockedSiteElement(site, index) {
  const item = document.createElement("div");
  item.className = "blocked-item";

  const siteInfo = document.createElement("div");
  siteInfo.className = "site-info-popup";

  if (site.isRegex) {
    // For regex patterns, show a regex icon instead of favicon
    const regexIcon = document.createElement("span");
    regexIcon.textContent = ".*";
    regexIcon.style.cssText =
      "font-family: monospace; font-weight: bold; font-size: 12px; color: #9c27b0; width: 20px; text-align: center;";
    siteInfo.appendChild(regexIcon);

    const siteText = document.createElement("span");
    siteText.textContent = site.pattern;
    siteInfo.appendChild(siteText);

    const badge = document.createElement("span");
    badge.className = "regex-badge";
    badge.textContent = "regex";
    siteInfo.appendChild(badge);
  } else {
    const domain = site.pattern.split("/")[0];

    const favicon = document.createElement("img");
    favicon.className = "site-favicon-popup";
    favicon.src = `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;
    favicon.alt = `${domain} icon`;
    siteInfo.appendChild(favicon);

    const siteText = document.createElement("span");
    siteText.textContent = site.pattern;
    siteInfo.appendChild(siteText);
  }

  item.appendChild(siteInfo);

  // Add remove button
  const removeBtn = document.createElement("button");
  removeBtn.className = "remove-btn";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", () => removeSite(index));
  item.appendChild(removeBtn);

  return item;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function normalizeDomain(url) {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("?")[0]
    .split("#")[0]
    .replace(/\/$/, "");
}

function isValidRegex(pattern) {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

function showError(message) {
  const errorEl = document.getElementById("errorMessage");
  errorEl.textContent = message;
  errorEl.style.display = "block";
}

function clearError() {
  const errorEl = document.getElementById("errorMessage");
  errorEl.style.display = "none";
}

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

function saveBlockedSites(sites, callback) {
  chrome.storage.sync.set({ blockedSites: sites }, () => {
    chrome.runtime.sendMessage({ action: "updateRules", sites });
    if (callback) callback();
  });
}
