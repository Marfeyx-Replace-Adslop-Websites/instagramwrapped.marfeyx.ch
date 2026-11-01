# Repository privacy

This app needs no API keys or account credentials. Never add real Instagram or
WhatsApp exports, extracted messages, contact lists, private media, screenshots,
generated personal summaries, session cookies, or credentials to this repository.
Use synthetic data generated inside tests instead of real exports.

`.gitignore` covers common export formats, extracted data directories, private
media, environment files, keys, backups, and local tooling. Project manifests,
entry pages, font licenses, and the placeholder-only `.env.example` are allowed.
Review any new exception before adding it. Ignore rules do not protect files
already tracked by Git, and `git add -f` can bypass them.

Before committing, review `git status --short` and `git diff --cached`. Check an
individual file with `git check-ignore -v --no-index path/to/file`. Do not paste
private data into commit messages, issue reports, pull requests, or CI logs.

## Commit identity

Configure a public alias and the noreply email shown in GitHub Settings > Emails.
For this repository, the maintainer configuration is:

```sh
git config --local user.name Marfeyx
git config --local user.email 174621078+marfeyx@users.noreply.github.com
```

The Repository privacy workflow checks all fetched history for secrets with a
pinned, checksum-verified Gitleaks release. It also rejects non-noreply email addresses in new commits without printing those addresses to the log. Contributors should use
their own GitHub noreply address and a public display name.

Environment templates must contain placeholders only. All `VITE_` variables are
included in client-side code and must be treated as public. Existing Marfeyx
branding and published support contacts are intentional public project details.

## If something was committed

Revoke or rotate exposed credentials first. Deleting a file in a later commit
does not remove it from history. A history rewrite changes commit IDs; re-clone
after a cleanup instead of merging an older clone back into the rewritten branch.
GitHub pull request refs, cached commits, forks, existing clones, and previously
published artifacts can retain old data after a force push. GitHub-controlled
copies may require a removal request to GitHub Support.
