# Publishing to the DSH plugin market

DeepSeek Harness does not have a central registry you must be accepted into.
Its **plugin market is a list of index URLs the user configures**: the harness
fetches each URL, validates it against *plugin market index format 1*, and shows
the plugins it declares in **Plugins → Discover**. Installing an entry is then
an ordinary bundle install.

So "publishing to the market" = **host a valid index at a public URL**. This
repository does exactly that in `market/index.json`.

## What the index declares

```json
{
  "format": 1,
  "title": { "en": "…", "zh": "…" },
  "metadata": {
    "categories": { "notifications": { "title": { "en": "Notifications" } } },
    "labels": { "windows": { "title": { "en": "Windows taskbar" } } }
  },
  "plugins": [
    {
      "name": "dsh-flash-notify",
      "versions": [
        {
          "version": "1.0.0",
          "publishTimestamp": 1793889000,
          "source": { "type": "git", "url": "https://github.com/OWNER/REPO", "commit": "<40-hex>" },
          "engines": { "dsh": ">=0.2.0-0" }
        }
      ]
    }
  ]
}
```

Rules that matter in practice (enforced by `@deepseek-ai/dsh-plugin-market-index`):

| Rule | Detail |
| --- | --- |
| `format` | must be exactly `1` |
| `title` / `description` | a string, or a language map that **must contain `en`** |
| `name` | a valid npm package name; entries must be unique |
| `versions[].version` | exact SemVer, no ranges |
| `versions[].publishTimestamp` | integer Unix **seconds** |
| `source` | `{ "type": "npm" }` or `{ "type": "git", "url": "https://…", "commit": "<40-hex>" }` |
| git source | pinned commit; the installer builds `git+https://…#<commit>` |
| `engines.dsh` | a SemVer range, never `workspace:` |
| `icon` | inline `data:` (≤32 KiB decoded) or a URL resolving to https / the index origin |
| `metadata.category` / `labels` | must reference ids declared in `metadata` |

`marketInstallTarget()` turns an entry into the pnpm spec the installer uses,
which is why the commit must already exist on the remote.

## Release checklist

```powershell
# 1. bump the version
#    (package.json + CHANGELOG.md)
# 2. run the suite
node --test "test/**/*.test.mjs"

# 3. push source, regenerate the index against the new commit, push again
pwsh -File scripts/publish.ps1

# 4. point a harness at it
pwsh -File scripts/install-market.ps1
```

`scripts/publish.ps1` commits, pushes, rebuilds `market/index.json` with the
freshly pushed commit SHA, validates it, and pushes the index. The index URL it
prints is:

```
https://raw.githubusercontent.com/<owner>/<repo>/<branch>/market/index.json
```

## Enabling the Discover tab

The market UI ships as an **optional bundle**:
`@deepseek-ai/dsh-experimental-plugin-market-bundle`. When it is enabled, the
Plugins page grows a **Discover** tab and the `plugin-market` service appears,
whose `indexes` config holds the URL list. `scripts/install-market.ps1` writes
that config for you and tells you if the bundle still needs enabling.

## Notes

- The index is plain JSON on a raw URL; no registry account, no review gate.
- Bumping a version means publishing a new commit and regenerating the index
  (`publish.ps1` does both). Existing pinned commits keep working, so old
  versions stay installable.
- If you later publish to npm as well, switch `--source npm`; entries then use
  `name@version` instead of a commit and the index no longer needs a SHA update.
- A private index works the same way: serve the JSON over https and add its URL.
