---
"@dojofoo/api": patch
---

The events endpoint rejects an event whose `occurredAt` isn't a date and stores the time in ISO form; catalog reads leave out any stored event whose time isn't a date, so one bad event can no longer break the course list and the marketplace.
