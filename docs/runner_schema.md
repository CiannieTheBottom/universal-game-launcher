# Runner API & Installer Recipe Schema

This document defines a compact, human-readable installer recipe format (YAML) and the Runner API primitives the app will implement.

Goals:
- Allow reproducible install + launch flows for games from different stores
- Be scriptable but safe — require explicit user confirmation for destructive steps
- Support multiple runtimes: `native`, `wine`, `proton` (Proton-GE managed by the app)

---

Schema (YAML, informal):

```yaml
id: uuid-or-slug
name: "Game Name"
version: "1.0"
store: gog|epic|steam|itch
sources:
  - type: url
    url: https://example.com/installer.exe
    sha256: <optional-checksum>

runtime:
  type: proton  # proton | wine | native
  proton_version: "proton-ge-8-22"  # optional; if omitted use 'latest-managed' or system

environment:
  env:
    DXVK_HUD: "1"
  wine_prefix: "default"  # named prefix or path

installer_steps:
  - name: download-installer
    run: |
      curl -L -o "$XDG_CACHE/installer.exe" "${{ sources[0].url }}"
  - name: run-installer
    run: |
      # Example: run using managed proton
      $PROTON_BIN run "$XDG_CACHE/installer.exe"

post_install:
  - name: move-game-files
    run: |
      mv "$WINEPREFIX/drive_c/Program Files/Game" "$INSTALL_DIR"

launch:
  exe: "$INSTALL_DIR/game.exe"
  args: ["--fullscreen"]

checks:
  pre:
    - type: disk-space
      min: 2000 # MB
  post:
    - type: exists
      path: "$INSTALL_DIR/game.exe"

metadata:
  description: "Short description"
  icon: "https://.../cover.jpg"
```

---

Runner API primitives (server or local):
- create_prefix(name, runtime) -> prefix_path
- install_recipe(recipe_yaml, prefix) -> result (logs, success)
- launch(prefix, exe, args, runtime) -> pid, logs
- list_managed_proton_versions() -> installed/available
- install_proton_version(version) -> success
- remove_proton_version(version) -> success

Notes:
- Runners must never auto-execute user-provided scripts without confirmation; always show a preview or require an explicit "Run".
- The app will support importing existing Steam/GOG installs by mapping their files into a prefix or launching them directly via Steam where appropriate.