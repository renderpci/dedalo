# Introduction

## What is Dédalo?

Dédalo is a open source project to create a Cultural Heritage Management System. It has two main systems, work system and diffusion system and both has a server side and client side. Server side is builds on top of PHP. Client side is builds on top of standard HTML, CSS, and JavaScript.

Dédalo use a multiple abstraction layers, from the database schema to the data definition or the relations between data. The data structure and program behavior is defined and controlled by his ontology.

## Why Dédalo is necessary?

The project is focused in Cultural Heritage and Memory. With tools for Archeology, Ethnology, Oral Memory, Numismatics etc. And Dédalo is building thinking in the day to day work of researches or curators in cultural projects.

The common CMS as Drupal, WordPress etc are designed to create web pages, Dédalo instead, is designed to create archives, census, inventories or catalogs than will be publish in websites.

Dédalo provide tools for the researches in humanities as bibliography or multiple thesaurus (toponymy, onomastic, thematic, etc).

Our goal is to create a management system for humanities for the digital era.

## Dédalo ecosystem

From the beginning in 1998 the project was built following the Internet and web standards. Nowadays Dédalo is using common open source technologies as httpd, javascript, css, html, postgreSQL or PHP. The project is licensed by AGLP (GNU Affero General Public License v3.0) and his code is updating every day.

To run Dédalo you will need a internet server running Linux; Ubuntu, Debian, RedHat, etc. and for development you can also install it in MacOs X and, of course, if you want play in Ninja mode, you can try to install it in Windows (but by your own...).

All data is stored and management in JSON format. Dédalo use PostgreSQL JSON functionalities to store data in the database. In publication system Dédalo use any other classical SQL database, by default MariaDB or MySQL, but you can choose any other SQL, for publication data Dédalo store classical SQL schema with data in columns

Dédalo has two different APIs, with different options and functionalities, to connect client and server for every system. First for work system and second to publication system. If you only want to get public data to create a webpage or connecting with other portals you will need to learn the diffusion API. If you want to develop some tools or adding components, services, etc. you will need to learn the Dédalo API (working system).

In old Dédalo versions data was render in html webpages in server before sent to client, in recent versions the server only work and transmit data and the html is created in client side.

### Definitions of Dédalo's nomenclature

Since v4 Dédalo do not work with standard SQL schema, and NoSQL model was defined thinking in the abstraction of database and the data will store in it. As the project was build his own schema system we named our own nomenclature of common things as `table`  that we name `section` because the real tables in database are not the same thing as the abstraction of SQL tables. 

Confusing? see this scenario.

We have a postgreSQL database with one unique table for lot of different data of Dédalo, this table is named `matrix` cool name!, in this table we have only 4 columns, `id`, `section_id`, `section_tipo` and `data`. The data column is a json column with all information about lots of different things; people, interviews, audiovisual, images, etc in classic SQL all these things will have a table with his own columns, but we are no stored the data in his own tables! Dédalo store data in common table, we have only 1 table for all these things. So, we do not want use the name `table` to name it, because it is not a database table and `section` name arise. For us `section` is like a table with his specific columns, and lots of sections are stored in the matrix table.

Of course Dédalo has more tables than `matrix` table but in total Dédalo only has 28 tables and 24 of these are the same concept a 4 columns with the data column with all information in json. But a full Dédalo schema has around 1100 different sections (tables equivalents) with around 16.000 columns/fields.

And the same thing was happen with columns/fields, we name it `components` because in matrix table we have only 4 columns but the data has a different component to define the property of the data.

For ex in classic SQL you will have a people table as:

| id | name | surname |
| --- | --- | --- |
| 1 |Alicia |Gutierrez|

But in Dédalo we have only a column for data and we will store the previous data in this way:

```json
{
    "section"       : "people",
    "section_id"    : 1,
    "name"          : "Alicia",
    "surname"       : "Gutierrez"
}
```

But, we do not stop here!, the previous example has the colums / properties in English... why in English? the Dédalo project born in Valencia, Spain, why not use our main language, català, or español... why use English?, well, we determine that Dédalo will be used with any language,, all names need to be translated and the fields / properties will be abstracted with codes, alphanumeric codes and it will defined by an ontology (do not worry if you do not know what ontology is... it will appear after in this document, but thing that is a hierarchy with definitions).

So for create new sections and components we built a nodes in the ontology with all definitions and codes in this way:

