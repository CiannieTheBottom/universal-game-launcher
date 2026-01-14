# Universal Game Launcher (UGL)

[![CI](https://github.com/CiannieTheBottom/universal-game-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/CiannieTheBottom/universal-game-launcher/actions/workflows/ci.yml)

A cross-platform game launcher (Linux + Windows) that bundles Proton-GE on Linux, integrates with Steam/GOG/Epic, and provides a scriptable installer/runner engine.

What’s in this scaffold:

- `docs/runner_schema.md` — Runner API and installer recipe schema (YAML) with examples
- `examples/recipes/` — sample recipes for GOG, Epic, Steam
- `docs/proton_integration.md` — plan for bundling Proton-GE and invoking it

Next steps:
- Implement Proton-GE manager (download/verify/install)
- Implement runner engine (create prefixes, run installers, launch games)
- Build a minimal backend + Tauri frontend to test flows

If you want, I can scaffold a minimal Tauri + Node backend next.