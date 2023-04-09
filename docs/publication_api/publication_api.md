# Publication API

Dédalo Publication API connects your archive data with the web.

## Introduction

Dédalo stores all data in a private PostgreSQL database, only accessible by the back-end.

When it is needed to publish some of the data stored, Dédalo is able to do that through a publication tool (Dédalo diffusion engine).

One of the most used publication services is the SQL publication format, and generally, these published data will be stored in a MySQL or MariaDB database. This database is accessible through Dédalo’s Public API.

Publication process transform your data into different formats as SQL, RDF or any other diffusion format without change your work data. This process is controlled by the ontology definition.

The purpose of this document is to guide you through the different available methods in the API, explaining every option and showing you how to use them with examples, code snippets and much more.

## Diffusion ontology

Diffusion ontology is a specific part of the Dédalo ontology to control what kind of data could be public and how this data need to be processed. The main idea is control the access to private data and how will be showed in the public web.

To understand this, you need to know that some archives has a personal data as tel or address that it can not to be public. And doing this transform you can control what data could be public and what no.

Besides, publication process could transform the original data into different "formats" or "versions".

For example: if you want to show one city, you can choose how this data will be processed by the web, so you can to define different formats to achieve these needs. So, to publish "Valencia" you can think; what kind of data will I need? and format it.

Let me explain. Inside Dédalo a toponymy as Valencia is a thesaurus term with all administrative hierarchy:

![valencia schema](assets/20230408_182510_valencia.png){: .small}

Ontology definition to publish this toponymy could be configured to get:

Only the name of the town. The name and all his parents (all administrative hierarchy), the name and the county, name and model (municipality), etc...

So you can create different fields in the publication database with different data:

--- | ---
toponymy    | Valencia
with_parents | Valencia, València, Valencia/Valéncia, Comunitat Valenciana, Spain
toponymy_county | Valencia, Spain
toponymy_model | Valencia, Municipality
etc | etc

If you need search by community ("Comunitat Valenciana") instead the municipality, so, you can do it searching in the field "with_parents", but if you need add one point to map, you will need to  use the geo data, so, you can define to add it to the resolution:

--- | ---
toponymy    | Valencia
geo | `{"alt":16,"lat":39.469860091745815,"lon":-0.3764533996582032,"zoom":12}`

Or you will need to link the term and his parents with the thesaurus table and you can add his locators:

--- | ---
toponymy    | Valencia
data | `["es1_7242"]`
with_parents | Valencia, València, Valencia/Valéncia, Comunitat Valenciana, Spain
data_parents | `["es1_7242", "es1_8131","es1_8842", "es1_8858", "es1_1"]`

The original data "Valencia" could be transformed into different fields to be used as needs without change the original data in PostgreSQL.

Doing those transformations we can adapt the data into publication database to be ready for different applications / optimizations, and create a very efficient websites, because the data is prepared to resolve the needs of the website, and, if in the future, you will need to add another combination not defined, is easy to include it.

### How ontology publication works?