```json
[
    {
        "tipo"      : "rsc197",
        "model"     : "section",
        "lg-eng"    : "People",
        "lg-spa"    : "Personas",
        "lg-cat"    : "Persones"
    },
    {
        "tipo"      : "rsc85",
        "model"     : "component_input_text",
        "lg-eng"    : "Name",
        "lg-spa"    : "Nombre",
        "lg-cat"    : "Nom"
    },
    {
        "tipo"      : "rsc86",
        "model"     : "component_input_text",
        "lg-eng"    : "Surname",
        "lg-spa"    : "Apellidos",
        "lg-cat"    : "Cognoms"
    }
]
```

And the data is referenced to this definitions in this way:

```json
{
    "section"       : "rsc197",
    "section_id"    : 1,
    "rsc85"         : "Alicia",
    "rsc86"         : "Gutierrez"
}
```

Beautiful! an abstraction of a table and columns with translatable fields! if we are working in English we can go to the node definition in the ontology and get the label of the field in English or we are working in català so we will get the label in català... changing the ontology names do not affect to the data and we can rename it without change the schema... great!

But... some names appear here, `section_id`? why? why not id? because we use `id` is the  matrix table `id` and the homonymy in these case could be confusing. It is not the same the unique id of the table than the id of the section, the id of the section is unique for the section but it is not for the table and make sense use section_id.

See a example:

| id | section_id | section_tipo | data |
| --- | --- | --- | --- |
| 1 |1 | "rsc197" | { "section" : "rsc197", "section_id": 1, "rsc85" : "Alicia","rsc86" : "Gutierrez"} |
| 2 |1 | "oh1" | { "section" : "oh1", "section_id": 1, "oh2" : "Interview"} |

We have two section_id = 1 because rsc197 is a section (remember a table) for persons and oh1 is a section for interviews. So, section_id is linked directly to sections.

Dédalo nomenclature table:

| name | equivalent | definition |
| --- | --- | --- |
| section | SQL table with format and logic | a group of records the same thing |
| component | SQL column with format and logic | a field with data management his data has specific format |
| tipo | code | alphanumeric code to identify every thing in the ontology, tipo is the Spanish name of type and it is the acronym of Typology of Indirect Programming Objects :-D |
| section_tipo | specific table |  a unique definition of a table in ontology |
| section_id | id | in combination with section_tipo: specific record /row of the table, unique id for his section_tipo |
| component_tipo | specific column | a unique definition of a column in ontology |
| model | typology | a unique definition of a typology in ontology, a model defines what node is in the ontology, a model could be 'component_input_text' to define that the node will work with text data and will use the input_text logic |
| Search Quey Object (sqo) | SQL query | abstraction of SQL syntax in json format, inspired by [mango query](https://docs.couchdb.org/en/stable/api/database/find.html) project and adapted to Dédalo schema |
| Request Quey Object (rqo) | API request | object to do request to Dédalo API to request sections, components, tools, and every thing that client need to process, it can contains a sqo |
| area|  | group of things as sections, an area could be "Intangible Heritage" that has sections as "Oral History" or "Intangible Cultural Assets" |
| locator| relation  | pointer between data, unidirectional, bidirectional o multidirectional |
| ontology | schema  | active definition of Dédalo behavior and his schema, ontology defines tables, columns, relations between data, tools, sections, components, etc, the changes in ontology will apply in real time to the Dédalo behavior. |
| tool | | specific interface and logic for do a task, tools in Dédalo could be a work process as 'transcription interviews' or actions as "propagate data between records" |
| service | | specific interface and logic shared between components, sections or tools in Dédalo a service could be a "text processor" used by text areas or html text components, or "upload files" process than could be used by image, pdf or audiovisuals components |
| widget |  | specific piece of code to do a task as summarize some components, collect data from sections, etc |
| dd_object (ddo) | | Dédalo object, a normalized object to be used in rqo, sqo and classes to build and instantiate sections, components, etc. |
| dd_date | | Dédalo date, a normalized object to representative dates |
| ts_object | | Dédalo thesaurus, a normalized object to representative thesaurus hierarchies |
| dd_grid | | Dédalo grid table, a normalized object to representative tables with rows and columns, dd_grid resolve data relations and build tables of flat data |
| context | | small piece of the ontology that defines every element as section, component, tool, etc, used to create the instances or modify it. |
| subcontext | | small piece of the ontology with all necessary elements to build the main element, for a section it will be the components inside it, for a component_portal will be the components pointed in other sections. |
| data | | data container with value and optional values as datalist or fallbacks of the value |
| value | | stored data in database |
| subdata | column value | all necessary data of other elements that is necessary to build the main element, in section will be all component data, for a a component_portal will be the data of the pointed section and components. |