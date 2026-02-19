# Pitfalls Research: Chrome Web Store Submission Readiness

**Domain:** Chrome Web Store (CWS) compliance — preparing an existing MV3 extension for submission
**Researched:** 2026-02-19
**Confidence:** HIGH (verified against official Chrome developer documentation and program policies)

This file supersedes and extends the earlier PITFALLS.md (v1.0 milestone scope). That research covered DOMPurify integration, WASM memory, and configurable thresholds. This research covers the distinct failure modes for CWS submission itself.

---

## Critical Pitfalls

### Pitfall 1: Privacy Policy Missing or Linked in the Wrong Place

**What goes wrong:**
The extension reads live chat messages from YouTube and Twitch DOM. Under the Chrome Web Store User Data Policy, reading web page content — including chat messages — constitutes handling "personal or sensitive user data" (specifically, "website content or resources a user requests or interacts with"). A privacy policy is mandatory. The policy must be linked from the dedicated **Privacy Policy URL field in the developer dashboard**, not in the extension description. A policy linked only in the description field is counted as missing and triggers rejection.

**Why it happens:**
Developers assume that because the extension processes data locally (no server, no telemetry), no privacy policy is required. The CWS policy explicitly rejects this logic: "Users may not easily be able to tell which apps or extensions save information locally or transmit it." Local processing is not an exemption.

**How to avoid:**
1. Write a privacy policy that discloses: (a) what data is read (chat text, author names, stream URL/title from `document.title`); (b) that all processing is local; (c) that no data is transmitted to any external server by the extension itself; (d) that WebLLM model weights are downloaded from Hugging Face CDN if the user opts in, and that download is subject to Hugging Face's own terms.
2. Host the policy at a stable public URL (GitHub Pages, a personal domain, or a static hosting service).
3. Enter this URL in the **Privacy Policy** field on the Privacy Practices tab of the CWS developer dashboard — not in the description.
4. Ensure the policy text matches what the extension actually does. Contradictions between the policy and the extension's manifest (e.g., connecting to `huggingface.co` not mentioned) cause rejection.

**Warning signs:**
- Privacy policy URL field left blank in the CWS dashboard during listing setup.
- Policy text says "we do not collect any data" when the manifest declares `connect-src https://huggingface.co` (the connection to download the model is a data flow, even if user-initiated).
- Policy hosted on a URL that requires login to view.

**Phase to address:** Phase 1 (Privacy Policy and Dashboard Compliance) — must be complete before the first submission attempt. Cannot be patched post-submission because the link is required before review begins.

---

### Pitfall 2: Privacy Practices Dashboard Fields Not Filled In (Distinct from Privacy Policy)

**What goes wrong:**
The CWS developer dashboard has a dedicated "Privacy practices" tab with required fields beyond the privacy policy URL. Developers who rush the submission frequently leave these fields incomplete, causing rejection under "Purple Lithium" (User Data Policy — Disclosure). Required fields include:

- **Single purpose description** — a short plain-language description of the extension's one core function, used by reviewers to evaluate single-purpose compliance.
- **Permissions justification** — each permission declared in the manifest must be explained. For this extension: `sidePanel`, `storage`, and `host_permissions` for YouTube and Twitch each need a stated reason.
- **Remote code declaration** — the dashboard asks whether the extension executes remote code. The answer is no (all code is bundled), but this field must be explicitly declared.
- **Data usage certification** — the developer must check boxes certifying compliance with the Limited Use policy.

**Why it happens:**
These fields are easy to miss because they live on a separate tab from the store listing (name, description, screenshots). Developers complete the listing tab and assume they are done.

**How to avoid:**
Complete the Privacy Practices tab in full before first submission. For each manifest permission, write one to two sentences explaining why it is necessary. The justification for `host_permissions` to YouTube and Twitch should reference the content script's purpose of observing live chat DOM.

**Warning signs:**
- Submissions rejected citing "Purple Lithium" violation.
- Dashboard shows red warning indicators on the Privacy practices tab.

**Phase to address:** Phase 1 (Privacy Policy and Dashboard Compliance).

