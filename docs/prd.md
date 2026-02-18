# Permanent Site Blocker — PRD

**Status:** Shipped (v1.3.0)
**Author:** zzoo
**Last Updated:** 2026-02-18
**Related:** [Product Brief](./product-brief.md)

---

## 1. Problem / Opportunity

### The Problem

Users who want to block distracting websites face a paradox: the tools designed to help them stay focused are too easy to circumvent, ultimately returning the user to a willpower battle they've already lost.

Existing site blockers suffer from three structural failures:

1. **Block list caps** — Most free-tier extensions limit users to 10-50 blocked sites, forcing users to constantly curate rather than comprehensively block.
2. **VPN-based blocking** — Tools like Freedom route all traffic through a VPN tunnel, causing battery drain, network latency, and raising privacy concerns — all to solve a problem that should be handled at the browser level.
3. **Easy reversibility** — Nearly every blocker offers a password, timer, or toggle to disable blocking. This gives the impulsive brain an escape hatch, defeating the entire purpose.

### Why Now

- Chrome Manifest V3's `declarativeNetRequest` API has reached stability, enabling true network-level blocking from lightweight extensions without VPN overhead.
- The explosion of short-form content (YouTube Shorts, TikTok, Instagram Reels) has created demand for URL-pattern-level precision — blocking `/shorts` without blocking all of YouTube.
- Remote work normalization has increased the need for self-managed productivity tools that don't rely on corporate IT policies.

---

## 2. Target Users & Use Cases

### Primary Persona

**The Self-Aware Procrastinator** — A knowledge worker or student who recognizes their distraction patterns but has failed to self-regulate through willpower alone. They have tried other blockers but always found themselves disabling the block at the moment of temptation.

Key traits:
- Works from home or in unsupervised environments
- Has specific sites/patterns they waste time on (not all browsing)
- Wants a tool that treats blocking as a commitment, not a suggestion
- Values privacy and simplicity over feature richness

### Use Cases

| # | Use Case | Priority |
|---|----------|----------|
| UC1 | Block an entire domain (e.g., `twitter.com`) permanently | P0 |
| UC2 | Block a specific path on a domain (e.g., `youtube.com/shorts`) | P0 |
| UC3 | Block URLs matching a regex pattern (e.g., `youtube\.com.*[가-힣]`) | P0 |
| UC4 | See which sites are currently blocked | P0 |
| UC5 | See a clear "blocked" message when visiting a blocked URL | P0 |
| UC6 | Sync blocked list across Chrome browsers via Chrome Sync | P1 |

---

## 3. Solution Overview

Permanent Site Blocker is a Chrome extension that blocks websites at the browser's network level using a dual-layer approach. It intentionally provides no way to unblock sites once added, making the act of blocking a deliberate, irreversible commitment.

**Core value propositions:**
1. **Irreversible by design** — No unblock button, no password bypass, no timer. The only way out is reinstalling the extension.
2. **Network-level blocking** — Requests are killed before they reach the server, not redirected after loading.
3. **Precision matching** — Regex support lets users block specific URL patterns without over-blocking entire domains.

---

## 4. Goals & Success Metrics

| Goal | Metric | Target | Timeframe |
|------|--------|--------|-----------|
| User adoption | Chrome Web Store active installs | 1,000+ | 6 months post-launch |
| User satisfaction | Chrome Web Store average rating | 4.5+ / 5.0 | Ongoing |
| Blocking effectiveness | User-reported bypass incidents | 0 reported bypasses | Ongoing |
| Design philosophy acceptance | Negative reviews citing irreversibility | <10% of total reviews | Ongoing |

**Counter-metric:** Monitor uninstall rate to ensure irreversibility doesn't drive excessive churn.

---

## 5. Functional Requirements

### 5.1 Adding a Blocked Site

**[P0]** User can enter a domain or URL path in the popup input field to block it.

- Input field accepts domains (`twitter.com`) and domain+path (`youtube.com/shorts`).
- Input trims whitespace and normalizes the entry.
- Autocomplete is disabled on the input field to prevent browser suggestions.
- Pressing the "Block Site" button adds the entry to the blocked list.

**[P0]** User can toggle regex mode to block by pattern.

- A checkbox labeled for regex mode toggles between standard and regex input.
- When regex mode is active, the placeholder text changes to indicate regex syntax is expected.
- Invalid regex patterns display a real-time error message below the input.
- Valid regex patterns are stored with an `isRegex: true` flag.

**[P0]** Newly blocked sites take effect immediately without browser restart.

- Blocking rules are applied to both dynamic rules (persistent) and session rules (temporary) simultaneously.
- The tab monitoring layer activates immediately for the new pattern.

