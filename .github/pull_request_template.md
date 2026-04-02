## Description
<!-- Describe your changes in detail -->

## Type of Change
<!-- Check relevant options -->
- [ ] Bug fix (non-breaking)
- [ ] New feature (non-breaking)
- [ ] Performance improvement
- [ ] Code refactoring (no functional changes)
- [ ] **Breaking change** ⚠️ (requires migration/updates)

## Breaking Change Detection
<!-- These checks are automated via CI -->
- [ ] I have reviewed the CI output for contract test failures
- [ ] I have reviewed the signature check results
- [ ] I have reviewed the ontology check results
- [ ] All baseline updates are intentional and documented

## If Breaking Change
<!-- Complete this section if you checked "Breaking change" above -->

### What breaks?
<!-- Describe the specific breaking changes -->

### Migration Path
<!-- How will users adapt to this change? -->

### Baseline Updates Required
<!-- Check which baselines need updating -->
- [ ] API Contract snapshots (`test/server/contract/snapshots/`)
- [ ] Method signature baseline (`dev/signature_tracker/baselines/`)
- [ ] Ontology baseline (`dev/ontology_tracker/baselines/`)

### Update Commands Used
```bash
# Run these commands and include output in PR description:
UPDATE_SNAPSHOTS=true vendor/bin/phpunit --testsuite contract
php dev/signature_tracker/signature-check.php --create-baseline
php dev/ontology_tracker/ontology-check.php --create-baseline
```

## Testing
<!-- How has this been tested? -->
- [ ] Unit tests pass (`vendor/bin/phpunit --testsuite "unit components"`)
- [ ] API tests pass (`vendor/bin/phpunit --testsuite "unit API"`)
- [ ] Contract tests pass (`vendor/bin/phpunit --testsuite contract`)
- [ ] Manual testing completed
- [ ] Tested with real data/ontology

## Checklist
- [ ] Code follows Dédalo coding standards (see AGENTS.md)
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated (if needed)
- [ ] No new warnings from static analysis
- [ ] Commit messages follow Conventional Commits (see AGENTS.md)

## Related
<!-- Link related issues, PRs, documentation -->
- Fixes #
- Related to #
- Documentation: docs/development/breaking_change_detection.md

## Additional Notes
<!-- Any additional context for reviewers -->