---

### Pitfall 3: Broad Host Permissions Triggering Extended Manual Review

**What goes wrong:**
The manifest declares `host_permissions` for `https://www.youtube.com/*` and `https://www.twitch.tv/*` alongside a content script that uses `all_frames: true`. These are not `<all_urls>`, which is the worst case, but they are site-specific patterns combined with `all_frames`. The CWS review system flags extensions that request "broad host permissions" for additional manual review, which adds 1-2 weeks to the initial 1-3 day baseline.

Separately, `all_frames: true` means the content script runs in every iframe on YouTube and Twitch pages, not just the top frame. The YouTube chat lives in an iframe (`iframe#chatframe`), so `all_frames: true` is technically required. However, the current content script injects into every frame on those domains, including ad iframes, YouTube Studio sub-frames, and unrelated Twitch iframes. Running in unneeded frames is an unnecessary permission footprint that reviewers notice.

**Why it happens:**
`all_frames: true` was set to reach the YouTube chat iframe and was never scoped more narrowly. The simplest fix would have been a popup-accessed tab approach, but the iframe access made `all_frames` seem necessary at the time.

**How to avoid:**
Two options:
1. **Keep `all_frames: true` and justify it explicitly** in the permissions justification field: "The YouTube live chat widget renders inside an iframe (`iframe#chatframe`). The content script must run inside that iframe to observe DOM mutations in the chat container." This justification is accurate and should satisfy reviewers.
2. **Eliminate `all_frames: true`** by restructuring the content script to use `chrome.tabs.sendMessage` to reach the iframe specifically, or by using `match_origin_as_fallback` with frame-specific matching. This reduces the permission footprint but adds implementation complexity. Given that both YouTube and Twitch are scoped to specific domains (not `<all_urls>`), the risk of rejection over `all_frames: true` is low if justification is provided.

**Warning signs:**
- Review takes longer than two weeks without an explanation.
- Rejection cites "Use of Permissions" violation (Purple Potassium).

**Phase to address:** Phase 2 (Manifest and Permission Audit). Justification approach is lower risk; restructuring is optional.

---

### Pitfall 4: `wasm-unsafe-eval` in CSP — Already Correct but Misunderstood

**What goes wrong:**
The manifest currently includes `'wasm-unsafe-eval'` in `extension_pages` CSP:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src https://huggingface.co https://cdn-lfs.huggingface.co https://raw.githubusercontent.com;"
}
```

This is the documented, approved mechanism for WASM in MV3. It is not a rejection trigger. The pitfall is that a developer unfamiliar with the approved CSP might "clean up" this value thinking `wasm-unsafe-eval` sounds dangerous and remove it, breaking WASM silently. Or, when reading CWS rejection guidelines about `unsafe-eval`, they conflate it with `wasm-unsafe-eval` and remove it preemptively.

The real risk is the `connect-src` directive. The CWS documentation only addresses `script-src` and `object-src` for extension_pages. The `connect-src` directive is not restricted by the mandatory minimum policy. Listing `https://huggingface.co`, `https://cdn-lfs.huggingface.co`, and `https://raw.githubusercontent.com` in `connect-src` is technically legal. However, connecting to external domains will prompt reviewers to scrutinize what data is being sent. If the privacy policy and dashboard fields do not explain the Hugging Face connection (model download for opt-in AI feature), reviewers may reject it as unexplained external data transmission.

**Why it happens:**
Developers treat CSP as purely a security control and do not realize the `connect-src` entries will be read by CWS reviewers as part of the data handling audit.

**How to avoid:**
1. Do not touch `wasm-unsafe-eval` in the CSP — it is correct and approved.
2. In the permissions justification field and privacy policy, explicitly state: "The extension connects to `huggingface.co` and its CDN only when the user explicitly enables the optional AI summarization feature. This connection downloads an AI model (~400MB) to the user's device. No user data is transmitted to Hugging Face."
3. If the WebLLM feature is not yet functional (the `libs/web-llm/index.js` bundle is not included in the extension package per `WEBLLM_SETUP.md`), consider removing the `connect-src` entries from the CSP until the feature ships. Declaring connections that the extension does not currently make invites reviewer questions.

