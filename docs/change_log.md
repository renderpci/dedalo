# Change log

Last modification date:

2026-04-02T18:50:05+01:00

Dédalo version

7.0.0

---

## [Unreleased] - Breaking Change Detection System

### Added
- **Breaking Change Detection** - Comprehensive CI/CD pipeline for detecting breaking changes
  - API Contract Snapshot Testing (`test/server/contract/`)
  - Method Signature Tracking (`dev/signature_tracker/`)
  - Data Model Change Detection (`dev/ontology_tracker/`)
  - CI integration via GitHub Actions
  - See `docs/development/breaking_change_detection.md` for full documentation

### CI/CD
- New workflow steps in `.github/workflows/phpunit.yml`:
  - Contract tests for API response stability
  - Signature checking for PHP class/method changes
  - Ontology checking for data model changes
- Added `.github/pull_request_template.md` with breaking change checklist

