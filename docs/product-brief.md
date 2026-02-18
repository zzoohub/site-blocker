# Permanent Site Blocker — Product Brief

**Author:** zzoo | **Date:** 2026-02-18 | **Status:** In Progress (v1.3.0)
**Tagline:** A Chrome extension that makes website blocking irreversible — replacing willpower with structure.

---

## 1. Problem

### What problem are we solving?

Staying productive in a digital environment requires blocking distracting websites. However, existing site blockers have two fundamental shortcomings:

1. **Block list limitations**: Most blocking extensions cap the number of sites you can block on free plans (typically 10-50), rendering them ineffective for serious use.
2. **VPN-based approaches**: Some blockers route traffic through a VPN to filter requests, causing battery drain, network slowdowns, and privacy concerns.

On top of this, most blockers let you easily disable or bypass the block — turning productivity back into a willpower battle you've already lost once.

### Who has this problem?

- Office workers and freelancers who habitually fall into YouTube, social media, and news sites during work hours
- Students who need deep focus during exam periods
- Anyone seeking a digital detox but unable to self-regulate
- Power users who want to block specific URL patterns (e.g., YouTube Shorts only, URLs with certain language content)

### How do they solve it today?

| Alternative | Pain Points |
|-------------|-------------|
| Blocking extensions (BlockSite, etc.) | Block list caps, easy to disable, paywalled features |
| VPN-based blockers (Freedom, etc.) | Battery/speed drain, privacy concerns, paid subscription |
| Manual hosts file editing | High technical barrier, per-device setup, no pattern matching |
| Willpower | High failure rate |

### Why now?

- Chrome Manifest V3's `declarativeNetRequest` API has stabilized, enabling true network-level blocking from extensions
- Remote work adoption has increased demand for self-managed productivity tools
- Short-form content explosion (YouTube Shorts, TikTok) has created the need for precise URL pattern blocking

---

## 2. Hypotheses & Risks

| Hypothesis | Risk Type | Validation Plan |
|-----------|-----------|-----------------|
| Users perceive "irreversible blocking" as a feature, not a flaw | Value | Chrome Web Store review analysis, user feedback |
| Regex pattern matching is a key conversion driver for power users | Value | Track regex feature adoption rate |
| Dual-layer blocking (declarativeNetRequest + tab monitoring) sufficiently prevents circumvention | Feasibility | Test against major bypass scenarios |
| Users retain the extension despite no unblock functionality | Usability | 7-day and 30-day retention rates |
| Chrome Web Store policies permit irreversible blocking | Viability | Chrome Web Store policy review |

---

## 3. Proposed Direction

### High-level approach

**"Replace willpower with structure."**

Permanent Site Blocker is a lightweight Chrome extension that blocks websites directly at the browser's network level. Without VPN tunneling or external servers, it uses Chrome's `declarativeNetRequest` API to block network requests at source, and the `tabs` API to catch cached pages as a fallback — a dual-layer approach.

The unblock/remove functionality has been intentionally removed, making blocking permanent. This is not a bug — it is the core design philosophy.

### What differentiates this?

| Aspect | Permanent Site Blocker | Existing Blockers |
|--------|----------------------|-------------------|
| Blocking method | Browser network-level (declarativeNetRequest) | VPN or simple redirect |
| Block list size | Virtually unlimited (Chrome dynamic rules cap: 5,000) | 10-50 sites (free tier) |
| Reversibility | Irreversible (by design) | Easily bypassed via password, timer, or toggle |
| Pattern matching | Regex (RE2) support | Mostly unsupported |
| Privacy | Zero data collection, fully local | Often includes analytics/ad trackers |
| Price | Free | Most premium features are paywalled |
| Sync | Automatic via Chrome Sync | Requires account creation and login |

### Non-Goals

- Schedule/time-based blocking is out of scope — always-on blocking is the core value
- No whitelist/exception list — exceptions are the beginning of bypass
- No mobile app or cross-browser support in current scope
- No analytics dashboard or usage statistics — contradicts privacy-first principles

---

## 4. Success Criteria

