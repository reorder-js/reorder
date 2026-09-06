# release-plugin

This skill automates the process of releasing the Medusa plugin, ensuring that NPM releases and GitHub releases are perfectly synced. It handles testing, building, version bumping, changelog generation, tagging, and creating the GitHub release, leaving only the final NPM publish step for the user to handle interactively.

## When to use

Use this skill when the user asks to release a new version of the plugin, publish to NPM, create a GitHub release, or complains about a mismatch between NPM packages and the GitHub repository state.

## Rules & Philosophy

1.  **Always keep GitHub and NPM in sync.** A published NPM package should always have a corresponding Git tag and GitHub release. This ensures a single source of truth for changelogs, easier debugging, and provenance tracking.
2.  **Automate everything possible, but respect auth.** Do all the heavy lifting (changelog, git, bumping, gh release) but leave `npm publish` to the user to prevent 2FA/auth hangs in the agent context.
3.  **Validate before release.** Never release a broken build.

## Steps to execute

### 1. Pre-flight Checks
- Check if the working directory is clean (`git status --porcelain`). If not, tell the user to commit or stash changes before releasing.
- Check if `gh` CLI is installed (`gh --version`). If not, advise the user to install it (`brew install gh`) and authenticate (`gh auth login`) before proceeding.
### 2. Validation & Build
- Verify in `package.json` that the package has the correct keywords for the Medusa v2 ecosystem (e.g., `medusa-v2`, `medusa-plugin-integration`) and that the `exports` object points to the built files in the `./.medusa/server/src/...` directory (a Medusa v2 requirement).
- Run `yarn build` (which internally runs `medusa plugin:build`) to compile the plugin code into the `.medusa/server` directory.
- Ask the user if they want to run the test suite before releasing (e.g., `yarn test:integration:modules`), which is highly recommended.

### 3. Analysis & Proposal (Wait for User)
- Find the previous Git tag (`git describe --tags --abbrev=0`).
- Get the list of commits since the last tag (`git log <last-tag>..HEAD --pretty=format:"* %s (%h)"`). (If no tag exists, get all commits).
- Read the current version from `package.json`.
- Use your AI capabilities to analyze the commits and prepare a proposal:
  1. Draft a structured Markdown changelog section (e.g., `### Features`, `### Fixes`, `### Chores`). This is exactly what will be added to the repo and visible on GitHub.
  2. Suggest a Semantic Versioning bump (`patch`, `minor`, or `major`) based on the nature of the commits (e.g., `fix:` -> patch, `feat:` -> minor, breaking change -> major).
- **Stop and present this drafted changelog and version suggestion to the user.** Wait for their explicit approval or override. The user MUST make the final decision on the version bump type.

### 4. Versioning & Changelog Update
- Once the user approves the changelog and selects the version bump type:
- Run `npm version <type> --no-git-tag-version` (where `<type>` is the user's choice) to bump the `package.json` version without creating an immediate git commit/tag.
- Prepend the approved changelog draft to the top of the `CHANGELOG.md` file under the newly created version header.
### 5. Git Commit and Tag
- Run `git add package.json CHANGELOG.md`.
- Run `git commit -m "chore(release): v<new-version>"`.
- Run `git tag v<new-version>`.
- Run `git push origin HEAD` (to push the commit).
- Run `git push origin v<new-version>` (to push the tag).

### 6. GitHub Release
- Extract the newly generated changelog section for this specific version into a temporary file (e.g., `.gh-release-notes.md`).
### 7. NPM Publish Handoff
- Remind the user that `npm publish` will typically trigger the `prepublishOnly` hook automatically (running `medusa plugin:build` once more).
- Instruct the user to run the final command in their own terminal (because of browser login / 2FA steps):
  ```bash
  npm publish
  ```
- Remind them that if they have 2FA enabled, they will need to authenticate.
