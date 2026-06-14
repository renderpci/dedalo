# Dédalo code documentation standard

This document defines how to write doc-blocks and inline comments in Dédalo's **own** PHP and
JavaScript code (everything under `core/` and `tools/`). It codifies the house style that
already exists in the best-documented files so that documentation is **uniform, accurate, and
useful to developers**.

> Scope: Dédalo source only. Do **not** apply this to `vendor/`, `lib/`, or any bundled
> third-party library.

## Guiding principles

1. **Explain *why*, not just *what*.** The signature already says *what*. A good doc-block adds
   intent, contracts, edge cases, and the consequences of getting it wrong.
2. **Documentation must match the code.** Every `@param`/`@return`/`@var` type must mirror the
   real signature. A stale or wrong doc-block is worse than none.
3. **Doc-only edits.** Improving documentation never changes behavior. You only add or rewrite
   comments and doc-blocks — never code tokens, never reordering, never "while I'm here" fixes.
4. **Signal over noise.** Comment the non-obvious. Do not narrate self-evident lines.
5. **English only.** Replace any stray Spanish comments with clear English. (Identifiers and
   ontology terms stay as they are — only comments are translated.)
6. **Never delete code.** If you find dead/commented-out code, leave it and flag it in the
   round report. Removal is a separate, explicit decision.

---

## PHP

### File & member order

```php
<?php declare(strict_types=1);
include_once 'trait.search_component_common.php';   // includes, if any
/**
* CLASS ...                                          // class doc-block immediately above the class
*/
class component_input_text extends component_string_common {
```

### Class / Trait / Interface header

- First line: `CLASS NAME`, `TRAIT NAME`, or `INTERFACE NAME` (UPPERCASE, matches the symbol).
- One-line summary of *what* it is.
- Blank `*` line, then the *why / responsibilities* — prose and/or bullet lists.
- Note key relationships: what it extends, what extends it, which traits it uses, the data shape
  it manages.
- Close with `@package Dédalo` and `@subpackage` (`Core`, `API`, `Tools`, `Ontology`, …).
- Do **not** use `@version` (deprecated in this codebase).

```php
/**
* CLASS COMPONENT_INPUT_TEXT
* Manages single-line text input components in Dédalo.
*
* Provides a simple text field for short string values with support for:
* - Multi-language content with fallback to default language
* - Grid display with configurable record separators
* - Data resolution for list views and exports
*
* Stores text data as simple string values. For rich text or multi-line content,
* use component_text_area instead.
*
* Data format: Objects with 'value' property containing the text string.
* Extends component_string_common for string-based component functionality.
*
* @package Dédalo
* @subpackage Core
*/
```

For a trait, note the host class and why the code was split out:

```php
/**
* TRAIT SEARCH_COMPONENT_COMMON
* From class component_common
* Common search methods for components.
*/
```

### Method doc-block

- First line: `METHOD_NAME` (UPPERCASE).
- *What & why* prose (one or more lines). State contracts and side effects.
- `@param <type> $name [= default] [- description]` — one per parameter, in signature order.
- `@return <type> [- description]`.
- `@throws <Exception>` when the method can throw.
- **Types must mirror the PHP signature exactly**: union with `|` (`array|null`), nullable with
  `?` (`?object`), and the same scalar/class types.

```php
/**
* GET_INSTANCE
* Singleton accessor. Returns the cached component instance for the given
* locator, creating it on first request. Pass cache=false to force a fresh build.
* @param string|null $component_name = null
* @param string|null $tipo = null
* @param mixed $section_id = null
* @param string $mode = 'edit'
* @param bool $cache = true
* @return object|null $component - null when the locator cannot be resolved
*/
final public static function get_instance( ?string $component_name=null, /* … */ ) : ?object {
```

### Property / class-var doc-block

- Short description + context (what it holds, when it is set, gotchas).
- `@var <type> $name` (nullable as `?type`).

```php
/**
* Resolved data for this component. Null is a valid initial state.
* Do not set a default value here; it is populated by get_data().
* @var ?array $data_resolved
*/
public ?array $data_resolved;
```

### Constants

Document non-obvious constants with a one-line comment or a short doc-block explaining the value's
meaning and any security/contract significance (e.g. `API_ACTIONS`, `DEDALO_*` markers).

---

## JavaScript

