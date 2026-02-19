# Milestones

## v1.0 Short-Term Improvements (Shipped: 2026-02-19)

**Phases completed:** 3 phases, 7 plans, 0 tasks

**Key accomplishments:**
- Increased analysis window from 100→500 messages with user-configurable slider (50-1000)
- Vendored DOMPurify 3.3.1 replacing custom regex sanitizer — XSS risk class eliminated
- Migrated all sidebar innerHTML to DOMPurify — zero raw innerHTML assignments remaining
- Added inactivity timeout setting (30-600s) replacing hardcoded 2-minute constant
- Hardened all numeric validation with Number.isFinite() across entire extension
- Added input-time validation with save-blocking to prevent invalid settings

**Stats:** 33 files changed, 3,795 insertions, 234 deletions

---

