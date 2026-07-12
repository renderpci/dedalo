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

## **Main variables:** Paths

### Defining host

../private/.env

DEDALO_HOST `string`

This parameter holds the domain or IP of your installation. When unset, code that
needs a host derives it from the current request's `Host` header instead.

```bash
DEDALO_HOST="dedalo.example.org"
```

---

### Defining protocol

../private/.env

DEDALO_PROTOCOL `string`

This parameter defines the internet protocol used to build absolute URLs. It is
recommended to use the HTTPS protocol for an installation with SSL certification —
it is not mandatory, but it ensures the connection is protected with encryption.
Defaults to `"http://"` when unset.

```bash
DEDALO_PROTOCOL="https://"
```

---

## Locale

### Defining time zone

../private/.env

DEDALO_TIMEZONE `string`

Used to defines the time zone of the project. It could be different of the server installation or the linux timezone. The time zone will be used to store the time stamp of the changes done by the users.

```bash
DEDALO_TIMEZONE="Europe/Madrid"
```

---

### Defining locale encoding

../private/.env

DEDALO_LOCALE `string`

Defines the UI locale used to format and encode text. By default Dédalo uses UTF-8
encoding for Spanish (`es-ES`).

```bash
DEDALO_LOCALE="es-ES"
```

---

### Defining date order

../private/.env

DEDALO_DATE_ORDER `string`

Defines the default order for the date input by users and to be showed in component_date. By default Dédalo use dmy (European dates format).

Options:

* dmy : common way order day/moth/year
* mdy : USA way order moth/day/year
* ymd : China, Japan, Korean, Iran way year/month/day

```bash
DEDALO_DATE_ORDER="dmy"
```

## Entity

### Defining entity

../private/.env

ENTITY `string`

This parameter defines the name of the entity proprietary of the Dédalo installation. Dédalo entity will be used to access to databases, to encrypt passwords or to publish data into the specific publication ontology and should NOT be changed after installation.

```bash
ENTITY="my_entity_name"
```

> Use secure characters to define the entity, without spaces, accents or other special characters that could create conflicts with other server parts, such as database connection. If you want define the full name of the entity, use DEDALO_ENTITY_LABEL definition.

---

### Defining entity label

../private/.env

DEDALO_ENTITY_LABEL `string`

Defines the entity label, the real name of the entity. Due the entity definition is use to encrypt passwords or access to databases, sometimes you will need define the real name of the entity with characters such as 'ñ' or accents.

```bash
DEDALO_ENTITY_LABEL="Museu de Prehistòria de València"
```

> When unset, `DEDALO_ENTITY_LABEL` defaults to the value of `ENTITY`.

---

### Entity id

../private/.env

DEDALO_ENTITY_ID `int`

This parameter defines the normalized id for the entity. The id of the entity could be used to create a locator to obtain information between Dédalo installations, the id will be added to the locator with the key: "entity_id" when the locator point to external resource.

```bash
DEDALO_ENTITY_ID=0
```

---

## Backup variables

### Defining backup time range

../private/.env

DEDALO_BACKUP_TIME_RANGE `int`

This parameter defines the time lapse between backup copies in hours. Dédalo check in every user login if the last backup exceed this time lapse, in affirmative case, it will create new one.

```bash
DEDALO_BACKUP_TIME_RANGE=8
```

---

### Defining backups directory

../private/.env

DEDALO_BACKUP_PATH `string`

This parameter defines the directory a code update stages the previous tree into
before swapping in a new release, so a failed update can be rolled back. Keep it
outside the served tree for security. Defaults to `<install>/../backups/code`.
This is distinct from `DEDALO_BACKUP_DIR`, which sets the directory for database
backups (see [Database connection](config_db.md)).

```bash
DEDALO_BACKUP_PATH="/srv/dedalo/backups/code"
```

---

## Logs and errors

Store application activity data info and errors into `activity` table in DDBB.

---

### Update log file

../private/.env

UPDATE_LOG_FILE `string`

Defines the directory path to store the update log.

The maintenance update process uses the update log to store the status of each update task. This log is useful to know what happens in the update process. If the update fails, you can consult the last status to restore the update process at this last point.

Defaults to `update.log` inside `../private`. If you move it elsewhere, keep the
directory private and outside the served tree.

```bash
UPDATE_LOG_FILE="/srv/dedalo/private/update.log"
```

---

## Languages

### Defining structure lang

../private/.env

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

---

### Defining application languages

../private/.env

DEDALO_APPLICATION_LANGS `object` (a JSON map of `lg-*` code → label)

This parameter defines the languages that Dédalo will use for the data and user interface. Dédalo is a true multi-language application, any text field can be defined as translatable and this configuration define the languages that the installation will use to store and translate text data. When the user select one of those languages Dédalo will change the data showed or the user interface, so it will render all data with this new language.

**Required** — the server refuses to boot without a non-empty value.

```bash
DEDALO_APPLICATION_LANGS={"lg-spa":"Castellano","lg-cat":"Català","lg-eus":"Euskara","lg-eng":"English","lg-fra":"French"}
```

> See the Dédalo structure lang for see the languages definitions.

---

### Defining default application language

../private/.env

