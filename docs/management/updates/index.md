# Updating Dédalo

Dédalo is an free open source project and community where being able to innovate often is key. All code is developed in the free and open source rules.

## How do I know when new versions are released?

The latest Dédalo version is [here](https://github.com/renderpci/dedalo/releases). This latest version contains all the latest fixes and improvements.

In the list you can view changelog to see highlights of the changes introduced in each release.

Need an older Dédalo? You can still download many of our older versions, until v4. Previous versions (v0, v1, v2 and v3) are considered very old and abandon technology and it's not available in this version list.

## Updating tasks

### Server services and dependencies

Dédalo has services dependencies as PostgreSQL or FFmpeg, by default last Dédalo versions are compatible with the current service dependency stable version and his previous version.

For example: Dédalo v6 in 2023 is compatible with PostgreSQL v15 and v14, PHP 8.2 and 8.1, etc. but it's not tested and could be not compatible with PostgreSQL v13 of PHP 8.0.

Is highly recommended to update server services to last stable versions. You can see the version dependence compatibility in our [readme file](https://github.com/renderpci/dedalo/blob/master/Readme.md#4-dependencies).

### Dédalo tasks

Dédalo has main 3 process to update the installation:

1. [Update ontology](updating_ontology.md)
2. [Update code](updating_code.md)
3. [Update data](updating_data.md)

#### Ontology

All updates are dependent of the ontology definition, ontology is changed multiples times all day and it change components (fields), sections (tables) and his configuration.

Normally ontology it's not dependent of the code, but in major Dédalo versions, as the v5 update process to v6, it need to be synched, in this cases the update will show an alert to indicate the dependency.

You can follow the update ontology process here.

#### Code

Update code has dependency of the ontology and usually a specific code version will need at least a ontology point or newer. For example a [v5.8.0](https://github.com/renderpci/dedalo/releases/tag/V5.8.0) will required at least the 03-19-2021 ontology version or newer.

Previous to update the Dédalo code is safe to update always the ontology.

You can follow the update code process here.

#### Data

Update data is dependent of the ontology and the code. When you update the code sometimes Dédalo will need to update your data, in those cases, you will inform to do this tasks in maintenance panel.

You can follow the update data process here.
