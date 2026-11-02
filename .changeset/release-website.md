---
"@dojofoo/web": patch
---

The website is versioned like the packages it's built from: a release tags it (`@dojofoo/web@x.y.z`), and the release run promotes that commit's deployment to dojo.foo. The release workflow uses changesets/action v2's inputs (`publish-script`, `version-script`), which push the tags and report private packages' tags as published, and checks the CLI on npm only when a new version of it was published.
