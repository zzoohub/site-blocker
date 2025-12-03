document.addEventListener("DOMContentLoaded", () => {
  loadBlockedSites();

  document.getElementById("addBtn").addEventListener("click", addWebsite);
  document.getElementById("websiteInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") addWebsite();
  });
});

// ============================================================================
// WEBSITE MANAGEMENT
// ============================================================================

function addWebsite() {
  const input = document.getElementById("websiteInput");
  const website = normalizeDomain(input.value.trim());

  if (!website) return;

  chrome.storage.sync.get(["blockedSites"], (result) => {
    const blockedSites = result.blockedSites || [];

    if (blockedSites.includes(website)) {
      input.value = "";
      return;
    }

    blockedSites.push(website);
    saveBlockedSites(blockedSites, () => {
      input.value = "";
      loadBlockedSites();
    });
  });
}

function removeWebsite(website) {
  chrome.storage.sync.get(["blockedSites"], (result) => {
    const blockedSites = result.blockedSites || [];
    const updatedSites = blockedSites.filter((site) => site !== website);
    saveBlockedSites(updatedSites, loadBlockedSites);
  });
}

// ============================================================================
// UI RENDERING
// ============================================================================

function loadBlockedSites() {
  chrome.storage.sync.get(["blockedSites"], (result) => {
    const blockedSites = result.blockedSites || [];
    const container = document.getElementById("blockedSites");

    if (blockedSites.length === 0) {
      container.innerHTML = '<p style="color: #999;">No blocked websites yet</p>';
      return;
    }

    container.innerHTML = "";
    blockedSites.forEach((site) => {
      container.appendChild(createBlockedSiteElement(site));
    });
  });
}

function createBlockedSiteElement(site) {
  const item = document.createElement("div");
  item.className = "blocked-item";

  const domain = site.split('/')[0];

  item.innerHTML = `
    <div class="site-info-popup">
      <img class="site-favicon-popup" src="https://www.google.com/s2/favicons?sz=32&domain=${domain}" alt="${escapeHtml(domain)} icon">
      <span>${escapeHtml(site)}</span>
    </div>
    <button class="remove-btn" data-site="${escapeHtml(site)}">Remove</button>
  `;

  item.querySelector(".remove-btn").addEventListener("click", (e) => {
    removeWebsite(e.target.getAttribute("data-site"));
  });

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

function saveBlockedSites(sites, callback) {
  chrome.storage.sync.set({ blockedSites: sites }, () => {
    chrome.runtime.sendMessage({ action: "updateRules", sites });
    if (callback) callback();
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