**Warning signs:**
- Rejection citing undisclosed data transmission.
- Reviewer questions about Hugging Face connections.

**Phase to address:** Phase 2 (Manifest and Permission Audit). Coordinate with Phase 3 (Disk Space Warning for WebLLM) to ensure the disclosure is consistent.

---

### Pitfall 5: ~400MB Model Download Without Disk Space Warning or Manifest Disclosure

**What goes wrong:**
The WebLLM opt-in downloads approximately 400MB of model weights to IndexedDB. This creates three separate rejection risks:

1. **Missing `unlimitedStorage` permission**: IndexedDB storage for extension origins is subject to the browser's storage pressure eviction. A 400MB download that gets evicted silently (while the user thinks the AI is enabled) creates broken behavior. The `unlimitedStorage` permission prevents eviction. Without it, the download is fragile. With it, the manifest shows `unlimitedStorage`, which displays an installation warning to users ("Can store unlimited amounts of data on your computer") — this warning may reduce install conversion but is the honest disclosure.

2. **No user-facing disk space warning**: Chrome's own policies do not mandate a disk space warning before large downloads, but the extension's existing consent modal only informs users about "an AI model download." It does not state the size (~400MB). Without the size disclosure, users may be surprised when their disk space decreases, or if they are on a metered connection. More importantly, CWS reviewers often test extensions in clean environments and will see the download begin without size context, which looks like unexplained data fetching.

3. **Privacy policy does not mention the Hugging Face download**: If the privacy policy says no data is transmitted but the extension downloads 400MB from Hugging Face when AI is enabled, the policy is accurate (no user data transmitted, but data is received from an external server). However, the policy should explicitly describe this model download to be complete.

**Why it happens:**
The WebLLM feature is optional and behind a consent modal. Developers assume the consent modal is sufficient disclosure. CWS reviewers audit the manifest and code directly, not the runtime UX flow.

**How to avoid:**
1. Add `unlimitedStorage` to the manifest permissions if the WebLLM feature is included in the submission. Accept the install-time warning to users as the correct tradeoff.
2. Update the consent modal to state the approximate download size: "Downloading the AI model (~400MB). This is a one-time download stored on your device."
3. Update the privacy policy to explicitly describe the model download: what is downloaded, from where, why, and that no user data is sent in exchange.
4. If the WebLLM bundle is not included in the v1.1 submission (the `WEBLLM_SETUP.md` suggests it is optional), remove the `connect-src` Hugging Face entries from the manifest CSP and defer this pitfall to the milestone that ships WebLLM.

**Warning signs:**
- Reviewer comment about unexplained network connections.
- Missing `unlimitedStorage` permission when WebLLM is included.
- Consent modal says "AI model" without a size estimate.

**Phase to address:** Phase 3 (Disk Space Warning and WebLLM Disclosure) for the UX side; Phase 2 (Manifest Audit) for the permission side.

---

### Pitfall 6: Extension Reads Web Page Content — Must Declare "Website Content" Data Type in Dashboard

**What goes wrong:**
The content script reads chat message text and author names from the YouTube and Twitch DOM. This constitutes reading "website content" under the CWS User Data Policy. The Privacy Practices tab has a data type checklist. Failing to check "Website Content" when the extension reads DOM text from third-party pages triggers a "Purple Lithium" rejection even if a privacy policy exists.

Additionally, the content script transmits the stream URL (`window.location.href`) and stream title (`document.title`) to the background service worker. This is "Web browsing activity" (domains and URLs the user interacts with). This data type must also be declared.

**Why it happens:**
Developers treat the data type checklist as referring to data uploaded to a server. The policy applies to any data the extension handles, including data processed locally.

**How to avoid:**
In the Privacy Practices dashboard, check at minimum:
- "Website content" (chat messages read from DOM)
- "Browsing activity" (stream URL and title read and relayed by content script)

For each, certify compliance with the Limited Use policy (data used only for chat analysis, not shared or sold). The certifications are checkboxes that must be actively selected.

