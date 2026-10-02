# WC-2026-10-02-select-lang-missing-entry — a stored non-project language gets ONE "<name> *" option at every edit door, named in the application language

- **Date:** 2026-10-02.
- **Decision:** DEC-12 (the rule lands with its gate). Code:
  `src/core/relations/select_lang.ts` (`appendMissingLang`, `missingLangItem`,
  `getSelectLangListValue`), `src/core/relations/datalist.ts` (`getEditDatalist`, the
  `editGuard` of the `project_langs` source), consumed by the edit read
  (`relations/models/select_family.ts`), the save echo (`api/handlers/dd_core_api.ts`)
  and the temporal echo (`section/record/temporal.ts`).

## Shape before

**PHP** (`component_select_lang_json.php` edit branch, `get_missing_lang`): when the
FIRST stored locator is not among the project-language options (a language removed from
`DEDALO_PROJECTS_DEFAULT_LANGS` after the save), the edit datalist gets one appended
entry `{value:{section_tipo, section_id}, label:"<name> *", section_id:"lg-<code>"}`, the
name in `DEDALO_APPLICATION_LANG`; skipped when the option list is empty. List mode shows
the same label. A record with no name yields `" *"`, one with no code `section_id:null`.

**TS until this entry:** no edit door appended the entry — the picker of a record storing
a non-project language showed no selected option (the value looked empty). List mode
added the label, but named in the DATA language.

## Shape after (TS)

1. Edit read, save echo and temporal echo append the PHP entry, AFTER the sorted
   options, once, through ONE door (`getEditDatalist`); the echoes complete against the
   value they hand back (saved items / picked locators). The shared option list
   (`getDatalist` — filters, the state widget, identify) never carries it.
2. The name is in the APPLICATION language (fallback: data language, then any name) —
   list mode aligned to it (PHP parity).
3. **Divergences:** a nameless record's label falls back to its code, a dangling
   locator's to `<section_tipo>_<section_id>` (the term resolver's orphan-locator
   string), never PHP's bare `" *"`; and the entry is appended even when the project
   option list is empty — the stored value is never hidden.

## Reason

A stored value the picker cannot show reads as "no value"; the curator re-picks and the
historic language is overwritten. The echo replaces the client's datalist, so an echo
without the entry would drop it on the first save.

## Gate reconciliation

No frozen fixture records a select_lang whose value is outside the project languages, so
no parity gate changes and no re-harvest is needed. Gate:
`test/unit/select_family_echo_datalist_native.test.ts` (scratch lg1 languages built at
runtime: read == save echo == temporal echo, entry present once and named in the
application lang, list label, orphan fallback, first-locator-only), every leg
mutation-checked.
