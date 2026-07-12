# Updating Dédalo

> See also: [Update ontology](updating_ontology.md) · [Update code](updating_code.md) · [Update data](updating_data.md)

Dédalo is a free, open-source project and community where the ability to innovate often is key. All code is developed under free and open-source rules.

Dédalo has three independent update processes, each with its own maintenance-panel control and, for code, a manual path too:

1. [Update ontology](updating_ontology.md) — import the latest definition for one or more TLDs from a configured ontology server.
2. [Update code](updating_code.md) — install a new release of the server tree, either from a configured code server or by pulling the repository yourself.
3. [Update data](updating_data.md) — run any pending database migrations for the installed code version.

All three EXECUTE actions run for real against this install's own tree and database — there is no separate install they delegate to. The ontology import (`update_ontology`, `src/core/ontology/ontology_update.ts`) stages and validates every file before any destructive statement, takes a per-table recovery snapshot before importing, and auto-restores it on failure. The code update (`update_code`, `src/core/update/code_update.ts`) downloads the release archive from a configured code server, verifies its checksum, extracts it into a quarantine directory, and only then swaps it onto the live tree. The data-migration EXECUTE (`update_data_version`, `src/core/update/engine.ts`) runs the migration catalog for this engine — currently empty for the 7.x line, so the panel reports no pending migrations.

## How do I know when new versions are released?

The latest Dédalo version is [here](https://github.com/renderpci/dedalo/releases). It contains all the latest fixes and improvements.

In the list you can view the changelog for the highlights of each release.

## Updating tasks

### Server services and dependencies

Dédalo has service dependencies such as PostgreSQL, the Bun runtime and FFmpeg. By default, recent Dédalo versions are compatible with the current stable version of each dependency and its previous version. The Bun runtime itself is pinned per install (`.bun-version`); upgrading it is a deliberate, separately-tested change, not something a code update does for you.

It is highly recommended to keep server services on the latest stable versions. You can check the version compatibility in our [readme file](https://github.com/renderpci/dedalo/blob/master/Readme.md#4-dependencies).

### Dédalo tasks

#### Ontology

All updates depend on the ontology definition. The ontology changes several times a day, altering components (fields), sections (tables) and their configuration.

Normally the ontology does not depend on the code, but in major Dédalo versions they must be synced; in those cases the update shows an alert indicating the dependency.

You can follow the [update ontology process](updating_ontology.md).

#### Code

Updating code depends on the ontology, and a specific code version usually needs at least a given ontology version or newer.

Before updating the Dédalo code, it is always safe to update the ontology first.

You can follow the [update code process](updating_code.md).

#### Data

Updating data depends on the ontology and the code. When a code update ships a database migration, the "Update data" panel shows the pending task.

You can follow the [update data process](updating_data.md).
