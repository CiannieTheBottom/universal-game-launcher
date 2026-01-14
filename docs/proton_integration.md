# Proton-GE Integration Plan

This document outlines how the app will bundle and manage Proton-GE on Linux to provide a seamless experience when launching Windows games.

Goals:
- Let users choose a Proton-GE version per-game or use a managed app-wide default
- Provide a one-click install of Proton-GE versions (via downloads, checksums)
- Ensure launches are reproducible and logs are captured for troubleshooting

Install location:
- Use a per-app directory for managed Proton installations, e.g.:
  - `~/.local/share/ugl/protons/<version>`
  - or follow the Steam convention: `~/.steam/root/compatibilitytools.d/<version>` (optional)

Download & verification:
- Fetch Proton-GE archives from trusted sources (GitHub releases / known mirrors)
- Verify with SHA256 checksums and optionally GPG signatures
- The CLI and programmatic API accept an expected SHA256 hex string and will reject downloads that do not match the checksum (see `ugl-proton install <version> <url> [sha256]`)
- Optionally, provide a detached signature and a public key to verify archive authenticity (see `ugl-proton install <version> <url> [sha256] [sig-url] [pubkey-url]`). The manager will download the signature/pubkey into a temporary GNUPGHOME and perform a detached signature verification before installing.
- Public key sources supported:
  - **HTTP/HTTPS URL**: direct path to the `.asc` file
  - **github:owner/repo[@tag]**: fetches the release asset (looks for `.asc`/`.sig`/`pub` names) from GitHub releases
  - **gpg:<keyid>** or **keyserver:<keyid>**: fetches the key from a keyserver (hkps://keys.openpgp.org) using `gpg --recv-keys` (requires `gpg` installed)

How to invoke Proton for installer & launch steps:
- Proton-GE distributions typically expose a wrapper script or a `dist/bin/wine` binary
- Preferred invocation (generic):
  - Set WINEPREFIX and any environment overrides, then call the Proton wrapper: `$PROTON_BIN run <exe> [args]`
- Fallback invocation: run the `wine` binary inside the Proton distribution with Proton-specific env vars (if wrapper not present)

Managing versions:
- `list_managed_proton_versions()` — list installed versions
- `install_proton_version(version)` — download & install into the managed dir (see `ugl-proton install <version> <url>`)
- `install_proton_archive(version, /path/to/archive)` — install from a local archive (see `ugl-proton install-archive`)
- `set_default_proton(version)` — choose a default for new installs (see `ugl-proton set-default <version>`)

CLI:
- The project includes a minimal CLI `ugl-proton` (installed via `npm link` or `npm i -g`) with commands:
  - `ugl-proton list`
  - `ugl-proton install <version> <url>`
  - `ugl-proton install-archive <version> <archive-path>`
  - `ugl-proton remove <version>`
  - `ugl-proton set-default <version>`
  - `ugl-proton get-default`

This provides a simple, testable interface while we implement programmatic APIs and a backend service.

Security & disk usage:
- Show disk usage and require confirmation before downloading large Proton builds
- Allow users to remove Proton versions and warn about games depending on them

Notes:
- For Steam-specific games launched through Steam, prefer letting Steam handle Proton where possible; managed Proton is used for Epic/GOG installers and non-Steam launches.
- Consider integrating with `protonup` (or embedding similar logic) to reuse existing infrastructure for Proton-GE releases.