DEDALO_APPLICATION_LANGS_DEFAULT `string`

Defines the main language will used in the user interface.

Dédalo can be translated to any language, the translations of the interface are done in the ontology. The users can change the Dédalo interface to use it in his language. In Dédalo the user interface and the data language are separated concepts and it is possible have a interface in one language and the data in other. This main language will be used as primary option and as fall back language when the element does not have the translation available.

```bash
DEDALO_APPLICATION_LANGS_DEFAULT="lg-eng"
```

> See the Dédalo structure lang for see the languages definitions.

---

### Defining application language

../private/.env

APPLICATION_LANG `string`

This parameter defines the language will us Dédalo for the user interface.

This is a dynamic parameter and it can be changed when the user login, or in application menu. When the language is changed it is saved into the user's session and it is read to maintain coherence in the diary workflow. If the user's session does not have defined the application language then Dédalo will use the application default language definition.

```bash
APPLICATION_LANG="lg-spa"
```

> You can set this as a fixed value, but it is recommended you do not — to change the
> default interface language, use `DEDALO_APPLICATION_LANGS_DEFAULT` instead.

---

### Defining default data language

../private/.env

DEDALO_DATA_LANG_DEFAULT `string`

Defines the main language will used by Dédalo to manage and process data.

The main language is the mandatory language for the text data in the catalog or inventory. Dédalo is a real multi-language application, it can manage multiple translation of the textual information.

In a multi-language situation, when you require some translated information but it is not present (because it is not done), Dédalo will need to use the main language to do a fall back process to main language to show the data. If the main language data is not present, Dédalo will use any other language to show those data.

```bash
DEDALO_DATA_LANG_DEFAULT="lg-spa"
```

---

### Defining data language

../private/.env

DATA_LANG `string`

It defines the data language used by Dédalo to process and render textual information.

This is a dynamic parameter that can be changed by the user in any moment. Dédalo is a real multi-language application, it can manage information in multiple languages and process it as unique information block (the field store any translated version of his data). The user can translate any information directly or using specific tools. This parameter define the current language used.

```bash
DATA_LANG="lg-spa"
```