### 5.2 Blocking Behavior

**[P0]** Blocked sites are intercepted at the network level before the page loads.

- Uses Chrome's `declarativeNetRequest` API to register blocking rules.
- Standard patterns generate two rules per entry: one for the exact domain and one for the `www.` variant.
- Regex patterns generate one rule using `regexFilter` with RE2 syntax.
- All rules target `main_frame` resource type only (does not block subresources like images or scripts on other pages).
- Rules are registered as both dynamic rules (persist across sessions) and session rules (ID offset +1000).

**[P0]** Cached or pre-loaded pages that bypass network blocking are caught by the tab monitoring layer.

- A `tabs.onUpdated` listener evaluates every tab URL change against the blocked list.
- If a match is found, the tab is redirected to `blocked.html`.
- URL matching logic (`isUrlBlocked` function):
  - Standard mode: strips `www.` prefix, matches hostname (with subdomain support) and optional path.
  - Regex mode: decodes the full URL first (handles encoded characters like Korean `%ED%95%9C%EA%B8%80`), then applies case-insensitive RegExp matching.
  - Invalid regex patterns are silently skipped to prevent runtime errors.

**[P0]** There is no mechanism to unblock or remove a site once added.

- The remove/unblock functionality has been intentionally removed from the codebase.
- This is the core design decision, not a missing feature.

### 5.3 Blocked Page

**[P0]** When a user visits a blocked site, they see a clear, informative blocked page.

- Full-screen gradient background (purple/blue).
- Displays "Website Blocked" heading with pulsing icon animation.
- Shows the blocked URL with its favicon in a card layout.
- Displays motivational message: "Stay focused and productive!"
- The page is responsive, adapting layout for screens narrower than 600px.
- The blocked URL is decoded for readability (e.g., Korean characters display properly).

### 5.4 Blocked Sites List

**[P0]** User can view all currently blocked sites in the popup.

- Blocked sites are displayed in a scrollable list (max-height 300px).
- Standard entries show a favicon (20x20px) fetched from Google's favicon service.
- Regex entries show a purple ".\*" icon and a "regex" badge.
- When no sites are blocked, displays: "No blocked websites yet."
- No delete/remove controls are present on list items.

### 5.5 Data Storage & Synchronization

**[P1]** Blocked sites sync across Chrome browsers when the user is signed in to Chrome.

- Uses `chrome.storage.sync` API.
- Data format: array of objects `{ url: string, isRegex: boolean }`.
- Storage writes trigger rule regeneration on all synced browsers.

**[P1]** Legacy data is automatically migrated on extension install or update.

- Previous format (plain string array) is detected and converted to the new object format.
- Migration runs in the `onInstalled` event handler.
- No user action required.

### 5.6 Privacy

**[P0]** The extension collects zero user data.

- No analytics, telemetry, or tracking of any kind.
- No data is transmitted to external servers.
- All data resides in Chrome's local sync storage.
- The only external request is to Google's favicon service for display purposes.
- A privacy policy document is included (`PRIVACY_POLICY.md`).

---

## 6. User Flows

### Flow 1: Block a Standard URL

```
Popup opens
  → User types "youtube.com/shorts" in input
  → User clicks "Block Site"
  → Entry appears in blocked list with YouTube favicon
  → background.js creates declarativeNetRequest rules:
      Rule 1: ||youtube.com/shorts*
      Rule 2: ||www.youtube.com/shorts*
  → Visiting youtube.com/shorts now shows blocked.html
```

### Flow 2: Block a Regex Pattern

```
Popup opens
  → User checks "Regex" checkbox
  → Placeholder changes to regex hint
  → User types "youtube\.com.*[가-힣]"
  → Real-time validation confirms pattern is valid
  → User clicks "Block Site"
  → Entry appears in list with ".*" icon and "regex" badge
  → background.js creates regexFilter rule
  → YouTube URLs containing Korean characters now show blocked.html
```

### Flow 3: Visit a Blocked Site

```
User navigates to blocked URL
  → [Layer 1] declarativeNetRequest intercepts network request
  → OR [Layer 2] tabs.onUpdated detects URL match on cached page
  → Tab redirects to blocked.html
  → User sees "Website Blocked" with site favicon and URL
  → User sees "Stay focused and productive!"
  → No option to unblock or proceed
```

---

## 7. Scope & Non-Goals

### In Scope (v1.3.0 — Shipped)

- Standard URL/domain blocking
- Regex pattern blocking (RE2)
- Dual-layer blocking (network + tab monitoring)
- Popup UI for adding and viewing blocked sites
- Blocked page with motivational messaging
- Chrome Sync storage
- Legacy data migration
- Privacy-first architecture