| Metric | Current State | Target | How Measured |
|--------|--------------|--------|-------------|
| Chrome Web Store installs | Early launch | 1,000+ active users | Chrome Web Store dashboard |
| Average rating | - | 4.5+ / 5.0 | Chrome Web Store reviews |
| Avg. blocked sites per user | - | 10+ | Privacy-first — estimated from reviews, not tracked |
| Negative reviews about irreversibility | - | <10% of total reviews | Review content analysis |

---

## 5. Audience & Market Context

### Target persona

**"Minsoo, the remote worker who can't trust himself"**
- 30s software developer, works from home
- Repeatedly loses 30+ minutes to YouTube Shorts during work
- Tried BlockSite, but always ended up typing in the password to unblock
- Editing hosts files is tedious, and he only wants to block Shorts — not all of YouTube
- "I don't trust myself, so just make it impossible to undo"

### Competitive landscape

| Competitor | Strength | Weakness | Our Angle |
|-----------|----------|----------|-----------|
| BlockSite | High awareness, feature-rich | Free tier block limit, easy to disable | Unlimited blocking, irreversible |
| Freedom | Multi-device, scheduling | VPN-based, paid subscription ($7/mo) | Network-level, free |
| Cold Turkey | Strong blocking | Windows only, paid | Chrome cross-platform, free |
| StayFocusd | Time-limit features | Legacy Manifest V2, complex UI | MV3 architecture, simplicity |

### Pricing strategy

Completely free. Prioritizing value as a personal productivity tool over monetization.

---

## 6. Scope & Current Feature Status

### Shipped (v1.3.0)

- **Must-have (Complete)**
  - Standard URL pattern blocking (domain + path)
  - Regex pattern blocking (RE2 syntax, case-insensitive)
  - declarativeNetRequest network-level blocking
  - tabs API fallback monitoring (catches cached pages)
  - Chrome Storage Sync for cross-device synchronization
  - Blocked page UI (gradient background, motivational message)
  - Popup UI (favicon display, regex toggle, real-time validation)
  - Encoded URL handling (Korean and other non-ASCII characters)
  - Legacy data auto-migration

- **Should-have (Future consideration)**
  - Blocked site categorization
  - Blocked page customization
  - Import/export functionality

- **Won't-have (Intentionally excluded)**
  - Unblock/remove functionality
  - Time-based blocking
  - Whitelist
  - Usage statistics/analytics

---

## 7. Open Questions

- [ ] Does Chrome Web Store policy permit irreversible blocking long-term?
- [ ] What happens when the extension is reinstalled and the block list restores from Chrome Sync?
- [ ] Are there user-desired patterns that RE2 regex limitations cannot express?
- [ ] Is it realistic that any user would hit the 5,000 dynamic rules cap?

---

## 8. Risks & Dependencies

- **Technical**: Changes to Chrome's declarativeNetRequest API policy would require a blocking architecture redesign
- **Platform**: Manifest V3 policy tightening could restrict `<all_urls>` host permissions
- **User experience**: Irreversible design may feel extreme to some users — clear pre-install messaging is essential
- **Dependency**: Favicon display depends on Google Favicon service (https://www.google.com/s2/favicons) availability

---

## 9. Technical Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                 Chrome Browser                   │
├──────────┬──────────────────────────────────────┤
│ Popup UI │  popup.html / popup.js               │
│ (320px)  │  - Site input & regex toggle          │
│          │  - Blocked sites list (with favicons) │
├──────────┼──────────────────────────────────────┤
│ Service  │  background.js                        │
│ Worker   │  - declarativeNetRequest rule mgmt    │
│          │  - tabs.onUpdated monitoring           │
│          │  - storage.sync read/write             │
├──────────┼──────────────────────────────────────┤
│ Blocked  │  blocked.html / blocked.js            │
│ Page     │  - Blocked URL & favicon display      │
│          │  - Motivational message                │
└──────────┴──────────────────────────────────────┘

Blocking flow:
  User → Attempts to visit URL
    → [Layer 1] declarativeNetRequest blocks network request
    → [Layer 2] tabs.onUpdated catches cached page → redirect to blocked.html
```

---

*This document evolves as the project progresses.*