> You can set this as a fixed value, but it is recommended you do not — to change the
> default data language, use [DEDALO_DATA_LANG_DEFAULT](#defining-default-data-language)
> instead.

---

### Defining data language selector

../private/.env

DEDALO_DATA_LANG_SELECTOR `bool`

It defines if the menu show or hide the data language selector.

When the selector is showed the user can change the data language independently of the interface language. If the selector is hide the data language is synchronous to the interface language a change in the interface language will be a change in the data language.

```bash
DEDALO_DATA_LANG_SELECTOR=true
```

---

### Defining data language sync

../private/.env

DATA_LANG_SYNC `bool`

Defines whether the application language and data language selection remain synchronized.

When set to ' true', it forces to keep DEDALO_APPLICATION_LANG and DEDALO_DATA_LANG synchronized across changes.
The default value is 'false', which allows the application language and data language to be selected independently.

```bash
DATA_LANG_SYNC=false
```

---

### Defining data without language (no lang)

../private/.env

DATA_NOLAN `string`

This parameter defines the tld used by Dédalo to tag data without translation possibility.

Dédalo is multi language by default, all information could be translated to other languages that the main lang, but some data is not susceptible to be translated, like numbers, dates or personal names. In these cases Dédalo defines this kind of data as "not translatable" with the specific tld define in this parameter.

By default and for global Dédalo definition for non translatable data this tld is: `lg-nolan`

```bash
DATA_NOLAN="lg-nolan"
```

---

### Defining default projects languages

../private/.env

PROJECTS_DEFAULT_LANGS `array`

This parameter defines the languages that will use for export and publish data.

This definition control the amount of languages that will be processed to export data or publish data in the publication process.

When Dédalo export data or publish data, it check the languages of every field of every record to create a fixed version of the data with the language processed or his own correspondences of the main languages when the data is not available in the current language. This parameter reduce the amount languages used in those processes.

```bash
PROJECTS_DEFAULT_LANGS=[ "lg-spa", "lg-cat", "lg-eng"]
```

> The parameter use the Dédalo tld definition for languages. See DEDALO_APPLICATION_LANGS definition to show some examples.

---

### Defining diffusion languages

../private/.env

DEDALO_DIFFUSION_LANGS `array`

This parameter defines the languages that Dédalo will use to publish data.

This definition control the amount of languages that will be processed to publish data in the publication process. When Dédalo publish data, it check the languages of every field of every record to create a fixed version of the data with the language processed or his own correspondences of the main languages when the data is not available in the current language. This parameter reduce the amount languages used in this process.

This parameter is configured with the same values as DEDALO_PROJECTS_DEFAULT_LANGS, but it can be changed to other values to separate the export languages from the diffusion languages.

```bash
DEDALO_DIFFUSION_LANGS=[ "lg-spa", "lg-cat", "lg-eng"]
```

>The parameter use the Dédalo tld definition for languages. See DEDALO_APPLICATION_LANGS definition to show some examples.

---

## Default variables

### Defining active ontology TLDs

../private/.env

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

---

### Defining main fallback section

../private/.env

MAIN_SECTION `string`

It defines the section will loaded by default when the user login.
The main section of the project that will used, normally will be a inventory or catalog section.

```bash
MAIN_SECTION="oh1"
```

---

### Defining maximum rows per page

../private/.env

DEDALO_MAX_ROWS_PER_PAGE `int`

It defines the maximum rows that will loaded in the lists.

This value is the default number of rows that Dédalo will load, but is possible to change this value directly in the filter by the users, when they make a search, if the user do not define the maximum rows, Dédalo will use the value of this parameter.

```bash
DEDALO_MAX_ROWS_PER_PAGE=10
```

---

### Defining default project

../private/.env

DEDALO_DEFAULT_PROJECT `int`

This parameter defines the default project that Dédalo will use to create new sections (records in the DDBB).

Dédalo use the project component (component_filter) to group sections by the research criteria. The project field is mandatory in every section, because an user that can access to a project will no see the records of the other projects and, therefore, is necessary that all sections can be searchable by projects. If the user forget introduce project data, Dédalo will use this parameter to introduce it.

```bash
DEDALO_DEFAULT_PROJECT=1
```

---

### Defining filter section tipo default

../private/.env

DEDALO_FILTER_SECTION_TIPO_DEFAULT `string`

This parameter defines the section that has the projects information inside the ontology.

Dédalo will use this parameter to define the locator of the filter by projects to apply to any search of sections. By default Dédalo has a predefined section to store the projects that administrators users can enlarge. The default section_tipo is `dd153` and it is located below 'Administration' area in the menu. Every project field target this section to define the specific project of the current record.

```bash
DEDALO_FILTER_SECTION_TIPO_DEFAULT="dd153"
```

> Defaults to `dd153` (the Projects section). Do not change this param.

---

## Media variables

Media as images, pdf, audiovisual, svg and other are files that Dédalo use inside the sections.

Media is referenced by locator and all files are name in the server with the locator that call it. Dédalo has a media directories definition that can be change with this parameter, for ex: is possible define the amount of image copies in different qualities for images.

---

### Defining media base path

../private/.env

MEDIA_PATH `string`

This parameter defines the root media directory in the directory tree.

Normally this directory sits alongside the install, but it can be set to any path. The server needs read/write access to this directory as its owner. Unset in dev leaves media handling disabled.

```bash
MEDIA_PATH="/srv/dedalo/media"
```

---

### Thumb

Thumb media are small images to be used in lists, all media has thumb image to represent the media.

#### Defining image thumb extension

../private/.env

DEDALO_THUMB_EXTENSION `string`

This parameter defines the standard file type of thumb files.

```bash
DEDALO_THUMB_EXTENSION="jpg"
```

---

#### Defining image thumb quality

../private/.env

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

---

#### Defining image thumb width size

../private/.env

DEDALO_IMAGE_THUMB_WIDTH `int`

This parameter defines width size in pixels to the thumb images, it will be used to compress the images with the thumb quality (the smaller version to be used in lists).

```bash
DEDALO_IMAGE_THUMB_WIDTH=222
```

---

#### Defining image thumb height size

../private/.env

DEDALO_IMAGE_THUMB_HEIGHT `int`

This parameter defines height size in pixels to the thumb images, it will be used to compress the images with the thumb quality (the smaller version to be used in lists).

```bash
DEDALO_IMAGE_THUMB_HEIGHT=148
```

---

### Audiovisual

Audiovisual media includes video and audio files, it use a posterframe to represent the file as the original quality.

#### Defining audiovisual directory

../private/.env

DEDALO_AV_FOLDER `string`

This parameter defines the main directory for the audiovisual files.

```bash
DEDALO_AV_FOLDER="/av"
```

---

#### Defining audiovisual extension (type of file)

../private/.env

DEDALO_AV_EXTENSION `string`

This parameter defines the standard file type of encapsulation for the audiovisual files.

By default Dédalo use mp4 encapsulation definition for the audiovisual files with codec h264 or h265. All other formats will be compressed to this parameters.

```bash
DEDALO_AV_EXTENSION="mp4"
```

---

#### Defining audiovisual extensions supported

../private/.env

DEDALO_AV_EXTENSIONS_SUPPORTED `array`

This parameter defines the standards file type admitted for the audiovisual files.

Dédalo will use this parameter to identify the file format of the original files uploaded by the users before compress it to the standard defined in the DEDALO_AV_EXTENSION parameter.

```bash
DEDALO_AV_EXTENSIONS_SUPPORTED=["mp4","wave","wav","aiff","aif","mp3","mov","avi","mpg","mpeg","vob","zip","flv"]
```

---

#### Defining audiovisual quality for original files

../private/.env

DEDALO_AV_QUALITY_ORIGINAL `string`

This parameter defines the quality original for the audiovisual files.

This parameter will use to identify the uploaded files to with specific quality. Dédalo admit lots of different formats from different sources and qualities, and it define this files as "original" quality. Dédalo will compress all formats to web standard format, unify all different qualities and codecs, and will store the original file without touch. In some cases, if the institution has a protocol for manage av files, is possible to use one specific quality for the files that users can upload. By default Dédalo do not limit the original format to be uploaded using a "original" quality denomination.

```bash
DEDALO_AV_QUALITY_ORIGINAL="original"
```

---

#### Defining audiovisual quality for processed files

../private/.env

DEDALO_AV_QUALITY_DEFAULT `string`

This parameter defines the default quality used for the audiovisual files.

This parameter will use to compress all audiovisual files to specific quality, unifying the quality used by all sections. By default Dédalo use 720x404 h264 quality.

```bash
DEDALO_AV_QUALITY_DEFAULT="404"
```

---

#### Defining audiovisual qualities definition

../private/.env

DEDALO_AV_AR_QUALITY `string`

This parameter defines the different qualities that can be used for compress the audiovisual files.

This parameter will use to compress audiovisual files to specific quality. The compression will use the original file and will compress to those qualities when the user demand a specific quality.

```bash
DEDALO_AV_AR_QUALITY=[DEDALO_AV_QUALITY_ORIGINAL,"4k","1080","720","576","404","240","audio"]
```

---

#### Defining posterframe filetype extension for audiovisual files

../private/.env

DEDALO_AV_POSTERFRAME_EXTENSION `string`

This parameter defines the type of the image file used to create the posterframe of the audiovisual files.

The posterframe is the image that will show before load the audiovisual files and identify it. This parameter define the type of this image. By default Dédalo use jpg standard to create the posterframe.

```bash
DEDALO_AV_POSTERFRAME_EXTENSION="jpg"
```

---

#### Defining audiovisual processor filepath (ffmpeg path)

../private/.env

DEDALO_AV_FFMPEG_PATH `string`

This parameter defines the path to the ffmpeg library in the server. ffmpeg will use to compress the audiovisual files.

```bash
DEDALO_AV_FFMPEG_PATH="/usr/bin/ffmpeg"
```

---

#### Defining audiovisual processor settings (faststart)

../private/.env

DEDALO_AV_FASTSTART_PATH `string`

This parameter defines the path to the qt-faststart library in the server.

qt-faststart is used to move the av header from last bytes of the av file to the start of the av file, this change improve the load of the av because the header is at the beginning of the file and it can read first when loads begin.

```bash
DEDALO_AV_FASTSTART_PATH="/usr/bin/qt-faststart"
```

---

#### Defining audiovisual ffprobe path

../private/.env

DEDALO_AV_FFPROBE_PATH `string`

This parameter defines the path to the ffprobe library in the server. ffprobe is used to analyze the audiovisual files and get his metadata.

```bash
DEDALO_AV_FFPROBE_PATH="/usr/bin/ffprobe"
```

---

#### Defining audiovisual subtitles directory

../private/.env

DEDALO_SUBTITLES_FOLDER `string`

This parameter defines the path to the subtitles directory.

Dédalo will store the VTT files generated by the subtitle engine in this directory.

```bash
DEDALO_SUBTITLES_FOLDER="/subtitles"
```

---

#### Defining audiovisual subtitles type extension

../private/.env

DEDALO_AV_SUBTITLES_EXTENSION `string`

This parameter defines the standard used to create the subtitles.

By default Dédalo use VTT format to create the subtitles.

```bash
DEDALO_AV_SUBTITLES_EXTENSION="vtt"
```

---

### Image

#### Defining image directory

../private/.env

DEDALO_IMAGE_FOLDER `string`

This parameter defines the main directory for the image files.

```bash
DEDALO_IMAGE_FOLDER="/image"
```

---

#### Defining image extension (type of file)

../private/.env

DEDALO_IMAGE_EXTENSION `string`

This parameter defines the standard file type of image files.

By default Dédalo use jpg standard definition for the image files. All other formats will be compressed to this standard.

```bash
DEDALO_IMAGE_EXTENSION="jpg"
```

---

#### Defining image extensions supported

../private/.env

DEDALO_IMAGE_EXTENSIONS_SUPPORTED `array`

This parameter defines the standards file type admitted for the image files.

Dédalo will use this parameter to identify the file format of the original files uploaded by the users before compress it to the standard defined in the DEDALO_IMAGE_EXTENSION parameter.

```bash
DEDALO_IMAGE_EXTENSIONS_SUPPORTED=["jpg","jpeg","png","tif","tiff","bmp","psd","raw","webp","heic"]
```

#### Defining alternative image extensions of image files

../private/.env

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

---

#### Defining image quality for original files

../private/.env

DEDALO_IMAGE_QUALITY_ORIGINAL `string`

This parameter defines the quality original for the image files.

This parameter will use to identify the uploaded files to with specific quality. Dédalo admit lots of different formats from different sources and qualities, and it define this files as "original" quality. Dédalo will compress all formats to web standard format, unify all different qualities and codecs, and will store the original file without touch. In some cases, if the institution has a protocol for manage image files, is possible to use one specific quality for the files that users can upload. By default Dédalo do not limit the original format to be uploaded using a "original" quality denomination.

```bash
DEDALO_IMAGE_QUALITY_ORIGINAL="original"
```

---

#### Defining image quality for the retouched files

../private/.env

DEDALO_IMAGE_QUALITY_RETOUCHED `string`

This parameter defines the quality for the image files that has been retouched.

Retouched images are the processed images to improve the image, this quality will be a copy of the original that has any kind of process (color balance, background removed, contrasted, etc)

```bash
DEDALO_IMAGE_QUALITY_RETOUCHED="modified"
```

---

#### Defining image default quality

../private/.env

DEDALO_IMAGE_QUALITY_DEFAULT `string`

This parameter defines the default quality used for the image files.

This parameter will use to compress all image files to specific quality, unifying the quality used by all sections. By default Dédalo use 1.5MB file size (524.217px or 887x591px) quality.

```bash
DEDALO_IMAGE_QUALITY_DEFAULT="1.5MB"
```

---

#### Defining image thumb default

../private/.env

DEDALO_IMAGE_THUMB_DEFAULT `string` *deprecated; use DEDALO_QUALITY_THUMB*

This parameter defines the thumb quality definition that can be used for compress the image files.

This parameter will use to compress and store image files used in lists. The compression will use the original file and will compress with smaller version or thumb version of the image.

```bash
DEDALO_IMAGE_THUMB_DEFAULT="thumb"
```

---

#### Defining image qualities definition

../private/.env

DEDALO_IMAGE_AR_QUALITY `serialized array`

This parameter defines the different qualities that can be used for compress the image files.

This parameter will use to compress image files to specific quality. The compression will use the original file and will compress to those qualities when the user demand a specific quality.

```bash
DEDALO_IMAGE_AR_QUALITY=[DEDALO_IMAGE_QUALITY_ORIGINAL,DEDALO_IMAGE_QUALITY_RETOUCHED,"25MB","6MB","1.5MB",DEDALO_QUALITY_THUMB]
```

---

#### Defining image print resolution definition

../private/.env

DEDALO_IMAGE_PRINT_DPI `int`

This parameter defines the resolution in pixels per inch that will be used in the image compression to be apply when the images will be printed.

```bash
DEDALO_IMAGE_PRINT_DPI=150
```

---

#### Defining Image Magick path

../private/.env

DEDALO_MAGICK_PATH `string`

This parameter defines the path to image magick library in the server (when image magick library is installed)

```bash
DEDALO_MAGICK_PATH="/usr/bin/"
```

---

### PDF

#### Defining pdf directory

../private/.env

DEDALO_PDF_FOLDER `int`

This parameter defines the main directory for the pdf files.

```bash
DEDALO_PDF_FOLDER="/pdf"
```

---

#### Defining pdf extension (type of file)

../private/.env

DEDALO_PDF_EXTENSION `string`

This parameter defines the standard file type of pdf files.

```bash
DEDALO_PDF_EXTENSION="pdf"
```

---

#### Defining pdf extensions supported

../private/.env

DEDALO_PDF_EXTENSIONS_SUPPORTED `array`

This parameter define the standards file type admitted for the pdf files. Dédalo will use this parameter to identify the file format of the original files uploaded by the users. Defaults to `["pdf","doc","pages","odt","ods","rtf","ppt"]`.

```bash
DEDALO_PDF_EXTENSIONS_SUPPORTED=["pdf","doc","pages","odt","ods","rtf","ppt"]
```

---

#### Defining pdf alternative extensions to process the original file into different images

../private/.env

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

---

#### Defining pdf quality for original files

../private/.env

DEDALO_PDF_QUALITY_ORIGINAL `string`

This parameter defines the quality original for the pdf files.

This parameter will use to identify the uploaded files to with specific quality. Dédalo admit hight quality for PDF files (print formats or preservation formats), and it define this files as "original" quality. Dédalo will compress to web standard format, unify all different qualities and will store the original file without touch. In some cases, if the institution has a protocol for manage PDF files, is possible to use a specific quality for the files that users can upload. By default Dédalo do not limit the original format to be uploaded using a "original" quality denomination.

```bash
DEDALO_PDF_QUALITY_ORIGINAL="original"
```

---

#### Defining pdf quality default

../private/.env

DEDALO_PDF_QUALITY_DEFAULT `string`

This parameter defines the default quality used for the PDF files.

This parameter will use to compress all pdf files to specific format, unifying the quality used by all sections. By default Dédalo will compress images to jpg for web quality.

```bash
DEDALO_PDF_QUALITY_DEFAULT="web"
```

---

#### Defining pdf quality for processed files

../private/.env

DEDALO_PDF_AR_QUALITY `array`

This parameter defines the different qualities that can be used for compress the PDF files.

This parameter will use to compress PDF files to specific quality. The compression will use the original file and will compress to those qualities when the user demand a specific quality.

```bash
DEDALO_PDF_AR_QUALITY=[DEDALO_PDF_QUALITY_ORIGINAL, DEDALO_PDF_QUALITY_DEFAULT]
```

---

#### Defining pdf thumb default

../private/.env

DEDALO_PDF_THUMB_DEFAULT `string` *deprecated; use DEDALO_QUALITY_THUMB*

This parameter defines the thumb quality definition that can be used for compress the pdf files.

This parameter will use to compress and store image files used in lists. The compression will use the original file and will compress the first page with smaller version or thumb version of the pdf. Only will be compress the first pdf page to thumb quality.

```bash
DEDALO_PDF_THUMB_DEFAULT="thumb"
```

---

#### Pdf automatic transcription engine

../private/.env

PDF_AUTOMATIC_TRANSCRIPTION_ENGINE `string`

This parameter defines the path to the library, usually [xpdf](http://www.xpdfreader.com/download.html) (pdftotext), to be used for process the pdf to extract the information, this library will be used get the text fo the pdf files and store in the component_text_area. The text will be use to search inside the pdf information.

```bash
PDF_AUTOMATIC_TRANSCRIPTION_ENGINE="/usr/bin/pdftotext"
```

---

#### Pdf OCR process

../private/.env

PDF_OCR_ENGINE `string`

This parameter defines the path to the library, usually [ocrmypdf](https://ocrmypdf.readthedocs.io/en/latest/index.html) that will be used for OCR processing of the pdf uploaded files. Optical Character Recognition or OCR is a technology that converts images of typed or handwritten text, such as in a scanned document, into computer text that can be selected, searched and copied.

```bash
PDF_OCR_ENGINE="/usr/bin/ocrmypdf"
```

---

### 3D

#### Defining main 3d directory

../private/.env

DEDALO_3D_FOLDER `string`

This parameter define the main directory for the 3d files.

```bash
DEDALO_3D_FOLDER="/3d"
```

---

#### Defining 3d extension (type of file)

../private/.env

DEDALO_3D_EXTENSION `string`

This parameter defines the standard file type of 3d files.

By default Dédalo use glb standard definition for the 3d files. All other formats will be exported to this standard.

```bash
DEDALO_3D_EXTENSION="glb"
```

---

#### Defining 3d extensions supported

../private/.env

DEDALO_3D_EXTENSIONS_SUPPORTED `array`

This parameter defines the standards file type admitted for the 3d files.

Dédalo will use this parameter to identify the file format of the original files uploaded by the users before transform it to the standard defined in the DEDALO_3D_EXTENSION parameter.

```bash
DEDALO_3D_EXTENSIONS_SUPPORTED=["glb"]
```

> Note: in current version only glb files are available, in future versions other format files will be supported: as 'gltf', 'obj', 'fbx', 'dae', 'zip'

---

#### Defining 3d quality for original files

../private/.env

DEDALO_3D_QUALITY_ORIGINAL `string`

This parameter defines the quality original for the 3d files.

This parameter will use to identify the uploaded files to with specific quality. Dédalo admit lots of different formats from different sources and qualities, and it define this files as "original" quality. Dédalo will transform all supported formats to web standard format, unify all different qualities and codecs, and will store the original file without touch. In some cases, if the institution has a protocol for manage image files, is possible to use one specific quality for the files that users can upload. By default Dédalo do not limit the original format to be uploaded using a "original" quality denomination.

```bash
DEDALO_3D_QUALITY_ORIGINAL="original"
```

---

#### Defining 3d quality for processed files

../private/.env

DEDALO_3D_QUALITY_DEFAULT `string`

This parameter defines the default quality used for the 3d files.

This parameter will use to transform all 3d files to specific format, unifying the quality used by all sections. By default Dédalo use glb format for web quality.

```bash
DEDALO_3D_QUALITY_DEFAULT="web"
```

---

#### Defining 3d qualities definition

../private/.env

DEDALO_3D_AR_QUALITY `array`

This parameter defines the different qualities that can be used for store 3d files.

This parameter will use to store files to specific quality.

```bash
DEDALO_3D_AR_QUALITY=[DEDALO_3D_QUALITY_ORIGINAL, DEDALO_3D_QUALITY_DEFAULT]
```

---

### SVG

#### Defining main directory for svg files

../private/.env

DEDALO_SVG_FOLDER `string`

This parameter defines the main directory for the svg files.

```bash
DEDALO_SVG_FOLDER="/svg"
```

---

#### Defining svg extension (type of file)

../private/.env

DEDALO_SVG_EXTENSION `string`

This parameter defines the standard file type of svg files.

```bash
DEDALO_SVG_EXTENSION="svg"
```

---

#### Defining svg extensions supported

../private/.env

DEDALO_SVG_EXTENSIONS_SUPPORTED `array`

This parameter defines the standards file type admitted for the svg files.

Dédalo will use this parameter to identify the file format of the original files uploaded by the users.

```bash
DEDALO_SVG_EXTENSIONS_SUPPORTED=["svg"]
```

---

#### Defining svg quality for original files

../private/.env

DEDALO_SVG_QUALITY_ORIGINAL `string`

This parameter defines the quality original for the svg files.

This parameter will use to identify the uploaded files to with specific quality. Dédalo admit different editing vector formats, and it define this files as "original" quality, Dédalo will store the original file without touch. In some cases, if the institution has a protocol for manage SVG files, is possible to use a specific quality for the files that users can upload. By default Dédalo do not limit the original format to be uploaded using a "original" quality denomination.

```bash
DEDALO_SVG_QUALITY_ORIGINAL="original"
```

---

#### Defining svg quality for processed files

../private/.env

DEDALO_SVG_QUALITY_DEFAULT `string`

This parameter defines the default quality used for the SVG files.

This parameter will use to store all svg files, unifying the quality used by all sections. By default Dédalo will use a flat svg for web quality.

```bash
DEDALO_SVG_QUALITY_DEFAULT="web"
```

---

#### Defining svg qualities for processed files

../private/.env

DEDALO_SVG_AR_QUALITY `array`

This parameter defines the different qualities that can be used transformed svg files.

This parameter will use to store different svg version files to specific quality.

```bash
DEDALO_SVG_AR_QUALITY=[DEDALO_SVG_QUALITY_DEFAULT, DEDALO_SVG_QUALITY_DEFAULT]
```

---

### Defining upload split files in chunks

../private/.env

DEDALO_UPLOAD_SERVICE_CHUNK_FILES `int || false`

Defines the size at which files are split into chunks for upload.

This parameter allows you to break large files into smaller, more manageable pieces for reliable resumable uploads.

This parameter will use to split files at specific size into small chunks or blobs. The value is expressed in MB, but do not use the MB string, the value is a integer, for ex: 5 will be interpreted as 5MB.

When an integer is provided, any file larger than this value will be automatically segmented into chunks. The value is interpreted as Megabytes (MB). For example, chunkSize: 95 will create chunks of approximately 95MB each.

When set to `false`, the chunking feature is disabled, and all files are uploaded in a single request.

```bash
DEDALO_UPLOAD_SERVICE_CHUNK_FILES=false); // 5 = 5MB
```

---

### Defining the maximum number of simultaneous connections for uploading chunked files

../private/.env

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

### Georeferencing variables

Dédalo use a georeference system based in leaflet library to create maps for the heritage.

---

#### Defining georeference provider

../private/.env

DEDALO_GEO_PROVIDER `string`

This parameter defines the tile maps provider to be used.

The param can be change the provider to specific configurations, for ex, if you want to use the ancient roman map and the actual OSM map you can use the "NUMISDATA" provider that include both maps. values supported: OSM | ARCGIS | GOOGLE | VARIOUS | ARCGIS | NUMISDATA

```bash
DEDALO_GEO_PROVIDER="VARIOUS"
```

## Menu variables

### Defining skip tipos from menu

../private/.env

MENU_SKIP_TIPOS `array`

This parameter defines the tipos to be skipped from the menu.

The ontology sometimes define long hierarchy to access to the sections, and could be convenient to remove some tipo from the menu to access more quickly to the sections. Add the tipo to the array to be removed it from menu.

```bash
MENU_SKIP_TIPOS=[]
```

---

## Security variables

### Defining lock components

../private/.env

DEDALO_LOCK_COMPONENTS `bool`

This parameter defines if Dédalo will lock / unlock components to avoid replacement data when more than one user edit the same component or Dédalo do not manage the user edition unlocking all components. By default Dédalo do not manage the editions (option false).

```bash
DEDALO_LOCK_COMPONENTS=false
```

---

### Defining protect media files for external access

../private/.env

DEDALO_MEDIA_ACCESS_MODE `false | string`

This parameter defines if the directory of the media files (av, images, pdf, subtitles, ...) will be protected and controlled for undesired/external access. The full documentation, with the architecture, use cases, web server configuration and examples, is in [Media protection (media file access control)](./media_protection.md).

* `false` : no protection — media files are world-readable (default)
* `'private'` : only logged-in Dédalo users can access media files
* `'publication'` : logged-in users access everything; anonymous users access only media of published records in the configured public quality folders (see `DEDALO_MEDIA_PUBLIC_QUALITIES`)

```bash
DEDALO_MEDIA_ACCESS_MODE=false
```

DEDALO_PROTECT_MEDIA_FILES `bool` (deprecated)

The legacy boolean is kept for back-compat: `true` behaves as `DEDALO_MEDIA_ACCESS_MODE='private'` when the new constant is not defined.

```bash
DEDALO_PROTECT_MEDIA_FILES=false
```

---

### Defining lock components notifications

../private/.env

DEDALO_NOTIFICATIONS `bool`

This parameter defines if Dédalo will notify to the user than other users are editing the same field in the same section when the user try to edit the field.

```bash
DEDALO_NOTIFICATIONS=false
```

---

### Defining exclude components

../private/.env

DEDALO_AR_EXCLUDE_COMPONENTS `array`

This parameter defines components to be excluded.

Some installations need to block the global access to specific components, use this param to remove the components adding the tipo into the array.

```bash
DEDALO_AR_EXCLUDE_COMPONENTS=[]
```

---

## Diffusion variables

Diffusion defines the configuration variables Dédalo uses to process data and resolve relations, producing the flattened version of the data stored in the diffusion database (MariaDB — see [Database connection](config_db.md)).

---

### Diffusion domain

../private/.env

DEDALO_DIFFUSION_DOMAIN `string`

This parameter would be set with the diffusion domain of our project publication, diffusion domain is the target domain or the part of diffusion ontology that will be used to get the tables and fields and the relation components in the back-end.

The definition for diffusion domain in the configuration file can set only one ontology diffusion_domain for our installation, it can have different diffusion groups or diffusion elements with different databases and tables.

```bash
DEDALO_DIFFUSION_DOMAIN="default"
```

> Any other 'section_tipo' are accepted and it can be other standard tlds used in the ontology like oh1 or ich1. If your institution has a specific tld space in the ontology, you can use your own tld into the DEDALO_DIFFUSION_DOMAIN.

---

### Defining resolution levels; going to the deeper information

../private/.env

DEDALO_DIFFUSION_RESOLVE_LEVELS `int`

This parameter set the number of resolution levels we would like to accomplish. By default, its value is set to '2'.

```bash
DEDALO_DIFFUSION_RESOLVE_LEVELS=2
```

> Every other positive, numerical value will be accepted.

The number defines the maximum resolution levels of linked information that Dédalo will resolved in the publication process. Dédalo work with related data connected by locators, every link is a level of information, the parameter limit the quantity of linked data will be resolve in the linked data tree.

Ex: If you have an Oral History interview (level 0) with 1 linked image (level 1) and this image has a person linked as author (level 2) and these author 1 linked toponym for the birthplace (level 3). For publishing all linked information will be necessary 3 levels of resolution:

If you increase the value of this parameter, the time needed by Dédalo to resolve the linked data in the publication process will also increase in exponential progression.

---

## Maintenance variables

Maintenance configure the variables that Dédalo will use to update the ontology, the code or check if the system is working properly.

---

### Sync ontology from master server

../private/.env

STRUCTURE_FROM_SERVER `bool`

This parameter defines if the installation will be updated his ontology using the master server versions.

```bash
STRUCTURE_FROM_SERVER=true
```

---

### Is an ontology master server

../private/.env

IS_AN_ONTOLOGY_SERVER `bool`

It defines if the installation server can provide his ontology files to other Dédalo servers.

```bash
IS_AN_ONTOLOGY_SERVER=false
```

---

### defining the  ontology master server code

../private/.env

ONTOLOGY_SERVER_CODE `string`

It  defines the valid code for clients to validate to get ontology files.

```bash
ONTOLOGY_SERVER_CODE="x3a0B4Y020Eg9w"
```

This parameter needs to be included as `code` in [ONTOLOGY_SERVERS](#ontology-servers) defintion in every authorized client.

---

### Ontology servers

../private/.env

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

---

### Ontology input/output, export/import or download directory

../private/.env

ONTOLOGY_DATA_IO_DIR `string`

This parameter defines the directory to input/output the ontology files in the server. Ontology files can be created by master ontology servers or downloaded from an external provider such as the official master Dédalo server. Defaults to `install/import/ontology` inside the install tree.

```bash
ONTOLOGY_DATA_IO_DIR="/srv/dedalo/import/ontology"
```

---

### Defining is a code server

../private/.env

IS_A_CODE_SERVER `bool`

This parameter defines if the server can provide code to other Dédalo servers. By default no Dédalo server provides code, but it is possible to set one up as a mirror server that provides code versions. To enable it, also set `DEDALO_CODE_FILES_DIR` — the URL other servers fetch from is derived automatically.

```bash
IS_A_CODE_SERVER=false
```

---

### Defining is a code server directory

../private/.env

DEDALO_CODE_FILES_DIR `string`

This parameter defines the path to the code files in the server. Default location in root path /code.
Code files are organize in version directories with major / minor / version_dedalo.zip as:
`./dedalo/code/6/6.4/6.4.1_dedalo.zip`

```bash
DEDALO_CODE_FILES_DIR="/srv/dedalo/code"
```

---

### Defining is a code server build version from development git

../private/.env

DEDALO_CODE_SERVER_GIT_DIR `string`

This parameter defines the path to git directory in the server. It use to build the version with for specific version.
GIT directory is a valid git server than can provide the build version.
This parameter is not necessary if the server will be only a mirror from official files.


```bash
DEDALO_CODE_SERVER_GIT_DIR="/my_dedalo_git_directory"
```

---

### Defining server code provider

../private/.env

CODE_SERVERS `array`

This parameter defines the code servers this install offers releases from. By default the server defines the official Dédalo code server, but you can include other mirror servers by adding entries to the array. Each entry is a JSON object with `name`, `url` and `code`.

```bash
CODE_SERVERS=[{"name":"Official Dédalo code server","url":"https://master.dedalo.dev/core/api/v1/json/","code":"x3a0B4Y020Eg9w"}]
```

---

### Defining source versions local directory to save the new code

../private/.env

DEDALO_SOURCE_VERSION_LOCAL_DIR `string`

This parameter defines the path to the local directory to save the new code downloaded from the master server repository.

```bash
DEDALO_SOURCE_VERSION_LOCAL_DIR="/tmp/my_museum"
```

---

### Defining ip api service

../private/.env

IP_API `array`

Defines the service to be used in section Activity to resolve source Country from IP address.

By default Dédalo use the ipapi.co service with free unsigned account. Is possible to configure other services with your specific account. If you want to use a http instead https you can use `ip-api.com`

```bash
IP_API={"url":"https://api.country.is/$ip","href":"https://ip-api.com/#$ip","country_code":"country"}
```

!!! note "IP variable"
    `$ip` string will be replaced by the real IP value in resolution and 'country_code' value property is used to generate the icon flag.

    The URL must be in the format that the provider requires.

---

