# @dojofoo/web

## 0.0.2

### Patch Changes

- fb55e99: The website is versioned like the packages it's built from: a release tags it (`@dojofoo/web@x.y.z`), and the release run promotes that commit's deployment to dojo.foo. The release workflow uses changesets/action v2's inputs (`publish-script`, `version-script`), which push the tags and report private packages' tags as published, and checks the CLI on npm only when a new version of it was published.
- Updated dependencies [01317a9]
- Updated dependencies [01317a9]
  - @dojofoo/uix@0.0.4
  - @dojofoo/ui@0.0.5
