status: Task 178 Anatomy Lab QA: add real-model browser regressions for partial mixed-layer failure/retry and a late show-all download after show-only, plus the sections 2–3 coverage map.

Scope: tests/e2e/anatomy-network-races.spec.ts and docs/ANATOMY-LAB-QA.md only, plus this required status note.

Validation: These are real draft-model Chromium/WebKit/Firefox browser test definitions. The GitHub connector does not provide a local checkout, installed dependencies or a Playwright browser, so local npm run verify and screenshots have not been run or claimed. Hosted exact-head CI, locked-preview manual checks and any additional QA row gaps must be checked before approval.

Safety: No model names, labels, licenses, model statuses, visibility data, production code, runtime configuration or dependencies are changed. No merge, hosted database action, deployment or publication is authorized.