All publication process is defined in Dédalo ontology, and it is dependent of the [diffusion](https://dedalo.dev/ontology/dd3) term.

Ontology defines some models to create a diffusion schema.

Common models

--- | ---
diffusion_domain | entity or tld group (main diffusion term)
diffusion_element | group
diffusion_group | specific group

For SQL:

--- | ---
database | name of MariaDB / MySQL database
database_alias | name of table in database (copy of schema of other database term )
table | name of table in database
table_alias | name of table in database (copy of schema of other table term )
field_boolean | bool field inside table in database
field_date | timestamp field inside table in database
field_decimal | float field inside table in database
field_enum | enum field inside table in database
field_int | in field inside table in database
field_mediumtext | mediumtext field inside table in database
field_point | mediumtext field inside table in database
field_varchar | varchar field inside table in database
field_text | text field inside table in database
field_year | year field inside table in database

For RDF:

| --- | --- |
| external_ontologies | group of definitions (main  diffusion term) |
| external_ontology   | definition of other ontology                |
| owl:Class           | Class                                       |
| owl:ObjectProperty  | Property                                    |

## Dédalo diffusion engine

It manages Dédalo’s diffusion schema and data.

Diffusion engine will process the Dédalo data and transform to other formats using the diffusion ontology. When user publish data Diffusion engine will do the transoms and store the result into other databases or files using an ontology map that defines what sections and fields will be exported.

> Output could be targeted to another database or to RDF files.

The most common scenario is to publish the data in a separate MariaDB / MySQL database. All the published data is intentionally published by the administrators and therefore, the destination database can be used for consultation without compromising the original data stored in the Dédalo working database.

Dédalo has some configurations already prepared for use as Oral History, Bibliography or Web, but you can build others, following the already existing elements patterns.

Each element of the ontology has several parameters that define the characteristics and the output format of the field in the MySQL table.

For example, the column name, the column type (varchar, text, int, date, etc.) the output processing (diffusion methods to post process the data), etc.

When data is published it will be accessible by the Publication Server API.

## Dédalo Publication Server API

It manages the public server request using a REST interface.

The publication server API can be hosted in the same Dédalo server or in another server used to create a website.
Publication server files are placed by default in Dédalo file structure at:

../httpdocs/dedalo/publication/server_api

but, you can move or copy this folder to another location or server. The only requirement to function is to allow access to the public database and media files.

Requests must be made to:

[https://mydomain.org/my_path/server_api/v1/json/](#dédalo-publication-server-api)

Example to get a list with all available tables in the database:

[http://mydomain.org/my_path/server_api/v1/json/tables_info?code=XXXX](#dédalo-publication-server-api)

The manager receives http requests from the public site, processes them and returns the data in JSON format.

Requests could be made with javascript, php, perl or any language capable of managing REST using json headers.

## Server configurations

Some examples of server configuration and data flow.

1. All system in the same server. The workspace and the diffusion is inside the same server. This configuration is easy to create and maintain, the server has all services, media, but any interference in website or attack will affect to work system.

   ![one server configuration](assets/20230408_180339_one_publication_server.svg)
2. Two different servers, one for work system, and another for Diffusion. Pros: the website is totally separated of the work system and you can scale if you have a lot of traffic into website, an attack to the website do no affect to work system. Cons: double maintenance, double cost.

   ![Two server configuration](assets/20230408_182454_two_publication_servers.svg)
3. Three different servers, first for work system, the second for media, the third for diffusion. This configuration ensure that your media files are shared by work system and diffusion system

   ![Three server configuration](assets/20230408_200232_three_publication_servers.svg)

## Data flow

1. User do an action to get information.
2. Website sent a request to the publication API as `Publication API::records`.
3. The request is processed and sended as SQL call to the database.
4. MariaDB/MySQL search into public data and return the result.
5. With the result publication API send a query to get authorization of the media associated.
6. Publication API create the final JSON mixing data and media result to be sended to website.
7. Finally website render the webpage and send to the user browser.

![Data flow](assets/20230408_201925_data_flow.svg)

## Publication API Setup

Set up publication API has two parts, activate the config files and setup the constants.

1. Set up Dédalo [Publication API configuration files](./public_api_configuration.md)
2. Dédalo [Publication API configuration](./server_config_api.md)

## Using publication API

The most widely used publication model in Dédalo is the publication on tables in a MySQL database.

Once the publication model (publication ontology) is generated, either using a pre-existing model such as Oral History or creating a custom one.

Dédalo publication API use a REST model to access to public data and we follow the OpenAPI initiative to document it.

The calls to API are sended via GET or POST queries, using variables as code to identify the authorized calls:

`https://mydomain/dedalo/lib/dedalo/publication/server_api/v1/json/tables_info?code=XXXX`

The documentation API user interface is accessible in the path:

`../dedalo/publication/server_api/v1/docu/ui/`

You can view your specific configuration and open publication API user interface directly inside Dédalo, go to `Development` menu and locate `Publication server API`, to open it click into "Open Swagger UI":

![](assets/20230408_212204_publication_api_access.png){: .medium}

You will see the Swagger interface ready to be used.

!!! warning
    If you have problems with getting data review the [public api configuration](server_config_api.md),and MariaDB / MySQl installation.

![Server API UI](assets/20230408_213159_server_api_ui.png)

## Doing request and getting data

Before begin to do calls you need to know:

- By default the request calls to get information about tables, fields, schema, etc use GET, but request calls to get data use POST.
- Every call to API need to send the API code as variable. API Code is defined in [server_config_api.php](./server_config_api.md#setting-the-api-code-authorisation-code) file.
- Every call to API need to specify the database.
- Some calls will need to specify the table.
- Response data are strings.

    !!! note
        For historical reasons and compatibility with old webpages all response data will be sended as JSON stringified, you will need parse before use it.

- You can do the calls directly or with CURL. All examples in this doc will use direct calls.

    This two request are the same:

    ```api_request
    https:///my_domain.org/dedalo/lib/dedalo/publication/server_api/v1/json/publication_schema?code=XXXX
    ```

    ```curl
    curl -X 'GET' \
    'https://my_domain.org/dedalo/publication/server_api/v1/json/publication_schema?code=XXXX' \
    -H 'accept: application/json'
    ```

### Related data

In the process to publish data Dédalo will resolve lost of relations to create flat version of data, but not all relations should be resolved because some data need to have relations to be resolve as web users need, so public data has some relations between tables and need to be resolved.

The data they hold is a stringified array in JSON format as '["1","2"]'. This data corresponds to the section_id column of each destination table.



In this example we see the correspondence between the informant column (interview table) and the section_id column (informant table). This correspondence can be resolved (if we need it) individually, through via single requests to each table, or in a joint request using the resolve_portals or resolve_portals_custom option on the same table.Table interviewTable informant array in json format array in json format

### /tables_info

Method: **GET**

The GET 'tables_info' request returns information from all the existing tables in our publication database. If you are doing a Oral History website the tables that you will get are:

- interview: contains generic information on the interview, as well as links to the resources used in the itself (image, audiovisual, informant)
- 'image': contains the data of the images associated with the interview (url, title, caption, description)
- audiovisual: contains the data of the audiovisuals (recordings) at the level of ' tape', with the url of the video file, the transcription text, the duration, subtitles, etc. 
- 'informant': contains the data of the informants associated with the interviews (name, surname, year and place of birth, etc. )
- interview: this table contains relationship columns to the image, audiovisual, and informant tables.

Request:

```api_request
https://my_domain.org/dedalo/publication/server_api/v1/json/tables_info?code=XXXX
```

Response:

```json
{
  "image": [
    "section_id",
    "lang",
    "publication",
    "image",
    "title",
    "footprint",
    "description"
  ],
  "informant": [
    "section_id",
    "lang",
    "publication",
    "name",
    "surname",
    "nickname",
    "birthdate",
    "birthplace",
    "birthplace_id",
    "gender",
    "location",
    "location_id",
    "profession",
    "dead_date",
    "dead_place",
    "dead_id",
    "biography",
    "observations"
  ],
  "interview": [
    "section_id",
    "lang",
    "publication",
    "code",
    "title",
    "abstract",
    "priority",
    "interview_place",
    "primary_lang",
    "date",
    "image",
    "audiovisual",
    "informant",
    "images",
    "project"
  ],
  "publication_schema": [
    "data"
  ]
}
```
### /publication_schema

Method: **GET**

Get information about automatic portal resolution map. Publication schema is the definition to resolve the connection between fields and the tables.

!!! info About portal fields
    Portal is a relation between data, we name portal to fields with connections with other record in the same or other table.
    If you have a interview with two audiovisuals, yo will have a portal named `audiovisual` in the table `interview`, the portal will be a array with two section_id to locate the record in the table audiovisual.

The request to 'publication_schema' returns information on the configuration of the automatic resolution of portals (see [resolve_portals](#resolve_portal)), which collects the data from the publication_schema table.

It is defined in the properties of the 'diffusion_element' node in the diffusion ontology and is updated when it is saved. As mentioned, it will be used as a map for the automatic resolution of relations (portals).

The name of each property corresponds to the column that houses the pointer and value to the destination table where the information is stored.

```json
"publication_schema":{
    "field_name" : "table_name"
}
```

Example of publication schema defined in ontology diffusion_element:

```json
"publication_schema":{
    "image"         : "image",
    "audiovisual"   : "audiovisual",
    "informant"     : "informant",
    "images"        : "image"
}
```

When you request to publication_schema you will return this:

Request:

```api_request
https://my_domain.org/dedalo/publication/server_api/v1/json/publication_schema?code=XXXX
```

Response:

```json
{
    "image"         : "image",
    "audiovisual"   : "audiovisual",
    "informant"     : "informant",
    "images"        : "image"
}
```

### /table_thesaurus

Method: **GET**

Request information about the table thesaurus resolution. This call get the configuration of the table thesaurus defined in the [TABLE_THESAURUS](./server_config_api.md#setting-the-thesaurus-table-map) constant in ./server_config_api.php file.

It is used when is necessary to manage several indexations pointed to several thesaurus. For example if you have one interview fragment with terms of thematic, onomastic and chronologic thesaurus, this definition will use in [fragment_from_index_locator](#fragment_from_index_locator) request to resolve the fragment into all thesaurus tables.

Request:

```api_request
https://my_domain.org/dedalo/publication/server_api/v1/json/table_thesaurus?code=XXXX
```

Response:

```json
"ts_chronological,ts_themes,ts_onomastic"
```

### /table_thesaurus_map

Method: **GET**

Request information about the table thesaurus map defined in [table_thesaurus_map](./server_config_api.md#setting-the-thesaurus-table-map) variable in ./server_config_api.php

Thesaurus map definition is used to prevent unnecessary union tables. It is used when you have a portal with different locators pointed to some thesaurus and the resolution will use the section_tipo tld to search only in the thesaurus table of this tld.

For expample if you have a indexation with thematic and onomastic thesaurus, you will have a portal with the locator in flat mode:

```json
{
    "indexation" : ["ts1_34","on1_55"]
}
```

The main Dédalo locator for this indexation are:

```json
[
    {
        "section_tipo" : "ts1",
        "section_id" : 34
    },
    {
        "section_tipo" : "on1",
        "section_id" : 55
    }
]
```

Thesaurus map define that section_tipo `ts1` will be resolved with `ts_themes` table and `on1` will be resolved in `ts_onomastic` table. The request will use only those tables prevent use all thesaurus tables.

When you call to [thesaurus_term](#thesaurus_term) or [thesaurus_children](#thesaurus_children), or any other thesaurus call, will use this definition to avoid unnecessary UNION with all thesaurus tables, and use only the tables that the request will need.

Request:

```api_request
https://my_domain.org/dedalo/publication/server_api/v1/json/table_thesaurus_map?code=XXXX
```

Response:

```json
{
    "dc1": "ts_chronological",
    "ts1": "ts_themes",
    "on1": "ts_onomastic",
    "fr1": "ts_onomastic"
}
```

### /records

Method: **POST**

The request to 'records' is a generic SQL query that returns the list of records found as an array of objects. It can be used to retrieve rows of tables, making it possible to select the columns to return, the number of records, the language of the themselves, grouping, sql filters, etc.

This request is similar to a basic sql query but note that not all commands are supported or allowed for security reasons.

!!! warning Security
    All calls did to API are filtered and analyzed by server processes to avoid SQL injection. Any call is directly processed by database. Diffusion API is defined to be easy to use and understand and the calls maintain similar SQL syntax, but thinking in security all calls are filtered before will send to database.

#### code

Authorization code (mandatory) `string`

#### db_name

Database name. If not defined, the default database will be used `string`

#### table

Table name in the database (mandatory) `string`

#### are_fields

Fields names to request data, similar to SELECT in SQL language. `sting || array`

By default you will get all fields / columns of the table, but you can limited the information that you need to specific field o column setting the `ar_fields` parameter. The `ar_fields` use a comma separated list of required columns in table or strings array, both formats are allowed.

Sample:

```json
"name","surname"
```

OR:

```json
["name","surname"]
```

Request:

```api_request
https://my_domain.org/dedalo/publication/server_api/v1/json/records?code=XXX&db_name=my_database&table=informant&ar_fields=["name","surname"]
```

Response:

```json
[
    {
        "table"     : "informant",
        "name"      : "John",
        "surname"   : "Doe"
    }
]
```

#### section_id

Get specific section_id. `int || int sequence`

If you need specific record like 1 you can a request to section_id also, it is valid a sequence separated by comma, like 1,4,5.

!!! info
    Dédalo do not use classical primary key id of the databases to locate information, it use a section_id in combination of section_tipo to define a unique record, in the work system it is possible to have the same section_id in the same table because the row is defined as these combination of section_id and section_tipo. This scenario is only for the work system but it is translated to publication scenario. All request will use section_id instead id.

Sample:

```json
{
    "section_id" : 1
}
```

Request:

```api_request
https://my_domain.org/dedalo/publication/server_api/v1/json/records?code=XXX&db_name=my_database&table=informant&section_id=1
```

Response:

```json
[
    {
        "table"         : "informant",
        "section_id"    : 1,
        "lang"          : "lg-eng",
        "name"          : "John",
        "surname"       : "Doe",
        "nickname"      : "Johny",
        "birthdate"     : "1943-09-30",
        "birthplace"    : "Valencia",
        "birthplace_id" : "["es1_7242"]",
        "gender"        : "non binary",
        "location"      : "Valencina de la Concepción",
        "location_id"   : "["es1_7248"]",
        "profession"    : "writer",
        "dead_date"     : null,
        "dead_place"    : null,
        "dead_id"       : null,
        "biography"     : null,
        "observations"  : null
    }
]
```

#### sql_filter

Custom query added to standard filter. `string`

It is possible to define the same parameters than SQL: `=, >, <, >=, <=, LIKE, LIKE %, ILIKE %, NOT LIKE, IN, IS NULL, IS NOT NULL` in any combination with fields.

Sample:

```json
"sql_filter": "name = John"
````

Request:

```api_request
https://my_domain.org/dedalo/publication/server_api/v1/json/records?code=XXX&db_name=my_database&table=informant&sql_filter="name = John"
```

```json
 {
    "table"         : "informant",
    "section_id"    : 1,
    "lang"          : "lg-eng",
    "name"          : "John",
    "surname"       : "Doe"
    ...
}
```


#### lang

Defines the lang of the data.

Dédalo is a multilingual system, every installation has his own language definition in his own configuration. The request to API will define the language that you want retrieve information. If this parameter is not defined publication API will get the default lang defined in [DEFAULT_LANG](./server_config_api.md#setting-the-default-lang-to-get-data) constant in server_config_api.php file.

??? note Languages
    For the languages, Dédalo uses the pattern: `lg-xxx`
    lg : identify the term as language
    xxx : with the official tld of the ISO 639-6, Alpha-4 code for comprehensive coverage of language variants.

    Some common languages:
    
    | Value | Diffusion language |
    | --- | --- |
    | lg-spa | Spanish |
    | lg-cat | Catalan |
    | lg-eus | Basque |
    | lg-eng | English |
    | lg-fra | French |
    | lg-ita | Italian |
    | lg-por | Portuguese |
    | lg-deu | German |
    | lg-ara | Arabian |
    | lg-ell | Greek |
    | lg-rus | Russian |
    | lg-ces | Czech |
    | lg-jpn | Japanese |

#### order

Custom order for result.`string`

To set the order by specific field and the order as name ASC or name DESC and is possible add more than 1 field / column.
Set this parameter with `null` if you do not want sort.

Sample:

```json
"order" : "name ASC, surname ASC"
```

Request:

```api_request
https://my_domain.org/dedalo/publication/server_api/v1/json/records?code=XXX&db_name=my_database&table=informant&order=name ASC, surname ASC
````

Response:

```json
[
     {
        "table"         : "informant",
        "section_id"    : 315,
        "lang"          : "lg-eng",
        "name"          : "Alberto",
        "surname"       : "Bertomeu",
        "nickname"      : "Pinxo",
        "birthdate"     : "1948-10-01",
        "birthplace"    : "Valencia",
        "birthplace_id" : "["es1_7242"]",
        "gender"        : "male",
        "location"      : null,
        "location_id"   : null",
        "profession"    : "his profession",
        "dead_date"     : null,
        "dead_place"    : null,
        "dead_id"       : null,
        "biography"     : null,
        "observations"  : null
    },
    {
        "table"         : "informant",
        "section_id"    : 1,
        "lang"          : "lg-eng",
        "name"          : "John",
        "surname"       : "Doe",
        "nickname"      : "Johny",
        "birthdate"     : "1943-09-30",
        "birthplace"    : "Valencia",
        "birthplace_id" : "["es1_7242"]",
        "gender"        : "non binary",
        "location"      : "Valencina de la Concepción",
        "location_id"   : "["es1_7248"]",
        "profession"    : "writer",
        "dead_date"     : null,
        "dead_place"    : null,
        "dead_id"       : null,
        "biography"     : null,
        "observations"  : null
    }
]
```

#### offset

Custom records offset for query `int`

Used to do pagination between rows in combination with `limit`. When you request has more rows than limit definition, you can specify the offset of the pagination to get other portion of the rows. 

#### count

Count the number of total rows was fonded in the search. `bool`

If you set this parameter to `true` you will get the total records number that found in your request.
Request:

```api_request
https://my_domain.org/dedalo/publication/server_api/v1/json/records?code=XXX&db_name=my_database&table=informant&count=true
```

Response:

```json
{
  "result":  [
    {   
        "table"         : "informant",
        "section_id"    : 1,
        "lang"          : "lg-eng",
        "name"          : "John",
        "surname"       : "Doe"
        ...
    },
    {   
        "table"         : "informant",
        "section_id"    : 2,
        "lang"          : "lg-eng",
        "name"          : "Another",
        "surname"       : "Informant"
        ...
    }
    "msg": "Ok get rows_data done. Ok exec_query done",
    "total": 2,
    "debug": {
        "total_time": 0.001
    }
}
```

If your request do not match to any record you will get `false` in total.

```json
{
  "result": false,
  "msg": "Ok get rows_data done.",
  "total": false,
  "debug": {
    "total_time": 0.001
  }
}
```

### /resolve_portal

Activates automatic resolution of portals. `bool`

Default `false`

### /fragment_from_index_locator

### /thesaurus_children

### /thesaurus_term