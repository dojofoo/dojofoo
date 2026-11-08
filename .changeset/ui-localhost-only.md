---
"dojofoo": patch
---

`dojofoo ui` always opens at dojo.localhost. When the Portless proxy was started without .localhost it stops and prints the command that restarts the proxy with it, instead of taking a dojo.<tld> name another project may use. `dojofoo ui --help` prints its flags instead of starting the UI.
