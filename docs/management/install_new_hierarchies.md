# Adding or installing new hierarchies

Hierarchies as thesaurus are an important area of Dédalo system. Dédalo use hierarchies in multiple scenarios, as normalized toponymy, languages, thematic, materials, techniques, etc. Adding or installing new hierarchies is and will be a important maintenance process.

## Defining hierarchy

Hierarchies are a complex structure of data with multiple relations formats, as his name defines, data will structure hierarchically with parent-children relation, Dédalo support more relations types as equality, change to, equivalence, or other relation types.

By default all hierarchies sections are a clone of the [hierarchy20](https://dedalo.dev/ontology/hierarchy20) section. But is possible use any other section adding the relations and definition to create a hierarchy with any flat section.

Hierarchies are showed inside the Thesaurus area and they are viewed with a tree representation.

What is the difference between hierarchy and thesaurus?

Hierarchies are the structure of the data and the thesaurus will be the data itself, the data entered by users or imported. Any thesaurus has a main controlled that is defined into Dédalo ontology (as an expansion of the ontology) and this definition is named hierarchy.

In other words; Hierarchies are the meta information of the thesaurus.

### Creating new hierarchies

Is necessary to identify two different hierarchies types:

- Common and shared hierarchies
- Private hierarchies.

#### Common or shared hierarchies

Every hierarchy has a unique TLD that identify it and is used into Dédalo [ontology](../core/index.md#dédalo-ontology) as a specific section with his own configuration. To create or import a common or shared hierarchies you will need to know the TLD before open the new hierarchy.

In some hierarchies this TLD use a standard denomination, as toponymy hierarchies, that use the [ISO 3166-1](https://www.iso.org/iso-3166-country-codes.html) definition to identify the countries.