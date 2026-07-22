# Settings reference

> See also: [How configuration works](administration.md) · [What changed in v7](whats_changed_v7.md) · [Migrating from v6](migrating_from_v6.md)

Every setting Dédalo v7 reads, what it means, and its default.

You set these in **`../private/.env`** — one `KEY=value` per line, outside the web
root, with nothing to edit inside the served tree. After changing a value,
**restart the server**.

```bash
# ../private/.env
ENTITY=my_museum
DEDALO_TIMEZONE=Europe/Madrid
ACTIVE_ONTOLOGY_TLDS=dd,rsc,oh
```

Lists and maps are **JSON** (simple lists also accept a comma list); booleans are
`true`/`false`; a key you leave out takes the default shown here. `../private/sample.env`
carries the same catalogue in copy-paste form.

!!! note "Coming from v6?"
    The settings below are the v7 names. Several were renamed, a few changed shape,
    and many v6 constants no longer exist at all (paths the engine now derives, the
    old session mechanism, the logger…). [What changed in v7](whats_changed_v7.md) is
    the complete map, and `bun run dedalo:migrate-config` converts an old config for you.

<!-- BEGIN GENERATED — src/config/catalog/ · regenerate: bun run config:gen -->

## **Main variables:** Paths {#paths}

### Defining host

DEDALO_HOST `string`

The public domain or IP of this installation — the address **other machines** use to
reach it. Dédalo does not need it to serve you; it needs it to tell someone else where it
lives.

It matters when this install publishes to others: the ontology and code update manifests it
serves, and the "Local files" server entry in the update panel, are all built from
`<DEDALO_PROTOCOL><DEDALO_HOST>`. Leave it unset and that address falls back to
`localhost`, which is correct **only** when the client is on this same machine — a
developer box. A remote installation told to fetch from `localhost` will fetch from
itself. So: if this install serves ontology or code to any other machine, set it.

