# Areas

> See also: [How configuration works](administration.md) · [Settings reference](config.md)

Areas are the top-level parts of the ontology (Thesaurus, Resources, Tools, …).
Denying one removes it from the menu and puts it out of reach — **for every user,
root included** — because the check happens before the security layer.

In v7 this is two `.env` keys, both JSON arrays of tipos:

```bash
# ../private/.env
AREAS_DENY=["dd137","rsc1","hierarchy20"]
MENU_SKIP_TIPOS=["dd349","dd355","numisdata1","tch188"]
```

- `AREAS_DENY` — areas removed from the ontology before the access check. There is
  no allow-list: denial is absolute.
- `MENU_SKIP_TIPOS` — areas that stay reachable but are hidden from the menu.

!!! tip "You can also change these at runtime"
    The **maintenance area** persists an override to `../private/ts_state.json`,
    which the menu and the security datalist consult live — no restart, no `.env`
    edit. An override set back to null falls through to the `.env` value.

---

## What an area denial means

Areas refer to different parts of the ontology. Every area has a specific, unique `tipo` (typology of indirect programming object). When an area is denied, it is removed from the menu and no user — not even the root user — can reach it: the deny list is applied *before* the security access check and strips those tipos from the ontology. Dédalo keeps some private areas in the ontology as internal lists of values, such as the Yes/No list, which must not be edited; those are denied by default.

!!! warning "Denial is not a permission"
    A denied area is removed from the ontology *before* the security check runs, so
    it is unreachable even for root. Some private lists (the Yes/No list, for
    instance) are denied by default and must stay that way.