**Warning signs:**
- Rejection email citing Purple Lithium / User Data Policy — Disclosure.
- Privacy Practices tab shows unchecked data type categories after submission.

**Phase to address:** Phase 1 (Privacy Policy and Dashboard Compliance).

---

### Pitfall 7: Extension Name or Store Description Contains YouTube/Twitch Trademark Violations

**What goes wrong:**
"Chat Signal Radar" does not include "YouTube" or "Twitch" in the extension name, so the name itself is clean. However, the store description and promotional copy will need to mention YouTube and Twitch to explain what the extension does. The YouTube Branding Guidelines (part of the YouTube API Terms of Service, which apply because the extension accesses YouTube pages) prohibit using "YouTube" in the application name and restrict how it may appear in promotional material. The safe phrasing is "works with YouTube" or "for YouTube" (lowercase), not "YouTube Chat Analyzer" as a standalone phrase.

Twitch has similar trademark restrictions. Using the Twitch logo, the Twitch purple color system, or implying Twitch endorsement causes rejection.

**Why it happens:**
Developers write natural promotional copy ("Analyze your YouTube chat") and do not realize "YouTube" in a title-case heading adjacent to the extension name implies partnership or endorsement.

**How to avoid:**
- In the store listing title: use "Chat Signal Radar" only (current name is already compliant).
- In descriptions: use lower-case "youtube" and "twitch" in context, or phrases like "live chat on YouTube and Twitch." Avoid heading-level uses of "YouTube Chat Radar" or similar.
- Do not use platform logos in screenshots or promotional images.
- Do not claim the extension is "endorsed by," "partnered with," or "approved by" YouTube or Twitch.

**Warning signs:**
- Rejection citing trademark violation.
- CWS listing pre-review checker flags the description.

**Phase to address:** Phase 4 (Store Listing Assets and Copy).

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems in the CWS compliance context.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip privacy policy until submission | Saves time during development | Rejection; must be live before first review | Never — write it in Phase 1 |
| Keep `connect-src` for Hugging Face even if WebLLM is not bundled | No code change needed | Reviewer questions about unexplained connections | Remove if WebLLM not included |
| Use generic "no data collected" privacy policy template | Fast to write | Inaccurate — extension does read DOM content; rejection for contradiction | Never — must be accurate |
| Leave `all_frames: true` undocumented in justification | No implementation work | Extended review time; potential rejection | Acceptable if justification is written in dashboard |
| Submit without filling privacy practices checklist | Saves 10 minutes | Guaranteed rejection (Purple Lithium) | Never |
| Omit `unlimitedStorage` when WebLLM is included | One fewer permission warning | 400MB download gets evicted under storage pressure; silent breakage | Never if WebLLM is included |

---

## Integration Gotchas

Common mistakes when the extension connects to the CWS submission system or external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| CWS Developer Dashboard | Enter privacy policy URL in description field, not the URL field | Use the designated Privacy Policy URL input on the Privacy Practices tab |
| CWS Developer Dashboard | Submit while Privacy Practices tab is incomplete | Complete all tabs, including permissions justification and data certifications |
| Hugging Face CDN (`connect-src`) | Declare the connection without disclosing it in the privacy policy | Privacy policy and consent modal must describe what is downloaded and from where |
| Chrome Web Store review appeal | Resubmit while an appeal is open | Appeals and resubmissions are mutually exclusive — complete one before starting the other |
| Store listing screenshots | Submit at wrong resolution (not 1280x800 or 640x400) | Use exactly 1280x800 pixels (recommended) or 640x400; promotional images have separate specs |
| Incognito mode | Assume extension works in incognito without verification | Test explicitly: `chrome.storage`, `sidePanel`, and WASM must all function (storage is shared between normal and incognito by default, but sidePanel behavior may differ) |

---

## Performance Traps

