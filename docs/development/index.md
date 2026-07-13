# Development

> See also: [Documentation style guide](documentation_style_guide.md) · [Code documentation standard](code_documentation_standard.md) · [Extending Dédalo](extending/index.md) · [The install engine](ts_install_internals.md) · [Diffusion API](../diffusion/diffusion_data_flow.md)

This is the developer guide for the Dédalo **work system** — how to add new functionality and how to start developing inside it. If instead you want to build a public website that reads from Dédalo, you call the [diffusion API](../diffusion/diffusion_data_flow.md), Dédalo's public REST API.

## Introduction

The Dédalo ecosystem has two systems: the **work system** and the **diffusion system**. The work system is connected to the diffusion system, which publishes selected data to websites — virtual exhibitions, online catalogues, interactive games or any other public output.

## Ecosystem

The Dédalo work system is a client-server web application. The server is written in **TypeScript and runs on Bun** (a single long-lived process behind a reverse proxy); the client is written in JavaScript, which renders the data as HTML and styles it with CSS (the CSS is authored in LESS). Dédalo stores its data in a PostgreSQL database using a NoSQL model: the data lives in JSONB (binary JSON) columns. In production a reverse proxy (Apache/Nginx) owns TCP, serves static files and media, and forwards API traffic to the server over a unix socket.

The server resolves each request through horizontal engines rather than a class-per-model hierarchy: a per-model **descriptor** (`src/core/components/component_X/descriptor.ts`, keyed in `registry.ts`) declares a component's behavior, and the resolve/relations/section engines (`src/core/resolve/`, `src/core/relations/`, `src/core/section/read.ts`) drive it. The JavaScript client lives in `client/` and uses ES module imports for inheritance, relying on native prototypes rather than classes.

## Running it while you work

```shell
bun install
bun run dev          # the server + the LESS watcher, together
```

`bun run dev` is the everyday loop. It supervises the server (restarting it when the install wizard asks for a fresh process) **and** watches the LESS, recompiling the affected stylesheets as you save. Ctrl-C stops both.

The CSS deserves one paragraph of warning, because it catches people out: **the `.less` is the source, the `.css` beside it is generated, and both are committed.** The compiled CSS is what ships — deploying is a checkout, and a production install never runs the LESS compiler — so a `.css` that has drifted from its `.less` means the browser gets bytes that no source in the repo produces. `test/unit/css_build_tripwire.test.ts` recompiles everything on each run and goes red if that happens; the fix is always `bun run css:build`, then commit. Never hand-edit a `.css` or a `.css.map`.

