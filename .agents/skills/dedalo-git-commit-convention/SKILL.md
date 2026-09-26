---
name: dedalo-git-commit-convention
description: Convention for git commit messages in Dédalo project.
---

# Git Commit Convention

Conventional Commits: `<type>(<scope>)<optional !>: <description>`

## Types
`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.

## Rules
- `!` after type/scope marks a breaking change (e.g. `feat(api)!: rewrite auth logic`).
- Imperative present tense ("change" not "changed"), no trailing period.
- Header under 80 chars; longer detail goes in body after a blank line.
- Wrap Dédalo function/class names and system identifiers in backticks.
- Be extremely concise.

### Common Scopes
`menu`, `data_manager`, `component_common`, `search`, `publication`, `diffusion`

## Examples
- ``refactor(menu): optimize `build` and `build_cache_id` methods``
- ``fix(search): accept 'ALL' limit from `set_limit(0)` ``
