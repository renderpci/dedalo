# Updating ontology

> See also: [Updating code](updating_code.md) · [Updating data](updating_data.md) · [Active ontology TLDs](../../config/config.md#defining-active-ontology-tlds)

The Dédalo ontology is the core of the application. It controls the data definition and how the data is interpreted. The ontology changes several times a day. Updating the ontology ensures that your Dédalo installation has the latest definition.

!!! warning "TS gap: this whole flow is PHP-install-only"
    The ontology `dd_ontology` table is **shared** between a coexisting PHP
    and TS server (see the TS ontology write layer, `src/core/db/dd_ontology.ts`,
    which reads/writes the very same rows PHP does). But the *update* process
    below — erasing tld-by-tld and importing from the shared/private ontology
    definition files — is PHP-tree tooling. On the TS server,
    `update_ontology.update_ontology` (and its `export_to_translate`/
    `rebuild_lang_files` siblings) are explicit, permanent refusals
    (`engine_denied`, `src/core/resolve/widget_request.ts`) because they
    "replace the shared `dd_ontology` from the PHP install ontology files".
    Run the ontology update from a PHP install; the TS server picks up the
    result immediately on its next read, since it shares the table and clears
    its own ontology caches independently
    (`src/core/ontology/cache_invalidation.ts`) rather than caching across
    requests the way PHP's static caches do.

In Dédalo v6 the ontology was expanded with richer definitions, and Dédalo's behavior depends on it more than before.

The ontology version is identified by the timestamp and the build location of the definition.

> Dédalo 2023-09-10T13:38:47+02:00 Benimamet

The ontology is built from different tlds. These tlds identify which part of the ontology is loaded and which parts will be updated.

## Shared and private ontologies

In your installation you could have a public and/or private tld's. Public tld's are common and shared definitions and it's updated by the main developer/users community.

Private tld's are not common or shared ontology parts and their are not maintained by main developers/ users community, but it can maintained by a specific institution or developer and shared by itself. Or it could be you own definition.

Some examples of common and shared tld's: `dd, rsc, oh, ich, tch, hierarchy, etc.`

Some examples of private tld's: `mupreva, qdp, muvaet, etc.`

The update process replaces the whole ontology definition with the latest version, tld by tld; the automatic process reads your configuration and updates only the shared tlds.

Private tlds must be updated manually.

Common and shared tld's are defined by `ACTIVE_ONTOLOGY_TLDS` (set in `../private/.env`; renamed from the PHP-era `DEDALO_PREFIX_TIPOS` — WC-028). See the [Configuration Administrator Guide](../../config/administration.md).

## Update process

To update the shared ontology enter into the Maintenance panel in the System administration -> Maintenance and locate the update ontology control:

![Updating ontology control panel](assets/20230910_141614_updating_ontology_panel.png)

The control panel will show the ontology configuration and the tld's to be updated, it's possible change the tld's to be update changing the input field to add or remove the tld.

When you ready, press the "Update Dédalo Ontology to the latest version" button, and the process will executed.

Dédalo will erase all definition of the tld's specified and import the new definition.

![Updating ontology result](assets/20230910_141614_updating_ontology_result.png)

All ontology updates will be backup into the directory:

> ../backups/ontology

!!! warning "Legacy Ontology versions considerations"
    Since 26-02-2024, master server returns freeze versions for the v6.0.x Dédalo code versions calls:   
    `6.0.x -> Ontology (freeze) version path: /6.0 `  
    `Others -> Ontology (live) version path: / `  
    This is because the new component_dataframe definition is compatible with version 5 and >=6.1 but NOT with v6.0.x
    
### doing the update process manually

Ontology is save tld by tld and you can update it coping the files located [here](https://github.com/renderpci/dedalo/tree/V5.8.0/install/import/ontology).
