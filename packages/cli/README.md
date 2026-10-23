# dojofoo

Installable coding dojos that turn your AI agent into a sensei.

## Usage

Requires Node.js 24 or newer for the local agent and authoring runtime. Course
toolchains are configured separately by each course.

```sh
npx dojofoo install       # set up your dojo (auto-detects your agent via env vars)
npx dojofoo add dojofoo/effect-ts # install a training pack (a "dojo")
npx dojofoo add owner/repository    # install a dojo directly from GitHub
npx dojofoo add owner/repository --master # include editable source and Kyoshi definitions
npx dojofoo update owner/repository # update it from its recorded source
npx dojofoo ui            # open the course and start practicing
npx dojofoo track --list  # inspect locally recorded .dojo/cassettes
```

You write the code. The agent runs your tests, points out where you're
stuck, and asks Socratic questions instead of solving the kata for you.
Think pair programming with a patient mentor who knows the material but
lets you do the typing.

## Sharing and adapting courses

Publish courses with ordinary Git commits, version tags and pushes. Authors own
their ignore rules and publication safety: review tracked files before pushing;
`.gitignore` does not remove files already tracked by Git. Dojofoo does not scan
for secrets or manage environment files.

Local installs, Git downloads and trials respect the course's `.gitignore`.
Normal installs keep learner material, checks and Sensei definitions, excluding
Kyoshi definitions and private runtime state. `--master` also keeps authored
`.dojo/kyoshi/` and `KYOSHI.md`; it never copies runtime state or overrides ignore
rules. Updates retain this choice. The editable copy is not a GitHub fork;
follow the course license and preserve attribution before redistributing it.

## Documentation

Full docs at **https://dojo.foo/docs**.

- [Installation](https://dojo.foo/docs/installation)
- [Quickstart](https://dojo.foo/docs/quickstart)
- [Commands](https://dojo.foo/docs/commands/install)
- [Available dojos](https://dojo.foo/dojos)

## License

MIT © Tomas Sivicki
