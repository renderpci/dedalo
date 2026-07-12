# area_admin

> The **Administration** area: the top-level menu node that groups the
> back-office's user, profile and security-configuration sections, and
> contributes their aggregated dashboard.

> See also: [area](area.md) · [Areas](index.md) ·
> [Sections](../sections/index.md) ·
> [Architecture overview](../architecture_overview.md)

## Role

`area_admin` is the ontology model of the **Administration** area node (`dd207`
in a stock installation). Like every [area](area.md), it is **not** backed by a
`matrix` table and owns no records of its own: it is a structural node whose
children are the record-bearing sections it groups, and whose job is to anchor
a menu branch, scope permissions and produce the dashboard that aggregates its
descendant sections.

It is a **grouping-only** area: it adds no behavior beyond that. In
`src/core/concepts/area.ts` it is one entry in the behavior map —
`'area_admin' → 'dashboard'` — and a read of it is served by the single generic
dashboard resolver (`readDashboardArea` in `src/core/area/read.ts`) that every
dashboard-behavior area shares. There is no per-area code to write or maintain:
the model string maps straight to a behavior.

## What the Administration area does

- **Groups the administration sections.** It is the parent ontology node of
  **Users** (`dd128`) and **Profiles** (`dd234`), plus the security and
  permission configuration those sections carry (notably
  `component_security_access` on a profile record). These are ordinary `section`
  records; the area only *contains* them in the ontology tree.
- **Anchors a menu branch.** `area_admin` is one of the root models in
  `MENU_ROOT_MODEL_ORDER`; the menu walk
  (`src/core/api/handlers/menu.ts`) collects its descendants recursively so the
  client renders the Administration branch.
- **Scopes permissions.** The area is a node over which permissions are
  evaluated; its child sections are permission-gated per user and profile.
- **Contributes a dashboard.** `getDashboardData`
  (`src/core/area/dashboard.ts`) produces the per-section `total` metric, the
  area-level `activity_30d` payload and the per-section `recent_7d` badge over
  its descendant sections. See
  [area → the dashboard payload](area.md#the-dashboard-payload).

!!! note "Why no record storage"
    An area is a structural node. It has a `tipo` but no `section_id` and no
    matrix row, and a write addressed at it is refused. See
    [area](area.md#role).

## Reading the Administration area

A read is dispatched straight off `(model, tipo)` — there is nothing to
instantiate. The dispatcher validates that the client-supplied `source.model`
actually matches the tipo's resolved ontology model and refuses the request on a
mismatch, so an unvalidated client string cannot choose a server code path.

The dashboard is built from the tipo alone (`src/core/area/dashboard.ts`):

```ts
const adminTipo = 'dd207'; // resolved from the ontology in practice
const sectionTipos = await getDashboardChildSections(adminTipo); // ['dd128', 'dd234', …]
const dashboard = await getDashboardData(principal, adminTipo, ['total']);
```

!!! warning "Resolve tipos, do not hardcode them"
    `dd207` (Administration), `dd128` (Users) and `dd234` (Profiles) are the
    **stock** ontology values; a given installation can differ. Resolve the area
    from its model and the sections from their ontology nodes rather than
    hardcoding a tipo.

## How it fits with the rest of Dédalo

- **[area](area.md)** — the family reference: the behavior taxonomy, the menu
  and dashboard walks, the dashboard payload.
- **[Sections](../sections/index.md)** — the record-bearing leaves the area
  groups: Users (`dd128`) and Profiles (`dd234`).
- **Security** — `src/core/security/permissions.ts` resolves a user's profile
  and its grants from exactly those two sections; see
  [Security](../system/security.md).
- **[component_security_access](../components/component_security_access.md)** —
  the per-profile permission-level field administered through this area.
- **[Menu](../ui/menu.md)** — the Administration area is one of the menu's
  top-level nodes.

## Related

- [area](area.md) — the area reference.
- [Areas](index.md) — the family index.
- [Sections](../sections/index.md) — Users/Profiles are sections grouped here.
- [component_security_access](../components/component_security_access.md) — the
  per-profile permissions field administered in this area.
- [Architecture overview](../architecture_overview.md) — areas → sections →
  components → data.
