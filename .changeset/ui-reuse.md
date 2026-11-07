---
"dojofoo": patch
"@dojofoo/ui": patch
---

Opening the UI while the same build of dojofoo already runs it, as `/kata` does, opens the running UI instead of replacing it, so its agent turns and evaluations keep going. A rebuilt or other version of the UI still replaces it, and a running UI started in another folder is named.
