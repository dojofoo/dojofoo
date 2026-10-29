# @dojofoo/uix

## 0.0.2

### Patch Changes

- 9394f74: Align shared highlighter and schema dependency types before adopting UIX in the local learning application, and preserve valid HTML fragments in teaching Markdown hovers.
- 2e98a34: Let the sign-in and sign-up blocks hide social sign-in and account creation, both closed unless the host opens them. With registration closed, signing up shows that registrations are closed and signing in no longer offers to create an account.
- 67df541: The landing page opens with Miyamoto Musashi's "You can only fight the way you practice", credited beneath it, in place of the shader-lit tagline, and a lead about deliberate practice with a sensei in your own dojo. The unused shader text component is gone.
- 2e98a34: Show Log in and Log out in the account menu only when the host provides them. The local UI has no accounts, so its menu now ends at the theme row instead of offering both placeholder actions.
- b6e09a7: Render the local course library through shared UIX presentation while preserving real installation discovery, workspace/session choices, native links and empty/error states.
- bf44267: Render native Fumadocs documentation inside the shared UIX frame, preserve host navigation and compiled heading metadata, and align documentation stories with the same controlled presentation.
- c0173fd: Use shared UIX presentation for the public website, preserve real navigation and course data, and isolate the illustrative learning preview from learner controllers. Add native button links and handle document transition interruptions through the shared document bootstrap.
- bf6314c: Share UIX providers and library-owned assets across application hosts and Storybook. Require application-supplied prepared OpenAPI data and keep preview content behind story adapters so the bundled local UI can adopt the shared presentation safely.
