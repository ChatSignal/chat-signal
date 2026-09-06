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

Open follow-up (tracked with the runtime model-integrity work): re-vendor from a
pinned `@mlc-ai/web-llm` release with a documented build step, record the
version + build command here, and pin the runtime Qwen model weights WebLLM
downloads (currently referenced by the mutable model id
`Qwen2.5-0.5B-Instruct-q4f16_1-MLC`). The bundle is loaded only when the user
opts into AI summaries.
