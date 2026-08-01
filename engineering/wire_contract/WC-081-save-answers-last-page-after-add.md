# WC-081 — the save answers with the LAST page after an add/link, and reports `created_section_id` (2026-07-31)

Two changes to the SAVE echo of a relation component, one a parity repair and
one a TS-native addition. Both exist to answer the same client question: *which
record did I just create?*

### 1. The echo pages to the LAST page (parity REPAIR, not a divergence)

PHP recomputed the component pagination after the `add_new_element` and
`insert` actions and answered with the last page — the page the appended
locator lives on (`v7_php_frozen/…/class.dd_core_api.php:1459-1479`), after
first honouring a client-supplied `data.pagination.limit` (:1453, the
"show all" case).

TS did neither: the echo re-reads through `readComponentData` with the SAVE
rqo, which carries no `sqo`, so the read paged at the component's config limit
with `offset: 0` — page ONE.

Reported live 2026-07-31: adding an image to the oh1 "Identifying image"
portal (oh17, `sqo.limit: 1`) opened the FIRST linked record. The client's add
button takes the new record from `self.data.entries[self.data.entries.length-1]`
(`component_portal/js/buttons.js`) and the echo IS its next `self.data`, so on a
paginated portal "the last entry" named the first record. It also snapped the
paginator back to page one after every add. Any portal where `limit < total`
was affected; it only looked right when the whole list fit on one page.

`src/core/api/handlers/dd_core_api.ts` now reproduces both PHP steps:
`offset = limit * (ceil(total/limit) - 1)` when the list spans more than one
page, else 0. A second read happens only when that offset differs from the one
already read.

### 2. `result.created_section_id` (TS-NATIVE — PHP echoed no such key)

Shape before (PHP): the save response is `{result: {context, data}, msg}`;
the created record's address is nowhere on the wire — the client infers it
from the echoed page.

Shape after (TS): a save whose `changed_data` created a record in a TARGET
section (`add_new_element`, the only action that does) adds
`result.created_section_id: <number>`. **Absent** on every other save — a save
that creates nothing says nothing. Both save doors stamp it: the persisted one
(`dd_core_api.ts`, from `SaveResult.created_section_id`, which
`save_component.ts` already computed and dropped on the floor) and the temporal
one (`section/record/temporal.ts`, WC-059 — the same button lives there).

Reason: position in a paginated echo is a proxy for identity, and a wrong proxy
is exactly the bug above. The address is exact regardless of paging, ordering or
page size. The client (`component_portal.js add_new_element` → `buttons.js`)
opens `created_section_id` when present and keeps the last-entry heuristic as
the fallback, so an older server still works.

**Gates:** `test/unit/save_add_new_element_page_native.test.ts` — the last-page
echo (limit 1 → offset 2 of 3; limit ≥ total → offset 0), the created record
being the one the client would open, and the negative case (a plain `insert`
carries no `created_section_id`). Temporal door: the WC-081 stamp is pinned in
`test/unit/temporal_door_native.test.ts` (the WC-059 add_new_element case).

**No re-harvest.** The frozen store does record saves — two, in
`info_observer_differential.json` (`component_radio_button` numisdata57,
`component_check_box` rsc156) — but neither is an `add_new_element`, so neither
response can gain the key, and neither is paginated (the select family returns
through the datalist branch with no pagination object, so the last-page
recompute is a no-op there). No fixture shape moves.
