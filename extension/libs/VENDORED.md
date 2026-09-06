# Vendored library provenance

Third-party code shipped inside the extension. Each entry records where the
file came from, its version, license, and a SHA-256 so the committed bytes are
tamper-evident and reproducible.

Verify all hashes at any time:

```bash
sha256sum extension/libs/dompurify/purify.min.js extension/libs/web-llm/index.js
```

| File | Version | License | Source | Reproducible via |
|------|---------|---------|--------|------------------|
| `dompurify/purify.min.js` | 3.3.1 | Apache-2.0 / MPL-2.0 | [cure53/DOMPurify](https://github.com/cure53/DOMPurify) (npm `dompurify@3.3.1`) | `scripts/vendor-dompurify.sh` |
| `transformers/` (git-ignored, generated) | `@huggingface/transformers` ^3.8.1 | Apache-2.0 | [huggingface/transformers.js](https://github.com/huggingface/transformers.js) | `scripts/vendor-transformers.sh` |
| `web-llm/index.js` | see note below | Apache-2.0 | [mlc-ai/web-llm](https://github.com/mlc-ai/web-llm) | not yet reproducible — see note |

## SHA-256

```
9b494057fad6656fd9ce2089d0b6898df9632c10e45e4775a43073a46cffc8cb  extension/libs/dompurify/purify.min.js
021e2239aa02004e68c75121a78cafedbaed5872d4169c1b4ddca2f1c2ecef80  extension/libs/web-llm/index.js
```

`dompurify/purify.min.js` is byte-for-byte identical to the `dist/purify.min.js`
shipped in npm `dompurify@3.3.1` (verified), so it is fully pinned via
`package.json` + `package-lock.json`.

## Note on `web-llm/index.js`

This is a ~6.5 MB pre-built single-file ESM bundle of
[WebLLM](https://github.com/mlc-ai/web-llm), bundled for MV3 CSP compliance.
The committed blob carries a source/license header but **no upstream version or
commit**, so its exact provenance cannot be reproduced from this repo today.

Open follow-up: re-vendor from a pinned `@mlc-ai/web-llm` release with a
documented build step, and record the version + build command here. The bundle
is loaded only when the user opts into AI summaries.

## Runtime Qwen weights — MLC registry inspection

WebLLM downloads the Qwen model at runtime (only after AI-summary opt-in). The
model id `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` resolves, via WebLLM's built-in
`prebuiltAppConfig`, to **two mutable-branch artifact sources**:

| Artifact | Resolved location | Mutability |
|----------|-------------------|------------|
| Weights + config + tokenizer | `https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC` | no revision → tracks HF `main` |
| WebGPU kernel lib (`model_lib`) | `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/Qwen2-0.5B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm` | served from GitHub `main` |

(WebLLM config `modelVersion` at bundle time: `v0_2_80` — a config tag, not an
artifact pin.)

To pin Qwen, pass a custom `appConfig` to `CreateMLCEngine` overriding **both**
URLs with revision-locked forms:
- `model:` → `…/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/resolve/<commit-sha>`
- `model_lib:` → `…/binary-mlc-llm-libs/<commit-sha>/web-llm-models/Qwen2-0.5B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm`

Both hosts are already allowed by the extension CSP. WebLLM performs no
post-download hash check, so the strongest form is self-hosting or bundling the
pinned artifacts; revision-locking both URLs is the minimal mitigation.

**Decision gate:** this pin is only worth doing if WebLLM/Qwen stays. If
summarization moves to Chrome's built-in Gemini Nano (no download, no fetch
surface), this entire concern is removed — so the Qwen pin waits on that call.