Patterns that affect CWS review success (not runtime performance).

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Bundling the WebLLM library (large file) | Extension ZIP exceeds CWS size limits (currently 128MB for the ZIP) | Do not bundle the WebLLM model weights in the ZIP — download at runtime via IndexedDB | If WebLLM `.wasm` and model shards are included in the ZIP |
| Minified/obfuscated code in ZIP | Rejection for "hard-to-review code" (review time extended) | Keep WASM artifacts (generated, not obfuscated) and hand-written JS readable; avoid bundler minification of extension JS | Any submission containing obfuscated JS |
| Submitting before testing in a clean Chrome profile | Extension appears to work (because local dev environment has dependencies) but fails for reviewers | Test in a clean Chrome profile with a freshly loaded extension | Every submission |

---

## Security Mistakes

Domain-specific security issues relevant to CWS review.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Privacy policy claims "no data collected" when DOM content is read | Contradiction between policy and code; rejection | Accurately describe DOM reading in the privacy policy as local processing |
| `connect-src` lists external domains without disclosure | Reviewer treats undisclosed external connections as data exfiltration risk | Document every `connect-src` entry in both the privacy policy and dashboard justification |
| Content script reads more data than described | If script reads auth tokens, payment info, or full page HTML beyond chat DOM, triggers sensitive data violation | Scope content script reads to exactly what is needed (chat container only) — current implementation is already appropriately scoped |
| Storing user chat messages in `chrome.storage` | Session history stored in `chrome.storage.local` contains user-identifiable data (stream URLs, chat topics) | Privacy policy must disclose this local storage of session data |

---

## UX Pitfalls

Common user experience mistakes that affect CWS listing quality and review.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Consent modal says "AI model" without size | User surprises when 400MB downloads; may lead to negative reviews that trigger CWS quality review | State the size explicitly: "~400MB, one-time download" |
| Screenshots show "Loading..." or empty states | Reviewers see incomplete functionality | Capture screenshots during an active live stream with real data visible |
| Store description is generic | Fails single-purpose test; users do not understand what the extension does | Describe the specific chat clustering feature, the sentiment analysis, and the session history — be concrete |
| Options page has no reset-to-defaults button | Users who misconfigure thresholds cannot recover without knowing default values | Add a "Restore defaults" button — this is polish that prevents negative reviews that could flag the listing for quality review |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces for CWS submission.

- [ ] **Privacy Policy URL**: Policy written and hosted does not mean it is linked in the CWS dashboard — verify the URL field on the Privacy Practices tab is filled.
- [ ] **Permissions justification**: Each permission in the manifest must have a written justification in the dashboard, not just be "obvious" from context — verify each row on the Privacy Practices tab has text.
- [ ] **Data type certification**: Checking the data type boxes is not the same as completing the certification — verify the "I certify" checkboxes are checked for each declared data type.
- [ ] **WebLLM disclosure**: Consent modal shows before download does not mean the download size and source are documented in the privacy policy — verify both.
- [ ] **`all_frames` justification**: The permission is justified in code (YouTube iframe requirement) but must also be documented in the dashboard justification field — verify text is written.
- [ ] **Screenshots**: Screenshot files exist in the repo does not mean they meet the required dimensions (1280x800 or 640x400) and show real in-use state — verify dimensions and content.
- [ ] **Incognito verification**: `chrome.storage` works in incognito does not mean `sidePanel` opens correctly — test with "Allow in incognito" enabled in extension settings.
- [ ] **Extension name clean**: "Chat Signal Radar" does not violate trademarks, but the store listing description may — verify no title-case "YouTube" or "Twitch" appears as part of the extension brand in any heading.
- [ ] **Single-purpose description field**: The description field in the listing is not the same as the single-purpose field on the Privacy Practices tab — verify both are filled separately.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Rejected for missing privacy policy | LOW | Write and host the policy, enter the URL in the dashboard, resubmit (no code changes needed) |
| Rejected for incomplete Privacy Practices tab | LOW | Complete all fields in the dashboard, resubmit without changing the extension package |
| Rejected for Purple Potassium (permissions) | MEDIUM | Audit permissions, remove unused ones or add justification; may require manifest change and new ZIP |
| Rejected for trademark violation in description | LOW | Edit the store listing text (no code or manifest change); resubmit |
| Rejected for undisclosed external connections | MEDIUM | Update privacy policy AND remove or justify the `connect-src` entries; resubmit with updated manifest |
| Extended review (>2 weeks, no decision) | LOW | Contact developer support via One Stop Support form; do not resubmit while appeal/inquiry is pending |
| Appeal denied | HIGH | One appeal per violation; if denied, fix the actual violation rather than appealing the denial again |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Missing privacy policy | Phase 1: Privacy Policy and Disclosure | Policy URL live and accessible before submission |
| Privacy Practices dashboard incomplete | Phase 1: Privacy Policy and Disclosure | All dashboard fields filled; no red indicators |
| "Website content" and "browsing activity" data types not declared | Phase 1: Privacy Policy and Disclosure | Dashboard data type checklist reviewed |
| `all_frames: true` undocumented | Phase 2: Manifest and Permission Audit | Dashboard justification written for each permission |
| `connect-src` external domains undisclosed | Phase 2: Manifest and Permission Audit | Privacy policy and dashboard reference all `connect-src` entries |
| WebLLM download lacks size disclosure | Phase 3: Disk Space Warning and WebLLM Consent | Consent modal shows size estimate; privacy policy describes the download |
| Missing `unlimitedStorage` permission | Phase 2: Manifest and Permission Audit (or Phase 3 if WebLLM is included) | Manifest updated before WebLLM download is allowed |
| Screenshot dimensions or content incorrect | Phase 4: Store Listing Assets | Screenshots verified at 1280x800 and show real in-use state |
| Trademark violation in store copy | Phase 4: Store Listing Assets | Description reviewed against YouTube and Twitch branding guidelines |
| Incognito mode not tested | Phase 5: Incognito Verification | Manual test with "Allow in incognito" enabled |

