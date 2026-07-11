# Updating Dédalo

> See also: [Update ontology](updating_ontology.md) · [Update code](updating_code.md) · [Update data](updating_data.md)

Dédalo is a free, open-source project and community where the ability to innovate often is key. All code is developed under free and open-source rules.

!!! warning "TS gap: these are PHP-tree operations, refused by the TS server"
    Updating the *code* and the *ontology* both mean replacing/regenerating
    files inside a PHP install tree (the code checkout, the ontology import
    files) — operations a coexisting TS server does not own and must not
    perform. `src/core/resolve/widget_request.ts` registers the `update_code`
    and `update_ontology` widgets' execute actions as explicit refusals (an
    `engine_denied` envelope naming the reason, e.g. "it downloads and
    REPLACES the PHP code tree" / "it replaces the shared `dd_ontology` from
    the PHP install ontology files") rather than a generic error — this is a
    deliberate boundary, not an oversight, and it is unlikely to be lifted: a
    TS-only deployment would update its own code with its own tooling (`git
    pull`/`bun install`), not this panel. **Update data is different**: the
    `update_data_version` panel's read side (`update_data_version.get_value`)
    is ported and byte-equal to PHP (it reports `current_version_in_db` from
    the shared `matrix_updates` table and this engine's own
    `dedalo_version`), but the actual data-migration EXECUTE also refuses
    (`engine_denied`) — migrations must run exactly once, on the engine that
    owns the migration catalog. See [Updating code](updating_code.md) and
    [Updating ontology](updating_ontology.md) for where each step stands.

## How do I know when new versions are released?

The latest Dédalo version is [here](https://github.com/renderpci/dedalo/releases). It contains all the latest fixes and improvements.

In the list you can view the changelog for the highlights of each release.

Need an older Dédalo? You can still download many of our older versions, back to v4. Earlier versions (v0, v1, v2 and v3) are considered very old, abandoned technology and are not available in this version list.

## Updating tasks

### Server services and dependencies

Dédalo has service dependencies such as PostgreSQL and FFmpeg. By default, recent Dédalo versions are compatible with the current stable version of each dependency and its previous version.

For example, Dédalo v6 in 2023 is compatible with PostgreSQL v15 and v14, PHP 8.2 and 8.1, and so on, but it is not tested and may not be compatible with PostgreSQL v13 or PHP 8.0.

It is highly recommended to keep server services on the latest stable versions. You can check the version compatibility in our [readme file](https://github.com/renderpci/dedalo/blob/master/Readme.md#4-dependencies).

### Dédalo tasks

Dédalo has three main processes to update an installation:

1. [Update ontology](updating_ontology.md)
2. [Update code](updating_code.md)
3. [Update data](updating_data.md)

#### Ontology

All updates depend on the ontology definition. The ontology changes several times a day, altering components (fields), sections (tables) and their configuration.

Normally the ontology does not depend on the code, but in major Dédalo versions — such as the v5-to-v6 upgrade — they must be synced; in those cases the update shows an alert indicating the dependency.

You can follow the [update ontology process](updating_ontology.md).

#### Code

Updating code depends on the ontology, and a specific code version usually needs at least a given ontology version or newer. For example, [v5.8.0](https://github.com/renderpci/dedalo/releases/tag/V5.8.0) requires the 03-19-2021 ontology version or newer.

Before updating the Dédalo code, it is always safe to update the ontology first.

You can follow the [update code process](updating_code.md).

#### Data

Updating data depends on the ontology and the code. When you update the code, Dédalo sometimes needs to update your data; in those cases it tells you to run the task in the maintenance panel.

You can follow the [update data process](updating_data.md).
