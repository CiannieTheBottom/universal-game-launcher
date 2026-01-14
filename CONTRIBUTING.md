# Contributing

Thanks for wanting to contribute!

- Follow the `docs/` guides and the recipe schema under `src/schema/recipe_schema.json` when adding recipes.
- Recipe PRs should include a short test plan indicating how to verify install and launch.
- For Proton management: prefer to reuse existing trusted sources (GitHub releases, protonup) and always include checksum verification logic with downloads.

If you'd like, I can add a simple CI job to validate YAML recipe syntax and JSON schema conformance.