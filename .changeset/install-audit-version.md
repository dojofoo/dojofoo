---
"dojofoo": patch
"@dojofoo/api": patch
"@dojofoo/web": patch
"@dojofoo/uix": patch
---

`add` reads the security checks of the exact version it downloaded, which the course API now runs first when it hasn't checked that version, asks before installing a version no check is for, checks with telemetry off too, and says so when the checks are unavailable.
