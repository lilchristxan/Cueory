STATUS: in review. Test-only fix: the logo-follows-site-theme check waited on `img.decode()`, which never settles in
WebKit for a lazy image that has not started loading, so the home page Evening cases timed out on the release run
(webkit-desktop part 3, staging 90e96cc). The check now waits for the image file's load event instead. No product
change; nothing loosened (same contrast and file-variant assertions). WebKit only runs on the staging to main pull
request, so the proof is the next release run.
