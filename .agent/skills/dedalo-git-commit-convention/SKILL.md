---
name: dedalo-git-commit-convention
description: Convention for git commit messages in Dédalo v7 project.
---

# Git Commit Convention

All git commits in this project should follow the Conventional Commits format, specifically using the pattern:

`<type>(<scope>): <subject>`

## Type and Scope
- **refactor**: Changes that neither fix a bug nor add a feature
- **feat**: New features
- **fix**: Bug fixes
- **docs**: Documentation changes
- **style**: Changes that do not affect the meaning of the code (white-space, formatting, etc)
- **test**: Adding missing tests or correcting existing tests

### Common Scopes:
- `menu`
- `data_manager`
- `component_common`
- `search`

## Example
`refactor(menu): optimize build and build_cache_id methods`
