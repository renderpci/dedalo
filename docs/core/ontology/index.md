# Ontology

## Introduction

Dédalo is an open-source cultural heritage management system designed to handle both tangible and intangible assets, including oral histories, archaeological asses and properties, ethnological objects, etc documented with multimedia archives.
At the heart of Dédalo lies its Ontology—a dynamic, modular framework that defines the structure, behaviour, and interactions of all data and components within the system.

## What Is the Dédalo Ontology?

The Ontology in Dédalo serves as the foundational schema that governs how information is organised, stored, and presented.
It defines every element of the application, from data models and user interfaces to workflows and outputs.
This abstraction layer allows for flexible and scalable management of diverse cultural heritage data.

Dédalo's Ontology employs a correspondence system based on models (elements) and nodes (definitions or instances).
For example, to define a `section` (analogous to an SQL table), a node is created in the Ontology with the model `section`.
This setup enables the system to manage records associated with that section in the database, with specific data processors defined as child nodes of that node, like `components` (analogous to an SQL fields), `groups`, view definitions, and more.

## Key Features of the Ontology

Model-Node Structure:
The Ontology uses a model-node structure where 'models' represent data types (e.g., sections, components), and 'nodes' are specific instances or definitions of these models.
This structure allows for dynamic and hierarchical organisation of data elements.

TLD Organisation:
All terms in the Ontology are organised using Top-Level Domains (TLDs), which are identifying codes that help adapt the Ontology's growth to specific needs without conflicts.
This system ensures scalability and customisation. Every TLD defines a specific part of the ontology with a meaning:

| **TLD** | definition |
| --- | --- |
| **dd** | Dédalo core definition, is used to general aspects as `Cultural heritage fields` as `Tangible` or `Oral History`, `Administration`, `Dédalo users`, etc. |
| **rsc** | Resource, used to define media elements as `Audiovisual`, `Image`, `SVG`, `PDF`, etc. including `Publications`, `Restoration processes`, and other common sections shared across the system |
| **ontology** | Ontology definition, used to create the ontology definition |
| **hierarchy** | Thesaurus definition, used to manage any kind of thesaurus and taxonomies as `Onomastic`, `Material`, `Techniques`, etc. as well `Tipology` catalogues. |
| **lg** | Languages, Definition for the languages in the thesaurus (used for all application to translate data and interface) |
| **utoponymy** | Unofficial toponymy. Section definition for unofficial toponymy (unofficial places names), used to add places that are not inside the official toponymy of countries or the installation don't want import the official toponymy (use to point the place without the official term in some sections as Publications, to define any place of publication around the world) |
| **oh** | Oral History, the definition sections and tools to be used for oral history projects such as `Interviews`, `Transcription`, `Indexation`, etc. |
| **ich** | Intangible Cultural Heritage, the definition sections and tools to use for intangible heritage, such as elements, processes, communities, symbolic acts, etc. |
| **tch** | Tangible Heritage, the definition of sections and tools to use for tangible heritage, such as objects, collectors, informants, etc |
| **tchi** | Tangible Heritage Immovable, the definition of sections and tools to use for tangible heritage immovable, such as archeological sites, finds, alqueries, etc |

Unique identification for every node (tipo):
Each node in the ontology is defined with uniquely identified by a combination of the Top-Level Domain (TLD) and a sequential number.
For example, `dd5` represents the fifth node within the `dd` TLD (`dd` being the TLD and `5` the sequence).
This identifier enables the creation of a uniquely instantiated object based on a specific modelo (model).

Dynamic Object Creation:
During execution, Dédalo builds programming objects in real-time based on the Ontology.
This means that changes to the Ontology can dynamically alter the application's behaviour without modifying the underlying code.

Format abstraction:
The Ontology enables Dédalo to interpret and translate data into multiple formats, including RDF, JSON-LD, SQL, CSV, XML, Dublin Core, HTML, etc.
This flexibility facilitates data sharing and integration with other systems.

Linked Data Model:
Dédalo is based on a linked data model and uses a relative, multi-reference, universal locator.
This locator can find entities, sections, components, and tags, allowing for precise data retrieval and management.

## Practical Applications

Dédalo's Ontology supports various cultural heritage domains, including:

- Oral History: Managing interviews and personal narratives.
- Archaeology: Documenting excavation records and artefacts.
- Numismatics: Cataloguing coin collections and monetary artefacts.
- Ethnology: Recording cultural practices and traditions.
- Memory: Managing archives, documentation, people and social events.

The system's flexibility allows institutions to tailor the Ontology to their specific needs, ensuring accurate representation and management of diverse cultural heritage materials .

## Benefits of Using Dédalo's Ontology

Customisation:
Organisations can adapt the Ontology to fit their unique data structures and workflows.

Scalability:
The TLD system and dynamic object creation support the growth and evolution of the Ontology alongside institutional needs.

Interoperability:
Multiformat output and a linked data model facilitate integration with other systems and platforms.

Efficiency:
Real-time object creation and dynamic behaviour adjustment reduce the need for extensive coding, streamlining the management process.
