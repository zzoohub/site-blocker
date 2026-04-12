// -- DOM References (resolved once on DOMContentLoaded) -----------------------

let $input, $regexToggle;

document.addEventListener("DOMContentLoaded", () => {
  $input = document.getElementById("websiteInput");
  $regexToggle = document.getElementById("regexMode");

  loadBlockedSites();

  document.getElementById("addBtn").addEventListener("click", addWebsite);
  $input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") addWebsite();
  });
  $input.addEventListener("input", clearError);

  $regexToggle.addEventListener("change", (e) => {
    $input.placeholder = e.target.checked
      ? "Enter regex (e.g., youtube\\.com.*[가-힣])"
      : "Enter website (e.g., youtube.com)";
    clearError();
  });
});

// -- Site Management -----------------------------------------------------------

function addWebsite() {
  const isRegex = $regexToggle.checked;
  const rawValue = $input.value.trim();

  if (!rawValue) return;

  if (isRegex && !isValidRegex(rawValue)) {
    showError("Invalid regex pattern");
    return;
  }

  const site = isRegex
    ? { pattern: rawValue, isRegex: true }
    : { pattern: normalizeDomain(rawValue), isRegex: false };

  getBlockedSites((blockedSites) => {
    const isDuplicate = blockedSites.some(
      (s) => s.pattern === site.pattern && s.isRegex === site.isRegex
    );
    if (isDuplicate) {
      $input.value = "";
      clearError();
      return;
    }

    blockedSites.push(site);
    saveBlockedSites(blockedSites, () => {
      $input.value = "";
      clearError();
      loadBlockedSites();
    });
  });
}

// -- Storage -------------------------------------------------------------------

function saveBlockedSites(sites, callback) {
  chrome.storage.sync.set({ blockedSites: sites }, () => {
    chrome.runtime.sendMessage({ action: "updateRules", sites });
    if (callback) callback();
  });
}

// -- UI Rendering --------------------------------------------------------------

function loadBlockedSites() {
  getBlockedSites((sites) => {
    const container = document.getElementById("blockedSites");
    container.textContent = "";

    if (sites.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No blocked websites yet";
      container.appendChild(empty);
      return;
    }

    for (const site of sites) {
      container.appendChild(createSiteElement(site));
    }
  });
}

function createSiteElement(site) {
  const item = document.createElement("div");
  item.className = "blocked-item";

  const info = document.createElement("div");
  info.className = "site-info-popup";

  if (site.isRegex) {
    info.appendChild(createRegexIcon());
    info.appendChild(createText(site.pattern));
    info.appendChild(createBadge("regex"));
  } else {
    const domain = site.pattern.split("/")[0];
    info.appendChild(createFavicon(domain));
    info.appendChild(createText(site.pattern));
  }

  item.appendChild(info);
  return item;
}

function createRegexIcon() {
  const icon = document.createElement("span");
  icon.className = "regex-icon";
  icon.textContent = ".*";
  return icon;
}

function createFavicon(domain) {
  const img = document.createElement("img");
  img.className = "site-favicon-popup";
  img.src = `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;
  img.alt = `${domain} icon`;
  return img;
}

function createText(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

function createBadge(label) {
  const badge = document.createElement("span");
  badge.className = "regex-badge";
  badge.textContent = label;
  return badge;
}

// -- Helpers -------------------------------------------------------------------

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
  const el = document.getElementById("errorMessage");
  el.textContent = message;
  el.style.display = "block";
}

function clearError() {
  document.getElementById("errorMessage").style.display = "none";
}
