undefined
Round 1: CI exposed a Playwright test-fixture issue: its text engine excludes noscript containers. Assertions now inspect the parsed visible child content, matching existing no-JavaScript tests. Check/build passed, all 3692 unit tests in 130 files passed, and 66 browser cases discovered. No local browser pass is claimed. Updated-head CI remains required.
