# Phase 4: Privacy and Dashboard Compliance - Research

**Researched:** 2026-02-19
**Domain:** Chrome Web Store compliance, GitHub Pages hosting, privacy policy authoring
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Privacy policy tone and depth**
- Plain language throughout — conversational, easy to read, no legal jargon
- Include a "Last updated" date (no version number)
- Link to GitHub Issues for privacy questions (no personal email exposed)
- Simple change notification clause: "We may update this policy. Check back for changes."

**Hosting and URL structure**
- Privacy policy lives in `docs/` folder as plain markdown
- GitHub Pages renders it with default Jekyll theme
- Custom domain: `chatsignal.dev` — requires CNAME file in docs/
- Privacy policy URL: `chatsignal.dev/privacy-policy`

**Permission justification framing**
- User-benefit focused framing (explain WHY from the user's perspective)
- Host permissions (youtube.com, twitch.tv): direct and specific about DOM reading — "Reads live chat messages from the page DOM to perform real-time clustering and sentiment analysis"
- All justifications stored in a standalone version-controlled doc: `docs/cws-justifications.md`
- Single doc combining permission justifications AND data certification checkbox answers

**Data disclosure scope**
- "Processes" framing for DOM reading — emphasizes chat messages are already publicly visible
- "Data never leaves your browser" mentioned naturally in the data practices flow (not prominently highlighted)
- WebLLM/HuggingFace download disclosed inline alongside other data practices — not a separate section
- chrome.storage.local usage disclosed with clearing instructions: "Session summaries are saved locally. You can clear them from the History tab or by removing the extension."

### Claude's Discretion
- Exact section ordering within the privacy policy
- Whether to use headers or a flat structure for the policy
- Formatting of the CWS justifications doc

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PRIV-01 | Privacy policy hosted at a public URL disclosing: chat DOM content reading, chrome.storage.local usage, optional HuggingFace model download, and no data transmitted to external servers (except HuggingFace CDN for model weights) | GitHub Pages setup pattern, Jekyll markdown rendering, CNAME file placement in docs/, required disclosure topics identified from CWS user data FAQ |
| PRIV-02 | CWS dashboard permission justifications written for each manifest permission (sidePanel, storage, unlimitedStorage, host_permissions for youtube.com and twitch.tv) | CWS dashboard Privacy Practices tab structure fully documented; per-permission justification field confirmed; draft text patterns identified |
| PRIV-03 | CWS dashboard data certification checkboxes completed accurately (website content, browsing activity declarations) | Data usage certification section confirmed to require two checkbox groups: data types collected + limited-use compliance; "website content" and "browsing activity" categories confirmed as the correct disclosures for this extension |
</phase_requirements>

---

## Summary

This phase has no code to write — it produces two files and one online action. The two files are `docs/privacy-policy.md` (becomes `chatsignal.dev/privacy-policy` via GitHub Pages) and `docs/cws-justifications.md` (a version-controlled record of what gets pasted into the CWS dashboard). The online action is completing the Privacy Practices tab in the CWS developer dashboard.

The extension reads DOM content from YouTube and Twitch (which classifies it as handling "website content" and "browsing activity" under CWS policy), stores session summaries in chrome.storage.local, and optionally downloads an LLM model from HuggingFace. All of this must be disclosed both in the privacy policy and via the CWS dashboard checkboxes. Because data never leaves the user's browser (except for the optional HuggingFace CDN download), the disclosure is factually simple — the complexity is getting the framing and CWS dashboard fields exactly right.

A draft privacy policy already exists at `PRIVACY.md` in the project root. It covers the right topics but uses some legal-sounding phrasing ("we do not collect") and needs to be rewritten in the decided plain-language tone and moved to `docs/privacy-policy.md`. The CNAME mechanism for GitHub Pages with the docs/ folder is straightforward but has one gotcha: GitHub's UI creates the CNAME file automatically in the repo root when configured via Settings, but when using docs/ as the publishing source the CNAME file must be inside docs/ — it should be added manually rather than relying on GitHub's auto-creation.

**Primary recommendation:** Write `docs/privacy-policy.md` and `docs/cws-justifications.md` as the source of truth, configure GitHub Pages in repo settings pointing to the docs/ folder on main, add the CNAME file manually inside docs/, then use cws-justifications.md as the copy-paste source for the CWS dashboard Privacy Practices tab.

---

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| GitHub Pages | — | Static HTTPS hosting for the privacy policy | Free, permanent, no third-party branding, automatic HTTPS, zero maintenance |
| Jekyll (default) | GitHub-managed | Renders `.md` files to HTML with a default theme | Auto-enabled by GitHub Pages when markdown files are present; no config needed for basic use |

### Supporting

| Tool | Purpose | When to Use |
|------|---------|-------------|
| Jekyll front matter (YAML) | Controls page title and permalink URL | Needed to produce the exact URL `chatsignal.dev/privacy-policy` from a file named `privacy-policy.md` |
| CNAME file | Maps custom domain to GitHub Pages | Required as a file inside `docs/` when using docs/ as publishing source |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GitHub Pages + Jekyll | Netlify, Vercel | More setup, account dependency, not needed for a single static page |
| Markdown file in docs/ | Separate GitHub Pages branch | Additional branch complicates repo; docs/ folder approach is simpler for a small site |

---

## Architecture Patterns

### Recommended Project Structure

```
docs/
├── CNAME                  # Contains: chatsignal.dev (apex domain)
├── privacy-policy.md      # The published privacy policy
└── cws-justifications.md  # Version-controlled CWS dashboard reference doc
```

### Pattern 1: Jekyll Markdown Page with Custom Permalink

**What:** A markdown file with YAML front matter that sets the page title and forces the permalink to match the decided URL.

**When to use:** Any time the filename alone would produce a URL like `/privacy-policy/` (with trailing slash) or the page title should differ from the filename.

**Example:**
```markdown
---
title: Privacy Policy
permalink: /privacy-policy
---

# Privacy Policy for Chat Signal Radar

**Last Updated:** February 2026
...
```

This produces `chatsignal.dev/privacy-policy` (without trailing slash) when Jekyll processes it.

**Note:** GitHub Pages default Jekyll theme renders this as clean HTML without further configuration.

### Pattern 2: GitHub Pages Configuration

**Steps:**
1. Create `docs/` directory with `privacy-policy.md` and `CNAME`
2. In repo Settings → Pages → Build and deployment → Deploy from a branch → select `main` branch and `/docs` folder
3. GitHub serves `docs/` content at the custom domain
4. HTTPS is enforced automatically once DNS propagates (up to 24 hours)

### Pattern 3: CWS Dashboard Privacy Practices Tab Fields

The Privacy Practices tab has five sections, all of which must be completed before submission:

1. **Single Purpose Description** — One sentence describing the extension's narrow focus. Required by the Single Purpose policy.

2. **Permissions Justification** — One text field per declared manifest permission. The dashboard auto-lists all permissions from the uploaded manifest. This phase addresses justifications for: `sidePanel`, `storage`, `unlimitedStorage` (Phase 5 adds this to manifest), and host_permissions for `youtube.com` and `twitch.tv`.

3. **Remote Code Declaration** — Select "No, I am not using remote code." (Manifest V3 prohibits remote code; the HuggingFace download is model weights, not executable code.)

4. **Data Usage Certification** — Two checkbox groups:
   - Group 1 (data types collected): Check "Website content" (chat DOM reading) and "Browsing activity" (host_permissions for YouTube/Twitch). Do NOT check "Personally identifiable information," "Financial/payment information," "Health information," "Authentication information," "Personal communications," or "User-generated content."
   - Group 2 (compliance certifications): Check all four limited-use compliance statements (allowed use, allowed transfer, prohibited advertising, prohibited human interaction).

5. **Privacy Policy URL** — Enter `https://chatsignal.dev/privacy-policy`

### Pattern 4: cws-justifications.md Structure

This document is a reference doc, not published content. Structure it to match the CWS dashboard fields for easy copy-paste:

```markdown
# CWS Dashboard — Privacy Practices Reference

## Single Purpose Description
[one-sentence text to paste]

## Permission Justifications

### sidePanel
[text]

### storage
[text]

### unlimitedStorage
[text]

### host_permissions: youtube.com
[text]

### host_permissions: twitch.tv
[text]

## Remote Code Declaration
No, I am not using remote code.

## Data Usage Checkboxes

### Group 1: Data types collected
- [x] Website content
- [x] Browsing activity

### Group 2: Compliance certifications
- [x] [all four limited-use statements]

## Privacy Policy URL
https://chatsignal.dev/privacy-policy
```

### Anti-Patterns to Avoid

- **Relying on GitHub to create the CNAME file automatically:** GitHub's auto-creation via repo Settings places CNAME in the repo root, not in `docs/`. When using docs/ as the publishing source, the CNAME must be inside `docs/`. Add it manually.
- **Leaving out unlimitedStorage from PRIV-02:** The current manifest does not have `unlimitedStorage` — that's a Phase 5 change. However, PRIV-02 requires justifications for the permissions that will be in the manifest at submission time. The justification doc should include a placeholder for `unlimitedStorage` now so it is not forgotten.
- **Using the existing PRIVACY.md at root as the published policy:** The file at `/PRIVACY.md` is a draft in the project root and is not served by GitHub Pages. The authoritative published version goes in `docs/privacy-policy.md`. The root PRIVACY.md can be deleted or left as a redirect note, but should not be the source of truth going forward.
- **Corporate/legal framing:** Phrases like "We do not collect" sound like boilerplate. The decided tone is conversational: "Chat Signal Radar does not collect personal information" or "Your chat data never leaves your browser."
- **Inconsistency between policy, dashboard, and extension behavior:** CWS explicitly warns that inconsistencies between the privacy policy, dashboard disclosures, and actual extension behavior can result in suspension. All three must agree on what data is accessed, where it goes, and what is stored.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTPS for the policy URL | Self-hosted server, S3 | GitHub Pages | GitHub Pages provides automatic HTTPS with Let's Encrypt, zero maintenance |
| URL routing/redirects | Custom Jekyll config | Jekyll front matter `permalink` | Front matter handles the URL directly in the markdown file |
| DNS configuration | None | DNS registrar for chatsignal.dev | Set A records pointing to GitHub Pages IPs; no custom tooling needed |

**Key insight:** This phase is documentation and configuration work, not code. The temptation to over-engineer (custom Jekyll theme, CI/CD for policy updates) should be resisted. The default Jekyll theme is adequate and appropriate for an indie extension.

---

## Common Pitfalls

### Pitfall 1: CNAME File in Wrong Location

**What goes wrong:** GitHub Pages serves 404s for the custom domain or reverts to the `username.github.io` URL.

**Why it happens:** When using docs/ as the publishing source, GitHub Pages looks for CNAME inside docs/. If the CNAME file is at the repo root (or absent), the custom domain mapping fails.

**How to avoid:** Manually create `docs/CNAME` containing only `chatsignal.dev` (no protocol, no trailing slash, single line). Then also set the custom domain in repo Settings → Pages to trigger DNS verification. Both are required.

**Warning signs:** The GitHub Pages settings page shows the custom domain as "not verified" or shows an error after saving.

### Pitfall 2: DNS Propagation Delay Blocks CWS Dashboard

**What goes wrong:** The privacy policy URL returns a connection error or wrong content when entered into the CWS Privacy Policy URL field.

**Why it happens:** After setting A records, DNS propagation can take 24-48 hours. GitHub Pages also needs up to 24 hours to issue the HTTPS certificate.

**How to avoid:** Set up GitHub Pages and DNS records first (before writing the CWS dashboard fields). Use `dig chatsignal.dev +short` to confirm DNS is resolving to GitHub's IPs before submitting the CWS form. HTTPS must be working — the CWS dashboard may reject HTTP URLs.

**Warning signs:** `dig chatsignal.dev` returns no results or returns wrong IPs.

### Pitfall 3: Data Disclosure Inconsistency

**What goes wrong:** CWS review rejects the extension or flags it for policy inconsistency.

**Why it happens:** The dashboard disclosures, privacy policy text, and actual extension behavior must align exactly. If the policy says "we read chat messages" but the dashboard doesn't check "website content," or vice versa, the review fails.

**How to avoid:** Use `docs/cws-justifications.md` as the single source of truth. Write the privacy policy text and justifications together so they reference the same facts. The three data disclosures that matter for this extension are: (1) DOM reading of chat → "Website content" + "Browsing activity" checkboxes; (2) chrome.storage.local → disclosed in policy; (3) HuggingFace download → disclosed in policy and permission justifications.

**Warning signs:** Policy says "no external requests" but extension downloads a model from HuggingFace. (The correct framing: "No external requests unless you enable AI summaries, which downloads a model from HuggingFace.")

### Pitfall 4: Omitting unlimitedStorage from Justifications

**What goes wrong:** Submission fails or reviewer flags an unjustified permission.

**Why it happens:** `unlimitedStorage` is added to the manifest in Phase 5, but the CWS dashboard is completed in Phase 4. If the justification doc doesn't include a ready-to-use entry, it will be missed.

**How to avoid:** Write the `unlimitedStorage` justification in `docs/cws-justifications.md` now, clearly marked as "added in Phase 5 — paste into dashboard after manifest update." The justification text: "Stores AI model weights (~400MB) in IndexedDB for offline use after one-time download. Required because chrome.storage cannot hold files this large."

### Pitfall 5: Jekyll URL Trailing Slash vs. No Trailing Slash

**What goes wrong:** The policy is live at `chatsignal.dev/privacy-policy/` (with slash) but the CWS dashboard is given `chatsignal.dev/privacy-policy` (no slash), causing a URL mismatch or redirect that CWS doesn't follow.

**Why it happens:** Jekyll's default permalink config adds a trailing slash. The CWS URL field should exactly match the accessible URL.

**How to avoid:** Set `permalink: /privacy-policy` in the front matter (no trailing slash). Or verify what URL actually resolves and use that exact string in the CWS form. Both `chatsignal.dev/privacy-policy` and `chatsignal.dev/privacy-policy/` will likely resolve (GitHub Pages handles both), but be consistent.

---

## Code Examples

### docs/CNAME
```
chatsignal.dev
```
(Single line, no protocol, no trailing slash, no whitespace.)

### docs/privacy-policy.md front matter
```yaml
---
title: Privacy Policy
permalink: /privacy-policy
---
```

### Required GitHub Pages DNS A Records
Point these four IPs at the registrar for chatsignal.dev:
```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```
Source: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site

### DNS verification command
```bash
dig chatsignal.dev +noall +answer -t A
# Should return all four GitHub Pages IPs above
```

### Privacy policy required disclosures (minimum topics, not final text)

The policy must address these facts — the PRIV-01 requirement maps directly to them:

1. **Chat DOM reading**: "Chat Signal Radar reads live chat messages directly from YouTube and Twitch pages you visit. Chat messages are processed locally in your browser — they are never sent to us or any external server."

2. **chrome.storage.local**: "Session summaries are saved locally on your device using Chrome's storage API. You can clear them from the History tab or by removing the extension."

3. **Optional HuggingFace download**: "If you choose to enable AI summaries, the extension downloads a language model (about 400MB) from HuggingFace CDN. This is a one-time download stored locally. No chat content is sent to HuggingFace or any other server."

4. **No external server**: "If you don't enable AI summaries, the extension makes no external network requests."

### CWS permission justification drafts

```
sidePanel:
Shows the real-time chat analysis dashboard alongside the stream page.

storage:
Saves user settings (analysis preferences, AI consent choice) and session
summaries to your local browser. All data stays on your device.

unlimitedStorage:
Stores the optional AI model (~400MB) in IndexedDB after a one-time download.
The standard storage quota is too small for model weights this size.

host_permissions: youtube.com
Reads live chat messages from the YouTube page DOM to perform real-time
message clustering, topic detection, and sentiment analysis. No data is
transmitted off-device.

host_permissions: twitch.tv
Reads live chat messages from the Twitch page DOM to perform real-time
message clustering, topic detection, and sentiment analysis. No data is
transmitted off-device.
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| Hosting policy on a third-party service (Notion, Google Docs) | Self-hosted HTTPS page | CWS requires a stable public HTTPS URL; GitHub Pages is the standard free solution for indie extensions |
| Vague permission justifications ("needed for functionality") | Specific justifications per permission | CWS explicitly states vague or inaccurate justifications may cause rejection |
| Single privacy policy with technical language | Plain-language policy for non-technical users | CWS user data FAQ emphasizes comprehensible disclosure |

**Note on unlimitedStorage timing:** The current manifest does not have `unlimitedStorage`. Phase 5 adds it. The PRIV-02 requirement anticipates the final manifest state. The justification doc should be written for the final state and clearly labeled.

---

## Open Questions

1. **Does CWS require the privacy policy to be live before the dashboard can be saved?**
   - What we know: The Privacy Practices tab has a privacy policy URL field. The tab can likely be saved with any URL, but submission probably validates the URL is reachable.
   - What's unclear: Whether CWS validates the URL at save-time or only at submission. Whether HTTP-only URLs are accepted.
   - Recommendation: Assume the URL must be HTTPS and reachable before completing the dashboard. Set up GitHub Pages and DNS first.

2. **Can Phase 4 CWS dashboard fields be saved before the extension is fully submitted?**
   - What we know: The CWS dashboard is saved per-item and fields can be edited at any time before submission.
   - What's unclear: Whether there is a "save draft" state that doesn't require all fields to be complete.
   - Recommendation: Plan for the CWS dashboard step to be completed after the GitHub Pages URL is live. The dashboard work is quick (copy-paste from cws-justifications.md); the DNS propagation is the time dependency.

3. **What is the exact text of the four limited-use compliance checkboxes in Group 2?**
   - What we know: The checkboxes require certifying: allowed use, allowed transfer, prohibited advertising, prohibited human interaction (all four elements from the CWS Limited Use policy).
   - What's unclear: The exact checkbox label wording in the current dashboard UI (the docs describe the policy; the dashboard UI wording may differ slightly).
   - Recommendation: Treat this as a "read and check" step when actually in the dashboard. The cws-justifications.md can note the four categories without needing the exact UI wording.

---

## Sources

### Primary (HIGH confidence)
- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy — Official CWS dashboard Privacy Practices tab documentation. Confirmed five sections: Single Purpose, Permissions Justification, Remote Code, Data Usage Certification, Privacy Policy URL.
- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq — Official CWS User Data FAQ. Confirms: local-only storage still requires a privacy policy; "website content" and "browsing activity" are the applicable data categories; data must be disclosed even when not transmitted externally; all four limited-use elements must be certified.
- https://developer.chrome.com/docs/webstore/program-policies/privacy — Official CWS Privacy Policies requirement: accurate, up-to-date policy must be posted and linked in the dashboard.
- https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site — Official GitHub Pages custom domain docs. Confirmed A record IPs, CNAME file behavior, DNS verification process.
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site — Confirmed docs/ folder as valid publishing source; CNAME placement behavior when using docs/ as source.

### Secondary (MEDIUM confidence)
- Existing `PRIVACY.md` in project root — Verified scope: covers the right disclosure topics (DOM reading, local storage, HuggingFace download, no external server). Needs tone rewrite and relocation to docs/privacy-policy.md.

---

## Metadata

**Confidence breakdown:**
- CWS dashboard fields and requirements: HIGH — verified against official developer.chrome.com documentation
- GitHub Pages setup with docs/ folder and custom domain: HIGH — verified against official GitHub docs
- CNAME file placement in docs/: MEDIUM — inferred from "CNAME added to root of publishing source" in GitHub docs; docs/ is the publishing source, therefore CNAME goes there. Recommend verifying by checking GitHub Pages settings after creation.
- Privacy policy content requirements: HIGH — CWS FAQ explicitly lists what must be disclosed; extension's actual behavior is known from codebase
- CWS dashboard checkbox exact wording: LOW — policy categories are confirmed but exact UI label text was not retrieved from the live dashboard UI

**Research date:** 2026-02-19
**Valid until:** Stable — GitHub Pages and CWS dashboard structure change infrequently. Re-verify if CWS policy pages show an update date newer than 2022.
