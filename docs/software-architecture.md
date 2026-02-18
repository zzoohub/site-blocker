# Permanent Site Blocker — Software Architecture Design Document

**Status:** Approved (Shipped v1.3.0)
**Author:** zzoo
**Date:** 2026-02-18
**PRD Reference:** [docs/prd.md](./prd.md)
**Product Brief:** [docs/product-brief.md](./product-brief.md)

---

## 1. Context & Scope

### 1.1 Problem Statement

Existing website blockers either cap their block lists, rely on VPN tunneling (causing battery/network overhead), or let users easily disable blocking — defeating the purpose. Permanent Site Blocker solves this by blocking websites at the browser's network level with no unblock mechanism, turning distraction prevention from a willpower exercise into a structural constraint.

### 1.2 System Context Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        User's Machine                       │
│                                                             │
│  ┌───────────┐    ┌──────────────────────────────────────┐  │
│  │  User      │    │         Chrome Browser               │  │
│  │ (clicks    │───▶│                                      │  │
│  │  popup)    │    │  ┌──────────────────────────────┐    │  │
│  └───────────┘    │  │   Permanent Site Blocker      │    │  │
│                   │  │   (Extension)                  │    │  │
│                   │  │                                │    │  │
│                   │  │  ┌──────────┐  ┌───────────┐  │    │  │
│                   │  │  │ Popup UI │  │ Service   │  │    │  │
│                   │  │  │          │  │ Worker    │  │    │  │
│                   │  │  └────┬─────┘  └─────┬─────┘  │    │  │
│                   │  │       │              │         │    │  │
│                   │  │       ▼              ▼         │    │  │
│                   │  │  ┌──────────────────────┐     │    │  │
│                   │  │  │ chrome.storage.sync  │     │    │  │
│                   │  │  └──────────────────────┘     │    │  │
│                   │  │                                │    │  │
│                   │  │  ┌──────────┐                  │    │  │
│                   │  │  │ Blocked  │                  │    │  │
│                   │  │  │ Page     │                  │    │  │
│                   │  │  └──────────┘                  │    │  │
│                   │  └──────────────────────────────┘    │  │
│                   │                                      │  │
│                   │  ┌──────────────────────────────┐    │  │
│                   │  │ Chrome Network Stack         │    │  │
│                   │  │ (declarativeNetRequest rules)│    │  │
│                   │  └──────────────────────────────┘    │  │
│                   └──────────────────────────────────────┘  │
│                                                             │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS (favicon only)
                       ▼
              ┌──────────────────┐
              │ Google Favicon   │
              │ Service          │
              │ (read-only, GET) │
              └──────────────────┘