---

## Sources

- [Chrome Web Store Review Process | Chrome for Developers](https://developer.chrome.com/docs/webstore/review-process) — review timeline, what triggers extended review, resubmission process
- [Troubleshooting Chrome Web Store Violations | Chrome for Developers](https://developer.chrome.com/docs/webstore/troubleshooting) — rejection categories (Purple Potassium, Purple Lithium, Blue Argon, Yellow Magnesium)
- [Chrome Web Store Program Policies | Chrome for Developers](https://developer.chrome.com/docs/webstore/program-policies/policies) — minimum permissions mandate, privacy policy requirements, Limited Use policy
- [Updated Privacy Policy and Secure Handling Requirements FAQ | Chrome for Developers](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) — what constitutes "user data," local processing is not an exemption, website content and browsing activity definitions
- [Fill Out the Privacy Fields | Chrome for Developers](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) — dashboard field requirements (single purpose, permissions justification, remote code, data certification)
- [Manifest — Content Security Policy | Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy) — `wasm-unsafe-eval` is the approved MV3 mechanism; `unsafe-eval` is not allowed
- [Why Chrome Extensions Get Rejected | Extension Radar Blog](https://www.extensionradar.com/blog/chrome-extension-rejected) — practical rejection case catalog (excessive permissions, vague descriptions, missing privacy policy, trademark violations)
- [chrome.storage API | Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/api/storage) — `unlimitedStorage` permission behavior, 10MB default local quota
- [Supplying Images | Chrome Extensions | Chrome for Developers](https://developer.chrome.com/docs/webstore/images) — screenshot dimension requirements (1280x800 or 640x400)
- [YouTube API Services — Branding Guidelines | Google for Developers](https://developers.google.com/youtube/terms/branding-guidelines) — prohibition on using "YouTube" in app names
- [Chrome Web Store Policy Updates 2025 | Chrome for Developers](https://developer.chrome.com/blog/cws-policy-updates-2025) — one appeal per violation (new 2025 policy)
- [Essential Steps After Chrome Extension Rejection | moldstud.com](https://moldstud.com/articles/p-essential-steps-to-take-after-your-chrome-extension-gets-rejected-a-detailed-guide-for-developers) — resubmission and appeal process details

---
*Pitfalls research for: Chrome Web Store submission readiness (v1.1 CWS milestone)*
*Researched: 2026-02-19*
