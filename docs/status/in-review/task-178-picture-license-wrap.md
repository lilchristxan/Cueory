# Task 178: export CC BY link after safe text wrapping

Status: stacked draft for review. Base: #427 at 8966f5a31ccfc72090c66548a2784fea195b9895 (the existing pure wrapText fix). Parent Anatomy Lab: #290.

The exported PNG text must include the existing BodyParts3D attribution, the full CC BY 4.0 license URI and the model-release/draft note because downloaded pictures do not preserve the clickable viewer link. Synthetic fixture pictures must never claim BodyParts3D licensing.

This change deliberately **depends on #427**, which splits oversized unbroken words only when they cannot fit. A synthetic narrow-column unit regression checks the entire URL is preserved and each credit line fits its measured maximum. A desktop-per-engine Playwright regression observes the canvas text used during fixture and existing draft-kidney PNG exports. The browser test waits for the newly selected model to load before checking credit text. No new anatomy names, facts, models, license flags, dependencies, auth or deployment changes.

Verification: Reviewed source and exact Git patch. Full exact-head CI and focused Playwright still required. Earlier unstacked #440 check/build and 4,180 unit tests passed, but its isolated building-notice test failed from missing copied test fixtures (#416), preventing its browser test. Integrate #416 and #427, then run exact-head tests and human content/rights review before any publication. No merge to main authorized.
