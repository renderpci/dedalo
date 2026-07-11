# Dédalo Client Tests

Browser-based Mocha/Chai integration tests for Dédalo's JavaScript runtime (instances, components, API).

## Prerequisites

- **Node.js** v18+ (for Puppeteer runner)
- **PHP** 8.4+ with a configured Dédalo instance
- Logged-in session or `DEDALO_TEST_USER` / `DEDALO_TEST_PASSWORD`

## Quick Start

```bash
# Terminal 1 — PHP server (project root)
php -S localhost:8080 -t .

# Terminal 2 — run all suites headlessly
node test/client/puppeteer_runner.js

# Or open interactively
open http://localhost:8080/test/client/index.html
```

## Test Design

### Architecture

```
index.html          Sidebar + orchestration (index.js)
    │
    └── iframe → frame.html → frame_runner.js → test_*.js (Mocha)
```

Each **sidebar card** = one **test suite file** loaded in an isolated iframe. This keeps Mocha state, DOM, and globals clean between runs.

### Registry (`js/test_registry.js`)

Single source of truth for what appears in the sidebar:

| Group | Key | Content |
|-------|-----|---------|
| generic | `generic` | Infrastructure tests (instances, events, errors, page…) |
| life-cycle | `lifecycle` | One file per component type (build/render/data) |
| components | `component` | Full matrix via `test_component_full.js` + `elements.js` |

**Add a new suite:** edit `test_registry.js` (and `elements.js` for component full tests).

### Stats model (`js/test_stats.js`)

Counters track **suites** (cards), not individual Mocha `it()` blocks. `frame_runner.js` aggregates Mocha results and reports once on `test_end`. Exposed as `window.global_stats` for Puppeteer.

### Shared helpers (`js/test_harness.js`)

Optional utilities for lifecycle tests: `build_instance_options`, `build_render_component`, `run_lifecycle_matrix`.

### Component data (`js/elements.js`, `js/data.js`)

`elements.js` defines component instances (model, tipo, section, random data generators). `test_component_full.js` runs the full edit/list/search matrix; individual `test_component_*.js` files cover focused scenarios.

## Puppeteer Runner

```bash
node test/client/puppeteer_runner.js [options]
```

| Option / Env | Default | Purpose |
|--------------|---------|---------|
| `--url` / `TEST_URL` | `http://localhost:8080/test/client/index.html` | Test page |
| `--timeout` / `TEST_TIMEOUT` | `300000` | Max wait (ms) |
| `--user` / `DEDALO_TEST_USER` | — | Login user |
| `--password` / `DEDALO_TEST_PASSWORD` | — | Login password |
| `--headless` / `HEADLESS` | `true` | Headless Chrome |

Exit code `0` when all suites pass with zero pending; `1` on failure, timeout, or incomplete run.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Failed to load test page | Start PHP server on port 8080 |
| Login required | Set credentials env vars or log in via browser |
| Tests timeout | Increase `--timeout`; try `HEADLESS=false` |
| Suite not in sidebar | Add to `test_registry.js` |

## License

AGPL-3.0 (same as Dédalo)