Where Dédalo merely reports its own hostname (the ontology manifest's `host` field), an
unset value is reported honestly as empty rather than as a false `localhost`.

```bash
DEDALO_HOST="dedalo.example.org"
```

*Default: (empty)*

---

### Defining protocol

DEDALO_PROTOCOL `string`

This parameter defines the internet protocol used to build absolute URLs. It is
recommended to use the HTTPS protocol for an installation with SSL certification —
it is not mandatory, but it ensures the connection is protected with encryption.
Defaults to `"http://"` when unset.

```bash
DEDALO_PROTOCOL="https://"
```

*Default: http://*

---

## Locale {#locale}

### Defining date order

DEDALO_DATE_ORDER `string`

Defines the default order for the date input by users and to be showed in component_date. By default Dédalo use dmy (European dates format).

Options:

* dmy : common way order day/moth/year
* mdy : USA way order moth/day/year
* ymd : China, Japan, Korean, Iran way year/month/day

```bash
DEDALO_DATE_ORDER="dmy"
```

*Default: dmy*

---

### Defining locale encoding

DEDALO_LOCALE `string`

Defines the UI locale used to format and encode text. By default Dédalo uses UTF-8
encoding for Spanish (`es-ES`).

```bash
DEDALO_LOCALE="es-ES"
```

*Default: es-ES*

---

### Defining time zone

DEDALO_TIMEZONE `string`

Used to defines the time zone of the project. It could be different of the server installation or the linux timezone. The time zone will be used to store the time stamp of the changes done by the users.

```bash
DEDALO_TIMEZONE="Europe/Madrid"
```

*Default: Europe/Madrid*

---

## Entity {#entity}

### Entity id

DEDALO_ENTITY_ID `int`

This parameter defines the normalized id for the entity. The id of the entity could be used to create a locator to obtain information between Dédalo installations, the id will be added to the locator with the key: "entity_id" when the locator point to external resource.

```bash
DEDALO_ENTITY_ID=0
```

*Default: 0*

---

### Defining entity label

DEDALO_ENTITY_LABEL `string`

Defines the entity label, the real name of the entity. Due the entity definition is use to encrypt passwords or access to databases, sometimes you will need define the real name of the entity with characters such as 'ñ' or accents.

```bash
DEDALO_ENTITY_LABEL="Museu de Prehistòria de València"
```

> When unset, `DEDALO_ENTITY_LABEL` defaults to the value of `ENTITY`.

*Default: the value of `ENTITY`*

---

### Defining entity

ENTITY `string`

This parameter defines the name of the entity proprietary of the Dédalo installation. Dédalo entity will be used to access to databases, to encrypt passwords or to publish data into the specific publication ontology and should NOT be changed after installation.

```bash
ENTITY="my_entity_name"
```

> Use secure characters to define the entity, without spaces, accents or other special characters that could create conflicts with other server parts, such as database connection. If you want define the full name of the entity, use DEDALO_ENTITY_LABEL definition.

*Default: install*

---

## Languages {#langs}

### Defining application language

APPLICATION_LANG `string`

This parameter defines the language will us Dédalo for the user interface.

This is a dynamic parameter and it can be changed when the user login, or in application menu. When the language is changed it is saved into the user's session and it is read to maintain coherence in the diary workflow. If the user's session does not have defined the application language then Dédalo will use the application default language definition.

```bash
APPLICATION_LANG="lg-spa"
```

> You can set this as a fixed value, but it is recommended you do not — to change the
> default interface language, use `DEDALO_APPLICATION_LANGS_DEFAULT` instead.

*Default: lg-spa*

---

### Defining data language

DATA_LANG `string`

It defines the data language used by Dédalo to process and render textual information.

This is a dynamic parameter that can be changed by the user in any moment. Dédalo is a real multi-language application, it can manage information in multiple languages and process it as unique information block (the field store any translated version of his data). The user can translate any information directly or using specific tools. This parameter define the current language used.

```bash
DATA_LANG="lg-spa"
```

> You can set this as a fixed value, but it is recommended you do not — to change the
> default data language, use [DEDALO_DATA_LANG_DEFAULT](#defining-default-data-language)
> instead.

*Default: lg-spa*

---

### Defining data language sync

DATA_LANG_SYNC `bool`

Defines whether the application language and data language selection remain synchronized.

When set to ' true', it forces to keep DEDALO_APPLICATION_LANG and DEDALO_DATA_LANG synchronized across changes.
The default value is 'false', which allows the application language and data language to be selected independently.

```bash
DATA_LANG_SYNC=false
```

*Default: false*

---

### Defining data without language (no lang)

DATA_NOLAN `string`

This parameter defines the tld used by Dédalo to tag data without translation possibility.

Dédalo is multi language by default, all information could be translated to other languages that the main lang, but some data is not susceptible to be translated, like numbers, dates or personal names. In these cases Dédalo defines this kind of data as "not translatable" with the specific tld define in this parameter.

By default and for global Dédalo definition for non translatable data this tld is: `lg-nolan`

```bash
DATA_NOLAN="lg-nolan"
```

*Default: lg-nolan*

---

### Defining application languages

DEDALO_APPLICATION_LANGS `object` (a JSON map of `lg-*` code → label)

This parameter defines the languages that Dédalo will use for the data and user interface. Dédalo is a true multi-language application, any text field can be defined as translatable and this configuration define the languages that the installation will use to store and translate text data. When the user select one of those languages Dédalo will change the data showed or the user interface, so it will render all data with this new language.

**Required** — the server refuses to boot without a non-empty value.

```bash
DEDALO_APPLICATION_LANGS={"lg-spa":"Castellano","lg-cat":"Català","lg-eus":"Euskara","lg-eng":"English","lg-fra":"French"}
```

> See the Dédalo structure lang for see the languages definitions.

*Default: {"lg-eng":"English"}*

---

### Defining default application language

DEDALO_APPLICATION_LANGS_DEFAULT `string`

Defines the main language will used in the user interface.

Dédalo can be translated to any language, the translations of the interface are done in the ontology. The users can change the Dédalo interface to use it in his language. In Dédalo the user interface and the data language are separated concepts and it is possible have a interface in one language and the data in other. This main language will be used as primary option and as fall back language when the element does not have the translation available.

```bash
DEDALO_APPLICATION_LANGS_DEFAULT="lg-eng"
```

> See the Dédalo structure lang for see the languages definitions.

*Default: lg-eng*

---

### Defining default data language

DEDALO_DATA_LANG_DEFAULT `string`

Defines the main language will used by Dédalo to manage and process data.

The main language is the mandatory language for the text data in the catalog or inventory. Dédalo is a real multi-language application, it can manage multiple translation of the textual information.

In a multi-language situation, when you require some translated information but it is not present (because it is not done), Dédalo will need to use the main language to do a fall back process to main language to show the data. If the main language data is not present, Dédalo will use any other language to show those data.

```bash
DEDALO_DATA_LANG_DEFAULT="lg-spa"
```

*Default: lg-eng*

---

### Defining data language selector

DEDALO_DATA_LANG_SELECTOR `bool`

It defines if the menu show or hide the data language selector.

When the selector is showed the user can change the data language independently of the interface language. If the selector is hide the data language is synchronous to the interface language a change in the interface language will be a change in the data language.

```bash
DEDALO_DATA_LANG_SELECTOR=true
```

*Default: true*

---

### Defining diffusion languages

DEDALO_DIFFUSION_LANGS `array`

This parameter defines the languages that Dédalo will use to publish data.

This definition control the amount of languages that will be processed to publish data in the publication process. When Dédalo publish data, it check the languages of every field of every record to create a fixed version of the data with the language processed or his own correspondences of the main languages when the data is not available in the current language. This parameter reduce the amount languages used in this process.

This parameter is configured with the same values as DEDALO_PROJECTS_DEFAULT_LANGS, but it can be changed to other values to separate the export languages from the diffusion languages.

```bash
DEDALO_DIFFUSION_LANGS=[ "lg-spa", "lg-cat", "lg-eng"]
```

>The parameter use the Dédalo tld definition for languages. See DEDALO_APPLICATION_LANGS definition to show some examples.

*Default: (unset)*

---

### Defining structure lang

DEDALO_STRUCTURE_LANG `string`

This parameter defines the default language that the ontology will use as main language. The ontology (abstracted structure) is the definition of areas, sections, fields, connections between data and definition models. All terms used in the ontology can be translated to any language, but this main language defined here will be use as mandatory language, if Dédalo is configured in other language that is not defined in the ontology translations Dédalo will do a fall back to this main language, if these main language is not present, Dédalo will use any other language to show the interface and explanations.

This parameter do not define the main data language, it only affect to the Dédalo interface and definitions in the ontology.

```bash
DEDALO_STRUCTURE_LANG="lg-spa"
```

>For the languages, Dédalo uses the pattern: `lg-xxx`
>lg : identify the term as language
>xxx : with the official tld of the ISO 639-6, Alpha-4 code for comprehensive coverage of language variants.
>
>Some common languages:
>
>| Value | Diffusion language |
>| --- | --- |
>| lg-spa | Spanish |
>| lg-cat | Catalan |
>| lg-eus | Basque |
>| lg-eng | English |
>| lg-fra | French |
>| lg-ita | Italian |
>| lg-por | Portuguese |
>| lg-deu | German |
>| lg-ara | Arabian |
>| lg-ell | Greek |
>| lg-rus | Russian |
>| lg-ces | Czech |
>| lg-jpn | Japanese |

*Default: lg-spa*

---

### Defining default projects languages

PROJECTS_DEFAULT_LANGS `array`

This parameter defines the languages that will use for export and publish data.

This definition control the amount of languages that will be processed to export data or publish data in the publication process.

When Dédalo export data or publish data, it check the languages of every field of every record to create a fixed version of the data with the language processed or his own correspondences of the main languages when the data is not available in the current language. This parameter reduce the amount languages used in those processes.

```bash
PROJECTS_DEFAULT_LANGS=[ "lg-spa", "lg-cat", "lg-eng"]
```

> The parameter use the Dédalo tld definition for languages. See DEDALO_APPLICATION_LANGS definition to show some examples.

*Default: ["lg-eng"]*

---

## Default variables {#defaults}

### Defining active ontology TLDs

ACTIVE_ONTOLOGY_TLDS `array`

!!! info "Renamed in v7 — was `DEDALO_PREFIX_TIPOS`"
    The old name did not describe the value: this is the set of ontology
    **top-level domains** active in the installation. The old spelling is retired —
    if it is still in your `.env` the server refuses to boot and names the line to
    change.

This parameter defines the ontology TLDs to be used in the Dédalo installation.

Every tipo (typology of indirect programming object) defines a heritage field, a data model, a structuring tools and definitions. Dédalo is a multi heritage application with ontologies for Archeology, Ethnology, Oral History, Numismatics, etc. Every project or institution can add any tipos that it demands. An archaeologic museum will use the model for archeological catalogs, but it will not need the ethnological definitions. In the same way that Oral History project will don't use the archeological or numismatic definitions.

By default Dédalo load some common tipos for all project types.

| **TLD** | **Defintion** |
| --- | --- |
| **dd** | Dédalo. Definition of default list and common uses and tools such as translation tools. |
| **rsc** | Resources. Definition for areas and sections commons to all projects such as people, images, audiovisual files, publications, documents, bibliography, etc. |
| **ontology** | Ontology. Definition of the sections used as nodes of the ontology |
| **hierarchy** | Thesaurus. Definition for sections as toponymy, onomastic, chronologies, techniques, material, etc. |
| **lg** | Languages, Definition for the languages in the thesaurus (used for all application to translate data and interface) |
| **utoponymy** | Unofficial toponymy. Section definition for unofficial toponymy (unofficial places names), used to add places that are not inside the official toponymy of countries or the installation don't want import the official toponymy (use to point the place without the official term in some sections as Publications, to define any place of publication around the world) |

Besides, every installation can import the ontology tipo that will use in the inventory or research:

| **TLD** | **Defintion** |
| --- | --- |
| **oh** | Oral History, the definition sections and tools to be used for oral history projects such as interviews, transcription, indexation, etc. |
| **ich** | Intangible Cultural Heritage, the definition sections and tools to use for intangible heritage, such as elements, processes, communities, symbolic acts, etc. |
| **tch** | Tangible heritage, the definition of sections and tools to use for tangible heritage, such as objects, collectors, informants, etc |
| **tchi** | Tangible heritage immovable, the definition of sections and tools to use for tangible heritage immovable, such as archeological sites, finds, alqueries, etc |
| **dmm** | Memory and documentary heritage, the definition of sections and tools to be used for the heritage of memory, such as graves, deportees, exiles, tortured, etc. |
| **numisdata** | Numismatic heritage, the definition sections and tools to use for numismatics project, such as mints, types, legends, hoards, finds, etc. |
| **isad** | Archives following the [ISAD(g) standard](https://www.ica.org/en/isadg-general-international-standard-archival-description-second-edition) (General International Standard Archival Description - Second edition), the definition of sections and tools to be used for cataloging documents with the standard structure, etc. |
| **actv** | Activities, the definition of section and fields of activities as exhibitions, workshops, didactics, conferences, etc. |

```bash
ACTIVE_ONTOLOGY_TLDS=[ "dd", "rsc", "ontology", "hierarchy", "lg", "oh", "ich" ]
```

!!! note "Thesaurus dependencies"
    Some tld has a thesaurus dependency, if you want to use a `tch` Dédalo installation will need to create the `material`, `technique`, or `objects` hierarchies. This hierarchies are not included into the main tld, because the hierarchies need to be activate and created by the users. [See the table of dependencies](thesaurus_dependeces.md#dependencies).

!!! note "Applying changes in ACTIVE_ONTOLOGY_TLDS"
    Any change in `ACTIVE_ONTOLOGY_TLDS` will need a update of the ontology, this changes are not directly applied. Dédalo needs to get the ontology tld and install it, to do that update the ontology in [maintenance](../management/maintenace_status.md) control panel.

!!! note "Activities"
    The `actv` tld should be used as model to implement a virtual sections with more specific activities as hierarchies of toponymy does into the thesaurus using it as `hierarchy20`, the main section to implement in this way is `actv1` and his model `actv2`. The virtual sections should be defined with a prefix `actv` into the new tld, in this way:
    - for exhibitions section the tld could be: `actvexhibition`
    - for conferences section the tld could be: `actvconference`

*Default: []*

---

### Defining default project

DEDALO_DEFAULT_PROJECT `int`

This parameter defines the default project that Dédalo will use to create new sections (records in the DDBB).

Dédalo use the project component (component_filter) to group sections by the research criteria. The project field is mandatory in every section, because an user that can access to a project will no see the records of the other projects and, therefore, is necessary that all sections can be searchable by projects. If the user forget introduce project data, Dédalo will use this parameter to introduce it.

```bash
DEDALO_DEFAULT_PROJECT=1
```

*Default: 1*

---

### Defining filter section tipo default

DEDALO_FILTER_SECTION_TIPO_DEFAULT `string`

This parameter defines the section that has the projects information inside the ontology.

Dédalo will use this parameter to define the locator of the filter by projects to apply to any search of sections. By default Dédalo has a predefined section to store the projects that administrators users can enlarge. The default section_tipo is `dd153` and it is located below 'Administration' area in the menu. Every project field target this section to define the specific project of the current record.

```bash
DEDALO_FILTER_SECTION_TIPO_DEFAULT="dd153"
```

> Defaults to `dd153` (the Projects section). Do not change this param.

*Default: dd153*

---

### Defining maximum rows per page

DEDALO_MAX_ROWS_PER_PAGE `int`

It defines the maximum rows that will loaded in the lists.

This value is the default number of rows that Dédalo will load, but is possible to change this value directly in the filter by the users, when they make a search, if the user do not define the maximum rows, Dédalo will use the value of this parameter.

```bash
DEDALO_MAX_ROWS_PER_PAGE=10
```

*Default: 10*

---

### Defining the maximum rows a search may return

DEDALO_SEARCH_CLIENT_MAX_LIMIT `int`

This parameter defines the ceiling applied to the number of rows a search coming FROM THE CLIENT may ask for.

It is not the page size the user sees (that is DEDALO_MAX_ROWS_PER_PAGE): it is the hard limit above which a request from the browser cannot go, whatever it asks for. A request for "all" rows, for a negative number, or for more rows than this ceiling, all come back clamped to the ceiling — so no client can ask the server for an unbounded result set. Searches the server itself builds (exports, publications, counts) are not clamped and keep full access to the whole result.

The default is 1000. Raise it if your own interface legitimately pages in bigger windows; lower it to harden an installation exposed to the public. A value below 1 is raised to 1.

```bash
DEDALO_SEARCH_CLIENT_MAX_LIMIT=1000
```

*Default: 1000*

---

### Defining the users section tipo

DEDALO_SECTION_USERS_TIPO `string`

This parameter defines the section of the ontology that holds the USER records — the login names, the password hashes, the profile and the projects each user may reach.

Dédalo needs to know which section that is, because the section is treated differently everywhere it appears: the root user is never returned by a search, not even to an administrator, and the raw view of a record refuses to open it, so a password hash cannot be read through the interface.

The default is `dd128` and an installation should keep it. It is a parameter rather than a fixed value only so that an installation whose ontology places the users section elsewhere keeps those protections instead of quietly losing them.

```bash
DEDALO_SECTION_USERS_TIPO="dd128"
```

*Default: dd128*

---

### Defining main fallback section

MAIN_SECTION `string`

It defines the section will loaded by default when the user login.
The main section of the project that will used, normally will be a inventory or catalog section.

```bash
MAIN_SECTION="oh1"
```

*Default: oh1*

---

## Media variables {#media}

### 3D

DEDALO_3D_ALTERNATIVE_EXTENSIONS `array` *optional*

This parameter defines the standards file types that will use to create alternative versions of the uploaded 3d files.

Dédalo will use this parameter to create extra versions of every 3d file, besides the standard defined in DEDALO_3D_EXTENSION. When the parameter is active, every 3d file uploaded will be processed in every quality with every format defined here, so the storage and the processing time grow with each format added.

By default the list is empty: no alternative version is created and Dédalo stores only the original file and the standard format.

```bash
DEDALO_3D_ALTERNATIVE_EXTENSIONS=["gltf"]
```

*Default: []*

---

### 3D

DEDALO_3D_AR_QUALITY `array`

This parameter defines the different qualities that can be used for store 3d files.

This parameter will use to store files to specific quality.

```bash
DEDALO_3D_AR_QUALITY=[DEDALO_3D_QUALITY_ORIGINAL, DEDALO_3D_QUALITY_DEFAULT]
```

*Default: ["original","web"]*

---

### 3D

DEDALO_3D_EXTENSION `string`

This parameter defines the standard file type of 3d files.

By default Dédalo use glb standard definition for the 3d files. All other formats will be exported to this standard.

```bash
DEDALO_3D_EXTENSION="glb"
```

*Default: glb*

---

### 3D

DEDALO_3D_EXTENSIONS_SUPPORTED `array`

This parameter defines the standards file type admitted for the 3d files.

Dédalo will use this parameter to identify the file format of the original files uploaded by the users before transform it to the standard defined in the DEDALO_3D_EXTENSION parameter.

```bash
DEDALO_3D_EXTENSIONS_SUPPORTED=["glb"]
```

> Note: in current version only glb files are available, in future versions other format files will be supported: as 'gltf', 'obj', 'fbx', 'dae', 'zip'

*Default: ["glb","gltf","obj","fbx","dae","zip"]*

---

### 3D

DEDALO_3D_FOLDER `string`

This parameter define the main directory for the 3d files.

```bash
DEDALO_3D_FOLDER="/3d"
```

*Default: /3d*

---

### 3D

DEDALO_3D_QUALITY_DEFAULT `string`

This parameter defines the default quality used for the 3d files.

This parameter will use to transform all 3d files to specific format, unifying the quality used by all sections. By default Dédalo use glb format for web quality.

```bash
DEDALO_3D_QUALITY_DEFAULT="web"
```

*Default: web*

---

### 3D

DEDALO_3D_QUALITY_ORIGINAL `string`

This parameter defines the quality original for the 3d files.

This parameter will use to identify the uploaded files to with specific quality. Dédalo admit lots of different formats from different sources and qualities, and it define this files as "original" quality. Dédalo will transform all supported formats to web standard format, unify all different qualities and codecs, and will store the original file without touch. In some cases, if the institution has a protocol for manage image files, is possible to use one specific quality for the files that users can upload. By default Dédalo do not limit the original format to be uploaded using a "original" quality denomination.

```bash
DEDALO_3D_QUALITY_ORIGINAL="original"
```

*Default: original*

---

### Audiovisual

DEDALO_AV_ALTERNATIVE_EXTENSIONS `array` *optional*

This parameter defines the standards file types that will use to create alternative versions of the uploaded audiovisual files.

Dédalo will use this parameter to compress extra versions of every audiovisual file, besides the encapsulation defined in DEDALO_AV_EXTENSION. When the parameter is active, every file uploaded will be compressed in every quality of DEDALO_AV_AR_QUALITY with every format defined here — a second format therefore doubles the transcoding time and the disk used by the derivatives.

By default the list is empty: Dédalo keeps the original file untouched and compresses only to the standard mp4 encapsulation.

```bash
DEDALO_AV_ALTERNATIVE_EXTENSIONS=["webm"]
```

*Default: []*

---

### Audiovisual

DEDALO_AV_AR_QUALITY `string`

This parameter defines the different qualities that can be used for compress the audiovisual files.

This parameter will use to compress audiovisual files to specific quality. The compression will use the original file and will compress to those qualities when the user demand a specific quality.

```bash
DEDALO_AV_AR_QUALITY=[DEDALO_AV_QUALITY_ORIGINAL,"4k","1080","720","576","404","240","audio"]
```

*Default: ["original","1080","720","576","404","240","audio"]*

---

### Audiovisual

DEDALO_AV_EXTENSION `string`

This parameter defines the standard file type of encapsulation for the audiovisual files.

By default Dédalo use mp4 encapsulation definition for the audiovisual files with codec h264 or h265. All other formats will be compressed to this parameters.

```bash
DEDALO_AV_EXTENSION="mp4"
```

*Default: mp4*

---

### Audiovisual

DEDALO_AV_EXTENSIONS_SUPPORTED `array`

This parameter defines the standards file type admitted for the audiovisual files.

Dédalo will use this parameter to identify the file format of the original files uploaded by the users before compress it to the standard defined in the DEDALO_AV_EXTENSION parameter.

```bash
DEDALO_AV_EXTENSIONS_SUPPORTED=["mp4","wave","wav","aiff","aif","mp3","mov","avi","mpg","mpeg","vob","zip","flv"]
```

*Default: ["mp4","wave","wav","aiff","aif","mp3","mov","avi","mpg","mpeg","vob","zip","flv"]*

---

### Audiovisual

DEDALO_AV_FASTSTART_PATH `string`

This parameter defines the path to the qt-faststart library in the server.

qt-faststart is used to move the av header from last bytes of the av file to the start of the av file, this change improve the load of the av because the header is at the beginning of the file and it can read first when loads begin.

```bash
DEDALO_AV_FASTSTART_PATH="/usr/bin/qt-faststart"
```

*Default: `<DEDALO_BINARY_BASE>/qt-faststart`*

---

### Audiovisual

DEDALO_AV_FFMPEG_PATH `string`

This parameter defines the path to the ffmpeg library in the server. ffmpeg will use to compress the audiovisual files.

```bash
DEDALO_AV_FFMPEG_PATH="/usr/bin/ffmpeg"
```

*Default: `<DEDALO_BINARY_BASE>/ffmpeg`*

---

### Audiovisual

DEDALO_AV_FFPROBE_PATH `string`

This parameter defines the path to the ffprobe library in the server. ffprobe is used to analyze the audiovisual files and get his metadata.

```bash
DEDALO_AV_FFPROBE_PATH="/usr/bin/ffprobe"
```

*Default: `<DEDALO_BINARY_BASE>/ffprobe`*

---

### Audiovisual

DEDALO_AV_FOLDER `string`

This parameter defines the main directory for the audiovisual files.

```bash
DEDALO_AV_FOLDER="/av"
```

*Default: /av*

---

### Audiovisual

DEDALO_AV_POSTERFRAME_EXTENSION `string`

This parameter defines the type of the image file used to create the posterframe of the audiovisual files.

The posterframe is the image that will show before load the audiovisual files and identify it. This parameter define the type of this image. By default Dédalo use jpg standard to create the posterframe.

```bash
DEDALO_AV_POSTERFRAME_EXTENSION="jpg"
```

*Default: jpg*

---

### Audiovisual

DEDALO_AV_QUALITY_DEFAULT `string`

This parameter defines the default quality used for the audiovisual files.

This parameter will use to compress all audiovisual files to specific quality, unifying the quality used by all sections. By default Dédalo use 720x404 h264 quality.

```bash
DEDALO_AV_QUALITY_DEFAULT="404"
```

*Default: 404*

---

### Audiovisual

DEDALO_AV_QUALITY_ORIGINAL `string`

This parameter defines the quality original for the audiovisual files.

This parameter will use to identify the uploaded files to with specific quality. Dédalo admit lots of different formats from different sources and qualities, and it define this files as "original" quality. Dédalo will compress all formats to web standard format, unify all different qualities and codecs, and will store the original file without touch. In some cases, if the institution has a protocol for manage av files, is possible to use one specific quality for the files that users can upload. By default Dédalo do not limit the original format to be uploaded using a "original" quality denomination.

```bash
DEDALO_AV_QUALITY_ORIGINAL="original"
```

*Default: original*

---

### Audiovisual

DEDALO_AV_SUBTITLES_EXTENSION `string`

This parameter defines the standard used to create the subtitles.

By default Dédalo use VTT format to create the subtitles.

```bash
DEDALO_AV_SUBTITLES_EXTENSION="vtt"
```

*Default: vtt*

---

### External binaries

DEDALO_BINARY_BASE `string`

This parameter defines the directory where the external media binaries are installed.

All media processing is done by external programs — ImageMagick, ffmpeg, ffprobe, qt-faststart, pdfinfo, pdftotext, pdftohtml, ocrmypdf — and Dédalo does not search the `PATH` for them: every binary key derives its default from this directory (`DEDALO_AV_FFMPEG_PATH` = `<DEDALO_BINARY_BASE>/ffmpeg`, and so on). Set this one key and the whole family follows; set an individual key only when that single binary lives somewhere else.

By default Dédalo uses `/usr/bin` (the location the system packages install to) and `/opt/homebrew/bin` on macOS. A source build or a local install (`/usr/local/bin`) is the usual reason to change it.

```bash
DEDALO_BINARY_BASE="/usr/local/bin"
```

*Default: `/opt/homebrew/bin` on macOS, `/usr/bin` elsewhere*

---

### External binaries

DEDALO_FILE_BIN_PATH `string`

This parameter defines the path to the `file` utility in the server, the program that reports the type of a file from its content.

The path is derived from DEDALO_BINARY_BASE and is resolved together with the rest of the external binaries when the server boots, so on a standard install there is nothing to set. Point it at an explicit location only when the utility is not installed alongside the other binaries.

Note that Dédalo does not depend on it to accept an upload: the upload endpoint validates every file by reading its signature bytes with its own detector and refuses anything whose content does not match the declared extension, so an install without this utility still uploads and processes media normally.

```bash
DEDALO_FILE_BIN_PATH="/usr/bin/file"
```

*Default: `<DEDALO_BINARY_BASE>/file`*

---

### Georeferencing variables

DEDALO_GEO_PROVIDER `string`

This parameter defines the tile maps provider to be used.

The param can be change the provider to specific configurations, for ex, if you want to use the ancient roman map and the actual OSM map you can use the "NUMISDATA" provider that include both maps. values supported: OSM | ARCGIS | GOOGLE | VARIOUS | ARCGIS | NUMISDATA

```bash
DEDALO_GEO_PROVIDER="VARIOUS"
```

*Default: VARIOUS*

---

### Image

DEDALO_IDENTIFY_PATH `string`

This parameter defines the path to the ImageMagick `identify` program in the server. Dédalo uses it to read the attributes of an image file — dimensions, format, colorspace, orientation, transparency — before deciding how to compress it.

The path is derived from DEDALO_BINARY_BASE, so a normal ImageMagick install needs no configuration. Dédalo prefers the modern single-entry-point form (`magick identify`, see DEDALO_MAGICK_PATH) and falls back to this standalone binary, which is what the older ImageMagick packages ship. Set this key only to point at a binary in a non-standard location.

```bash
DEDALO_IDENTIFY_PATH="/usr/bin/identify"
```

*Default: `<DEDALO_BINARY_BASE>/identify`*

---

### Image

DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS `array` *optional*

This parameter defines the standards file types that will use to create versions of the uploaded image files.

Dédalo will use this parameter to create alternative versions of the images uploaded, the files formats that will use to convert from the original files uploaded by the users. This parameter is optional and can be used to add other image formats. When the parameter is active, every image uploaded will be processed in every quality with every format define it.

```bash
DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS=["avif","png"]
```

Example:

Original file: **my_image.tif**

Default format defined in DEDALO_IMAGE_EXTENSION: **jpg**

Alternatives formats defined in DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS: **\['avif','png'\]**

Result:

In original quality directory:
> ../media/image/original/rsc29_rsc170_1.tif
>
> ../media/image/original/rsc29_rsc170_1.jpg
>
> ../media/image/original/rsc29_rsc170_1.avif
>
> ../media/image/original/rsc29_rsc170_1.png

In 1.5MB quality directory:
> ../media/image/1.5MB/rsc29_rsc170_1.jpg
>
> ../media/image/1.5MB/rsc29_rsc170_1.avif
>
> ../media/image/1.5MB/rsc29_rsc170_1.png

*Default: []*

---

### Image

DEDALO_IMAGE_AR_QUALITY `serialized array`

This parameter defines the different qualities that can be used for compress the image files.

This parameter will use to compress image files to specific quality. The compression will use the original file and will compress to those qualities when the user demand a specific quality.

```bash
DEDALO_IMAGE_AR_QUALITY=[DEDALO_IMAGE_QUALITY_ORIGINAL,DEDALO_IMAGE_QUALITY_RETOUCHED,"25MB","6MB","1.5MB",DEDALO_QUALITY_THUMB]
```

*Default: ["original","modified","100MB","25MB","6MB","1.5MB","thumb"]*

---

### Image

DEDALO_IMAGE_EXTENSION `string`

This parameter defines the standard file type of image files.

By default Dédalo use jpg standard definition for the image files. All other formats will be compressed to this standard.

```bash
DEDALO_IMAGE_EXTENSION="jpg"
```

*Default: jpg*

---

### Image

DEDALO_IMAGE_EXTENSIONS_SUPPORTED `array`

This parameter defines the standards file type admitted for the image files.

Dédalo will use this parameter to identify the file format of the original files uploaded by the users before compress it to the standard defined in the DEDALO_IMAGE_EXTENSION parameter.

```bash
DEDALO_IMAGE_EXTENSIONS_SUPPORTED=["jpg","jpeg","png","tif","tiff","bmp","psd","raw","webp","heic"]
```

*Default: ["jpg","jpeg","png","tif","tiff","bmp","psd","raw","webp","heic","avif"]*

---

### Image

DEDALO_IMAGE_FOLDER `string`

This parameter defines the main directory for the image files.

```bash
DEDALO_IMAGE_FOLDER="/image"
```

*Default: /image*

---

### Image

DEDALO_IMAGE_PRINT_DPI `int`

This parameter defines the resolution in pixels per inch that will be used in the image compression to be apply when the images will be printed.

```bash
DEDALO_IMAGE_PRINT_DPI=150
```

*Default: 150*

---

### Image

DEDALO_IMAGE_QUALITY_DEFAULT `string`

This parameter defines the default quality used for the image files.

This parameter will use to compress all image files to specific quality, unifying the quality used by all sections. By default Dédalo use 1.5MB file size (524.217px or 887x591px) quality.

```bash
DEDALO_IMAGE_QUALITY_DEFAULT="1.5MB"
```

*Default: 1.5MB*

---

### Image

DEDALO_IMAGE_QUALITY_ORIGINAL `string`

This parameter defines the quality original for the image files.

This parameter will use to identify the uploaded files to with specific quality. Dédalo admit lots of different formats from different sources and qualities, and it define this files as "original" quality. Dédalo will compress all formats to web standard format, unify all different qualities and codecs, and will store the original file without touch. In some cases, if the institution has a protocol for manage image files, is possible to use one specific quality for the files that users can upload. By default Dédalo do not limit the original format to be uploaded using a "original" quality denomination.

```bash
DEDALO_IMAGE_QUALITY_ORIGINAL="original"
```

*Default: original*

---

### Image

DEDALO_IMAGE_QUALITY_RETOUCHED `string`

This parameter defines the quality for the image files that has been retouched.

Retouched images are the processed images to improve the image, this quality will be a copy of the original that has any kind of process (color balance, background removed, contrasted, etc)

```bash
DEDALO_IMAGE_QUALITY_RETOUCHED="modified"
```

*Default: modified*

---

### Thumb

DEDALO_IMAGE_THUMB_HEIGHT `int`

This parameter defines height size in pixels to the thumb images, it will be used to compress the images with the thumb quality (the smaller version to be used in lists).

```bash
DEDALO_IMAGE_THUMB_HEIGHT=148
```

*Default: 148*

---

### Thumb

DEDALO_IMAGE_THUMB_WIDTH `int`

This parameter defines width size in pixels to the thumb images, it will be used to compress the images with the thumb quality (the smaller version to be used in lists).

```bash
DEDALO_IMAGE_THUMB_WIDTH=222
```

*Default: 222*

---

### Image

DEDALO_MAGICK_PATH `string`

This parameter defines the path to image magick library in the server (when image magick library is installed)

```bash
DEDALO_MAGICK_PATH="/usr/bin/"
```

*Default: `<DEDALO_BINARY_BASE>/magick`*

---

### Defining the public media base URL

DEDALO_MEDIA_BASE_URL `string` *optional*

This parameter defines the public address that media files are reachable at, and it is used to build ABSOLUTE media URLs where a relative one would be meaningless.

Inside the application every media URL is relative (`/dedalo/media/image/1.5MB/…`), because the browser already knows the host. But an exported list, a relation list or any cell that leaves the application must carry a URL a third party can open — so those cells are built as this base plus the file path of the model's default quality.

The parameter is unset by default. When it is unset, media cells cannot be resolved and are reported as unresolved rather than guessed: the export leaves the cell empty and names the models it could not build. Set it to the public root that fronts the installation, without a trailing slash.

```bash
DEDALO_MEDIA_BASE_URL="https://my_institution.org"
```

*Default: (unset)*

---

### Defining the media URL directory

DEDALO_MEDIA_DIR `string`

This parameter defines the NAME of the media directory as it appears in the URL. Every media URL Dédalo builds is `/dedalo/<DEDALO_MEDIA_DIR>/` plus the file path.

Do not confuse it with MEDIA_PATH, which is the directory on disk: this one is the public folder name, and the web server maps the two together (the media rules and the reverse-proxy configuration are generated from both, and they must agree — `<web root> + /dedalo/<DEDALO_MEDIA_DIR>/…` must resolve to `MEDIA_PATH/…`).

The default is `media` and a new installation should keep it. The reason to change it is an existing installation whose media were published under another folder name (`media_mib`, say): setting the old name keeps every URL already diffused to the public working.

```bash
DEDALO_MEDIA_DIR="media"
```

*Default: media*

---

### Defining media job concurrency

DEDALO_MEDIA_JOB_CONCURRENCY `int`

This parameter defines how many media jobs Dédalo will run at the same time.

Media processing (video transcoding, image derivatives, OCR) is heavy and runs inside the server process, so it is capped: a job that arrives while the lanes are busy is queued and starts as soon as one is free. The upload and the interface never block — only the processing waits.

By default Dédalo uses 3 lanes, a safe figure for a modest server. Raise it on a machine with cores to spare and a heavy ingest workload (bulk imports, long interviews); lower it to 1 when the server also serves the public site and must stay responsive while it transcodes. Values below 1 are raised to 1.

```bash
DEDALO_MEDIA_JOB_CONCURRENCY=3
```

*Default: 3*

---

### Defining the media job process files directory

DEDALO_MEDIA_PROCESSES_DIR `string`

This parameter defines the directory holding the process files of the media jobs.

Every media job writes a small JSON file with its state (progress, errors, result) that the client polls while it waits, and that lets a job be resumed after a restart. Terminal files are pruned automatically.

By default Dédalo writes them to `processes/` inside the private directory, which the server creates on demand. Change it when the private directory is on a read-only or network volume, or when several installations share one host and their job files must stay apart. The server needs read/write access to the directory as its owner.

```bash
DEDALO_MEDIA_PROCESSES_DIR="/var/lib/dedalo/processes"
```

*Default: (unset)*

---

### Defining the media web base for the client

DEDALO_MEDIA_WEB_BASE `string` *optional — unset serves media same-origin*

This parameter defines the base every media URL served to the CLIENT is built on — the address the browser fetches images, video, PDFs and their derivatives from.

Unset (the default, and the right value whenever the web server that serves media also fronts the application), media URLs are RELATIVE: `/dedalo/<DEDALO_MEDIA_DIR>/` plus the file path, resolved by the browser against the page's own origin. Set it to an ABSOLUTE URL, without a trailing slash, when media is served from a DIFFERENT origin than the application — the typical case is development, with the application on the engine's TCP port and the media on the local web server that enforces the generated access rules:

```bash
DEDALO_MEDIA_WEB_BASE="http://localhost:8080/dedalo/media"
```

In a production topology (one virtual host fronting both the application and `/dedalo/media`) leave it unset.

Do not confuse it with DEDALO_MEDIA_BASE_URL, which only resolves media cells in EXPORTS — content that leaves the application and cannot use a relative URL. That key stays deliberately unset-means-unresolved; this one always has an effective value (the relative default).

*Default: (unset)*

---

### PDF

DEDALO_PDF_ALTERNATIVE_EXTENSIONS `array` *optional*

This parameter defines the standards file types that will use to create versions of the uploaded PDF files.

Dédalo will use this parameter to create alternative versions of the PDF uploaded, the files formats that will use to convert from the original files uploaded by the users. This parameter is optional and can be used to add other image formats. When the parameter is active, every PDF uploaded will be processed for every quality with every alternative format defines.

```bash
DEDALO_PDF_ALTERNATIVE_EXTENSIONS=["avif","jpg"]
```

Example:

Original file: **my_pfd.pdf**

Alternatives formats defined in DEDALO_PDF_ALTERNATIVE_EXTENSIONS: **\['avif','jpg'\]**

Result:

In original quality directory:
> ../media/pdf/original/rsc37_rsc176_1.pdf
>
> ../media/pdf/original/rsc37_rsc176_1.avif
>
> ../media/pdf/original/rsc37_rsc176_1.jpg

In web quality directory:
> ../media/pdf/web/rsc37_rsc176_1.pdf
>
> ../media/pdf/web/rsc37_rsc176_1.avif
>
> ../media/pdf/web/rsc37_rsc176_1.jpg

!!! warning "About increment time when uploaded PDF files render alternative versions"
    Alternative versions of PDF increase the rendering process time of uploaded PDF files by ~5 times.
    The render PDF use a high density dpi and reduce the final image to get a good anti-aliased image.
    This process increases the waiting time until the PDF is displayed and usable.

*Default: ["jpg"]*

---

### PDF

DEDALO_PDF_AR_QUALITY `array`

This parameter defines the different qualities that can be used for compress the PDF files.

This parameter will use to compress PDF files to specific quality. The compression will use the original file and will compress to those qualities when the user demand a specific quality.

```bash
DEDALO_PDF_AR_QUALITY=[DEDALO_PDF_QUALITY_ORIGINAL, DEDALO_PDF_QUALITY_DEFAULT]
```

*Default: ["original","web"]*

---

### PDF

DEDALO_PDF_EXTENSION `string`

This parameter defines the standard file type of pdf files.

```bash
DEDALO_PDF_EXTENSION="pdf"
```

*Default: pdf*

---

### PDF

DEDALO_PDF_EXTENSIONS_SUPPORTED `array`

This parameter define the standards file type admitted for the pdf files. Dédalo will use this parameter to identify the file format of the original files uploaded by the users. Defaults to `["pdf","doc","pages","odt","ods","rtf","ppt"]`.

```bash
DEDALO_PDF_EXTENSIONS_SUPPORTED=["pdf","doc","pages","odt","ods","rtf","ppt"]
```

*Default: ["pdf","doc","pages","odt","ods","rtf","ppt"]*

---

### PDF

DEDALO_PDF_FOLDER `int`

This parameter defines the main directory for the pdf files.

```bash
DEDALO_PDF_FOLDER="/pdf"
```

*Default: /pdf*

---

### PDF

DEDALO_PDF_QUALITY_DEFAULT `string`

This parameter defines the default quality used for the PDF files.

This parameter will use to compress all pdf files to specific format, unifying the quality used by all sections. By default Dédalo will compress images to jpg for web quality.

```bash
DEDALO_PDF_QUALITY_DEFAULT="web"
```

*Default: web*

---

### PDF

DEDALO_PDF_QUALITY_ORIGINAL `string`

This parameter defines the quality original for the pdf files.

This parameter will use to identify the uploaded files to with specific quality. Dédalo admit hight quality for PDF files (print formats or preservation formats), and it define this files as "original" quality. Dédalo will compress to web standard format, unify all different qualities and will store the original file without touch. In some cases, if the institution has a protocol for manage PDF files, is possible to use a specific quality for the files that users can upload. By default Dédalo do not limit the original format to be uploaded using a "original" quality denomination.

```bash
DEDALO_PDF_QUALITY_ORIGINAL="original"
```

*Default: original*

---

### PDF

DEDALO_PDFINFO_PATH `string`

This parameter defines the path to the `pdfinfo` program in the server, usually shipped with [Poppler](https://poppler.freedesktop.org/). Dédalo uses it to read the metadata of the uploaded PDF files — the number of pages and the creation date that feeds the automatic date components.

The path is derived from DEDALO_BINARY_BASE, so a normal Poppler install needs no configuration; set the key only to point at a binary in a non-standard location. When the binary is missing, the PDF is stored and converted normally but its date and page metadata are not extracted.

```bash
DEDALO_PDFINFO_PATH="/usr/bin/pdfinfo"
```

*Default: `<DEDALO_BINARY_BASE>/pdfinfo`*

---

### PDF

DEDALO_PDFTOHTML_PATH `string`

This parameter defines the path to the `pdftohtml` program in the server, usually shipped with [Poppler](https://poppler.freedesktop.org/). The PDF extractor tool uses it to pull the content of a PDF out as formatted HTML, keeping the layout of the page; the plain-text alternative is PDF_AUTOMATIC_TRANSCRIPTION_ENGINE, and the user chooses between them in the tool.

The path is derived from DEDALO_BINARY_BASE, so a normal Poppler install needs no configuration. Set this key only to point at a binary in a non-standard location.

```bash
DEDALO_PDFTOHTML_PATH="/usr/bin/pdftohtml"
```

*Default: `<DEDALO_BINARY_BASE>/pdftohtml`*

---

### Thumb

DEDALO_QUALITY_THUMB `string`

This parameter defines the thumb quality definition that can be used for compress the media files.

This parameter will use to compress and store image files used in lists. The compression will use the default file.

| Media | Remark |
| --- | --- |
| PDF | Will render the first page of the website in quality, if the default image does not exist it will try to use the original quality.|
| AV | Will render the posterframe.|
| Image | Will render the default quality, if the default image does not exist it will try to use the original quality.|
| SVG | Will render the default quality, if the default image does not exist it will try to use the original quality.|
| 3d | Will render the posterframe.|

```bash
DEDALO_QUALITY_THUMB="thumb"
```

*Default: thumb*

---

### Audiovisual

DEDALO_SUBTITLES_FOLDER `string`

This parameter defines the path to the subtitles directory.

Dédalo will store the VTT files generated by the subtitle engine in this directory.

```bash
DEDALO_SUBTITLES_FOLDER="/subtitles"
```

*Default: /subtitles*

---

### SVG

DEDALO_SVG_ALTERNATIVE_EXTENSIONS `array` *optional*

This parameter defines the standards file types that will use to create alternative versions of the uploaded svg files.

Dédalo will use this parameter to create extra versions of every svg file, besides the standard defined in DEDALO_SVG_EXTENSION. When the parameter is active, every svg uploaded will be processed in every quality with every format defined here — a raster copy of a vector drawing, typically, for a consumer that cannot render svg.

By default the list is empty: Dédalo stores the original file and the web version, and nothing else.

```bash
DEDALO_SVG_ALTERNATIVE_EXTENSIONS=["png"]
```

*Default: []*

---

### SVG

DEDALO_SVG_AR_QUALITY `array`

This parameter defines the different qualities that can be used transformed svg files.

This parameter will use to store different svg version files to specific quality.

```bash
DEDALO_SVG_AR_QUALITY=[DEDALO_SVG_QUALITY_DEFAULT, DEDALO_SVG_QUALITY_DEFAULT]
```

*Default: ["original","web"]*

---

### SVG

DEDALO_SVG_EXTENSION `string`

This parameter defines the standard file type of svg files.

```bash
DEDALO_SVG_EXTENSION="svg"
```

*Default: svg*

---

### SVG

DEDALO_SVG_EXTENSIONS_SUPPORTED `array`

This parameter defines the standards file type admitted for the svg files.

Dédalo will use this parameter to identify the file format of the original files uploaded by the users.

```bash
DEDALO_SVG_EXTENSIONS_SUPPORTED=["svg"]
```

*Default: ["svg"]*

---

### SVG

DEDALO_SVG_FOLDER `string`

This parameter defines the main directory for the svg files.

```bash
DEDALO_SVG_FOLDER="/svg"
```

*Default: /svg*

---

### SVG

DEDALO_SVG_QUALITY_DEFAULT `string`

This parameter defines the default quality used for the SVG files.

This parameter will use to store all svg files, unifying the quality used by all sections. By default Dédalo will use a flat svg for web quality.

```bash
DEDALO_SVG_QUALITY_DEFAULT="web"
```

*Default: web*

---

### SVG

DEDALO_SVG_QUALITY_ORIGINAL `string`

This parameter defines the quality original for the svg files.

This parameter will use to identify the uploaded files to with specific quality. Dédalo admit different editing vector formats, and it define this files as "original" quality, Dédalo will store the original file without touch. In some cases, if the institution has a protocol for manage SVG files, is possible to use a specific quality for the files that users can upload. By default Dédalo do not limit the original format to be uploaded using a "original" quality denomination.

```bash
DEDALO_SVG_QUALITY_ORIGINAL="original"
```

*Default: original*

---

### Thumb

DEDALO_THUMB_EXTENSION `string`

This parameter defines the standard file type of thumb files.

```bash
DEDALO_THUMB_EXTENSION="jpg"
```

*Default: jpg*

---

### Defining the maximum upload size

DEDALO_UPLOAD_MAX_SIZE_BYTES `int`

This parameter defines the largest file, in BYTES, that Dédalo will accept in an upload.

The limit is enforced twice. The server publishes it to the client (the upload service reads it when it starts), so the interface can refuse an oversize file before a single byte travels and tell the user why; and the server checks the size of every part it receives, so the limit holds even against a client that ignores it.

By default the limit is 2 GB (`2147483648`). Raise it for collections of long, high-resolution video — and remember that the web server in front of Dédalo has a limit of its own (`client_max_body_size` in nginx, `LimitRequestBody` in Apache) which must be at least as large, or the upload dies before it reaches the engine. Splitting the file into chunks (DEDALO_UPLOAD_SERVICE_CHUNK_FILES) is what keeps a single request small; this ceiling applies to the file as a whole.

```bash
DEDALO_UPLOAD_MAX_SIZE_BYTES=2147483648
```

*Default: 2147483648*

---

### Defining upload split files in chunks

DEDALO_UPLOAD_SERVICE_CHUNK_FILES `int || false`

Defines the size at which files are split into chunks for upload.

This parameter allows you to break large files into smaller, more manageable pieces for reliable resumable uploads.

This parameter will use to split files at specific size into small chunks or blobs. The value is expressed in MB, but do not use the MB string, the value is a integer, for ex: 5 will be interpreted as 5MB.

When an integer is provided, any file larger than this value will be automatically segmented into chunks. The value is interpreted as Megabytes (MB). For example, chunkSize: 95 will create chunks of approximately 95MB each.

When set to `false`, the chunking feature is disabled, and all files are uploaded in a single request.

```bash
DEDALO_UPLOAD_SERVICE_CHUNK_FILES=false); // 5 = 5MB
```

*Default: 4*

---

### Defining the maximum number of simultaneous connections for uploading chunked files

DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT `int || false`

Defines the maximum number of simultaneous HTTP requests that can be open to the server when uploading a file in chunks.

When set to `false`, the internal limit is removed. The browser will then determine the maximum number of concurrent requests, which is typically based on the HTTP protocol version (see below).
When set to a positive integer (e.g., 50), the client will enforce that limit, ensuring no more than the specified number of chunks are uploaded simultaneously.

Protocol Dependencies:
This parameter is highly dependent on the HTTP protocol version in use:

For HTTP/1.1: The standard limits the number of simultaneous requests per domain to a very low number (typically 4-6). In this environment, setting a value higher than ~6 is ineffective and will be ignored by the browser. For optimal performance with HTTP/1.1, it is recommended to set this value to 4.
For HTTP/2: The protocol supports multiplexing, allowing many requests to be sent concurrently over a single connection. While this allows for a higher limit, setting the value too high can overwhelm the server with simultaneous processing load. This parameter should be used to throttle the requests to a level your server can handle reliably.

Purpose:
This setting allows you to optimize upload performance and ensure server stability by defining a number of concurrent chunk upload requests that your server can process efficiently.

```bash
DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT=50
```

*Default: 50*

---

### Defining the upload staging directory

DEDALO_UPLOAD_TMP_SUBDIR `string`

This parameter defines the staging directory where an upload is assembled, RELATIVE to the media root (MEDIA_PATH).

A file arriving in chunks is written there piece by piece, under a subdirectory of the user who is uploading it, and only when the last chunk has landed and the content has been verified is the finished file moved into its media folder. Nothing outside the staging tree is ever written by an upload in flight, and the path is confined to the media root: a value that escapes it is refused.

The default is `upload/service_upload/tmp`, and there is normally no reason to change it. A change is only useful to move the staging tree to a different subdirectory of the media volume — it must stay inside it, because the final move has to be a rename on the same filesystem, not a copy.

```bash
DEDALO_UPLOAD_TMP_SUBDIR="upload/service_upload/tmp"
```

*Default: upload/service_upload/tmp*

---

### Serving media from the engine (development only)

MEDIA_DEV_ROUTE_ENABLED `bool` *optional — unset is NOT the same as `false`*

**You normally leave this unset.** Media files are served by the WEB SERVER, which enforces the access rules Dédalo generates for it. But Dédalo can also serve them itself, straight from the media root — with no per-record access control at all. That fallback exists for the one setup that has no web server in the request path: a developer running the engine on its local TCP port.

Unset, the fallback is bound to conditions a production install cannot meet, so it needs no flag: it answers ONLY on the development TCP listener (production serves through a unix socket) and ONLY while media protection is unconfigured (once it is, the generated rules are authoritative and the engine must never undercut them).

Set the key only to override that decision. `true` FORCES the fallback on for every listener, the production socket included, serving every file under the media root to any logged-in session with no per-record or per-project check — never do this on a shared or public host; the server logs a loud warning when you do. `false` forces it off even in development.

```bash
MEDIA_DEV_ROUTE_ENABLED=false
```

*Default: (unset)*

---

### Defining media base path

MEDIA_PATH `string`

This parameter defines the root media directory in the directory tree.

Normally this directory sits alongside the install, but it can be set to any path. The server needs read/write access to this directory as its owner. Unset in dev leaves media handling disabled.

```bash
MEDIA_PATH="/srv/dedalo/media"
```

*Default: `<install dir>/media` — auto-derived; set only to relocate the media tree*

---

### PDF

PDF_AUTOMATIC_TRANSCRIPTION_ENGINE `string`

This parameter defines the path to the library, usually [xpdf](http://www.xpdfreader.com/download.html) (pdftotext), to be used for process the pdf to extract the information, this library will be used get the text fo the pdf files and store in the component_text_area. The text will be use to search inside the pdf information.

```bash
PDF_AUTOMATIC_TRANSCRIPTION_ENGINE="/usr/bin/pdftotext"
```

*Default: `<DEDALO_BINARY_BASE>/pdftotext`*

---

### PDF

PDF_OCR_ENGINE `string`

This parameter defines the path to the library, usually [ocrmypdf](https://ocrmypdf.readthedocs.io/en/latest/index.html) that will be used for OCR processing of the pdf uploaded files. Optical Character Recognition or OCR is a technology that converts images of typed or handwritten text, such as in a scanned document, into computer text that can be selected, searched and copied.

```bash
PDF_OCR_ENGINE="/usr/bin/ocrmypdf"
```

*Default: `<DEDALO_BINARY_BASE>/ocrmypdf`*

---

## Menu variables {#menu}

### Defining denied areas

AREAS_DENY `array`

This parameter defines the areas that are removed from the installation.

Areas are the top-level parts of the ontology (Thesaurus, Resources, Tools, …), each with its own tipo. A denied area is stripped from the ontology BEFORE the security layer runs, so it disappears from the menu and becomes unreachable — for every user, the root user included. Denial is absolute: there is no allow-list that can give it back.

By default Dédalo denies the areas that exist as internal lists of values rather than as places a user works in — the Yes/No list, for one — and those should stay denied. Add a tipo here to take a whole area out of an installation that does not use it. To hide an area from the menu while leaving it reachable, use MENU_SKIP_TIPOS instead. The maintenance area can also persist this list at runtime, and that override wins over the value set here.

```bash
AREAS_DENY=["dd137","rsc1","hierarchy20"]
```

*Default: ["dd137","rsc1","hierarchy20"]*

---

### Defining skip tipos from menu

MENU_SKIP_TIPOS `array`

This parameter defines the tipos to be skipped from the menu.

The ontology sometimes define long hierarchy to access to the sections, and could be convenient to remove some tipo from the menu to access more quickly to the sections. Add the tipo to the array to be removed it from menu.

```bash
MENU_SKIP_TIPOS=[]
```

*Default: ["dd349","dd355","numisdata1","tch188"]*

---

## Security variables {#security}

### Defining exclude components

DEDALO_AR_EXCLUDE_COMPONENTS `array`

This parameter defines components to be excluded.

Some installations need to block the global access to specific components, use this param to remove the components adding the tipo into the array.

```bash
DEDALO_AR_EXCLUDE_COMPONENTS=[]
```

*Default: []*

---

### Defining lock components

DEDALO_LOCK_COMPONENTS `bool`

This parameter defines if Dédalo will lock / unlock components to avoid replacement data when more than one user edit the same component or Dédalo do not manage the user edition unlocking all components. By default Dédalo do not manage the editions (option false).

```bash
DEDALO_LOCK_COMPONENTS=false
```

*Default: true*

---

### Defining protect media files for external access

DEDALO_MEDIA_ACCESS_MODE `false | string`

This parameter defines if the directory of the media files (av, images, pdf, subtitles, ...) will be protected and controlled for undesired/external access. The full documentation, with the architecture, use cases, web server configuration and examples, is in [Media protection (media file access control)](./media_protection.md).

* `false` : no protection — media files are world-readable (default)
* `'private'` : only logged-in Dédalo users can access media files
* `'publication'` : logged-in users access everything; anonymous users access only media of published records in the configured public quality folders (see `DEDALO_MEDIA_PUBLIC_QUALITIES`)

```bash
DEDALO_MEDIA_ACCESS_MODE=false
```

*Default: (empty)*

---

### Defining protect media files for external access

DEDALO_MEDIA_PUBLIC_QUALITIES `string[]` (optional)

The quality folders an **anonymous** visitor may read when the record is published (rule B).
A JSON array, or a comma-separated list. Leave it unset to derive the delivery-grade folders
from this installation's own quality catalog — `av/404`, `av/posterframe`, `av/subtitles`,
`image/1.5MB`, `image/thumb`, `pdf/web`, `svg/web`, `3d/web`.

Master and working qualities (`original`, `modified`) are **always refused, even if you list
them**: they are the source files, they are the large ones, and they are never public. A
refused entry is dropped and logged; it never silently becomes public and never aborts the boot.

```bash
# publish the larger image derivative too, and keep thumbnails private
DEDALO_MEDIA_PUBLIC_QUALITIES=["image/1.5MB","av/404","av/subtitles"]
```

*Default: (unset)*

---

### Defining lock components notifications

DEDALO_NOTIFICATIONS `bool`

This parameter defines if Dédalo will notify to the user than other users are editing the same field in the same section when the user try to edit the field.

```bash
DEDALO_NOTIFICATIONS=false
```

*Default: false*

---

### Defining protect media files for external access

DEDALO_PROTECT_MEDIA_FILES `bool` (deprecated)

The legacy boolean is kept for back-compat: `true` behaves as `DEDALO_MEDIA_ACCESS_MODE='private'` when the new constant is not defined.

```bash
DEDALO_PROTECT_MEDIA_FILES=false
```

!!! note "The mode can also be set at runtime"
    The root user can change the mode from the **media_control** maintenance widget. That
    override is stored in `<private>/ts_state.json` and **wins over this key**, taking effect
    with no restart. If editing `.env` appears to do nothing, the widget reports the effective
    mode and where it came from.

*Default: false*

---

### Defining the upload session cache expiry

DEDALO_SESSION_CACHE_EXPIRE `int`

The lifetime, **in minutes**, that the upload service announces for a queued upload
session. The engine reports it with the rest of the system information, and the upload
panel displays it, so a user knows how long files that were uploaded but not yet saved
into a record remain available in the temporary upload directory.

Default `180` (3 hours). This value is what the interface announces — it does not by
itself prune the temporary upload directory, so keep it in step with whatever
housekeeping runs over `DEDALO_UPLOAD_TMP_SUBDIR`.

```bash
DEDALO_SESSION_CACHE_EXPIRE=180
```

*Default: 180*

---

### Defining the account-wide login attempt limit

LOGIN_ACCOUNT_MAX_ATTEMPTS `int`

The second dimension of the login throttle: how many failed logins one **user name**
may accumulate inside `LOGIN_ATTEMPT_WINDOW` **from any address at all**, before that
account is locked for `LOGIN_LOCKOUT_SECONDS`. It is what stops an attacker who rotates
addresses (every new address gets a fresh per-address bucket, but they all share this one).

It is deliberately much higher than `LOGIN_MAX_ATTEMPTS` (default `50` against `10`),
and it should stay that way: a low account-wide limit lets anyone lock a colleague out of
their own account with a burst of wrong passwords — a denial of service you inflict on
yourself. Set it very high to effectively disable this dimension and rely on the
per-address limit alone.

```bash
LOGIN_ACCOUNT_MAX_ATTEMPTS=50
```

*Default: 50*

---

### Defining the login attempt window

LOGIN_ATTEMPT_WINDOW `int`

The sliding window, **in seconds**, over which failed logins are counted for both
throttle limits (`LOGIN_MAX_ATTEMPTS` and `LOGIN_ACCOUNT_MAX_ATTEMPTS`). A failure
older than the window no longer counts against anyone, and is deleted from the store
once it can no longer influence a decision.

Default `900` (15 minutes). A longer window makes the throttle stricter — failures
spread over a slow, patient attack still add up.

```bash
LOGIN_ATTEMPT_WINDOW=900
```

*Default: 900*

---

### Defining the login lockout time

LOGIN_LOCKOUT_SECONDS `int`

How long, **in seconds**, a login stays refused once a throttle limit has been reached.
The lock lifts this long after the most recent counted failure; a successful login clears
the counters immediately, so a user who finally remembers the password is not kept waiting.

Default `900` (15 minutes). Raising it slows a brute-force attempt further; lowering it
mostly buys convenience for people who mistype.

```bash
LOGIN_LOCKOUT_SECONDS=900
```

*Default: 900*

---

### Defining the login attempt limit per address

LOGIN_MAX_ATTEMPTS `int`

How many failed logins the same user name may accumulate **from the same client
address** inside `LOGIN_ATTEMPT_WINDOW` before further attempts are refused for
`LOGIN_LOCKOUT_SECONDS`. A successful login clears the counter at once.

Default `10` — room for a run of typos, nowhere near enough for a password-guessing
attack. Note that the client address is taken from the trusted reverse-proxy hop
(`TRUSTED_PROXY_HOPS`): if that number is wrong, every request looks like it comes from
your proxy and one user's mistakes will lock out everybody.

```bash
LOGIN_MAX_ATTEMPTS=10
```

*Default: 10*

---

### Defining protect media files for external access

MEDIA_HTACCESS_ADDONS `string[]` (optional, Apache only)

Raw Apache rewrite directives appended to the generated `.htaccess` immediately before the
final deny rule. You own their syntax; Dédalo only places them.

The value is **JSON only** — a directive legitimately contains commas (`[R=404,L]`), so a
comma-separated list would tear one directive into two invalid ones. That means **every
backslash must be doubled** for JSON. A malformed value is refused and logged
(`[config] MEDIA_HTACCESS_ADDONS must be a JSON array of strings — ignoring the value.`);
your lines are dropped, and the access gate itself is unaffected and stays closed.

```bash
# allow an internal network unconditionally (note the doubled backslashes)
MEDIA_HTACCESS_ADDONS=["RewriteCond %{REMOTE_ADDR} ^10\\.0\\.","RewriteRule ^ - [L]"]
```

*Default: []*

---

### Defining the permissions cache lifetime

PERMISSIONS_CACHE_TTL_SECONDS `int`

Each user's permission table — the grants their profile gives them over sections and
components — is resolved from the database once and then kept in memory. Saving a profile
or changing a user's profile drops the cached table immediately, so a grant change is
normally visible on the next request.

This key is the **backstop**, in seconds: it caps how long a *missed* invalidation can
keep serving stale permissions. A grant changed by a different process (a second engine
instance, a background worker) cannot reach this process's memory, and the time limit is
what eventually corrects it. Default `300` (5 minutes). Lower it if several processes
share one database and you want a tighter bound; set `0` to disable the time limit and
rely on explicit invalidation alone.

```bash
PERMISSIONS_CACHE_TTL_SECONDS=300
```

*Default: 300*

---

### Defining the absolute session lifetime

SESSION_ABSOLUTE_TTL_SECONDS `int`

The hard ceiling, in seconds, on a session's life **counted from the moment it was
created** — regardless of how active it has been. It exists because an idle limit alone
(`SESSION_TTL_SECONDS`) never expires a session that is used at least once per window:
a stolen cookie would live forever.

Default `2592000` (30 days): a user is asked to log in again once a month, and any
long-lived token eventually dies on its own. Shorten it for a stricter policy; set `0`
to disable the absolute cap and keep the idle limit only.

```bash
SESSION_ABSOLUTE_TTL_SECONDS=2592000
```

*Default: 2592000*

---

### Defining the Secure flag of the session cookie

SESSION_COOKIE_SECURE `bool`

Marks the session cookie `Secure`, so the browser only ever sends it back over HTTPS
(the media access cookie carries the same posture). It is `true` by default and it should
stay `true` on anything reachable over a network: a session cookie that travels once in
clear text is a session an eavesdropper can replay.

Only the exact value `false` turns it off. The single legitimate reason is a plain-HTTP
development listener on localhost — a browser silently discards a `Secure` cookie over
`http://`, so login there appears to succeed and then does nothing. Never set it on a
server that anyone else can reach; terminate TLS at the web server instead.

```bash
SESSION_COOKIE_SECURE=true
```

*Default: true*

---

### Defining the session idle timeout

SESSION_TTL_SECONDS `int`

How long, in seconds, a session survives **without being used**. Every authenticated
request refreshes it; a session left untouched for longer than this is destroyed and the
user must log in again.

Default `43200` (12 hours) — a session comfortably spans a working day but does not
outlive it. Lower it for shared or public workstations, where an unattended browser is the
real threat. The separate `SESSION_ABSOLUTE_TTL_SECONDS` caps the total life of a session
that is being used continuously.

```bash
SESSION_TTL_SECONDS=43200
```

*Default: 43200*

---

## Server and runtime {#server}

### Declaring that a process supervisor is present

DEDALO_SUPERVISED `bool` (optional; auto-detected)

A code update replaces the installation tree and then exits the server process, so that
it comes back up running the new code. That only works if **something restarts it**. To
avoid taking the server down for good, the update refuses to run unless it can see a
supervisor.

Leave this unset and the engine detects one by itself: a service manager exposes its own
markers in the environment (see `INVOCATION_ID` / `JOURNAL_STREAM`). Set it to `true`
when the server is supervised by something the detection does not recognise — a container
restart policy, a process manager, a shell loop that relaunches on exit — and the update
would otherwise be refused with *"No supervisor detected"*. Set it to `false` to state
there is none.

Declaring `true` on a process that nothing restarts is the one dangerous mistake here:
the update will swap the code, exit, and the server will stay down until you start it
by hand.

```bash
DEDALO_SUPERVISED=true
```

*Default: (unset)*

---

### Defining the request idle timeout

SERVER_IDLE_TIMEOUT_S `int`

How many seconds a request may stay idle before the engine drops the connection. It
applies to both listeners, and it is clamped to the range 1–255.

Default `255` (the maximum): deliberately generous, because the previous silent 10-second
default killed slow but perfectly legitimate work — large exports, wide searches, long tool
actions — in the middle of the handler.

Whatever you choose, **the web server in front must be at least as patient**: a reverse-proxy
read timeout shorter than your slowest legitimate request re-introduces exactly the same
failure one hop earlier (in nginx, `proxy_read_timeout`).

```bash
SERVER_IDLE_TIMEOUT_S=255
```

*Default: 255*

---

### Defining the maximum request body size

SERVER_MAX_BODY_BYTES `int`

The ceiling, in bytes, on the body of any single request the engine accepts. Every body
is buffered whole in a long-lived process, so an unbounded one is a memory-exhaustion
hazard — this is the cap that bounds it.

Default `268435456` (256 MiB). It does **not** limit the size of a media file: the client
always uploads large files in chunks, so a single request only ever has to carry one chunk.
The per-file limit is `DEDALO_UPLOAD_MAX_SIZE_BYTES`, and the chunk size is
`DEDALO_UPLOAD_SERVICE_CHUNK_FILES`.

Raise it only if a legitimate single request genuinely needs more, and remember the web
server has its own limit — in nginx, `client_max_body_size` — which will reject the request
first if it is lower.

```bash
SERVER_MAX_BODY_BYTES=268435456
```

*Default: 268435456*

---

### Defining the shutdown grace period

SERVER_SHUTDOWN_GRACE_MS `int`

When the server is asked to stop — a service restart, a deploy, a Ctrl-C — it stops
accepting new connections and then **drains the requests already in flight** for up to this
many milliseconds before it closes the database pool, removes the socket file and exits.
Users mid-save are not cut off by a routine restart.

Default `10000` (10 seconds). Raise it if your slowest legitimate request is longer and you
want it to survive a restart; `0` exits immediately and abandons whatever was running.

Keep it **below** the stop timeout of whatever supervises the process, or the supervisor
will kill the server before the drain has finished — which defeats the purpose.

```bash
SERVER_SHUTDOWN_GRACE_MS=10000
```

*Default: 10000*

---

### Defining the development TCP port

SERVER_TCP_PORT `int` (optional; development only)

When set, the engine opens an **additional** plain-HTTP listener on this port, on top of
the unix socket, and the client is reachable at `http://localhost:<port>/dedalo/core/page/`.
It exists because a browser cannot talk to a unix socket directly, so a developer would
otherwise need a web server in front of every local checkout.

Leave it **unset in production**. This listener terminates no TLS, and it is the only one
that will serve media straight from the engine when media protection is unconfigured — with
no per-record access control. A production install serves on the socket only, behind the
reverse proxy that owns TLS, the static files and the media.

```bash
SERVER_TCP_PORT=3000
```

*Default: (unset)*

---

### Defining the server socket

SERVER_UNIX_SOCKET `string`

The unix socket the engine listens on. In production this is the **only** listener: the web
server owns TCP and TLS, serves the client files and the media, and forwards the API and the
dynamic routes to this socket.

Default `/tmp/dedalo_ts.sock`. On a system that cleans `/tmp`, prefer a directory of your
own (`/run/dedalo/`). The path must be writable by the user the engine runs as and reachable
by the user the web server runs as — a socket neither can open is the usual cause of a
"bad gateway" that looks like the engine is down.

If the file already exists at start-up the engine probes it: when a live instance answers,
it **refuses to start** rather than quietly steal the running server's socket; a leftover
file from an unclean stop is removed.

```bash
SERVER_UNIX_SOCKET="/run/dedalo/dedalo_ts.sock"
```

*Default: /tmp/dedalo_ts.sock*

---

### Defining the number of trusted proxy hops

TRUSTED_PROXY_HOPS `int`

How many reverse proxies stand between the internet and the engine. Each one **appends**
the address it received the request from to the `X-Forwarded-For` header, so the genuine
client address is the entry this many positions **from the right**. Everything further to the
left was supplied by the caller and can be forged freely.

The engine uses that address for the login throttle and for audit records — never as an
authorization input. Set it to exactly the number of proxies that append the header; the
default `1` matches the standard single web server in front. Both mistakes hurt:

* **Too high** — you start trusting an entry the caller wrote. An attacker sends a new forged
  address on every attempt, gets a fresh login-throttle bucket each time, and the brute-force
  protection is gone.
* **Too low** — every request appears to come from your own proxy. All users share one throttle
  bucket, so one person's wrong passwords lock out everybody.

Your proxy must *append* rather than replace (in nginx,
`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`), or the count is meaningless.

```bash
TRUSTED_PROXY_HOPS=1
```

*Default: 1*

---

## Outbound email and password recovery {#mailer}

Dédalo relays outbound email (password-recovery codes) through an existing mailbox over SMTP — it never runs its own mail server. Leaving `DEDALO_SMTP_HOST` empty disables sending entirely, which also disables the login screen's password-recovery emails.

### Defining the SMTP server

DEDALO_SMTP_HOST `string`

The hostname of the SMTP server Dédalo relays outbound email through (recovery
codes, notifications). Leaving it empty **disables the mailer entirely** — features
that need email (the login screen's password recovery) will silently skip sending.

```bash
DEDALO_SMTP_HOST="smtp.example.org"
```

*Default: (empty)*

---

### Defining the SMTP port

DEDALO_SMTP_PORT `int`

The TCP port of the SMTP server. The default `587` is the submission port used
with STARTTLS; use `465` with `DEDALO_SMTP_SECURE='ssl'` for implicit TLS.

```bash
DEDALO_SMTP_PORT=587
```

*Default: 587*

---

### Defining the SMTP encryption mode

DEDALO_SMTP_SECURE `string`

How the SMTP connection is encrypted:

* `'tls'` : STARTTLS on a plain connection (default, pairs with port 587)
* `'ssl'` : implicit TLS from the first byte (pairs with port 465)
* `'none'` : no encryption — only ever acceptable for a relay on localhost

```bash
DEDALO_SMTP_SECURE=tls
```

*Default: tls*

---

### Defining the SMTP credentials

DEDALO_SMTP_USER `string`

The SMTP AUTH username (usually the mailbox login). Leave it empty for a relay
that accepts unauthenticated mail (e.g. a local MTA).

```bash
DEDALO_SMTP_USER="dedalo@example.org"
```

*Default: (empty)*

---

### Defining the SMTP credentials

DEDALO_SMTP_PASS `string`

The SMTP AUTH password for `DEDALO_SMTP_USER`. Ignored when the user is empty.

```bash
DEDALO_SMTP_PASS="my_smtp_password"
```

*Default: (empty)*

---

### Defining the From address

DEDALO_SMTP_FROM `string`

The envelope/header From address of outbound mail. It must be an address the
relay is allowed to send as (most providers refuse arbitrary senders). When empty,
`DEDALO_SMTP_USER` is used; if both are empty the mailer refuses to send.

```bash
DEDALO_SMTP_FROM="dedalo@example.org"
```

*Default: (empty)*

---

### Defining the From address

DEDALO_SMTP_FROM_NAME `string` (optional)

An optional display name shown next to the From address.

```bash
DEDALO_SMTP_FROM_NAME="Dédalo"
```

*Default: (empty)*

---

### Defining the password recovery code lifetime

DEDALO_PWRESET_CODE_TTL `int`

How long, **in seconds**, an emailed password-recovery code stays valid. The code
is single-use and its short life is part of what makes the 8-digit space safe, so
keep this small. Default `600` (10 minutes).

```bash
DEDALO_PWRESET_CODE_TTL=600
```

*Default: 600*

---

### Defining the password recovery attempt cap

DEDALO_PWRESET_MAX_ATTEMPTS `int`

How many wrong guesses are allowed against a single issued recovery code before
it is invalidated and the user must request a new one. Together with the short
`DEDALO_PWRESET_CODE_TTL` this caps brute-force odds against the 8-digit code at
a few in a hundred million. Default `5`.

```bash
DEDALO_PWRESET_MAX_ATTEMPTS=5
```

*Default: 5*

---

## Logs, backups and diagnostics {#ops}

### Defining the access log

DEDALO_ACCESS_LOG `bool`

With `true`, the engine writes **one JSON line per API request** to its standard output:
timestamp, request id, user id, the API class and action that was called, the response status
and the duration in milliseconds. A service manager captures it with the rest of the service
log, so it can be filtered and parsed with the usual tools.

Off by default: it is a line per request, and on a busy installation that is a lot of lines.
Turn it on when you need to see who called what — a suspicious edit, a user reporting an error
they cannot reproduce — and turn it off again afterwards.

Slow requests are warn-logged whatever this is set to (see `DEDALO_SLOW_REQUEST_MS`), so you
do not need the access log merely to notice that something is slow.

```bash
DEDALO_ACCESS_LOG=false
```

*Default: false*

---

### Defining the database backups directory

DEDALO_BACKUP_DIR `string`

Where the database dumps produced by the maintenance backup tool (and by a scheduled
nightly backup job) are written. Unset, they go to `backups/db` inside the private directory,
next to the configuration file and the session store.

Set it to move the dumps onto another volume: a backup that lives on the same disk as the
database it came from is not a backup. The directory must be writable by the user the engine
runs as, and it must never sit inside the tree the web server publishes — a dump is a complete,
unprotected copy of your data.

Remember that the database dump is only one piece: the media originals and the private directory
have to be copied too, or a restore will bring back records that point at files that no longer
exist. This key is distinct from `DEDALO_BACKUP_PATH`, which is where a code update stages the
previous code tree.

```bash
DEDALO_BACKUP_DIR="/srv/backups/dedalo/db"
```

*Default: (unset)*

---

### Defining backups directory

DEDALO_BACKUP_PATH `string`

This parameter defines the directory a code update stages the previous tree into
before swapping in a new release, so a failed update can be rolled back. Keep it
outside the served tree for security. Defaults to `<install>/../backups/code`.
This is distinct from `DEDALO_BACKUP_DIR`, which sets the directory for database
backups (see [Database connection](config_db.md)).

```bash
DEDALO_BACKUP_PATH="/srv/dedalo/backups/code"
```

*Default: (unset)*

---

### Defining backup time range

DEDALO_BACKUP_TIME_RANGE `int`

This parameter defines the time lapse between backup copies in hours. Dédalo check in every user login if the last backup exceed this time lapse, in affirmative case, it will create new one.

```bash
DEDALO_BACKUP_TIME_RANGE=8
```

*Default: 8*

---

### Defining debug detail for API errors

DEDALO_DEBUG_API_ERRORS `bool` (optional; development only)

When a request fails unexpectedly, the client is answered with a generic message and a
**request id**, while the exception text stays on the server, logged under that same id. This
is deliberate: the raw text of an error can carry query fragments, filesystem paths and internal
identifiers, and the request id is what lets you find the full story in the log without handing
any of it to the caller.

Set `DEDALO_DEBUG_API_ERRORS=true` and the exception text is **also** echoed in the response.
It is a convenience while developing, and a gift to an attacker anywhere else — every failed
request becomes a free description of your internals.

Unset (off) is the default and the only correct value on a shared or public installation.

```bash
DEDALO_DEBUG_API_ERRORS=true
```

*Default: (unset)*

---

### Defining development mode

DEDALO_DEV_MODE `bool`

Marks this installation as a development server. With `true`, logged-in users get the
debug and developer surfaces in the interface (the extra inspection panels), the client is told
it is talking to a development server so it takes the no-cache path instead of the offline
service-worker one, and the readable, non-minified versions of the client libraries are served.
The configuration widget in the maintenance area reports the mode it resolved, so you can always
check what a running server thinks it is.

Default `false`, the production posture. Never `true` on a shared or public installation: the
developer surfaces expose internal structure that ordinary users have no business seeing.

The real environment wins over the configuration file, so a single development run can be marked
without editing anything:

```bash
DEDALO_DEV_MODE=true bun run dev
```

*Default: false*

---

### Defining the slow request threshold

DEDALO_SLOW_REQUEST_MS `int`

Any API request that takes longer than this, in milliseconds, is warn-logged with its
duration, the API call, the request id and the user — and counted, so the count also shows up in
the server counters. This happens whether or not the access log is on.

Default `5000` (5 seconds): slow enough that a healthy installation stays quiet, fast enough to
notice a query that has started to degrade. Lower it while hunting a latency problem; raise it if
one genuinely heavy operation is flooding the log with noise you have already accounted for. Set
`0` to disable the warning entirely.

```bash
DEDALO_SLOW_REQUEST_MS=5000
```

*Default: 5000*

---

### Update log file

UPDATE_LOG_FILE `string`

Defines the directory path to store the update log.

The maintenance update process uses the update log to store the status of each update task. This log is useful to know what happens in the update process. If the update fails, you can consult the last status to restore the update process at this last point.

Defaults to `update.log` inside `../private`. If you move it elsewhere, keep the
directory private and outside the served tree.

```bash
UPDATE_LOG_FILE="/srv/dedalo/private/update.log"
```

*Default: (unset)*

---

## Error reporting {#error_report}

### Error reports: reporter IP allowlist

DEDALO_ERROR_REPORT_ALLOWED_IPS `string`

Only meaningful on the **master** installation (the one that receives reports). A
comma-separated list of the IP addresses allowed to reach the intake; a report from any
other address is refused. The shorthand `loopback` accepts the local machine.

Unset (the default) leaves the intake open to any address — it is still anonymous,
rate-limited and size-capped, but if you know which installations report to you, listing
them here is the cheapest way to keep everyone else out.

```bash
DEDALO_ERROR_REPORT_ALLOWED_IPS="loopback,203.0.113.10,203.0.113.11"
```

*Default: (unset)*

---

### Error reports: master installation URL

DEDALO_ERROR_REPORT_MASTER_URL `string`

The JSON API endpoint of the **master** installation this Dédalo sends its error
reports to. **Setting it is what enables reporting**: with a master URL configured, global
administrators get a report button on every page, from which they can describe a problem
and send it — together with the page context and any JavaScript errors captured since the
page loaded — to the maintainers. Nothing ever leaves the machine without that explicit
click.

Leave it unset if this installation does not report anywhere. `https` is required (plain
`http` is accepted only for a loopback target while developing).

```bash
DEDALO_ERROR_REPORT_MASTER_URL="https://master.example.org/dedalo/core/api/v1/json/"
```

*Default: (unset)*

---

### Error reports: act as the receiver

DEDALO_ERROR_REPORT_RECEIVER `bool`

Set to `true` **only on the designated master installation** — the one other
Dédalos point at with their master URL. It opens the intake endpoint that stores the
incoming reports, and it turns on the *Error reports* widget of the maintenance dashboard,
where an administrator can browse what has arrived.

The default is `false`, and while it is off the endpoint is indistinguishable from an
action that does not exist. A normal installation never turns this on.

```bash
DEDALO_ERROR_REPORT_RECEIVER=true
```

*Default: false*

---

### Error reports: retention

DEDALO_ERROR_REPORT_RETENTION_DAYS `int`

Only meaningful on the **master** installation. Received reports older than this many
days are pruned. Default `90`; `0` keeps them forever.

Reports are user-written text and can quote record data, so a bounded retention is the
recommended posture — shorten it if your institution's data-protection policy asks for it.

```bash
DEDALO_ERROR_REPORT_RETENTION_DAYS=90
```

*Default: 90*

---

### Error reports: relay timeout

DEDALO_ERROR_REPORT_TIMEOUT_MS `int`

How long (in milliseconds) this server waits for the master installation to accept a
relayed report before giving up. Default `10000` (ten seconds), minimum `1000`.

Raise it if the master is reached over a slow link and administrators see reports fail to
send; a timeout only loses that one report, it never blocks the user's work.

```bash
DEDALO_ERROR_REPORT_TIMEOUT_MS=10000
```

*Default: 10000*

---

### Error reports: shared token

DEDALO_ERROR_REPORT_TOKEN `string`

An optional shared secret sent with every relayed report and checked by the master
installation, which rejects a report that does not carry the matching value. It is a spam
filter, not authentication: the sending server, not the browser, adds it.

Both ends must hold the **same** value — set it on the master and on each installation
that reports to it. This is a **secret**: the shipped template carries a placeholder only,
so pick a long random string and set it for real. When it is unset on the master, the
check is skipped and any report is accepted (still rate-limited and size-capped).

```bash
DEDALO_ERROR_REPORT_TOKEN="a-long-random-shared-secret"
```

*Default: (unset)*

---

## AI assistant, agent and semantic search {#ai}

### Defining the default assistant model

AGENT_MODEL `string`

This parameter names the model the assistant uses when no model catalog is declared.
It only matters in the zero-configuration case: with `DEDALO_AGENT_MODELS` unset and an
`ANTHROPIC_API_KEY` present, Dédalo builds an implicit one-model catalog and this is the
model id it asks for. As soon as you declare an explicit catalog, this parameter is
ignored — each catalog entry carries its own model id.

Change it to move the single implicit model up or down a generation (a faster, cheaper
model for a small installation; a more capable one for heavy cataloguing work). The
default is `"claude-opus-4-8"`.

```bash
AGENT_MODEL="claude-opus-4-8"
```

*Default: claude-opus-4-8*

---

### Defining the Anthropic API key

ANTHROPIC_API_KEY `string`

The credential the assistant sends to Anthropic. It is used by every catalog entry
whose provider is `anthropic` and does not name its own key variable, and it is what makes
the implicit (zero-configuration) catalog exist at all: with no key and no
`DEDALO_AGENT_MODELS`, the assistant has no models and stays disabled.

The engine fails closed without it — a conversation with an Anthropic model refuses rather
than silently trying an unauthenticated call. It is a secret: keep it in `../private/.env`,
never in a repository. There is no default.

```bash
ANTHROPIC_API_KEY="sk-ant-..."
```

*Default: (unset)*

---

### Allowing record content to reach external models

DEDALO_AGENT_ALLOW_EXTERNAL_PROVIDER_DEFAULT `bool`

This parameter decides whether a conversation held with an **external** model (one whose
catalog egress class is `external` — any model whose API call leaves your server) may
receive the content of your records at all. It is the privacy switch for institutions whose
data may not leave the building.

With the default `false`, an external conversation still works: the model can use the
discovery tools that describe the ontology (section names, field maps, relational paths),
and it can answer general questions — but **every tool call that would return record content
is refused** with an `egress_restricted` message, and the user is steered to a local model,
which is never gated. Set it to `true` to let external conversations read record content,
minus whatever you list in `DEDALO_RAG_EXTERNAL_PROVIDER_FORBIDDEN_SECTIONS`.

Note what the gate does *not* cover: the user's own question and any image they attach
travel to whichever model they picked — that is the user's own act. The gate protects the
repository, not the user's words.

```bash
DEDALO_AGENT_ALLOW_EXTERNAL_PROVIDER_DEFAULT=false
```

*Default: false*

---

### Allowing the assistant to propose changes

DEDALO_AGENT_ALLOW_WRITE `bool`

This parameter exposes the assistant's write tools and the change-plan flow. With the
default `false` the assistant is strictly read-only: the write tools are not even listed to
the model, and a call to one is refused.

Even when it is `true` the assistant never writes on its own. Write mode makes it produce a
**change plan** that a human reads and confirms; only that confirmation executes, and every
gate is re-checked at execution time — the user's own permissions, the per-record scope, and
the section allowlist (`DEDALO_AGENT_WRITE_SECTIONS`). Two limits are worth knowing before
you enable it: writes always run as the logged-in user (never as a service identity), and
write mode is **refused to global-admin sessions** — an administrator's unlimited reach must
not be lent to a model.

```bash
DEDALO_AGENT_ALLOW_WRITE=false
```

*Default: false*

---

### Enabling the in-app assistant

DEDALO_AGENT_HTTP_ENABLED `bool`

The master switch for the assistant inside the Dédalo client: the chat panel, the model
list, and the streaming answer. With the default `false` every assistant request is refused
like an unknown action, and the panel reports the feature as disabled — the rest of the
application is unaffected.

Turn it on once you have declared at least one model (`DEDALO_AGENT_MODELS`, or an
`ANTHROPIC_API_KEY` for the implicit catalog); with the switch on but no usable model the
assistant reports that none is configured. Enabling it grants no write capability by itself —
see `DEDALO_AGENT_ALLOW_WRITE`.

```bash
DEDALO_AGENT_HTTP_ENABLED=true
```

*Default: false*

---

### Defining the assistant output limit

DEDALO_AGENT_MAX_TOKENS `int`

The maximum number of tokens the assistant may produce in a single model turn. It caps
the length of one answer (and the cost of one runaway generation); it does not cap the
conversation, which may take several turns.

Raise it if long answers are being cut off mid-sentence, lower it to keep spend predictable.
A model catalog entry may override it with its own `max_tokens` — the entry always wins. A
missing or non-positive value falls back to the default `16000`.

```bash
DEDALO_AGENT_MAX_TOKENS=16000
```

*Default: 16000*

---

### Defining the assistant model catalog

DEDALO_AGENT_MODELS `array of objects (JSON)`

The list of models the assistant may use — the one place a deployment declares what the
user can pick from, and where each model's answers travel. It is a JSON array; each entry
takes `id`, `label` (what the user sees), `provider` (`anthropic` or `openai_compatible`),
`model` (the provider's own model id), and optionally `endpoint`, `api_key_env` (the NAME of
another variable holding the key — never the key itself), `egress` (`local` or `external`),
`vision`, `max_tokens` and `timeout_s`. The first entry is the default choice.

The catalog is validated fail-closed on every request: malformed JSON, an unknown field or a
single bad entry disables the assistant rather than half-enabling it. An `anthropic` entry is
always `external` — its call leaves your server, and declaring it `local` is rejected as a
configuration error. An `openai_compatible` entry must carry an `endpoint` and an explicit
`egress`, so that calling a model "local" is always a conscious statement. That egress class
is what the privacy gate acts on (see
`DEDALO_AGENT_ALLOW_EXTERNAL_PROVIDER_DEFAULT`).

Leave it unset for the zero-configuration case: a single Anthropic model, but only if
`ANTHROPIC_API_KEY` is set — otherwise the assistant stays disabled.

```bash
DEDALO_AGENT_MODELS=[{"id":"local","label":"Llama 3.1 (local, private)","provider":"openai_compatible","model":"llama3.1:70b","endpoint":"http://127.0.0.1:11434/v1/chat/completions","egress":"local"},{"id":"claude","label":"Claude (external)","provider":"anthropic","model":"claude-opus-4-8","vision":true}]
```

*Default: (unset)*

---

### Defining the deployment prompt text

DEDALO_AGENT_SYSTEM_PROMPT_APPEND `string`

Free text appended to the assistant's built-in instructions, so it knows where it is
working. Use it for the facts a model cannot guess: what the institution holds, which
language its labels are in, which collection is the important one.

It is added *after* the built-in rules, which it can extend but never reorder or remove — the
safety and permission instructions are not overridable from configuration. The text is read
at boot and is the same for every conversation, so it stays in the cached part of the prompt
and costs nothing per question. Unset by default.

```bash
DEDALO_AGENT_SYSTEM_PROMPT_APPEND="This is the archive of the Museum of X. Prefer Catalan (lg-cat) labels when they exist. The oral-history collection is sensitive."
```

*Default: (unset)*

---

### Defining the assistant writable sections

DEDALO_AGENT_WRITE_SECTIONS `string[]`

A comma-separated list of section `tipo`s the assistant's change plans may touch. It
narrows write mode to the part of the repository you are willing to let a model propose edits
in — a cataloguing section, say, and nothing else. A plan naming any other section is refused
before it reaches the database.

Read the default carefully: **unset (or empty) means no narrowing at all** — with
`DEDALO_AGENT_ALLOW_WRITE=true` and this list empty, a confirmed plan may write to any
section the logged-in user could already edit through the client. The allowlist is a
restriction, not a grant: it can only take sections away, never add permission the user does
not have. It has no effect while write mode is off.

```bash
DEDALO_AGENT_WRITE_SECTIONS=oh1,rsc197
```

*Default: (unset)*

---

### Allowing writes in the stand-alone tool server

DEDALO_MCP_ALLOW_WRITE `bool`

Exposes the write tools in the **stand-alone tool server** — the separate process that
offers Dédalo's tools to an external AI client over a local pipe. With the default `false`
that server registers read tools only, and a write call is refused as read-only.

This is not the in-app assistant (that one is governed by `DEDALO_AGENT_ALLOW_WRITE`);
enabling one does nothing to the other. When you do enable it, remember that the tool server
acts as ONE fixed user (`DEDALO_MCP_USER_ID`) for its whole lifetime: every write is checked
against that user's permissions and record scope, so give it a real, narrowly-privileged
cataloguing user — never an administrator. Write mode refuses a global-admin or superuser
identity outright.

```bash
DEDALO_MCP_ALLOW_WRITE=false
```

*Default: false*

---

### Defining the media import directory

DEDALO_MCP_MEDIA_IMPORT_DIR `string`

The one directory from which the stand-alone tool server may ingest a media file **by
path**. Unset by default, and unset means the whole path-based branch is disabled: a tool
call that names a file path is refused, and media can only be uploaded as inline data.

Point it at a dedicated staging directory (an ingest drop-box), never at a home directory or
the media store itself. Every requested path is resolved to its real location and must land
inside this directory — a `..` traversal or a symbolic link that points outside is refused,
not followed.

```bash
DEDALO_MCP_MEDIA_IMPORT_DIR="/var/dedalo/ingest"
```

*Default: (unset)*

---

### Defining the media import size limit

DEDALO_MCP_MEDIA_MAX_BYTES `int`

The largest media file, in bytes, the stand-alone tool server will accept in one upload
tool call — whether it arrives as inline data or from the import directory. Anything larger is
refused with a "too large" message.

Raise it if you ingest high-resolution masters through the tool server; the default is
`10485760` (10 MiB). The value must be a plain positive integer of bytes: a value the engine
cannot read as one (`10MB`, `0`, empty) falls back to that default rather than removing the
limit.

```bash
DEDALO_MCP_MEDIA_MAX_BYTES=10485760
```

*Default: 10485760*

---

### Defining the tool-server service user

DEDALO_MCP_USER_ID `int`

The Dédalo user the **stand-alone tool server** acts as. That server has no login: it
resolves this one identity at startup and keeps it for the whole process lifetime — every
tool call it serves is authorized against this user's permissions and record scope, exactly as
if that person had done it in the client. There is no tool to change identity mid-flight.

It is required by that server and by nothing else: the Dédalo server itself boots without it,
and the in-app assistant never uses it (it always acts as the logged-in browser user). A
missing or non-integer value is a hard startup error for the tool server — it refuses to start
rather than fall back to a privileged identity. Set it to the `section_id` of a user in the
users section; `-1` is the superuser and is acceptable only in trusted local development, and
read-only even there.

```bash
DEDALO_MCP_USER_ID=42
```

*Default: (unset)*

---

### Defining the tool-server writable sections

DEDALO_MCP_WRITE_SECTIONS `string[]`

A comma-separated list of section `tipo`s the stand-alone tool server's write tools may
target. A write call addressing any other section is refused before the engine is reached.

As with the assistant's twin setting, **unset (or empty) means no narrowing**: with
`DEDALO_MCP_ALLOW_WRITE=true` and this list empty, the tool server may write to every section
its service user (`DEDALO_MCP_USER_ID`) is already allowed to edit. The list only ever removes
sections — it cannot grant permission that user does not have. It has no effect while write
mode is off.

```bash
DEDALO_MCP_WRITE_SECTIONS=rsc197
```

*Default: (unset)*

---

### Defining the embedding batch size

DEDALO_RAG_BATCH_SIZE `int`

How many text fragments Dédalo sends to the embedding service in one request while
indexing. It is a throughput knob for the indexer, invisible to end users.

Larger batches index a big collection faster but make each request heavier — lower it if your
embedding service times out or runs out of memory, raise it if indexing is slow and the
service has headroom. It only applies when an external embedding service is configured
(`DEDALO_RAG_EMBEDDING_PROVIDER=sidecar`). Unset or non-positive falls back to `32`.

```bash
DEDALO_RAG_BATCH_SIZE=32
```

*Default: 32*

---

### Defining the chunking strategy

DEDALO_RAG_CHUNK_STRATEGY `string`

How Dédalo cuts a long text into the fragments it indexes for semantic search. Two
strategies exist:

* `structural_semantic` (the default) — split on the text's own structure (headings,
  paragraphs, transcription time-codes), then also where the meaning shifts, so a fragment
  stays about one thing;
* `structural` — split on structure only. Cheaper and fully deterministic; a reasonable
  choice for short, uniform fields.

A component may override the installation-wide choice in the ontology
(`properties.rag.strategy`). Changing this value only affects fragments produced from then
on — re-index a section if you want the whole of it recut.

```bash
DEDALO_RAG_CHUNK_STRATEGY="structural_semantic"
```

*Default: structural_semantic*

---

### Defining the maximum fragment size

DEDALO_RAG_CHUNK_TOKENS `int`

The largest fragment, in tokens, the chunker will emit. Bigger fragments carry more
context into an answer but blur the match — the embedding of a long passage is an average of
everything in it, so a precise question retrieves it less sharply. Smaller fragments match
precisely but may arrive without the sentence that explains them.

450 suits the descriptive prose typical of catalogue records. Raise it for long-form
transcriptions where an answer usually needs a whole paragraph; lower it for short, dense
fields. A component may override it in the ontology (`properties.rag`).

Changing this only affects fragments produced from then on — re-index a section to recut it.

```bash
DEDALO_RAG_CHUNK_TOKENS=450
```

*Default: 450*

---

### Defining the minimum fragment size

DEDALO_RAG_CHUNK_MIN_TOKENS `int`

The floor, in tokens, below which the chunker will not leave a fragment standing on its
own: a shorter one is merged into its neighbour. Without a floor, a heading or a one-line
field becomes a fragment of its own, and such a fragment matches many questions weakly and
none of them well.

Lower it only if your records genuinely carry meaning in very short fields.

```bash
DEDALO_RAG_CHUNK_MIN_TOKENS=120
```

*Default: 120*

---

### Defining the semantic breakpoint sensitivity

DEDALO_RAG_SEMANTIC_BREAKPOINT_THRESHOLD `float`

Under the `structural_semantic` strategy, how different two consecutive passages must be
before the chunker cuts between them. It is a similarity threshold between 0 and 1: the cut
is made when similarity falls *below* it.

A HIGHER value cuts more eagerly (more, tighter fragments); a lower value cuts only at a
pronounced change of subject (fewer, broader fragments). 0.92 is deliberately close to 1 —
catalogue prose tends to stay on topic, so only a clear shift should split a record.

Has no effect under the `structural` strategy.

```bash
DEDALO_RAG_SEMANTIC_BREAKPOINT_THRESHOLD=0.92
```

*Default: 0.92*

---

### Defining the semantic index database connection

DEDALO_RAG_DB_HOSTNAME_CONN `string`

The host of the vector database. Set it only when the semantic index lives on a
**different** database server than the catalogue: when unset (the default), Dédalo reuses the
main database's host, and the same goes for `DEDALO_RAG_DB_PORT_CONN`,
`DEDALO_RAG_DB_USERNAME_CONN` and `DEDALO_RAG_DB_PASSWORD_CONN`. The typical installation sets
none of them.

Give it a host name or IP; a path is also accepted and is treated as a socket directory. A
Unix socket set in `DEDALO_RAG_DB_SOCKET_CONN` wins over this value.

```bash
DEDALO_RAG_DB_HOSTNAME_CONN="10.0.0.42"
```

*Default: (unset)*

---

### Defining the semantic index database

DEDALO_RAG_DB_NAME `string`

The name of the database that holds the semantic index — the vectors and the indexed text
fragments. It is deliberately **separate** from the catalogue database: nothing in it is
irreplaceable, since the whole index can be rebuilt from the records at any time.

Leave it unset unless you host several installations on one database server and need distinct
index databases. Unset, Dédalo uses the compatibility spelling `RAG_DB_NAME` if present, and
otherwise `dedalo7_rag`.

```bash
DEDALO_RAG_DB_NAME="dedalo7_rag"
```

*Default: (unset)*

---

### Defining the semantic index database connection

DEDALO_RAG_DB_PASSWORD_CONN `string`

The password used to connect to the vector database. Needed only when the semantic index
lives on a different database server (or under a different role) than the catalogue: unset,
Dédalo reuses the main database password.

It is a secret — keep it in `../private/.env`. An empty value is a legitimate configuration
when the vector database authenticates by trust or peer.

```bash
DEDALO_RAG_DB_PASSWORD_CONN="•••••"
```

*Default: (unset)*

---

### Defining the semantic index database connection

DEDALO_RAG_DB_PORT_CONN `int`

The port of the vector database server. Set it only when the semantic index lives on a
different server, or on a non-standard port; unset (the default), Dédalo reuses the main
database's port. A value that is not a positive number is ignored and the main database's port
is used.

```bash
DEDALO_RAG_DB_PORT_CONN=5432
```

*Default: (unset)*

---

### Defining the semantic index database connection

DEDALO_RAG_DB_SOCKET_CONN `string`

The Unix socket directory of the vector database, for a local connection that does not go
through the network stack. When set it **wins** over the host and port settings.

Leave it empty (the default) to connect over the network — that is what an installation whose
vector database sits on a separate server needs.

```bash
DEDALO_RAG_DB_SOCKET_CONN="/var/run/postgresql"
```

*Default: (empty)*

---

### Defining the semantic index database connection

DEDALO_RAG_DB_USERNAME_CONN `string`

The role used to connect to the vector database. Set it only when the semantic index lives
on a different database server, or is owned by a different role, than the catalogue; unset (the
default), Dédalo reuses the main database user.

```bash
DEDALO_RAG_DB_USERNAME_CONN="dedalo"
```

*Default: (unset)*

---

### Defining the embedding service endpoint

DEDALO_RAG_EMBEDDING_ENDPOINT `string`

The base URL of the embedding service that turns text into vectors. It is **required** for
real semantic search: with `DEDALO_RAG_EMBEDDING_PROVIDER=sidecar` but no endpoint, Dédalo
silently keeps the built-in development embedder, whose results are reproducible but not
meaningful.

Dédalo posts the fragments to `{endpoint}/embed` and expects the vectors back. Any transport
failure is treated as a retryable indexing failure — a failed batch is never written as
garbage vectors. Empty by default.

```bash
DEDALO_RAG_EMBEDDING_ENDPOINT="http://127.0.0.1:8085"
```

*Default: (empty)*

---

### Defining the embedding model

DEDALO_RAG_EMBEDDING_MODEL `string`

The model name Dédalo asks the embedding service for. It is also the **partition key** of
the semantic index: vectors are stored per model, so two models never contaminate each other's
results.

Because of that, changing this value on a populated installation does not convert the existing
index — it starts a new one, and the records must be re-indexed under the new model before
searches see them again. The default is `"bge-m3"`, a multilingual model that suits a
multi-language archive. It only applies when an external embedding service is configured.

```bash
DEDALO_RAG_EMBEDDING_MODEL="bge-m3"
```

*Default: bge-m3*

---

### Defining the embedding provider

DEDALO_RAG_EMBEDDING_PROVIDER `string`

Which embedder produces the vectors behind semantic search. Set it to `sidecar` to use a
real embedding service — and then `DEDALO_RAG_EMBEDDING_ENDPOINT` must be set too, or Dédalo
falls back to the built-in one.

The default (empty) selects the built-in **development embedder**: it runs offline, needs no
service and no key, and is perfectly reproducible — which makes it right for a test
installation and wrong for a real one, because it matches words rather than meaning. Any
production installation that wants genuine semantic search runs a service and sets `sidecar`.

```bash
DEDALO_RAG_EMBEDDING_PROVIDER="sidecar"
```

*Default: (empty)*

---

### Enabling semantic search

DEDALO_RAG_ENABLED `bool`

The master switch for semantic search: the vector index, the indexing that follows a save,
and the search and question-answering actions built on them. With the default `false` the
subsystem costs nothing — no indexing work is queued when a record is saved, and every
semantic-search request is declined.

Turning it on is only the first half of the decision: nothing is indexed until you also opt
each section and component in through the ontology (`properties.rag`), so enabling the switch
never sweeps the whole repository into an index by surprise. It needs the vector database to
exist (see `DEDALO_RAG_DB_NAME`).

```bash
DEDALO_RAG_ENABLED=true
```

*Default: false*

---

### Defining sections forbidden to external providers

DEDALO_RAG_EXTERNAL_PROVIDER_FORBIDDEN_SECTIONS `string[]`

A comma-separated list of section `tipo`s whose content must **never** reach a model
hosted outside your server — the never-egress list. It is the one place an institution names
its protected material (an oral-history collection, a donor file), and it is honoured by both
AI surfaces: the assistant's conversations and the semantic question-answering. One
classification, applied twice.

It outranks the permissive setting: a section on this list stays restricted even with
`DEDALO_AGENT_ALLOW_EXTERNAL_PROVIDER_DEFAULT=true`. The gate errs towards refusal — a request
that merely *mentions* a forbidden section in a filter, or whose answer would surface a linked
record from one, is refused whole rather than trimmed, because a filter over protected values
answers questions about them just as surely as reading them does. Local models are never
gated, so the honest fallback is always available to the user.

Empty by default (nothing is on the list). Naming a section here does not hide it from the
people who may see it — it only stops it from leaving.

```bash
DEDALO_RAG_EXTERNAL_PROVIDER_FORBIDDEN_SECTIONS=oh1,rsc45
```

*Default: (unset)*

---

### Defining the embedding service timeout

DEDALO_RAG_PROVIDER_TIMEOUT `int`

How long, **in seconds**, Dédalo waits for the embedding service to answer one batch before
giving up on it. A timed-out batch is a retryable indexing failure, never a partial write.

Raise it if you embed long transcriptions on a service without hardware acceleration and see
indexing failures; lower it to fail fast on an unresponsive service. Unset or non-positive
falls back to `30`.

```bash
DEDALO_RAG_PROVIDER_TIMEOUT=30
```

*Default: 30*

---

### Defining the hybrid ranking constant

DEDALO_RAG_RRF_K `int`

A tuning constant of the hybrid ranking. A semantic search runs two searches — one on
meaning (vectors), one on words (full text) — and merges the two rankings by position rather
than by score, since the scores are not comparable. This value damps how much the very top
positions dominate that merge.

It is a fine-tuning knob most installations never touch: a lower value gives the leaders of
each list more weight, a higher one flattens the two lists together. Unset or non-positive
falls back to `60`, the widely used value.

```bash
DEDALO_RAG_RRF_K=60
```

*Default: 60*

---

### Defining the semantic index database

RAG_DB_NAME `string`

The compatibility spelling of the vector-database name, still honoured so that an
installation configured before `DEDALO_RAG_DB_NAME` existed keeps working untouched.

Use `DEDALO_RAG_DB_NAME` in new installations; it wins whenever both are present. With
neither set, the database is `dedalo7_rag`.

```bash
RAG_DB_NAME="dedalo7_rag"
```

*Default: dedalo7_rag*

---

## Tools {#tools}

### Defining additional tool roots

DEDALO_ADDITIONAL_TOOLS `array of objects` *optional*

This parameter defines extra directories where Dédalo will look for tools, besides the `tools/` directory of the installation itself.

Tools kept outside the Dédalo directory survive an update of the code and can be versioned on their own, which is what an institution developing its own tools wants. Every entry is an object with a `path` (the directory on disk holding the tool packages) and a `url` (the address the web server publishes that directory at, because the browser loads the tool's own interface code from there). The url must be an address of THIS site — a full address pointing at another host is rejected — and serving the directory at that address is your job, not Dédalo's.

The list is empty by default. The installation's own `tools/` directory is always searched first and always wins a name collision, so an additional root can never quietly replace a tool that ships with Dédalo; a root that does not exist, is not a directory, or sits in a system temporary directory is refused and reported at boot.

```bash
DEDALO_ADDITIONAL_TOOLS=[{"path":"/srv/custom_tools","url":"/custom_tools"}]
```

*Default: (unset)*

---

### Defining the transform definitions directory

DEDALO_TRANSFORM_DEFINITIONS_DIR `string`

This parameter defines the directory holding the transform definition files — the JSON declarations that drive the `move_*` maintenance widgets (move a tipo, move a locator, move data into a portal or into a table, move a language).

A transformation of this kind is written down before it is run: the file lists, item by item, what is moved where. The widget reads the files of its own subdirectory (`<dir>/move_tld/`, `<dir>/move_locator/`, …) and offers them to the operator; only `.json` files sitting directly in that subdirectory are read, never a path that climbs out of it.

By default Dédalo reads them from `install/transform_definition_files` inside the installation. Point the key at a directory of your own to keep your transformations outside the code — a sensible thing to do, since they are institution-specific and an update of the code should not touch them.

```bash
DEDALO_TRANSFORM_DEFINITIONS_DIR="/srv/dedalo_transforms"
```

*Default: `<install dir>/install/transform_definition_files`*

---

### Enabling writes from the tools registration

TOOLS_ENABLE_REGISTRY_IMPORT `bool`

This parameter defines whether the "Register tools" maintenance widget may WRITE to the tools registry, or only report what it would write.

The widget walks every tool directory, validates its declaration and compares it with the tool records stored in the ontology. With this parameter at its default `false`, that is all it does: it reports, per tool, whether it is valid and whether the registry already matches — and changes nothing. Set it to `true` and the same run reconciles the registry, creating or updating the record of each tool.

Leave it off in normal operation and turn it on for the moment you register a newly added tool. An installation that never adds tools of its own never needs it.

```bash
TOOLS_ENABLE_REGISTRY_IMPORT=false
```

*Default: false*

---

### Tools registry cache expiry

TOOLS_REGISTRY_CACHE_TTL_MS `int` *no longer consulted*

This parameter defined how long, in milliseconds, the server kept the tools registry in memory before reading it from the database again.

It is no longer consulted. The expiry existed because a second engine could write the tools registry behind this server's back, so the cache had to be assumed stale after a while. Dédalo is now the only writer of those records, and every write clears the cache the moment it happens — so the data can never be stale and there is nothing to expire.

The key is still recognized, so an existing configuration carrying it still starts, but setting it has no effect and it can be removed.

```bash
TOOLS_REGISTRY_CACHE_TTL_MS=60000
```

*Default: 60000*

---

## Site builder {#sitebuilder}

### Defining the site builder service URL

DEDALO_SITE_BUILDER_URL `string` *optional*

This parameter is the base URL of the **Site Builder** service — the standalone daemon that lets your users build their own public websites over the published data by talking to a coding agent.

The daemon is a separate deployable (`publication/site_builder`) and may run on another host, typically the one that already serves the publication API and its MariaDB. Point this key at the address your reverse proxy publishes it under, including the base path, for example `https://sites.example.org/publication/site_builder`.

Leave it **unset** and the feature does not exist on this install: the site-builder tool hides itself from every toolbar and its actions refuse. Set it, set `DEDALO_SITE_BUILDER_TOKEN` to match the daemon's `SERVICE_TOKEN`, grant the tool to the users who should build sites, and they get a workspace where an agent writes the site, a live preview, and a gated publish to production.

```bash
DEDALO_SITE_BUILDER_URL="https://sites.example.org/publication/site_builder"
```

*Default: (unset)*

---

### Defining the site builder service token

DEDALO_SITE_BUILDER_TOKEN `string`

The shared bearer token the engine presents to the Site Builder daemon on every call. It MUST equal the daemon's own `SERVICE_TOKEN` (the daemon's installer generates one and prints it).

The engine is the daemon's only client and its only authorizer: it authenticates the Dédalo user, decides who may build and who may publish, then calls the daemon with this token and the acting user's identity. The token is what proves the request came from the engine and not from anyone who can reach the daemon's port.

It is a secret: keep it in `../private/.env`, never in a repository. There is no default — without it (and without the URL) the feature is simply off.

```bash
DEDALO_SITE_BUILDER_TOKEN="..."
```

*Default: (unset)*

---

### Defining the site builder request timeout

DEDALO_SITE_BUILDER_TIMEOUT_MS `int`

How long, in milliseconds, the engine waits for a JSON response from the Site Builder daemon before giving up and reporting the service unreachable. It bounds the ordinary control calls (list sites, start a session, trigger a build); the live event stream a session produces is NOT subject to it — a streamed turn may run for many minutes.

The default is `10000` (ten seconds), which is generous for a daemon on the same network. Raise it if the daemon is far away or under load; lower it if you would rather fail fast.

```bash
DEDALO_SITE_BUILDER_TIMEOUT_MS=10000
```

*Default: 10000*

---

## Install {#install}

### Restricting the install wizard by address

DEDALO_INSTALL_ALLOWED_IPS `string` *comma list*

This parameter defines which addresses may reach the install wizard.

A fresh installation has no users yet, so the wizard cannot ask anyone to log in: until the installation is SEALED (the last step of the wizard), its actions are reachable without a password by whoever can open the page. That is harmless on a laptop and dangerous on a network. Set this parameter — a comma-separated list of addresses, where the word `loopback` stands for the local machine — before you expose an unsealed installation to anything but yourself.

Unset, the wizard is open to any address, which is the convenient default for a local installation. The address is taken from the trusted hop reported by the web server in front of Dédalo, so behind a proxy `loopback` will NOT match: name the real address of the machine you install from. Once the installation is sealed, the whole install surface answers "not found" for good and this parameter no longer matters.

```bash
DEDALO_INSTALL_ALLOWED_IPS="loopback,203.0.113.10"
```

*Default: (unset)*

---

### Defining the private directory the installer writes to

DEDALO_INSTALL_PRIVATE_DIR `string`

This parameter defines the directory the installer WRITES to — the configuration file it persists, the state file, the sessions and the backups.

By default that is the `private` directory next to the installation, which is where the server also reads its configuration from, and an ordinary installation never sets this key. It exists so that a run which must not touch the live configuration can be pointed somewhere else: the automated checks redirect it to a scratch directory so that a test of the installer can never overwrite the configuration of the machine it runs on.

```bash
DEDALO_INSTALL_PRIVATE_DIR="/srv/dedalo_private"
```

*Default: (unset)*

---

## Maintenance variables {#maintenance}

### Defining server code provider

CODE_SERVERS `array`

This parameter defines the code servers this install offers releases from. By default the server defines the official Dédalo code server, but you can include other mirror servers by adding entries to the array. Each entry is a JSON object with `name`, `url` and `code`.

```bash
CODE_SERVERS=[{"name":"Official Dédalo code server","url":"https://master.dedalo.dev/core/api/v1/json/","code":"x3a0B4Y020Eg9w"}]
```

*Default: (unset)*

---

### Defining is a code server directory

DEDALO_CODE_FILES_DIR `string`

This parameter defines the path to the code files in the server. Default location in root path /code.
Code files are organize in version directories with major / minor / version_dedalo.zip as:
`./dedalo/code/6/6.4/6.4.1_dedalo.zip`

```bash
DEDALO_CODE_FILES_DIR="/srv/dedalo/code"
```

*Default: (unset)*

---

### Defining is a code server build version from development git

DEDALO_CODE_SERVER_GIT_DIR `string`

This parameter defines the path to git directory in the server. It use to build the version with for specific version.
GIT directory is a valid git server than can provide the build version.
This parameter is not necessary if the server will be only a mirror from official files.


```bash
DEDALO_CODE_SERVER_GIT_DIR="/my_dedalo_git_directory"
```

*Default: (unset)*

---

### Defining source versions local directory to save the new code

DEDALO_SOURCE_VERSION_LOCAL_DIR `string`

This parameter defines the path to the local directory to save the new code downloaded from the master server repository.

```bash
DEDALO_SOURCE_VERSION_LOCAL_DIR="/tmp/my_museum"
```

*Default: (unset)*

---

### Defining is a code server

IS_A_CODE_SERVER `bool`

This parameter defines if the server can provide code to other Dédalo servers. By default no Dédalo server provides code, but it is possible to set one up as a mirror server that provides code versions. To enable it, also set `DEDALO_CODE_FILES_DIR` — the URL other servers fetch from is derived automatically.

```bash
IS_A_CODE_SERVER=false
```

*Default: false*

---

### Is an ontology master server

IS_AN_ONTOLOGY_SERVER `bool`

It defines if the installation server can provide his ontology files to other Dédalo servers.

```bash
IS_AN_ONTOLOGY_SERVER=false
```

*Default: false*

---

### Ontology input/output, export/import or download directory

ONTOLOGY_DATA_IO_DIR `string`

This parameter defines the directory to input/output the ontology files in the server. Ontology files can be created by master ontology servers or downloaded from an external provider such as the official master Dédalo server. Defaults to `install/import/ontology` inside the install tree.

```bash
ONTOLOGY_DATA_IO_DIR="/srv/dedalo/import/ontology"
```

*Default: `<install dir>/install/import/ontology`*

---

### defining the  ontology master server code

ONTOLOGY_SERVER_CODE `string`

It  defines the valid code for clients to validate to get ontology files.

```bash
ONTOLOGY_SERVER_CODE="x3a0B4Y020Eg9w"
```

This parameter needs to be included as `code` in [ONTOLOGY_SERVERS](#ontology-servers) defintion in every authorized client.

*Default: (unset)*

---

### Ontology servers

ONTOLOGY_SERVERS `array of objects`

This parameter defines the ontology master servers to get the ontology updates. The servers could be:

- the official dedalo.dev server
- an external server for local Ontologies (private Ontologies of entities.)
- local server, the current installation

Each entry is a JSON object with `name`, `url` and `code`. Configuration for the official dedalo.dev server:

```bash
ONTOLOGY_SERVERS=[{"name":"Official Dédalo Ontology server","url":"https://master.dedalo.dev/dedalo/core/api/v1/json/","code":"x3a0B4Y020Eg9w"}]
```

It gets the tld from the [ACTIVE_ONTOLOGY_TLDS](#defining-active-ontology-tlds) definition.

Local ontologies can be provided by other installations in parallel by adding new
entries to this list. Every Dédalo server can provide its own ontologies.

*Default: (unset)*

---

### Sync ontology from master server

STRUCTURE_FROM_SERVER `bool`

This parameter defines if the installation will be updated his ontology using the master server versions.

```bash
STRUCTURE_FROM_SERVER=true
```

*Default: (unset)*

---

### Enable local IP to Country resolution

DEDALO_GEOIP_ENABLED `bool`

Enables the built-in, self-hosted IP to Country resolution used in section Activity to show the source country flag from an IP address.

Resolution runs on the server against a local, openly-licensed country database (DB-IP IP to Country Lite, CC-BY-4.0) — no third-party request is made from the browser. When disabled, IP addresses are shown without a country flag.

```bash
DEDALO_GEOIP_ENABLED=true
```

*Default: true*

---

### IP to Country database directory

DEDALO_GEOIP_DIR `string`

Directory where the local IP to Country database file is downloaded and cached. Defaults to `geoip` inside the private directory (outside the web root).

```bash
DEDALO_GEOIP_DIR="/srv/dedalo/geoip"
```

*Default: `<private dir>/geoip`*

---

### Auto-download and refresh the IP to Country database

DEDALO_GEOIP_AUTO_UPDATE `bool`

When enabled, the server downloads the IP to Country database on first use and refreshes it monthly. Disable it to use only a database file placed manually in `DEDALO_GEOIP_DIR` (e.g. air-gapped installs).

```bash
DEDALO_GEOIP_AUTO_UPDATE=true
```

*Default: true*

---

### IP to Country database download URL override

DEDALO_GEOIP_DB_URL `string`

Overrides the default monthly DB-IP download URL. Use it to point at a mirror or a pinned month. The default is `https://download.db-ip.com/free/dbip-country-lite-YYYY-MM.mmdb.gz` (the current month, with a fallback to the previous month), computed automatically.

```bash
DEDALO_GEOIP_DB_URL="https://mirror.example.org/dbip-country-lite-2026-07.mmdb.gz"
```

*Default: (unset)*

---

## Diffusion variables {#diffusion}

### Publication record batch size

DEDALO_DIFFUSION_BATCH_RECORDS `int`

The number of records the publication resolver walks per batch. Diffusion is a
streaming process: records are selected in ordered batches, resolved, and handed to
the format writer, so that a section of hundreds of thousands of records never has to
fit in memory at once. A smaller batch lowers the memory ceiling of a publication run;
a larger one reduces the number of round trips to the database.

The engine currently resolves in fixed batches of **500** records. This key is read for
the diffusion panel of the maintenance dashboard, which reports the configured value —
the resolver does not yet take it as an override, so leave it unset unless you were
told otherwise.

```bash
DEDALO_DIFFUSION_BATCH_RECORDS=500
```

*Default: (unset)*

---

### Publication rows per write statement

DEDALO_DIFFUSION_BATCH_ROWS `int`

The maximum number of rows the engine packs into a single insert/update statement
when it writes a published table into the target database. Default `200`.

Raise it to reduce the number of statements sent to a remote target database (fewer,
bigger writes); lower it if the target rejects or chokes on large statements — a very
wide table (many columns, long texts) can hit the target's maximum packet size before
it hits the row cap. Any value that is not a positive number falls back to the default.

```bash
DEDALO_DIFFUSION_BATCH_ROWS=200
```

*Default: 200*

---

### Diffusion domain

DEDALO_DIFFUSION_DOMAIN `string`

This parameter would be set with the diffusion domain of our project publication, diffusion domain is the target domain or the part of diffusion ontology that will be used to get the tables and fields and the relation components in the back-end.

The definition for diffusion domain in the configuration file can set only one ontology diffusion_domain for our installation, it can have different diffusion groups or diffusion elements with different databases and tables.

```bash
DEDALO_DIFFUSION_DOMAIN="default"
```

> Any other 'section_tipo' are accepted and it can be other standard tlds used in the ontology like oh1 or ich1. If your institution has a specific tld space in the ontology, you can use your own tld into the DEDALO_DIFFUSION_DOMAIN.

*Default: (unset)*

---

### Published files root

DEDALO_DIFFUSION_FILES_ROOT `string`

The directory under which the file-format publications (RDF, XML, Markdown, CSV,
JSON…) are written, one subdirectory per publication target. When unset — the normal
case — Dédalo publishes under `MEDIA_PATH`, the same root the media files live in, so
that publishing and un-publishing (which removes the files of a deleted record) always
agree on where the artifacts are.

Set it only when the published files must live outside the media root, for example on a
volume that the public web server exposes and the media root is not.

```bash
DEDALO_DIFFUSION_FILES_ROOT="/var/www/published"
```

*Default: (unset)*

---

### Concurrent publication runners

DEDALO_DIFFUSION_MAX_RUNNERS `int`

How many publication jobs may run at the same time. Dédalo queues every diffusion
request durably and dispatches it to a **runner process** of its own — a separate,
killable process with its own memory ceiling — so a long publication survives a browser
disconnect, a logout, or a server restart. This key caps how many of those processes
the scheduler will have in flight; further jobs simply wait in the queue. Default `2`,
minimum `1`.

Raise it on a machine with spare cores and database connections; each runner opens its
own database pool, so the budget to respect is
`DB_POOL_MAX × (1 + DEDALO_DIFFUSION_MAX_RUNNERS)` connections against the PostgreSQL
server's `max_connections`.

```bash
DEDALO_DIFFUSION_MAX_RUNNERS=2
```

*Default: 2*

---

### Native diffusion engine

DEDALO_DIFFUSION_NATIVE `bool`

Routes the publication tool to the diffusion engine built into this server instead
of the separate, external diffusion service of earlier releases. Set to `true` once the
installation's publications have been validated against the native engine: the tool in
the browser is unchanged, only the server that answers it is.

While it is `false` (the default), Dédalo keeps advertising the external diffusion
service to the client and publications continue to go through it.

```bash
DEDALO_DIFFUSION_NATIVE=true
```

*Default: false*

---

### Elements routed to the native diffusion engine

DEDALO_DIFFUSION_NATIVE_ELEMENTS `string`

A staged-migration lever: a comma-separated list of the diffusion element tipos that
the native engine is allowed to publish, or `all` for every one of them. An element
outside the list is refused loudly with an explicit "not routed" message, so that one
element+section is never published by two engines at once.

Use it to move a large installation over one publication at a time. Unset (the default)
is permissive — every element is accepted — which is the right posture for a development
box and for an installation that has finished its migration.

```bash
DEDALO_DIFFUSION_NATIVE_ELEMENTS="dd1190,rsc167"
```

*Default: (unset)*

---

### Defining resolution levels; going to the deeper information

DEDALO_DIFFUSION_RESOLVE_LEVELS `int`

This parameter set the number of resolution levels we would like to accomplish. By default, its value is set to '2'.

```bash
DEDALO_DIFFUSION_RESOLVE_LEVELS=2
```

> Every other positive, numerical value will be accepted.

The number defines the maximum resolution levels of linked information that Dédalo will resolved in the publication process. Dédalo work with related data connected by locators, every link is a level of information, the parameter limit the quantity of linked data will be resolve in the linked data tree.

Ex: If you have an Oral History interview (level 0) with 1 linked image (level 1) and this image has a person linked as author (level 2) and these author 1 linked toponym for the birthplace (level 3). For publishing all linked information will be necessary 3 levels of resolution:

If you increase the value of this parameter, the time needed by Dédalo to resolve the linked data in the publication process will also increase in exponential progression.

*Default: 2*

---

### Publication job scheduler

DEDALO_DIFFUSION_SCHEDULER_ENABLED `bool`

Whether **this** server claims publication jobs from the queue and dispatches runner
processes for them. Enabled by default: a standard, single-server installation must have
it on, or publications will queue and never start.

Set it to `false` only on an instance that must not touch the live queue — a second
instance of the same installation (a maintenance or smoke-test copy sharing the database)
or a deployment where a dedicated machine runs the runners. Turning it off disables only
the claiming and the recovery sweep of interrupted jobs; the rest of diffusion, including
the removal of a deleted record from the published tables, keeps working.

```bash
DEDALO_DIFFUSION_SCHEDULER_ENABLED=false
```

*Default: true*

---

<!-- END GENERATED -->
