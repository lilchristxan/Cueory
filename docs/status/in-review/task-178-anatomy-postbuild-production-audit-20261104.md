status: Task 178, Anatomy Lab production artifact audit (#625): production builds fail closed on unapproved models, draft IDs and fixtures; protected previews remain draft-enabled. Founder-held; all 11 models remain draft.

- 2026-11-13: Repair the real BZip2 end-marker bypass by failing closed on its validated header and block magic, correct RAR4 CRC32/16 handling, recognize RAR5 encrypted headers, and require a usable index.html in the active production postbuild gate.
- Add a genuine BZip2-compressed synthetic GLB fixture, RAR4/RAR5 negative tests and empty/malformed entrypoint tests. Models and source names remain unchanged.
- These changes still require exact-head CI, a complete npm run verify, the three contaminated main-style full-build transcripts from issue #662, independent review and Christian's approval. No release, deployment or hosted database migration is authorized.