```

**Actors:**
- **User** — Interacts via the popup to add sites; encounters the blocked page when navigating to a blocked URL.
- **Chrome Browser** — Hosts the extension, provides the API surface (declarativeNetRequest, storage, tabs).
- **Google Favicon Service** — External read-only service for favicon display. The only network dependency.

**Data flows:**
- **Inbound:** User input (URLs/patterns) via popup → chrome.storage.sync.
- **Internal:** storage.sync → service worker → declarativeNetRequest rules + tabs listener.
- **Outbound:** Favicon GET requests to Google (display only, no user data sent).

### 1.3 Assumptions

1. Chrome's Manifest V3 and `declarativeNetRequest` API remain stable and supported.
2. `chrome.storage.sync` provides sufficient capacity for typical block lists (sync quota: 100KB, ~8KB per item).
3. Users understand blocking is permanent before adding sites (communicated via Chrome Web Store listing).
4. The extension will only run on Chrome/Chromium-based browsers.
5. Google's favicon service remains publicly available.

---

## 2. Goals & Non-Goals

### 2.1 Goals

- Block any user-specified URL at the network level before the page loads.
- Provide regex pattern matching for precise URL targeting (e.g., blocking YouTube Shorts without blocking all of YouTube).
- Make blocking irreversible through the extension's own UI.
- Zero data collection — no analytics, no telemetry, no external data transmission.
- Sync blocked sites across Chrome instances via Chrome Sync with zero user configuration.
- Survive service worker termination — all state reconstructable from storage alone.

### 2.2 Non-Goals

- **Unblock/remove capability** — Irreversibility is the product, not a missing feature.
- **Subresource blocking** — Only `main_frame` navigation is blocked; images/scripts/iframes from blocked domains on other pages are not intercepted.
- **Cross-browser support** — Architecture is Chrome-API-dependent by design.
- **Server-side component** — The system is entirely client-side with no backend.
- **Tamper resistance** — The extension can be uninstalled by the user. Preventing this is outside Chrome extension capabilities and outside our scope.

---

## 3. High-Level Architecture

### 3.1 Architecture Style

**System architecture:** Single-process Chrome extension with event-driven internal communication.

There is no server, no database, no network infrastructure. The entire system runs within Chrome's extension sandbox. Components communicate through Chrome's event system (`storage.onChanged`, `tabs.onUpdated`, `runtime.onInstalled`) rather than direct function calls between contexts.

**Code structure:** Flat script architecture — no framework, no build step, no module system.

**Rationale:** A Chrome extension with 3 JavaScript files and a single responsibility does not benefit from hexagonal architecture, dependency injection, or module bundling. The codebase is small enough (~300 lines total) that any developer can read the entire system in 10 minutes. Adding architectural layers would increase complexity with zero benefit. The event-driven communication between popup, service worker, and blocked page is dictated by Chrome's extension security model (isolated contexts), not by architectural choice.

**Trade-offs:**
- Gained: Zero build tooling, zero dependencies, instant comprehension, trivial debugging.
- Sacrificed: No unit test harness, no type safety, no code reuse abstractions. Acceptable given the codebase size.

### 3.2 Container Diagram

The extension consists of three isolated runtime contexts that cannot directly call each other's functions:

```
┌─────────────────────────────────────────────────────────────┐
│                    Chrome Extension                          │
│                                                             │
│  ┌─────────────────┐   storage.sync   ┌─────────────────┐  │
│  │   POPUP          │◀───────────────▶│  SERVICE WORKER  │  │
│  │   (popup.html/js)│   (event-based) │  (background.js) │  │
│  │                  │                  │                  │  │
│  │ Responsibilities:│                  │ Responsibilities:│  │
│  │ - User input     │                  │ - Rule mgmt      │  │
│  │ - Validation     │                  │ - Tab monitoring  │  │
│  │ - List rendering │                  │ - Data migration  │  │
│  └─────────────────┘                  └────────┬─────────┘  │
│                                                │             │
│                                        redirect│             │
│                                                ▼             │
│                                       ┌─────────────────┐   │
│                                       │  BLOCKED PAGE    │   │
│                                       │  (blocked.html/js│   │
│                                       │                  │   │
│                                       │ Responsibilities:│   │
│                                       │ - URL display    │   │
│                                       │ - Favicon fetch  │   │
│                                       │ - Motivation msg │   │
│                                       └─────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              CHROME PLATFORM LAYER                    │   │
│  │  ┌──────────────┐ ┌─────────┐ ┌──────────────────┐  │   │
│  │  │declarativeNet│ │storage  │ │tabs API          │  │   │
│  │  │Request engine│ │.sync    │ │(onUpdated)       │  │   │
│  │  └──────────────┘ └─────────┘ └──────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

| Container | Technology | Responsibility | Communication |
|-----------|-----------|----------------|---------------|
| Popup | Vanilla HTML/JS | User input, validation, list display | Reads/writes `chrome.storage.sync` |
| Service Worker | Vanilla JS (MV3) | Rule generation, tab monitoring, migration | Listens to `storage.onChanged`, `tabs.onUpdated`, `runtime.onInstalled` |
| Blocked Page | Vanilla HTML/JS | Display blocked URL info and motivational message | Reads URL from query params; fetches favicon via HTTPS GET |
| Chrome Platform | Chrome APIs | Network blocking, persistent storage, tab lifecycle | API calls from extension code |

### 3.3 Component Overview

The service worker (`background.js`) is the only container with meaningful internal structure:

```
background.js
├── Event Handlers
│   ├── runtime.onInstalled    → triggers data migration + initial rule sync
│   ├── storage.onChanged      → triggers full rule regeneration
│   └── tabs.onUpdated         → fallback URL check on every navigation
│
├── Core Functions
│   ├── updateBlockRules()     → reads storage, generates rules, applies to both
│   │                            dynamic and session rule sets
│   └── isUrlBlocked()         → URL matching logic (standard + regex modes)
│
└── Data Migration
    └── Legacy format detector → converts string[] to {url, isRegex}[]
```

**Critical path:** `storage.onChanged` → `updateBlockRules()` → rules applied. If this path fails, new sites won't be blocked until the next storage change event.

---

## 4. Data Architecture

### 4.1 Data Flow

**Flow 1: Adding a blocked site**

```
User types URL in popup input
  → popup.js validates input (non-empty; regex validity if regex mode)
  → popup.js reads current array from chrome.storage.sync
  → popup.js appends new { url, isRegex } entry
  → popup.js writes updated array to chrome.storage.sync
  → chrome fires storage.onChanged event
  → background.js receives event
  → updateBlockRules() reads full array from storage
  → Removes ALL existing dynamic + session rules
  → Generates new rule set from full array
  → Applies rules via declarativeNetRequest.updateDynamicRules()
  → Applies rules via declarativeNetRequest.updateSessionRules()
```

**Flow 2: Blocking a navigation**

```
User navigates to URL
  ─── Path A (network-level, primary) ───
  → Chrome network stack evaluates declarativeNetRequest rules
  → Rule matches → request blocked (never reaches server)
  → Chrome shows net::ERR_BLOCKED_BY_CLIENT or similar

  ─── Path B (tab-level, fallback) ───
  → tabs.onUpdated fires with new URL
  → background.js calls isUrlBlocked(url, blockedSites)
  → Match found → chrome.tabs.update() redirects to blocked.html?url=<encoded>
  → blocked.js reads URL param, decodes, displays with favicon
```

**Why both paths exist:** declarativeNetRequest handles the majority of cases at the network level. But cached pages, prerendered pages, and certain browser-internal navigations can bypass network rules. The tabs listener catches these edge cases. The redundancy is intentional — both paths firing for the same URL is harmless (the network block prevents the page from loading; the tab redirect only triggers if the page somehow loaded anyway).

**Flow 3: Data migration (on install/update)**

```
runtime.onInstalled fires
  → Read blockedSites from storage.sync
  → Check if any entry is a plain string (legacy format)
  → If yes: map string[] → { url: string, isRegex: false }[]
  → Write migrated array back to storage.sync
  → updateBlockRules() regenerates all rules
```

### 4.2 Storage Strategy

| Store | Data | Type | Consistency | Capacity |
|-------|------|------|-------------|----------|
| `chrome.storage.sync` | Blocked sites array | Key-value (JSON) | Strong (local), Eventually consistent (cross-device sync) | 100KB total, 8KB per item |
| declarativeNetRequest dynamic rules | Blocking rules | Chrome-managed rule set | Strong (local) | 5,000 rules max |
| declarativeNetRequest session rules | Blocking rules (duplicate) | Chrome-managed rule set | Strong (local, cleared on restart) | 5,000 rules max |

**Why `storage.sync` over `storage.local`:** Cross-device synchronization with zero infrastructure. Chrome handles the sync protocol. Trade-off: 100KB storage limit vs. `storage.local`'s 10MB. Acceptable because the blocked sites list is small — each entry is ~50 bytes, supporting ~2,000 entries within quota.

**Why both dynamic AND session rules:** Dynamic rules persist across browser restarts. Session rules are cleared when the browser closes but are applied faster during the current session. Using both provides defense in depth — if one rule type fails to apply, the other still blocks. The session rules use an ID offset of +1000 to avoid ID collisions with dynamic rules.

### 4.3 Data Schema

```json
// chrome.storage.sync key: "blockedSites"
// Value: array of BlockedSiteEntry

// Current format (v1.3.0)
[
  { "url": "twitter.com", "isRegex": false },
  { "url": "youtube.com/shorts", "isRegex": false },
  { "url": "youtube\\.com.*[가-힣]", "isRegex": true }
]

// Legacy format (pre-regex, auto-migrated)
["twitter.com", "youtube.com/shorts"]
```

---

## 5. Infrastructure & Deployment

### 5.1 Compute Platform

**Platform:** Chrome Extension (runs inside the user's browser).

There is no server infrastructure. The extension runs entirely within Chrome's extension sandbox using:
- A **service worker** for background processing (MV3 requirement — replaces persistent background pages from MV2).
- **Extension pages** for popup and blocked page UI.

**Service worker lifecycle:** Chrome can terminate the service worker at any time to conserve resources. It is restarted on-demand when an event fires (storage change, tab update, etc.). This means the service worker must be stateless — all persistent state lives in `chrome.storage.sync`, and rules are registered with Chrome's declarativeNetRequest engine (which persists independently of the service worker).

**Why not a persistent background page (MV2):** Manifest V3 is now required for new Chrome Web Store submissions. MV2 is deprecated. The service worker model is more resource-efficient at the cost of requiring stateless design.

### 5.2 Deployment Strategy

```
Developer builds .zip
  → Upload to Chrome Web Store Developer Dashboard
  → Chrome Web Store review process
  → Published to Chrome Web Store
  → Chrome auto-updates installed extensions (within ~hours)
```

- No CI/CD pipeline — the extension is a static bundle of HTML/JS/images.
- No build step — source files are shipped directly.
- Rollback: Upload previous version as a new version to Chrome Web Store.
- `site-blocker.zip` in the repo is the packaged distribution artifact.

### 5.3 Environment Topology

| Environment | Description |
|-------------|-------------|
| Development | Load unpacked extension from local filesystem via `chrome://extensions` |
| Production | Chrome Web Store distribution |

No staging environment. The extension's behavior is deterministic and testable locally via Chrome's developer mode.

---

## 6. Cross-Cutting Concerns

### 6.1 Authentication & Authorization

Not applicable. The extension has no user accounts, no login, no server. Chrome's extension permission model is the only authorization layer:

- The user grants permissions at install time (`declarativeNetRequest`, `storage`, `tabs`, `<all_urls>`).
- Chrome enforces these permissions at the API level.

### 6.2 Observability

**Logging:** None in production. The extension includes no logging, metrics, or telemetry by design (privacy-first).

**Debugging:** During development, standard Chrome DevTools:
- Service worker console: `chrome://extensions` → Inspect service worker
- Popup console: Right-click extension icon → Inspect popup
- `chrome.declarativeNetRequest.getDynamicRules()` and `getSessionRules()` for rule inspection

**Trade-off:** Zero observability in production means diagnosing user-reported issues requires reproduction. Accepted because the system is simple enough that most issues can be reproduced locally, and any form of telemetry contradicts the privacy commitment.

### 6.3 Error Handling & Resilience

| Scenario | Handling |
|----------|----------|
| Invalid regex pattern input | popup.js validates via `new RegExp()` in try-catch; displays error message; blocks submission |
| Invalid regex pattern in storage (corrupted) | `isUrlBlocked()` wraps regex construction in try-catch; silently skips invalid patterns |
| `storage.sync` read failure | Chrome API returns empty/error; no sites blocked until storage recovers |
| `declarativeNetRequest` rule application failure | Tab monitoring layer (`tabs.onUpdated`) serves as independent fallback |
| Service worker terminated mid-operation | Stateless design — next event triggers full rule regeneration from storage |
| Google Favicon service unavailable | Broken image icon displayed; no functional impact on blocking |

**Resilience model:** The dual-layer blocking architecture is itself the resilience strategy. The two layers are independent — a failure in `declarativeNetRequest` doesn't affect tab monitoring, and vice versa.

### 6.4 Security

**Extension sandbox:** Chrome's extension security model provides the primary security boundary:
- Content Security Policy restricts script sources to `'self'` only.
- Image sources allowed: `self`, `https://*.google.com`, `https://*.gstatic.com`, `data:` (for favicons).
- No inline scripts, no dynamic code execution, no remote code loading.

**Data at rest:** Blocked sites list stored in Chrome's extension storage. Not encrypted by the extension, but Chrome encrypts its own profile data on supported platforms.

**Data in transit:** No data is sent to external servers. The only outbound request is HTTPS GET to Google's favicon service with a domain name (not user-identifying).

**Input validation:**
- popup.js validates that input is non-empty.
- Regex patterns are validated via `new RegExp()` before storage.
- `isUrlBlocked()` wraps regex construction in try-catch to prevent malformed patterns from crashing the service worker.

**No injection surface:** The extension does not execute user-provided strings as code. Regex patterns are passed to `new RegExp()` (safe constructor) and to `declarativeNetRequest` as `regexFilter` (Chrome validates RE2 syntax server-side).

### 6.5 Performance

**Popup UI:** Renders blocked list synchronously on open. With hundreds of entries, this could cause perceptible lag. Current assumption: most users have <100 entries, making this acceptable.

**Rule generation (`updateBlockRules`):** Deletes all rules then recreates from scratch on every storage change. This is O(n) where n = blocked sites count. With the 5,000 rule cap, worst case is ~10,000 rule operations (5,000 dynamic + 5,000 session) — well within Chrome's handling capacity.

**Tab monitoring (`isUrlBlocked`):** Called on every `tabs.onUpdated` event. Iterates the full blocked list for each event. O(n) per navigation. Could become a concern with thousands of entries and rapid tab switching, but in practice n is small and the operation is string comparison (fast).

**Memory:** The service worker holds no persistent in-memory state. It reads from storage, processes, and exits. Chrome manages memory allocation for declarativeNetRequest rules independently.

---

## 7. Integration Points

| External System | What It Provides | Protocol | Failure Mode | Fallback |
|----------------|------------------|----------|-------------|----------|
| Google Favicon Service | Website favicons for display | HTTPS GET | Broken image icon | Default/missing icon; no functional impact |
| Chrome Storage Sync | Cross-device data synchronization | Chrome internal | Block list not synced; local data intact | Extension works locally; sync resumes when Chrome Sync recovers |
| Chrome declarativeNetRequest | Network-level request blocking | Chrome API | Rules not applied | Tab monitoring layer blocks via redirect |
| Chrome Tabs API | Tab URL monitoring | Chrome API | Fallback layer inactive | Primary layer (declarativeNetRequest) still blocks |

No external system is a hard dependency for the core blocking function. Google Favicon is cosmetic-only. Chrome APIs are the platform itself — if they fail, the extension cannot function regardless of architecture.

---

## 8. Migration & Rollout

### Data Migration (Implemented)

The extension migrated from a legacy data format to the current format:

| Version | Format | Example |
|---------|--------|---------|
| Pre-1.3 | `string[]` | `["twitter.com", "youtube.com"]` |
| 1.3.0+ | `{url, isRegex}[]` | `[{"url": "twitter.com", "isRegex": false}]` |

**Strategy:** Automatic, transparent migration on `runtime.onInstalled` (covers both fresh installs and updates):
1. Read `blockedSites` from storage.
2. Check if any element is a plain string.
3. If yes, map each string to `{ url: string, isRegex: false }`.
4. Write the migrated array back to storage.
5. Regenerate all blocking rules.

**Rollback:** Not needed — the new format is a strict superset of the old format. No data is lost.

---

## 9. Risks & Open Questions

### 9.1 Technical Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Chrome deprecates or restricts `declarativeNetRequest` | Core blocking breaks | Low | Tabs API fallback provides partial coverage; monitor Chrome release notes |
| Chrome restricts `<all_urls>` host permission | Extension cannot block arbitrary sites | Medium | May need to switch to runtime host permissions with user-granted per-site access |
| `storage.sync` quota exceeded | New sites cannot be added | Low | 100KB supports ~2,000 entries; far exceeds typical usage |
| Dynamic rule limit (5,000) reached | Diminishing blocking coverage | Low | Each standard site uses 2 rules + 2 session rules; limit reached at ~1,250 standard sites |
| Service worker killed during `updateBlockRules()` | Partial rule application | Low | Next `storage.onChanged` event triggers full regeneration; eventual consistency |

### 9.2 Open Questions

1. **Should the extension validate against Chrome's 5,000 rule limit before adding a site?**
   - Currently no limit check exists.
   - Options: (a) Warn user when approaching limit, (b) Silently stop adding rules, (c) Do nothing (current).
   - Needed: Data on typical user block list sizes.

2. **Is the full rule regeneration strategy sustainable at scale?**
   - Currently deletes all rules and recreates from scratch on every change.
   - Options: (a) Keep current approach (simple), (b) Diff-based rule updates (complex, marginal benefit).
   - Current approach is fine for <1,000 entries.

3. **Should `blocked.html` be shown for declarativeNetRequest blocks?**
   - Currently, network-level blocks show Chrome's generic error page, not the custom blocked page.
   - Only the tabs-layer fallback shows `blocked.html`.
   - Options: (a) Use `redirect` action instead of `block` in declarativeNetRequest rules, (b) Accept the inconsistency.

---

## 10. Architecture Decision Records

### ADR-1: Chrome Extension Over Native App or VPN

- **Status:** Accepted
- **Context:** Need to block websites without battery drain, network overhead, or privacy concerns inherent in VPN-based approaches.
- **Decision:** Build as a Chrome extension using Manifest V3 APIs.
- **Alternatives Considered:**
  - **VPN-based app (like Freedom):** Rejected — adds network latency, drains battery, requires server infrastructure, raises privacy concerns.
  - **Native desktop app (like Cold Turkey):** Rejected — platform-specific, requires elevated OS permissions, cannot leverage Chrome's built-in blocking APIs.
  - **hosts file manager:** Rejected — requires admin/root privileges, no pattern matching, no sync, poor UX.
- **Consequences:** Locked into Chrome/Chromium ecosystem. Cannot block in other browsers or at the OS level. Users can uninstall the extension (accepted limitation).

### ADR-2: declarativeNetRequest Over webRequest API

- **Status:** Accepted
- **Context:** Need network-level blocking. MV3 provides two options: `declarativeNetRequest` (declarative, rules-based) and `webRequest` (programmatic, request interception).
- **Decision:** Use `declarativeNetRequest` as the primary blocking mechanism.
- **Alternatives Considered:**
  - **webRequest API:** Rejected — requires persistent background page (MV2 only for blocking), Chrome is deprecating blocking `webRequest` for MV3 extensions. More flexible but not future-proof.
  - **Content script injection:** Rejected — only works after page loads, easily bypassed, cannot prevent network requests.
- **Consequences:** Limited to rule-based matching (urlFilter patterns and RE2 regex). Cannot execute arbitrary logic per-request. Offset by the tabs API fallback for edge cases.

### ADR-3: Dual-Layer Blocking (Network + Tab Monitoring)

- **Status:** Accepted
- **Context:** `declarativeNetRequest` alone cannot catch all navigation scenarios — cached pages, prerendered pages, and some browser-internal navigations bypass network rules.
- **Decision:** Add a `tabs.onUpdated` listener as an independent fallback layer that evaluates URLs and redirects to `blocked.html`.
- **Alternatives Considered:**
  - **declarativeNetRequest only:** Rejected — known gaps with cached/prerendered content.
  - **tabs.onUpdated only:** Rejected — fires after the page starts loading, creating a flash of blocked content before redirect.
  - **Content script only:** Rejected — requires page to load first, unreliable.
- **Consequences:** Some blocked navigations show Chrome's generic error (network layer), others show the custom blocked page (tab layer). Minor UX inconsistency accepted for coverage completeness.

### ADR-4: Irreversible Blocking (No Remove Function)

- **Status:** Accepted
- **Context:** The core product thesis is that easy unblocking defeats the purpose of a site blocker. Users who can easily remove a block will do so impulsively.
- **Decision:** Remove the unblock/delete functionality entirely from the UI and codebase.
- **Alternatives Considered:**
  - **Password-protected unblock:** Rejected — users set simple passwords or store them in their browser, providing no real friction.
  - **Time-delayed unblock (e.g., 24-hour cooldown):** Rejected — adds complexity; still provides an escape hatch that undermines commitment.
  - **Keep remove button:** Rejected — directly contradicts the product thesis.
- **Consequences:** The only way to unblock a site is to uninstall the extension (which loses all data) or clear extension storage via Chrome DevTools. This is intentional friction. Risk: negative reviews from users who didn't understand permanence before adding sites.

### ADR-5: chrome.storage.sync Over storage.local

- **Status:** Accepted
- **Context:** Need persistent storage for the blocked sites list. Chrome offers `storage.sync` (100KB, synced across devices) and `storage.local` (10MB, local only).
- **Decision:** Use `storage.sync` for cross-device synchronization with zero configuration.
- **Alternatives Considered:**
  - **storage.local:** Rejected — no cross-device sync; users would need to re-add sites on each browser.
  - **External database (Firebase, Supabase):** Rejected — requires accounts, server infrastructure, and contradicts the privacy-first, zero-infrastructure philosophy.
- **Consequences:** 100KB storage limit constrains the block list to ~2,000 entries. Acceptable for the expected use case. If a user needs more, `storage.local` could be added as overflow (not currently needed).

### ADR-6: No Build System or Framework

- **Status:** Accepted
- **Context:** The extension consists of ~300 lines of JavaScript across 3 files. Need to decide on tooling.
- **Decision:** Ship vanilla HTML/CSS/JS with no build step, no framework, no bundler, no TypeScript.
- **Alternatives Considered:**
  - **React/Vue/Svelte for popup UI:** Rejected — adds build complexity, bundle size, and dependency management for a 320px popup with one input and one list.
  - **TypeScript:** Rejected — adds build step for minimal benefit in a ~300-line codebase. Type safety concerns are mitigated by the small surface area.
  - **Webpack/Vite/esbuild:** Rejected — no modules to bundle, no assets to transform.
- **Consequences:** No type checking, no tree shaking, no minification. The entire extension source is human-readable in production. For a privacy-focused extension, this is a feature — users can inspect exactly what the code does.

### ADR-7: Full Rule Regeneration Over Incremental Updates

- **Status:** Accepted
- **Context:** When a site is added, the blocking rules need to be updated. Two approaches: (a) delete all rules and recreate from scratch, (b) add/remove individual rules incrementally.
- **Decision:** Full regeneration — delete all existing rules and recreate the complete rule set on every storage change.
- **Alternatives Considered:**
  - **Incremental rule updates:** Rejected — more complex, requires tracking rule IDs mapped to sites, handling ID reuse, and diffing old vs. new state. Bug-prone for marginal performance gain.
- **Consequences:** Simpler code, no ID management bugs. Slightly higher latency on rule updates (delete ~n + create ~n rules vs. create 1 rule). Negligible for expected list sizes (<100 entries for most users).

---

*This document describes the shipped architecture of v1.3.0. It is a living document and will be updated as the system evolves.*