The full account — the three commands, why the output is committed, how entrypoints are derived, why source maps must stay relative, and what to do about a merge conflict in a generated file — is in [CSS architecture → Building the CSS](../css-architecture.md#building-the-css).

Other everyday commands:

```shell
bun test                       # the suite (see Testing)
bun run scripts/verify.ts      # the pre-merge gate: typecheck, lint, all tripwires, neighbours
bunx tsc --noEmit              # typecheck only
bun run lint                   # Biome
```

## Code style

The two sides of the seam have different conventions. The **JavaScript client** uses snake case for the names of methods, functions, variables and every other definition (the section below documents that client style). The **TypeScript server** follows idiomatic TS instead — camelCase symbols, formatted and linted by Biome (`biome.json`: tab indent, single quotes, `noVar`) — so `handleRequest`, `dispatchRqo` and `runWithRequestLangs` are the server-side norm.

Two house standards govern how Dédalo is documented:

- [Code documentation standard](code_documentation_standard.md) — doc-blocks and inline comments inside the TS/JS **source**.
- [Documentation style guide](documentation_style_guide.md) — the prose documentation under `docs/` (this site).

### JavaScript (the client)

1. Variables

    1. Local variable declarations

        Prefer `const`: it is immutable and its scope is clear and well defined. Use `let` only when you need a mutable variable. Do not use `var` — its scope is unclear, so its use is avoided.

    2. One variable per declaration

        Every local variable declaration must declare only one variable. Declarations such as `const a = 1, b = 2;` are not used.

    3. Function parameters, options

        Dédalo uses an object named `options` to pass parameters to functions. Any variables within the object must be declared at the beginning of the function.

        ``` js
        component_text_area.prototype.updated_layer_data = function(options) {

            const self = this

            const caller    = options.caller
            const type      = options.layer.type
            const layer_id  = options.layer.layer_id
            ...
        }
        ```

    4. Do not use the variadic `Array` constructor

        The constructor is error-prone if arguments are added or removed. Use a literal instead.

        ``` js title="wrong!"
        const a1 = new Array(1, 8, 'cookies');
        const a2 = new Array(22, 5);
        const a3 = new Array(17);
        const a4 = new Array();
        ```

        This works as expected except for the third case: `a3` becomes an array with 17 empty slots, not an array holding the number 17.

        Instead, use `[]`:

        ``` js
        const a1 = [1, 8, 'cookies'];
        const a2 = [22, 5];
        const a3 = [17];
        const a4 = [];
        ```

        Explicitly allocating an array of a given length with `new Array(length)` is allowed when appropriate.

    5. Do not use the `Object` constructor

        Use an object literal `{}` or `{a: 0, b: 1, c: 2}` instead.

        ``` js
        const a1 = { a : 1, b : 2, c : 3 };
        const a2 = { a : 1, b2 : 'my second value' };
        const a3 = { my_other_property : 'other value' };
        const a4 = {};
        ```

    6. Use trailing commas

        Include a trailing comma whenever there is a line break between the final element and the closing bracket.

        Example:

        ``` js
        const values = [
            'first value',
            'second value',
        ];
        ```

2. Functions and inheritance

    1. Prototypes instead of classes

        Dédalo uses native JavaScript inheritance based on prototypes. ES6 introduced the `class` keyword for inheritance, but this is not a new inheritance model — it is only a specific prototype model.

        !!! note "About inheritance in JavaScript"

            [From MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_classes): JavaScript is a prototype-based language — an object's behaviors are specified by its own properties and its prototype's properties. [...] In JavaScript, classes are mainly an abstraction over the existing prototypical inheritance mechanism — all patterns are convertible to prototype-based inheritance. Classes themselves are normal JavaScript values as well, and have their own prototype chains.

            See the [Mozilla documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Inheritance_and_the_prototype_chain) for more information.

    2. Use `self` instead of `this`

        To avoid conflicts and confusion, functions always declare `self` to hold a reference to the main object.

        ``` js
        component_text_area.prototype.init = async function(options) {

            const self = this
        }
        ```

        `self` is then used elsewhere in the code to get, set or expand the main object. It is used instead of `this` to avoid confusion.

        ``` js
        const get_content_data = function(options) {

            const self = options.self

            const data  = self.data || {}
            const value = data.value || []

            const save_promise = await component_common.prototype.save.call(this, data);
        }
        ```

    3. Anonymous functions in events

        Avoid anonymous functions inside events. An anonymous handler can be shadowed by other anonymous handlers, creating an unclear situation.

3. ES modules

    Dédalo uses native ES module imports only. RequireJS, CommonJS modules and other import models are not supported.

    1. Import paths

        ES module files must use the import statement to import other ES module files.

        ``` js
        import './section.js';

        import {data_manager} from '../../common/js/data_manager.js'
        import {upload} from '../../services/service_upload/js/service_upload.js'

        import * from '../../common/js/common.js'
        ```

    2. File extensions in import paths

        The `.js` file extension is not optional in import paths and must always be included.

        ``` js title="wrong!"
        import '../directory/file';
        ```

        ``` js title="right"
        import '../directory/file.js';
        ```

    3. Importing the same file multiple times

        Do not import the same file multiple times. This can make it hard to determine the aggregate imports of a file.

        ``` js
        // Imports have the same path, but since it doesn't align it can be hard to see.
        import {common} from '../../common/js/common.js';
        import {push_browser_history} from '../../common/js/common.js';
        ```

## Extending Dédalo

Most "new" work in Dédalo is **ontology authoring**, not code — a new section, a new field, or a new menu area is usually just a node in the ontology. You write code only for a genuinely new component model, service or widget. The extending cookbooks explain the ontology-first principle and give a focused, step-by-step procedure per typology.

- [Extending Dédalo (overview)](extending/index.md) — the ontology-first decision guide: when you need code at all, the file-layout conventions and the universal checklist
- [Add a component](extending/add_a_component.md) — a new field model (a `descriptor.ts` + its `registry.ts` entry, plus the client JS + CSS)
- [Add a section](extending/add_a_section.md) — a new record type (mostly ontology)
- [Add an area](extending/add_an_area.md) — a new back-office area (an ontology node + menu wiring)
- [Add a service](extending/add_a_service.md) — a reusable client interaction hosted by a component
- [Add a widget](extending/add_a_widget.md) — a computed, read-only display embedded in a host

For the *tool* extension surface (which has its own scaffolder and registration flow), see the [Tools](#tools) section below.

## Git commit style

Since v6, Dédalo follows the [Conventional Commits v1.0](https://www.conventionalcommits.org/en/v1.0.0/) convention for commit messages.

Use the imperative verb form so that verbs such as "fix" or "update" are written in the correct tense. Apply the formula "If applied, my commit will…" — for example, "If applied, my commit will (INSERT COMMIT MESSAGE TEXT)".

The prefixes to be used in the commits are as follows:

### build

The commit alters the build system or external dependencies of the product (adding, removing, or upgrading dependencies).

### change

The commit changes the implementation of an existing feature.

### chore

The commit includes a technical or preventative maintenance task that is necessary for managing the product or the repository, but it is not tied to any specific feature or user story. For example, releasing the product can be considered a chore. Regenerating generated code that must be included in the repository could be a chore.

`chore:` This prefix is used for commits related to maintenance tasks, build processes, or other non-user-facing changes. It typically includes tasks that don't directly impact the functionality but are necessary for the project's development and maintenance.

For example:
> chore: Update dependencies

### ci

The commit makes changes to continuous integration or continuous delivery scripts or configuration files.

### deprecate

The commit deprecates existing functionality, but does not remove it from the product. For example, sometimes older public APIs may get deprecated because newer, more efficient APIs are available. Removing the APIs could break existing integrations so the APIs may be marked as deprecated in order to encourage the integration developers to migrate to the newer APIs while also giving them time before removing older functionality.

### docs

The commit adds, updates, or revises documentation that is stored in the repository.

`docs:` Used when making changes to documentation, including comments in the code, README files, or any other documentation associated with the project.

For example:
>docs: Update API documentation

### feat

The commit implements a new feature for the application.

`feat:` used as short for "feature," this prefix is used when introducing a new feature or functionality to the codebase.

For example:
> feat: Add user authentication feature

### fix

The commit fixes a defect in the application.

`fix:` Used when addressing a bug or issue in the codebase. This prefix indicates that the commit contains a fix for a problem.

For example:
>fix: Correct calculation in revenue calculation

### perf

The commit improves the performance of algorithms or general execution time of the product, but does not fundamentally change an existing feature.

`perf:` Short for "performance," this prefix is used when making changes aimed at improving the performance of the codebase.

For example:
>perf: Optimize database queries for faster response times

### refactor

The commit refactors existing code in the product, but does not alter or change existing behavior in the product.

`refactor:` Used when making changes to the codebase that do not introduce new features or fix issues but involve restructuring or optimizing existing code.

For example:
>refactor: Reorganize folder structure

### remove

The commit removes a feature from the product. Typically features are deprecated first for a period of time before being removed. Removing a feature from the product may be considered a breaking change that will require a major version number increment.

### revert

The commit reverts one or more commits that were previously included in the product, but were accidentally merged or serious issues were discovered that required their removal from the main branch.

### security

The commit improves the security of the product or resolves a security issue that has been reported.

### style

The commit updates or reformats the style of the source code, but does not otherwise change the product implementation.

`style:` This prefix is used for code style changes, such as formatting, indentation, and whitespace adjustments. It's important to separate style changes from functional changes for better clarity.

For example:
>style: Format code according to style guide

### test

The commit enhances, adds to, revised, or otherwise changes the suite of automated tests for the product.

`test:` Used when adding or modifying tests for the codebase, including unit tests, integration tests, and other forms of testing.

For example:
>test: Add unit tests for user authentication

## Testing

Dédalo ships an automated test suite run by `bun test`. It splits into a read-path parity layer (`test/parity/`, which replays a **frozen fixture store** of recorded request/response pairs), a unit/integration layer (`test/unit/`) that carries the write-path contracts and the tripwires, and an out-of-band headless client browser harness (`bun run test:client`).

See [testing.md](testing.md) for full documentation on:

- The frozen fixture store and how a parity replay runs credential-free
- How to run the suite, the `bunfig.toml` discovery/timeout config
- The `test/parity/` + `test/unit/` layout and minimal `normalize.ts` policy
- Scratch-twin write hygiene (never mutate real records)
- Writing a new parity or unit test

## Breaking change detection

Dédalo includes an automated system to detect breaking changes in API contracts, method signatures, and data models. This helps prevent regressions when developing new features.

See [breaking_change_detection.md](breaking_change_detection.md) for full documentation on:

- API Contract Snapshot Testing
- Method Signature Tracking
- Data Model Change Detection
- CI/CD integration
- How to update baselines for intentional changes

## Performance metrics

Dédalo records lightweight, process-lifetime operational counters — request totals, error classes, latency (average and max), DB-pool saturation, and per-subsystem gauges (diffusion queue depths, media-job headroom, background tool jobs) — and serves them from an admin-only diagnostics endpoint, so developers can confirm the main processes run within reasonable timeframes and detect bottlenecks.

See [metrics.md](metrics.md) for full documentation on:

- The counter registry (`src/core/api/counters.ts`) and the recording API (`incrementCounter`, `observeRequest`, `recordPoolWait`, `registerOpsGauge`)
- The structured access log (`DEDALO_ACCESS_LOG`) and the slow-request warning threshold
- `GET /api/v1/counters` — the admin-only aggregated payload and its fail-closed gate
- How to add a new counter or gauge

## Tools

A Dédalo tool is an isolated block of code that extends a component, section or area without that element knowing about it. The tools documentation covers building, registering, securing and serving tools.

- [Tools catalog](tools/reference/index.md) — every tool shipped with Dédalo v7, grouped by purpose, with per-tool reference pages
- [Creating new tools](tools/creating_tools.md) — end-to-end tutorial (scaffold → register → authorize)
- [register.json reference](tools/register_json.md) — every field of the registration file
- [Server contract](tools/server_contract.md) — the server module, API actions, configuration, lifecycle hooks
- [JS lifecycle](tools/js_lifecycle.md) — the client tool lifecycle and helpers
- [Security](tools/security.md) — what the framework enforces and what you must do

The subsystem's internals and design decisions are defined in `engineering/TOOLS_SPEC.md`.

## Runtime & request-scoped context

The work-system server runs as a single long-lived Bun process. Every request gets its own request context, threaded explicitly; the genuinely ambient values (the caller's identity, the effective languages and the DB transaction handle) live in `AsyncLocalStorage` scopes opened once per request. Nothing request-dependent lives at module level, so no cross-request state can bleed between concurrent callers and no manual per-request reset is needed.

See [runtime_and_workers.md](runtime_and_workers.md) for full documentation on:

- The entry point and routing pipeline in `src/server.ts` (`handleRequest()`)
- The per-request context and the three request-scoped `AsyncLocalStorage` scopes (`request_context.ts`, `request_lang.ts`, `postgres.ts`)
- The contract for adding new ambient state, and which caches may legitimately outlive a request
- Session handling, response building and NDJSON streaming

## Media pipeline

A media file in Dédalo is never a database blob — it is a preserved master plus generated derivatives on disk, governed by a thin JSON pointer in a media component's matrix column. The media pipeline doc maps the full lifecycle that the five media components share.

See [media_pipeline.md](media_pipeline.md) for the end-to-end stages:

- Upload (`service_upload` → `tool_upload` → the component as the single DB writer)
- Master storage and the deterministic on-disk path / filename grammar
- Transcode and derive qualities / alternative formats via `media_engine` (`Ffmpeg` / `ImageMagick`)
- Thumbnails, poster frames and per-language VTT subtitles
- Web-server-enforced access control (`media_protection`) and publication to the diffusion media index

## Internationalization (i18n)

Dédalo is multilingual to the core: the same record can hold a value per language, the interface can be shown in any configured language, and content can be tagged with the language it is in. The i18n doc ties together the two independent translation planes (data vs interface).

See [internationalization.md](internationalization.md) for full documentation on:

- The DATA plane vs the INTERFACE plane and the `DEDALO_DATA_LANG` / `DEDALO_APPLICATION_LANG` constants
- The `lg` TLD: how a language is itself a thesaurus record, and the `lang` resolver
- Translatable, non-translatable and transliterate components, and the empty-slot fallback hierarchy
- The translation workflow tools (`tool_lang` / `tool_lang_multi`) and how to add a new language