### Out of Scope (Intentional)

| Non-Goal | Reasoning |
|----------|-----------|
| Unblock/remove functionality | Core design philosophy — irreversibility is the feature |
| Time-based/scheduled blocking | Always-on blocking is the value proposition |
| Whitelist/exception rules | Exceptions are the beginning of bypass |
| Usage analytics/dashboard | Contradicts privacy-first principles |
| Mobile app or cross-browser | Focus on Chrome where the API is strongest |
| Blocking subresources (images, scripts) | `main_frame` only — avoids breaking pages the user hasn't blocked |
| Password-protected settings | Any unlock mechanism undermines irreversibility |

### Future Consideration

- Blocked site categorization/tagging
- Blocked page visual customization
- Import/export of block lists
- Bulk-add patterns

---

## 8. Technical Architecture

### Component Map

```
┌──────────────────────────────────────────────────────┐
│                    Chrome Browser                     │
├────────────┬─────────────────────────────────────────┤
│ Popup UI   │ popup.html + popup.js                   │
│            │ - Site input (standard / regex)          │
│            │ - Blocked list with favicons             │
│            │ - Writes to chrome.storage.sync          │
├────────────┼─────────────────────────────────────────┤
│ Service    │ background.js                            │
│ Worker     │ - Listens to storage changes             │
│            │ - Manages declarativeNetRequest rules    │
│            │   (dynamic + session)                    │
│            │ - tabs.onUpdated fallback monitoring     │
│            │ - isUrlBlocked() matching logic          │
│            │ - Data migration on install/update       │
├────────────┼─────────────────────────────────────────┤
│ Blocked    │ blocked.html + blocked.js                │
│ Page       │ - Reads blocked URL from query params    │
│            │ - Displays favicon + decoded URL         │
│            │ - Motivational messaging                 │
└────────────┴─────────────────────────────────────────┘
```

### Permissions Justification

| Permission | Purpose |
|-----------|---------|
| `declarativeNetRequest` | Network-level blocking rules |
| `storage` | Persist and sync blocked sites list |
| `tabs` | Monitor tab URLs for fallback blocking |
| `<all_urls>` (host) | Allow blocking any user-specified domain |

### Rule Generation Strategy

| Entry Type | Dynamic Rules | Session Rules |
|-----------|---------------|---------------|
| Standard URL | 2 rules (domain + www variant) | 2 rules (ID + 1000 offset) |
| Regex pattern | 1 rule (regexFilter, RE2) | 1 rule (ID + 1000 offset) |

---

## 9. Assumptions, Constraints & Dependencies

### Assumptions

- Users understand that blocking is permanent before they add a site.
- Chrome Sync is reliable enough for cross-device block list synchronization.
- RE2 regex syntax covers the majority of user-desired patterns.

### Constraints

- Chrome's dynamic rule limit: 5,000 rules maximum.
- RE2 regex engine does not support all PCRE features (e.g., lookahead/lookbehind).
- Manifest V3 service workers have no persistent state — must rely on storage API.
- `declarativeNetRequest` can only target predefined resource types.

### Dependencies

- **Chrome declarativeNetRequest API** — Core blocking mechanism.
- **Chrome storage.sync API** — Data persistence and cross-device sync.
- **Google Favicon Service** — Favicon display in popup and blocked page.

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Chrome policy change restricts `<all_urls>` permission | High | Monitor Chrome extension policy updates; prepare for per-site permission model |
| declarativeNetRequest API deprecation or breaking change | High | Dual-layer architecture provides fallback via tabs API |
| Google Favicon service becomes unavailable | Low | Graceful degradation — show default icon |
| User frustration with irreversible blocking | Medium | Clear messaging in Chrome Web Store listing and popup UI |

---

## 10. File Inventory

| File | Role |
|------|------|
| `manifest.json` | Extension configuration (MV3) |
| `background.js` | Service worker — blocking logic, rule management, data migration |
| `popup.html` | Popup markup |
| `popup.js` | Popup logic — input handling, list rendering, storage writes |
| `blocked.html` | Blocked page markup |
| `blocked.js` | Blocked page logic — URL/favicon display |
| `icon16.png` | Toolbar icon (16x16) |
| `icon48.png` | Extension management icon (48x48) |
| `icon128.png` | Chrome Web Store icon (128x128) |
| `PRIVACY_POLICY.md` | Privacy policy documentation |

---

*This PRD reflects the shipped state of v1.3.0. It is a living document and will be updated as the product evolves.*
