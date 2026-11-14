status: Task 616 review queue validation: reject invalid ISO months before toISOString, preserve normalized-day validation and return field-specific errors.

Scope: src/islands/reviewqueue.ts, tests/unit/reviewqueue.test.ts, and this status note.

Verification: A local repository checkout and installed Node 24 dependencies are not available in the GitHub connector environment. Do not treat these edits as a passing npm run verify. Exact-head hosted CI, independent review and a separate founder release decision remain required.

Safety: No database tables, migrations, data, account settings, workflow, build configuration or runtime dependencies changed. This is only input validation and accompanying tests.