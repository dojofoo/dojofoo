// Commit messages and pull request titles follow Conventional Commits (https://www.conventionalcommits.org):
// `type(optional scope): subject`, for example `fix(ui): keep the chat open while a lesson loads`.
// The commit-msg hook (.husky/commit-msg) checks every commit; CI checks every pull request title, which a squash merge uses.
export default { extends: ["@commitlint/config-conventional"] };
