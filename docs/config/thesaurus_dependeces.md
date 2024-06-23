# Thesaurus dependencies

## Introduction

Dédalo use different models for specific heritage field. For example, if you want create a tangible catalog of archeological collection, you will need to implement the `tch` (tangible cultural heritage) ontology model or tld, if you want work with numismatics heritage you will need to implement `numisdata` or if you want create a interviews archive you will need to implement `oh` tld, etc.

All this ontology definitions get data, use, thesaurus, therefore the ontology model has dependencies of some specific thesaurus.

Why thesaurus are not directly use the main tld?

The quick answer is that thesaurus can be shared between disciplines.

The longer answer is that if you use the the same tld for the thesaurus when you implement the tld you are implemented the full definition with all sections and fields that maybe you don't want to use.

For example; you want to implement `tch` model and it use the thesaurus `material`, seems that this material thesaurus definition should be defined with a `tch` tld instead his own tld, in this way the material thesaurus will implemented at same time that tch implementation. But material is also used by numismatic model `numisdata`, if the thesaurus use the `tch` tld when you implement the thesaurus you will implement full `tch` model that you don't want.

Besides a thesaurus can be shared between projects and installations, so is necessary a specific tld.

## Dependencies

The next table show the dependencies between main catalog tld and thesaurus tld.

| Thesaurus name | Typology | tld | tch | tchi | ich | numisdata | oh | isad | dmm |
| --- | --- | --- |  --- |  --- |  --- |  --- |  --- |  --- |  --- |
| Chronology | Thematic | dc | √ | √ | √ | √ | √ | √ | √ |
| Culture | Thematic | culture | √ | √ | √ | √ | x | x | x |
| Deposition type | Thematic | depositiontype | x | x | x | √ | x | x | x |
| Enrollment Position | Thematic | pieces | √ | x | x | x | x | x | x |
| Iconography | Thematic | icon | √ | √ | √ | √ | x | x | x |
| Immovable property | Thematic | tchi | √ | √ | √ | √ | x | x | x |
| Material | Thematic | material | √ | √ | √ | √ | x | x | x |
| Onomastic | Thematic | on | √ | √ | √ | √ | √ | √ | √ |
| Technique | Thematic | technique | √ | √ | √ | √ | x | x | x |
| Thematic | Thematic | ts | √ | √ | √ | √ | √ | √ | √ |
| Object | Typology | object | √ | √ | √ | √ | x | x | x |
| Flora | Typology | flora | √ | √ | √ | √ | x | x | x |
| Fauna | Typology | fauna | √ | √ | √ | √ | x | x | x |
| ISAD(g) | Catalog | isad | x | x | x | x | x | √ | x |
| Location | Ubications | ubication | √ | √ | x | √ | x | x | x |
| Historical toponymy | Toponymy | htoponymy | √ | √ | x | √ | * | * | * |
| Cause of uncertainty | Semantics | uncertainty | x | x | x | √ | x | x | x |
| Job roles | Semantics | rolejob | √ | √ | √ | √ | √ | √ | √ |
| Position roles | Semantics | rolepos | √ | √ | √ | √ | √ | √ | √ |
| Semantic | Semantics | ds | √ | √ | √ | √ | √ | √ | √ |
| User roles | Semantics | roleusr | √ | √ | √ | √ | √ | √ | √ |
| Special | Special | special | x | x | x | x | √ | x | x |
| Analysis | Laboratory \| Restoration | labanalysis | √ | √ | x | x | x | x | x |
| Cause | Laboratory \| Restoration | rescause | √ | √ | x | x | x | x | x |
| Job material | Laboratory \| Restoration | resmaterial | √ | √ | x | x | x | x | x |
| Pathology | Laboratory \| Restoration | respathology | √ | √ | x | x | x | x | x |
| Treatment | Laboratory \| Restoration | restreatment | √ | √ | x | x | x | x | x |
| Countermarks | Epigraphy | sccmk | x | x | x | √ | x | x | x |
| Greek | Epigraphy | scell | x | x | x | √ | x | x | x |
| Latin | Epigraphy | sclat | x | x | x | √ | x | x | x |
| Northern Paleohispanic | Epigraphy | scxibo | x | x | x | x | x | x | x |
| Punic | Epigraphy | scxpu | x | x | x | √ | x | x | x |
| Southern Paleohispanic | Epigraphy | scxibm | x | x | x | x | x | x | x |
| Southwest Paleohispanic | Epigraphy | sctxr | x | x | x | x | x | x | x |
| Symbol | Epigraphy | scsym | x | x | x | √ | x | x | x |
| Web sites | Websites | ww |  x | x | x | x | x | x | x |

- √ The thesaurus is used and called directly
- X The thesaurus is not used directly
- \* The thesaurus may or may not be used, depending on the project. The thesaurus is called by the components through their typology.

The above table shows required dependencies for the main tlds, but it is possible to implement more thesaurus than those required, for example, if you want to work with epigraphic legends in amphorae with Greek thesaurus when you are working with the `tch` catalogue, you can implement it.

## How implement?

Thesaurus is a flexible and extensible system. Main definitions with tld and ontology creation is managed and controlled by the `Hierarchies` section [hierarchy1](https://dedalo.dev/ontology/hierarchy1). You can add new registers and create new thesaurus to be used in specific way.

Some thesaurus are common as languages and they are implemented by default in the installation process. Some of them are common but you need to specify if you want implement it or not, as toponymy (official toponymy), some installation will work with Spanish toponymy some with France or Japan or a mix of any of the 147 countries than Dédalo has implemented, this thesaurus can be implemented in the install process or in the [maintenance panel](../management/install_new_hierarchies.md) at any time.
