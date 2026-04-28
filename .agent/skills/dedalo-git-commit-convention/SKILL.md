---
name: dedalo-git-commit-convention
description: Convention for git commit messages in Dédalo v7 project.
---

# Git Commit Convention

All git commits in this project must follow the Conventional Commits specification.

## Format

`<type>(<scope>)<optional !>: <description>`

## Important
- Never use `hard reset` in commit command. Double user validation required before executing.
- Be extremely concise and precise. Sacrifice grammar for concision.

## Types
- **feat**: New features
- **fix**: Bug fixes
- **docs**: Documentation changes
- **style**: Code style changes (white-space, formatting, etc) not affecting meaning
- **refactor**: Code changes that neither fix bug nor add feature
- **perf**: Performance improvements
- **test**: Adding or correcting tests
- **build**: Build system or dependency changes
- **ci**: CI/CD configuration changes
- **chore**: Other changes not matching above types

## Scopes
Use relevant scope for change. Common scopes:
- `menu`
- `data_manager`
- `component_common`
- `search`
- `api`
- `diffusion`
- `area`

## Breaking Changes
Append `!` after type/scope to signal breaking change:
`feat(api)!: rewrite auth logic`

## Description Rules
- Use imperative, present tense ("change" not "changed")
- No period at end
- Keep header under 80 characters if possible
- If description exceeds 80 chars, use blank line to separate header from body
- Body provides additional context about change

## Dédalo Specifics
All internal Dédalo function names, class names, or system identifiers must be enclosed in backticks:
- `component_text_area`
- `is_empty()`
- `DEDALO_DATA_NOLAN`

## Forbidden Notations
Never include IDE-specific link formats in commit messages:
- No `cci:1://file://...` links
- No `[function_name](cci:...)` markdown links
- No file path references with line numbers
- Use plain text references only

## Examples

`refactor(menu): optimize build and build_cache_id methods`

`fix(component_text_area): resolve null pointer in is_empty()`

`feat(api): add endpoint for component data retrieval`

`docs(component_portal): update JSDoc for all methods`

`style(search): standardize formatting in query builder`