Dédalo JS is browser-side ES modules (no framework). Two type-annotation styles existed in the
codebase; **the standard is modern JSDoc with brace types**. Migrate legacy `@param type name`
to `@param {Type} name` as you touch files.

### File header

Preserve and normalize, in this order:

```javascript
// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global SHOW_DEBUG, page_globals */
/*eslint no-undef: "error"*/

// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager}  from '../../common/js/data_manager.js'
```

- Line 1 is the **mandatory** AGPL license magnet line — never remove it.
- `/*global …*/` lists module-scope globals (only if any are used).
- For files larger than ~200 lines, add a module header doc-block describing the module's purpose
  and main exports:

```javascript
/**
* DATA_MANAGER
* Central client→server request layer: builds API calls, applies retry/timeout,
* and routes responses through the response cache.
*/
```

### Function doc-block

- First line: `FUNCTION_NAME` (UPPERCASE) — kept for grep-ability and parity with PHP.
- *What & why* prose.
- `@param {Type} name - description` — **braces** around the type; hyphen before the description.
- `@returns {Type} description` — use `@returns` (not `@return`).
- `@throws {Error} …` when applicable; `@example` for non-obvious call patterns.
- Common brace types: `{Object}`, `{string}`, `{boolean}`, `{number}`, `{Array}`,
  `{Function}`, `{Promise<Object>}`, `{HTMLElement}`, `{Map}`, `{Set}`, `{*}` (any).

```javascript
/**
* IS_FILTER_EMPTY
* Check whether a normalized filter object contains no active query clauses.
* Recurses through nested $and / $or operator groups.
* @param {Object} filter_obj - normalized filter tree ($and/$or → array of clauses)
* @returns {boolean} true when every leaf `q` clause is empty
*/
export const is_filter_empty = function(filter_obj) {
```

### Prototype-assignment modules (`search.js`, `section.js`, `page.js`, …)

- The constructor function gets a minimal header:

```javascript
/**
* SEARCH
* Search instance: builds and runs the SQO for a section's search UI.
*/
export const search = function() { … }
```

- The block of `X.prototype.method = …` assignments gets one section header doc-block, and the
  existing inline group labels (`// lifecycle`, `// render`, …) are kept:

```javascript
/**
* COMMON FUNCTIONS
* Extend instance with shared prototype methods from common / render modules.
*/
// prototypes assign
	// lifecycle
	search.prototype.destroy = common.prototype.destroy
```

- Individual `prototype.x = …` lines are **not** doc-blocked — the documentation lives at the
  source method's definition.

### Object-literal / namespace modules (`ui.js`, `data_manager.js`)

Each method property carries its own function doc-block (same format as above), not just inline
comments.

### ES6 class modules (`event_manager.js`)

Use standard JSDoc on the class and each method (`@param {Type} name - desc`, `@returns`,
`@throws`, `@example`). Keep the narrative description.

---

## Inline comments (PHP & JS)

Use the existing **`// label` block** style: a label line introduces a logical block, with the
explanation indented beneath it. Comment the non-obvious — *why* a check exists, what an edge
case protects against — not the obvious.

```php
// Get only the component data. Remove possible dataframe data.
// (TM rows store main + dataframe merged; dataframe entries are
//  identified positively via is_dataframe_entry: type marker first,
//  legacy pairing-keys shape as fallback.)
if ( $is_literal_with_dataframe ) {
    …
}
```

- Prefix genuinely critical warnings with `(!)`:

```javascript
// (!) For components, always use common.init() — do not call init() directly.
```

- Same-line trailing comments are fine for short clarifications of a variable's meaning:

```javascript
self.tipo = options.tipo // structure tipo of the component, e.g. 'dd345'
```

---

## Anti-patterns to avoid

- `@param`/`@return` types that disagree with the real signature.
- Copy-pasted doc-blocks whose name/params no longer match the method.
- Vague returns (`@return mixed` when the type is known).
- Doc-blocks attached to commented-out (dead) code.
- Mixed Spanish/English comments.
- Restating the obvious line by line.
- Removing the AGPL header or changing any code while "documenting".

## Verification checklist (per file)

- [ ] Doc-only: stripping comments from before/after yields byte-identical code.
- [ ] Every `@param`/`@return`/`@var` matches the actual signature/type.
- [ ] JS uses brace types and `@returns`.
- [ ] `php -l` passes (PHP) / lints clean (JS).
- [ ] No new dead code, no Spanish comments, AGPL header intact.
