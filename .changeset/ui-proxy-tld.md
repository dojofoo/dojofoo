---
"dojofoo": patch
---

`dojofoo ui` comes up when the shared Portless proxy serves other TLDs (e.g. `PORTLESS_TLD=td`): a proxy it starts also serves `.localhost`, and on a running HTTPS proxy without `.localhost` it uses `dojo.<tld>`, instead of timing out on a certificate the proxy refuses.
