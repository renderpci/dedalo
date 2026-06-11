# Configuration Reference

All Dédalo configuration is managed through the `/private/.env` file. The `config/bootstrap.php` file is scaffolding that defines constants with safe defaults — **do not edit `bootstrap.php` to change values**. Instead, set or uncomment the corresponding key in your `.env` file.

## How to change a configuration value

1. Locate the `.env` file in the `/private/` directory

    ```shell
    nano /private/.env
    ```

2. Find (or add) the KEY and set the proper value

    ```ini
    DEDALO_ENTITY=my_entity_name
    ```

3. Save the file — changes take effect on the next request

> Constants not present in `.env` fall back to their defaults defined in `bootstrap.php`. You only need to set values that differ from the defaults.

### .env value types

| Type | Format | Example |
| --- | --- | --- |
| String | Plain text | `DEDALO_ENTITY=my_entity` |
| Boolean | true/false, yes/no, 1/0, on/off | `DEVELOPMENT_SERVER=true` |
| Integer | Numeric | `DEDALO_MAX_ROWS_PER_PAGE=10` |
| Array | JSON-encoded | `DEDALO_PREFIX_TIPOS=["dd","rsc","ontology"]` |
| Object | JSON-encoded | `MAGICK_CONFIG={"remove_layer_0":false}` |
| Null | Empty value | `DEDALO_SOCKET_CONN=` |

---

## Constant categories

Constants fall into two categories:

1. **Configurable via .env** — entity-specific values like `DEDALO_ENTITY`, database credentials, language settings, etc.
2. **Structural / computed** — derived from `__FILE__`, other constants, or runtime state. These are auto-calculated by `bootstrap.php` and **cannot** be set in `.env`.

Structural constants are noted with a *computed* label below.

---

## **Main variables:** Paths

### Defining host

DEDALO_HOST `string` *computed*

This parameter uses the name of the domain or IP of your installation. It is computed from `$_SERVER['HTTP_HOST']` (web) or `DEDALO_HOST` env var (CLI). Not configurable via `.env`.

---

### Defining protocol

DEDALO_PROTOCOL `string` *computed*

This parameter defines the internet protocol used by the server. It is computed from `$_SERVER['HTTPS']`. Not configurable via `.env`.

---

### Defining root path

DEDALO_ROOT_PATH `string` *computed*

This parameter defines the root directory for Dédalo installation. It is computed from `dirname(__FILE__, 2)`. Not configurable via `.env`.

> Usually `DEDALO_ROOT_PATH` will be: `/home/www/httpdocs/dedalo`

---

### Defining root web directory

DEDALO_ROOT_WEB `string` *computed*

Used to define the URI path to the root Dédalo installation. It is computed from `$_SERVER["REQUEST_URI"]`. Not configurable via `.env`.

> Example: `/dedalo`

---

### Defining base paths

The following directory name constants are structural and computed by `bootstrap.php`:

DEDALO_CONFIG `string` *computed* — `'config'`
DEDALO_CORE  `string` *computed* — `'core'`
DEDALO_SHARED `string` *computed* — `'shared'`
DEDALO_TOOLS `string` *computed* — `'tools'`
DEDALO_LIB  `string` *computed* — `'lib'`

---

### Defining config path

DEDALO_CONFIG_PATH `string` *computed*

Used to define the main config directory. Computed from `DEDALO_ROOT_PATH . '/config'`. Not configurable via `.env`.

---

### Defining core path

DEDALO_CORE_PATH `string` *computed*

Defines the core directory. Computed from `DEDALO_ROOT_PATH . '/core'`. Not configurable via `.env`.

---

### Defining core URL

DEDALO_CORE_URL `string` *computed*

Defines the URI for the core directory. Computed from `DEDALO_ROOT_WEB . '/core'`. Not configurable via `.env`.

---

### Defining shared path

DEDALO_SHARED_PATH `string` *computed*

Defines the shared directory path. Computed from `DEDALO_ROOT_PATH . '/shared'`. Not configurable via `.env`.

---

### Defining shared URL

DEDALO_SHARED_URL `string` *computed*

Defines the URI for the shared directory. Computed from `DEDALO_ROOT_WEB . '/shared'`. Not configurable via `.env`.

> Example: `https://dedalo.dev/dedalo/shared/`

---

### Defining tools path

DEDALO_TOOLS_PATH `string` *computed*

Defines the tools directory path. Computed from `DEDALO_ROOT_PATH . '/tools'`. Not configurable via `.env`.

---

### Defining tools URL

DEDALO_TOOLS_URL `string` *computed*

Defines the URI for the tools directory. Computed from `DEDALO_ROOT_WEB . '/tools'`. Not configurable via `.env`.

---

### Defining lib path

DEDALO_LIB_PATH `string` *computed*

Used to define the libraries directory path. Computed from `DEDALO_ROOT_PATH . '/lib'`. Not configurable via `.env`.

---

### Defining library URI

DEDALO_LIB_URL `string` *computed*

This parameter defines the URI path for the lib directory. Computed from `DEDALO_ROOT_WEB . '/lib'`. Not configurable via `.env`.

> Example: `https://dedalo.dev/dedalo/lib/`

---

### Defining widgets path

DEDALO_WIDGETS_PATH `string` *computed*

This parameter defines the widgets path. Computed from `DEDALO_CORE_PATH . '/widgets'`. Not configurable via `.env`.

---

### Defining widgets URL

DEDALO_WIDGETS_URL `string` *computed*

This parameter defines the URI for widgets directory. Computed from `DEDALO_CORE_URL . '/widgets'`. Not configurable via `.env`.

> Example: `https://dedalo.dev/dedalo/core/widgets/`

---

### Defining extras path

DEDALO_EXTRAS_PATH  `string` *computed*

This parameter defines the extras path directory. Computed from `DEDALO_CORE_PATH . '/extras'`. Not configurable via `.env.

> Example: `/home/www/httpdocs/dedalo/core/extras`

---

### Defining extras URI

DEDALO_EXTRAS_URL  `string` *computed*

This parameter defines the extras URI directory. Computed from `DEDALO_CORE_URL . '/extras'`. Not configurable via `.env`.

> Example: `https://dedalo.dev/dedalo/core/extras`

---

### Defining install path

DEDALO_INSTALL_PATH  `string` *computed*

This parameter defines the install path directory. Computed from `DEDALO_ROOT_PATH . '/install'`. Not configurable via `.env`.

---

### Defining install URI

DEDALO_INSTALL_URL  `string` *computed*

This parameter defines the install URI directory. Computed from `DEDALO_ROOT_WEB . '/install'`. Not configurable via `.env`.

> Example: `https://master.dedalo.dev/dedalo/install`

---

## Salt

### Defining salt string (string used for encryption)

DEDALO_SALT_STRING `string`

Salt string to be used by the encryption system. Used to generate random string that is added to each password as part of the hashing process.

```ini
DEDALO_SALT_STRING=My_secure_Salt_String!_2046
```

> **Security-critical**: This value MUST be explicitly set in `.env`. The default `'dedalo_six'` is only for development.

## Locale

### Defining time zone

DEDALO_TIMEZONE `string`

Used to define the time zone of the project. It could be different from the server installation or the Linux timezone. The time zone will be used to store the timestamps of the changes done by the users.

```ini
DEDALO_TIMEZONE=Europe/Madrid
```

> Default: `UTC`

---

### Defining locale encoding

DEDALO_LOCALE `string`

Defines the internal PHP locale to be used to encode text. By default Dédalo uses UTF8 encoding.

```ini
DEDALO_LOCALE=es-ES
```

> Default: `C.UTF-8`

---

### Defining date order

DEDALO_DATE_ORDER `string`

Defines the default order for the date input by users and to be shown in `component_date`. By default Dédalo uses dmy (European date format).

Options:

* dmy : common way order day/month/year
* mdy : USA way order month/day/year
* ymd : China, Japan, Korean, Iran way year/month/day

```ini
DEDALO_DATE_ORDER=dmy
```

> Default: `dmy`

## Entity

### Defining entity

DEDALO_ENTITY `string`

This parameter defines the name of the entity proprietary of the Dédalo installation. Dédalo entity will be used to access databases, encrypt passwords, and publish data into the specific publication ontology. It should NOT be changed after installation.

```ini
DEDALO_ENTITY=my_entity_name
```

> Use secure characters to define the entity, without spaces, accents or other special characters that could create conflicts with other server parts, such as database connection. If you want to define the full name of the entity, use `DEDALO_ENTITY_LABEL`.

> Default: `development`

---

### Defining entity label

DEDALO_ENTITY_LABEL `string`

Defines the entity label, the real name of the entity. Since the entity definition is used to encrypt passwords or access databases, sometimes you will need to define the real name of the entity with characters such as 'ñ' or accents.

```ini
DEDALO_ENTITY_LABEL=Museu de Prehistòria de València
```

> Default: same as `DEDALO_ENTITY`

---

### Entity id

DEDALO_ENTITY_ID `int`

This parameter defines the normalized ID for the entity. The ID of the entity could be used to create a locator to obtain information between Dédalo installations.

```ini
DEDALO_ENTITY_ID=0
```

> Default: `0`

---

### Developer server

DEVELOPMENT_SERVER `bool`

It defines if the server will be used for development tasks. When the server is defined as a developer server, Dédalo will activate the debug mode and will add the developer sections in the menu.

With the debugger active Dédalo will show many messages in the PHP log and JS console, taking time to process the data. Do not use developer mode in a production server.

```ini
DEVELOPMENT_SERVER=false
```

> Default: `false`

---

### Is production

IS_PRODUCTION `bool`

Computed from `!DEVELOPMENT_SERVER` by default. Set explicitly in `.env` to override.

```ini
IS_PRODUCTION=true
```

> Default: opposite of `DEVELOPMENT_SERVER`

---

### Binary base path

DEDALO_BINARY_BASE_PATH `string`

Path to the directory containing binary tools (ffmpeg, magick, ffprobe, etc.). Used to construct paths for media processing tools.

```ini
DEDALO_BINARY_BASE_PATH=/usr/bin
```

> Default: `/usr/bin`
>
> On macOS Homebrew: `/opt/homebrew/bin`

## Sessions

### Session handler

DEDALO_SESSION_HANDLER `string`

Defines the session handler to use. Options: `files`, `redis`, `memcached`.

```ini
DEDALO_SESSION_HANDLER=redis
```

> Default: `files`

---

### Session save path

DEDALO_SESSION_SAVE_PATH `string`

The save path for the session handler. For Redis, use `tcp://host:port` or `unix:///path/to/redis.sock`. For files, the computed `DEDALO_SESSIONS_PATH` is used.

```ini
DEDALO_SESSION_SAVE_PATH=tcp://127.0.0.1:6379
```

> Default: computed from `DEDALO_SESSION_HANDLER`

## Cache + debug

### Cache path

DEDALO_CACHE_PATH `string`

Defines the cache directory path.

```ini
DEDALO_CACHE_PATH=/path/to/cache
```

> Default: `{parent_of_root}/cache`

---

### Show debug

SHOW_DEBUG `bool`

Sets the debug mode. When true, Dédalo will show debug information in the interface and log verbose messages.

```ini
SHOW_DEBUG=true
```

> Default: `false` (auto-enabled for superuser)

---

### Show developer

SHOW_DEVELOPER  `bool`

Sets, as environment constant, the current logged user profile status (developer: bool true/false). This value is set in the user record option 'Developer' by Dédalo administrators and stored in session on login.

When true, the logged user can access and view specific develop information like component configuration (tipo, parent, etc.) hidden to regular users.

```ini
# SHOW_DEVELOPER=false
```

> Default: auto-detected from logged user session

## Loader / required

Loader and includes are handled automatically by `bootstrap.php`. Not configurable via `.env`.

## Backup variables

### Defining backup on login

DEDALO_BACKUP_ON_LOGIN  `bool`

This parameter defines if Dédalo will do a backup when users login. It prevents that issues doing to the data could be repaired quickly.

If this constant is set to `true` Dédalo will check if the last backup is a copy done after the time defined by `DEDALO_BACKUP_TIME_RANGE` and will create a new one if the time exceeds this parameter.

```ini
DEDALO_BACKUP_ON_LOGIN=true
```

> Default: `true`

---

### Defining backup time range

DEDALO_BACKUP_TIME_RANGE `int`

This parameter defines the time lapse between backup copies in hours. Dédalo checks on every user login if the last backup exceeds this time lapse; if so, it will create a new one.

```ini
DEDALO_BACKUP_TIME_RANGE=8
```

> Default: `8`

---

### Defining backups directory

DEDALO_BACKUP_PATH `string`

This parameter defines the backups directory path. By default the backups directory will be out of httpdocs scope for security.

```ini
DEDALO_BACKUP_PATH=/var/backups/dedalo
```

> Default: `{two_levels_up_from_root}/backups`

---

### Defining temporary backup

DEDALO_BACKUP_PATH_TEMP `string`

This parameter defines the temporary backups directory path. Dédalo will use this directory to store download ontology data before updating the ontology.

```ini
DEDALO_BACKUP_PATH_TEMP=/var/backups/dedalo/temp
```

> Default: `{DEDALO_BACKUP_PATH}/temp`

---

### Defining main db backup

DEDALO_BACKUP_PATH_DB `string`

This parameter defines the main database backups directory path. Dédalo will use this directory to store the full backup of PostgreSQL.

```ini
DEDALO_BACKUP_PATH_DB=/var/backups/dedalo/db
```

> Default: `{DEDALO_BACKUP_PATH}/db`

---

### Defining ontology backup

DEDALO_BACKUP_PATH_ONTOLOGY `string`

This parameter defines the main ontology backups directory path. Dédalo will use this directory to store the full ontology backup.

```ini
DEDALO_BACKUP_PATH_ONTOLOGY=/var/backups/dedalo/ontology
```

> Default: `{DEDALO_BACKUP_PATH}/ontology`

## Logs and errors

Store application activity data info and errors into `activity` table in DDBB.

---

### Logger level

LOGGER_LEVEL `class constant` *computed*

This parameter defines the level of the information shown in the logger. It is computed from `SHOW_DEBUG` / `SHOW_DEVELOPER`. Not configurable via `.env`.

| Level error codes ||
| --- | --- |
| DEBUG | 100 |
| INFO | 75 |
| NOTICE | 50 |
| WARNING | 25 |
| ERROR | 10 |
| CRITICAL| 5 |

> Note that log output files are defined in the `php.ini` config file / `error_log` definition like `/var/log/fpm-php.log`. You can view the server log using terminal command `tail -f /var/log/php_errors.log` with your own log path.

---

### Activity log database

Dédalo stores the activity in the table `matrix_activity` in PostgreSQL. The logger is configured automatically by `bootstrap.php`. Not configurable via `.env`.

---

### Update log file

UPDATE_LOG_FILE `string` *computed*

Defines the directory path to store the update log. Computed from `DEDALO_CONFIG_PATH . '/update.log'`. Not configurable via `.env`.

---

## Languages

### Defining structure lang

DEDALO_STRUCTURE_LANG `string`

This parameter defines the default language that the ontology will use as main language. The ontology (abstracted structure) is the definition of areas, sections, fields, connections between data and definition models. All terms used in the ontology can be translated to any language, but this main language defined here will be used as mandatory language. If Dédalo is configured in another language that is not defined in the ontology translations, Dédalo will fall back to this main language.

This parameter does not define the main data language; it only affects the Dédalo interface and definitions in the ontology.

```ini
DEDALO_STRUCTURE_LANG=lg-spa
```

> For the languages, Dédalo uses the pattern: `lg-xxx`
> lg : identifies the term as language
> xxx : with the official TLD of the ISO 639-6, Alpha-4 code for comprehensive coverage of language variants.
>
> Some common languages:
>
> | Value | Diffusion language |
> | --- | --- |
> | lg-spa | Spanish |
> | lg-cat | Catalan |
> | lg-eus | Basque |
> | lg-eng | English |
> | lg-fra | French |
> | lg-ita | Italian |
> | lg-por | Portuguese |
> | lg-deu | German |
> | lg-ara | Arabian |
> | lg-ell | Greek |
> | lg-rus | Russian |
> | lg-ces | Czech |
> | lg-jpn | Japanese |

> Default: `lg-spa`

---

### Defining application languages

DEDALO_APPLICATION_LANGS `object` (JSON-encoded associative array)

This parameter defines the languages that Dédalo will use for the data and user interface. Dédalo is a true multi-language application; any text field can be defined as translatable, and this configuration defines the languages the installation will use to store and translate text data.

```ini
DEDALO_APPLICATION_LANGS={"lg-spa":"Castellano","lg-cat":"Català","lg-eus":"Euskara","lg-eng":"English","lg-fra":"French"}
```

> Default: `{"lg-eng":"English","lg-spa":"Castellano","lg-cat":"Català","lg-eus":"Euskara","lg-fra":"Français","lg-por":"Português","lg-deu":"Deutsch","lg-ita":"Italiano","lg-ell":"Ελληνικά","lg-nep":"नेपाली"}`

---

### Defining default application language

DEDALO_APPLICATION_LANGS_DEFAULT `string`

Defines the main language used in the user interface.

Dédalo can be translated into any language defined in `DEDALO_APPLICATION_LANGS`. This parameter defines which language will be used by default when a user starts a session.

```ini
DEDALO_APPLICATION_LANGS_DEFAULT=lg-eng
```

> Default: `lg-eng`

---

### Defining data lang default

DEDALO_DATA_LANG_DEFAULT `string`

Defines the default data language. This is the language that Dédalo will use to show the data when the user starts a session.

```ini
DEDALO_DATA_LANG_DEFAULT=lg-eng
```

> Default: `lg-eng`

---

### Defining data lang selector

DEDALO_DATA_LANG_SELECTOR `bool`

Defines if the data language selector will be shown in the interface. When true, users can switch the data language from the interface.

```ini
DEDALO_DATA_LANG_SELECTOR=true
```

> Default: `true`

---

### Defining data lang sync

DEDALO_DATA_LANG_SYNC `bool`

Defines if the data language will be synced with the application language. When true, changing the application language will also change the data language.

```ini
DEDALO_DATA_LANG_SYNC=false
```

> Default: `false`

---

### Defining no language

DEDALO_DATA_NOLAN `string`

Defines the no-language code used for data that is not language-specific (numbers, dates, etc.).

```ini
DEDALO_DATA_NOLAN=lg-nolan
```

> Default: `lg-nolan`

---

### Defining projects default languages

DEDALO_PROJECTS_DEFAULT_LANGS `array` (JSON)

Defines the default languages for projects.

```ini
DEDALO_PROJECTS_DEFAULT_LANGS=["lg-spa","lg-cat","lg-eng","lg-fra"]
```

> Default: `["lg-eng","lg-spa","lg-cat","lg-fra"]`

---

### Defining diffusion languages

DEDALO_DIFFUSION_LANGS `array` (JSON)

Defines the languages used for diffusion / publication.

```ini
DEDALO_DIFFUSION_LANGS=["lg-spa","lg-cat","lg-eng","lg-fra"]
```

> Default: `["lg-eng","lg-spa","lg-cat","lg-fra"]`

---

## Default config values

### Defining prefix tipos

DEDALO_PREFIX_TIPOS `array` (JSON)

Defines the ontology TLD prefixes used in the installation.

```ini
DEDALO_PREFIX_TIPOS=["dd","rsc","ontology","hierarchy","lg","utoponymy","oh","ich","nexus","actv"]
```

> Default: `["dd","rsc","ontology","ontologytype","hierarchy","lg","utoponymy","oh","ich","nexus","actv"]`

---

### Defining main fallback section

MAIN_FALLBACK_SECTION `string`

Defines the main section to use as fallback when no specific section is found.

```ini
MAIN_FALLBACK_SECTION=oh1
```

> Default: `oh1`

---

### Defining numerical matrix value for yes

NUMERICAL_MATRIX_VALUE_YES `int`

Definition of the section_id of the 'yes' value. This value is used to access directly to this value without calling the database.

```ini
NUMERICAL_MATRIX_VALUE_YES=1
```

> Default: `1`

---

### Defining numerical matrix value for no

NUMERICAL_MATRIX_VALUE_NO `int`

Definition of the section_id of the 'no' value. This value is used to access directly to this value without calling the database.

```ini
NUMERICAL_MATRIX_VALUE_NO=2
```

> Default: `2`

---

### Defining maximum rows per page

DEDALO_MAX_ROWS_PER_PAGE `int`

It defines the maximum rows that will be loaded in the lists.

This value is the default number of rows that Dédalo will load, but it is possible to change this value directly in the filter by the users. When they make a search, if the user does not define the maximum rows, Dédalo will use the value of this parameter.

```ini
DEDALO_MAX_ROWS_PER_PAGE=10
```

> Default: `10`

---

### Defining default profile

DEDALO_PROFILE_DEFAULT `int`

This parameter defines the section_id of the default profile that Dédalo will use to create new users.

The profile defines where the user can access inside the system, and if they can access tools or administrative areas. By default Dédalo will use the profile definition for normal 'users' (section_id: 2; section_id: 1 is for administrator users).

```ini
DEDALO_PROFILE_DEFAULT=2
```

> Default: `2`

---

### Defining default project

DEDALO_DEFAULT_PROJECT `int`

This parameter defines the default project that Dédalo will use to create new sections (records in the DDBB).

Dédalo uses the project component (`component_filter`) to group sections by research criteria. The project field is mandatory in every section, because a user that can access a project will not see the records of other projects. If the user forgets to introduce project data, Dédalo will use this parameter.

```ini
DEDALO_DEFAULT_PROJECT=1
```

> Default: `1`

---

### Defining filter section tipo default

DEDALO_FILTER_SECTION_TIPO_DEFAULT `string` *computed*

This parameter defines the section that has the project information inside the ontology. Computed from `DEDALO_SECTION_PROJECTS_TIPO`. Not configurable via `.env`.

> By default this definition gets the section_tipo from the predefined constant `DEDALO_SECTION_PROJECTS_TIPO` inside `dd_tipos.php` file. Do not change this param.

---

### Defining defaults values for components

CONFIG_DEFAULT_FILE_PATH `string`  *optional*

This parameter defines the path to the default values definition file for components.

Defaults values are specific data to be entered into the component when a section is created; empty values are not allowed in components with default data — the component will replace empty data with the default value.

Usually the component defines its own defaults data in the ontology, but it is possible to change it in local installations by creating a `config_defaults.json` file in the config directory.

```ini
CONFIG_DEFAULT_FILE_PATH=/path/to/dedalo/config/config_defaults.json
```

Example to change the default data for the publishable component [rsc279](https://dedalo.dev/ontology/rsc279), in the ontology the component has a default value of "no" (section_id 2 of section [dd64](https://dedalo.dev/ontology/dd64)). To change to 'Yes' (section_id 1), the `config_defaults.json` needs:

```json
[{
    "tipo": "rsc279",
    "type": "component",
    "tld": "rsc",
    "value": [
        {
            "section_id": "1",
            "section_tipo": "dd64"
        }
    ]
}]
```

| Property | Value | Remark |
| --- | --- | --- |
| tipo | string: ontology tipo | The unique tipo for the component or section |
| type | string: ontology type of the node | defines the type of the node: component \| section |
| tld | string: ontology tld of the node | defines the ontology group of tipos (dd, rsc, oh, tch, tchi, etc.) |
| value | string \| array of locator/s \| object: the default value for the component | If the component is a related component it will be the locator, note that locator needs to be inside an array; if the component is literal it will be compatible data as text or date |

---

## Media variables

Media (images, PDF, audiovisual, SVG, etc.) are files that Dédalo uses inside sections.

Media is referenced by locator and all files are named in the server with the locator that calls them. Dédalo has a media directories definition that can be changed with these parameters.

---

### Defining media directory name

DEDALO_MEDIA_DIR_NAME `string`

Defines the name of the media directory. This is the only media path constant configurable via `.env`; all other media paths are computed from it.

```ini
DEDALO_MEDIA_DIR_NAME=media_development
```

> Default: `media`

---

### Defining media base path

DEDALO_MEDIA_PATH `string` *computed*

This parameter defines the root media directory in the directory tree. Computed from `DEDALO_ROOT_PATH . '/' . DEDALO_MEDIA_DIR_NAME`. Not configurable via `.env`.

---

### Defining media base URL

DEDALO_MEDIA_URL `string` *computed*

This parameter defines the root media URL to be accessed by the client. Computed from `DEDALO_ROOT_WEB . '/' . DEDALO_MEDIA_DIR_NAME`. Not configurable via `.env`.

---

### Thumb

Thumb media are small images to be used in lists; all media has a thumb image to represent the media.

#### Defining image thumb extension

DEDALO_THUMB_EXTENSION `string`

This parameter defines the standard file type of thumb files.

```ini
DEDALO_THUMB_EXTENSION=jpg
```

> Default: `jpg`

---

#### Defining image thumb quality

DEDALO_QUALITY_THUMB `string`

This parameter defines the thumb quality definition that can be used for compressing media files.

This parameter will be used to compress and store image files used in lists.

| Media | Remark |
| --- | --- |
| PDF | Will render the first page of the document in quality; if the default image does not exist it will try to use the original quality.|
| AV | Will render the posterframe.|
| Image | Will render the default quality; if the default image does not exist it will try to use the original quality.|
| SVG | Will render the default quality; if the default image does not exist it will try to use the original quality.|
| 3d | Will render the posterframe.|

```ini
DEDALO_QUALITY_THUMB=thumb
```

> Default: `thumb`

---

#### Defining image thumb width size

DEDALO_IMAGE_THUMB_WIDTH `int`

This parameter defines width size in pixels for thumb images.

```ini
DEDALO_IMAGE_THUMB_WIDTH=222
```

> Default: `222`

---

#### Defining image thumb height size

DEDALO_IMAGE_THUMB_HEIGHT `int`

This parameter defines height size in pixels for thumb images.

```ini
DEDALO_IMAGE_THUMB_HEIGHT=148
```

> Default: `148`

---

### Audiovisual

Audiovisual media includes video and audio files; it uses a posterframe to represent the file as the original quality.

#### Defining audiovisual directory

DEDALO_AV_FOLDER `string`

This parameter defines the main directory for the audiovisual files.

```ini
DEDALO_AV_FOLDER=/av
```

> Default: `/av`

---

#### Defining audiovisual extension (type of file)

DEDALO_AV_EXTENSION `string`

This parameter defines the standard file type of audiovisual files.

By default Dédalo uses mp4 standard definition for the audiovisual files. All other formats will be compressed to this standard.

```ini
DEDALO_AV_EXTENSION=mp4
```

> Default: `mp4`

---

#### Defining audiovisual extensions supported

DEDALO_AV_EXTENSIONS_SUPPORTED `array` (JSON)

This parameter defines the standard file types admitted for audiovisual files.

```ini
DEDALO_AV_EXTENSIONS_SUPPORTED=["mp4","wave","wav","aiff","aif","mp3","mov","avi","mpg","mpeg","vob","zip","flv"]
```

> Default: `["mp4","wave","wav","aiff","aif","mp3","mov","avi","mpg","mpeg","vob","zip","flv"]`

---

#### Defining audiovisual mime type

DEDALO_AV_MIME_TYPE `string`

This parameter defines the standard mime type for audiovisual files.

```ini
DEDALO_AV_MIME_TYPE=video/mp4
```

> Default: `video/mp4`

---

#### Defining audiovisual type

DEDALO_AV_TYPE `string`

This parameter defines the standard codec type for audiovisual files.

```ini
DEDALO_AV_TYPE=h264/AAC
```

> Default: `h264/AAC`

---

#### Defining audiovisual quality for original files

DEDALO_AV_QUALITY_ORIGINAL `string`

This parameter defines the quality original for audiovisual files.

```ini
DEDALO_AV_QUALITY_ORIGINAL=original
```

> Default: `original`

---

#### Defining audiovisual default quality

DEDALO_AV_QUALITY_DEFAULT `string`

This parameter defines the default quality used for audiovisual files.

```ini
DEDALO_AV_QUALITY_DEFAULT=404
```

> Default: `404`

---

#### Defining audiovisual qualities definition

DEDALO_AV_AR_QUALITY `array` (JSON)

This parameter defines the different qualities that can be used for compressing audiovisual files.

```ini
DEDALO_AV_AR_QUALITY=["original","1080","720","576","404","240","audio"]
```

> Default: `["original","1080","720","576","404","240","audio"]`

---

#### Defining audiovisual posterframe extension

DEDALO_AV_POSTERFRAME_EXTENSION `string`

This parameter defines the file extension for the posterframe image of audiovisual files.

```ini
DEDALO_AV_POSTERFRAME_EXTENSION=jpg
```

> Default: `jpg`

---

#### Defining audiovisual streamer

DEDALO_AV_STREAMER `string` *optional*

This parameter defines the streaming server URL.

```ini
DEDALO_AV_STREAMER=
```

> Default: not set

---

#### Defining subtitles folder

DEDALO_SUBTITLES_FOLDER `string`

This parameter defines the folder for subtitle files.

```ini
DEDALO_SUBTITLES_FOLDER=/subtitles
```

> Default: `/subtitles`

---

#### Defining subtitles extension

DEDALO_AV_SUBTITLES_EXTENSION `string`

This parameter defines the file extension for subtitle files.

```ini
DEDALO_AV_SUBTITLES_EXTENSION=vtt
```

> Default: `vtt`

---

#### Defining audiovisual re-compress all uploaded files

DEDALO_AV_RECOMPRESS_ALL `int`

This parameter defines if Dédalo will process all audiovisual files uploaded to the server to the default quality.

By default Dédalo will compress all files (1 value), but it can be deactivated with 0 value.

```ini
DEDALO_AV_RECOMPRESS_ALL=1
```

> Default: `1`

---

### Image

#### Defining image directory

DEDALO_IMAGE_FOLDER `string`

This parameter defines the main directory for the image files.

```ini
DEDALO_IMAGE_FOLDER=/image
```

> Default: `/image`

---

#### Defining image extension (type of file)

DEDALO_IMAGE_EXTENSION `string`

This parameter defines the standard file type of image files.

By default Dédalo uses jpg standard definition for image files. All other formats will be compressed to this standard.

```ini
DEDALO_IMAGE_EXTENSION=jpg
```

> Default: `jpg`

---

#### Defining image mime type

DEDALO_IMAGE_MIME_TYPE `string`

This parameter defines the standard mime type for image files.

```ini
DEDALO_IMAGE_MIME_TYPE=image/jpeg
```

> Default: `image/jpeg`

---

#### Defining image type

DEDALO_IMAGE_TYPE `string`

This parameter defines the standard type for image files.

```ini
DEDALO_IMAGE_TYPE=jpeg
```

> Default: `jpeg`

---

#### Defining image extensions supported

DEDALO_IMAGE_EXTENSIONS_SUPPORTED `array` (JSON)

This parameter defines the standard file types admitted for image files.

```ini
DEDALO_IMAGE_EXTENSIONS_SUPPORTED=["jpg","jpeg","png","tif","tiff","bmp","psd","raw","webp","heic","avif"]
```

> Default: `["jpg","jpeg","png","tif","tiff","bmp","psd","raw","webp","heic","avif"]`

#### Defining alternative image extensions of image files

DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS `array` (JSON) *optional*

This parameter defines the standard file types that will be used to create versions of the uploaded image files.

Dédalo will use this parameter to create alternative versions of uploaded images. This parameter is optional. When active, every uploaded image will be processed in every quality with every format defined.

```ini
DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS=["avif","png"]
```

Example:

Original file: **my_image.tif**

Default format defined in `DEDALO_IMAGE_EXTENSION`: **jpg**

Alternatives formats defined in `DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS`: **\['avif','png'\]**

Result:

In original quality directory:
> `../media/image/original/rsc29_rsc170_1.tif`
> `../media/image/original/rsc29_rsc170_1.jpg`
> `../media/image/original/rsc29_rsc170_1.avif`
> `../media/image/original/rsc29_rsc170_1.png`

In 1.5MB quality directory:
> `../media/image/1.5MB/rsc29_rsc170_1.jpg`
> `../media/image/1.5MB/rsc29_rsc170_1.avif`
> `../media/image/1.5MB/rsc29_rsc170_1.png`

> Default: `[]`

---

#### Defining image quality for original files

DEDALO_IMAGE_QUALITY_ORIGINAL `string`

This parameter defines the quality original for image files.

```ini
DEDALO_IMAGE_QUALITY_ORIGINAL=original
```

> Default: `original`

---

#### Defining image quality for the retouched files

DEDALO_IMAGE_QUALITY_RETOUCHED `string`

This parameter defines the quality for retouched image files.

Retouched images are processed images to improve the image (color balance, background removed, contrasted, etc.)

```ini
DEDALO_IMAGE_QUALITY_RETOUCHED=modified
```

> Default: `modified`

---

#### Defining image default quality

DEDALO_IMAGE_QUALITY_DEFAULT `string`

This parameter defines the default quality used for image files.

By default Dédalo uses 1.5MB file size (524.217px or 887x591px) quality.

```ini
DEDALO_IMAGE_QUALITY_DEFAULT=1.5MB
```

> Default: `1.5MB`

---

#### Defining image thumb default

DEDALO_IMAGE_THUMB_DEFAULT `string` *deprecated; use DEDALO_QUALITY_THUMB*

> Default: `thumb`

---

#### Defining image qualities definition

DEDALO_IMAGE_AR_QUALITY `array` (JSON)

This parameter defines the different qualities that can be used for compressing image files.

```ini
DEDALO_IMAGE_AR_QUALITY=["original","modified","100MB","25MB","6MB","1.5MB","thumb"]
```

> Default: `["original","modified","100MB","25MB","6MB","1.5MB","thumb"]`

---

#### Defining image print resolution definition

DEDALO_IMAGE_PRINT_DPI `int`

This parameter defines the resolution in pixels per inch for image compression when printing.

```ini
DEDALO_IMAGE_PRINT_DPI=150
```

> Default: `150`

---

#### Defining image engine processor URL

DEDALO_IMAGE_FILE_URL `string` *computed*

This parameter defines the image processor engine URL. Computed from `DEDALO_CORE_URL . '/media_engine/img.php'`. Not configurable via `.env`.

---

#### Defining Image Magick path

MAGICK_PATH `string` *computed*

This parameter defines the path to ImageMagick library. Computed from `DEDALO_BINARY_BASE_PATH . '/'`. Not configurable via `.env`.

> Set `DEDALO_BINARY_BASE_PATH` in `.env` to change the ImageMagick binary location.

---

#### Defining Image Magick configuration

MAGICK_CONFIG `object` (JSON)

This constant defines the configuration parameters of ImageMagick library.

ImageMagick has different behaviors for transparent images; in some OS the library can detect opacity, in others not. `MAGICK_CONFIG` allows setting specific behavior for every installation.

```ini
MAGICK_CONFIG={"remove_layer_0":false,"is_opaque":null}
```

**remove_layer0** `bool`, by default `false`

Use to control the composition layer of transparent tiff; when set as true Dédalo will remove the layer 0 before processing the image.

**is_opaque** `bool|null`, by default `null`

Use to force opacity detection across different OS / ImageMagick versions.

> Default: `{"remove_layer_0":false,"is_opaque":null}`

---

#### Defining color profiles path

COLOR_PROFILES_PATH `string` *computed*

This parameter defines the path to ICC color profiles. Computed from `DEDALO_CORE_PATH . '/media_engine/lib/color_profiles_icc/'`. Not configurable via `.env`.

---

#### Defining image web folder

DEDALO_IMAGE_WEB_FOLDER `string`

This parameter defines the web quality subfolder for images.

```ini
DEDALO_IMAGE_WEB_FOLDER=/web
```

> Default: `/web`

---

### PDF

#### Defining pdf directory

DEDALO_PDF_FOLDER `string`

This parameter defines the main directory for PDF files.

```ini
DEDALO_PDF_FOLDER=/pdf
```

> Default: `/pdf`

---

#### Defining pdf extension (type of file)

DEDALO_PDF_EXTENSION `string`

This parameter defines the standard file type of PDF files.

```ini
DEDALO_PDF_EXTENSION=pdf
```

> Default: `pdf`

---

#### Defining pdf extensions supported

DEDALO_PDF_EXTENSIONS_SUPPORTED `array` (JSON)

This parameter defines the standard file types admitted for PDF files.

```ini
DEDALO_PDF_EXTENSIONS_SUPPORTED=["pdf","doc","pages","odt","ods","rtf","ppt","pages"]
```

> Default: `["pdf","doc","pages","odt","ods","rtf","ppt","pages"]`

---

#### Defining alternative pdf extensions

DEDALO_PDF_ALTERNATIVE_EXTENSIONS `array` (JSON)

This parameter defines alternative file types for PDF files.

```ini
DEDALO_PDF_ALTERNATIVE_EXTENSIONS=["jpg"]
```

> Default: `["jpg"]`

---

#### Defining pdf mime type

DEDALO_PDF_MIME_TYPE `string`

This parameter defines the standard mime type for PDF files.

```ini
DEDALO_PDF_MIME_TYPE=application/pdf
```

> Default: `application/pdf`

---

#### Defining pdf type

DEDALO_PDF_TYPE `string`

This parameter defines the standard type for PDF files.

```ini
DEDALO_PDF_TYPE=pdf
```

> Default: `pdf`

---

#### Defining pdf quality for original files

DEDALO_PDF_QUALITY_ORIGINAL `string`

This parameter defines the quality original for PDF files.

```ini
DEDALO_PDF_QUALITY_ORIGINAL=original
```

> Default: `original`

---

#### Defining pdf default quality

DEDALO_PDF_QUALITY_DEFAULT `string`

This parameter defines the default quality used for PDF files.

```ini
DEDALO_PDF_QUALITY_DEFAULT=web
```

> Default: `web`

---

#### Defining pdf qualities definition

DEDALO_PDF_AR_QUALITY `array` (JSON)

This parameter defines the different qualities for PDF files.

```ini
DEDALO_PDF_AR_QUALITY=["original","web"]
```

> Default: `["original","web"]`

---

#### Pdf automatic transcription engine

PDF_AUTOMATIC_TRANSCRIPTION_ENGINE `string` *computed*

This parameter defines the path to the library, usually [xpdf](http://www.xpdfreader.com/download.html) (pdftotext), used to extract text from PDF files. Computed from `DEDALO_BINARY_BASE_PATH . '/pdftotext'`. Not configurable via `.env`.

> Set `DEDALO_BINARY_BASE_PATH` in `.env` to change the binary location.

---

#### Pdf OCR process

PDF_OCR_ENGINE `string`

This parameter defines the path to the library, usually [ocrmypdf](https://ocrmypdf.readthedocs.io/en/latest/index.html), used for OCR processing of uploaded PDF files.

```ini
PDF_OCR_ENGINE=/usr/bin/ocrmypdf
```

> Default: not set

---

### 3D

#### Defining main 3d directory

DEDALO_3D_FOLDER `string`

This parameter defines the main directory for 3D files.

```ini
DEDALO_3D_FOLDER=/3d
```

> Default: `/3d`

---

#### Defining 3d extension (type of file)

DEDALO_3D_EXTENSION `string`

This parameter defines the standard file type of 3D files.

By default Dédalo uses glb standard definition for 3D files. All other formats will be exported to this standard.

```ini
DEDALO_3D_EXTENSION=glb
```

> Default: `glb`

---

#### Defining 3d extensions supported

DEDALO_3D_EXTENSIONS_SUPPORTED `array` (JSON)

This parameter defines the standard file types admitted for 3D files.

```ini
DEDALO_3D_EXTENSIONS_SUPPORTED=["glb","gltf","obj","fbx","dae","zip"]
```

> Default: `["glb","gltf","obj","fbx","dae","zip"]`

---

#### Defining 3d mime type

DEDALO_3D_MIME_TYPE `string`

This parameter defines the standard mime type for 3D files.

```ini
DEDALO_3D_MIME_TYPE=model/gltf-binary
```

> Default: `model/gltf-binary`

---

#### Defining 3d quality for original files

DEDALO_3D_QUALITY_ORIGINAL `string`

This parameter defines the quality original for 3D files.

```ini
DEDALO_3D_QUALITY_ORIGINAL=original
```

> Default: `original`

---

#### Defining 3d quality for processed files

DEDALO_3D_QUALITY_DEFAULT `string`

This parameter defines the default quality used for 3D files.

```ini
DEDALO_3D_QUALITY_DEFAULT=web
```

> Default: `web`

---

#### Defining 3d thumb default

DEDALO_3D_THUMB_DEFAULT `string`

This parameter defines the thumb quality for 3D files.

```ini
DEDALO_3D_THUMB_DEFAULT=thumb
```

> Default: `thumb`

---

#### Defining 3d qualities definition

DEDALO_3D_AR_QUALITY `array` (JSON)

This parameter defines the different qualities for 3D files.

```ini
DEDALO_3D_AR_QUALITY=["original","web"]
```

> Default: `["original","web"]`

---

#### Defining 3d gltfpack converter

DEDALO_3D_GLTFPACK_PATH `string` *computed*

This parameter defines the gltfpack library path. Computed from `DEDALO_BINARY_BASE_PATH . '/gltfpack'`. Not configurable via `.env`.

> Set `DEDALO_BINARY_BASE_PATH` in `.env` to change the binary location.

---

#### Defining 3d FBX2glTF converter

DEDALO_3D_FBX2GLTF_PATH `string` *computed*

This parameter defines the FBX2glTF library path. Computed from `DEDALO_BINARY_BASE_PATH . '/FBX2glTF'`. Not configurable via `.env`.

---

#### Defining 3d COLLADA2GLTF converter

DEDALO_3D_COLLADA2GLTF_PATH `string` *computed*

This parameter defines the COLLADA2GLTF library path. Computed from `DEDALO_BINARY_BASE_PATH . '/COLLADA2GLTF-bin'`. Not configurable via `.env`.

---

### SVG

#### Defining main directory for svg files

DEDALO_SVG_FOLDER `string`

This parameter defines the main directory for SVG files.

```ini
DEDALO_SVG_FOLDER=/svg
```

> Default: `/svg`

---

#### Defining svg extension (type of file)

DEDALO_SVG_EXTENSION `string`

This parameter defines the standard file type of SVG files.

```ini
DEDALO_SVG_EXTENSION=svg
```

> Default: `svg`

---

#### Defining svg extensions supported

DEDALO_SVG_EXTENSIONS_SUPPORTED `array` (JSON)

This parameter defines the standard file types admitted for SVG files.

```ini
DEDALO_SVG_EXTENSIONS_SUPPORTED=["svg"]
```

> Default: `["svg"]`

---

#### Defining svg mime type

DEDALO_SVG_MIME_TYPE `string`

This parameter defines the standard mime type for SVG files.

```ini
DEDALO_SVG_MIME_TYPE=image/svg+xml
```

> Default: `image/svg+xml`

---

#### Defining svg quality for original files

DEDALO_SVG_QUALITY_ORIGINAL `string`

This parameter defines the quality original for SVG files.

```ini
DEDALO_SVG_QUALITY_ORIGINAL=original
```

> Default: `original`

---

#### Defining svg default quality

DEDALO_SVG_QUALITY_DEFAULT `string`

This parameter defines the default quality for SVG files.

```ini
DEDALO_SVG_QUALITY_DEFAULT=web
```

> Default: `web`

---

#### Defining svg qualities definition

DEDALO_SVG_AR_QUALITY `array` (JSON)

This parameter defines the different qualities for SVG files.

```ini
DEDALO_SVG_AR_QUALITY=["original","web"]
```

> Default: `["original","web"]`

---

### HTML files

#### Defining html files directory

DEDALO_HTML_FILES_FOLDER `string`

This parameter defines the main directory for HTML files.

```ini
DEDALO_HTML_FILES_FOLDER=/html_files
```

> Default: `/html_files`

---

#### Defining html files extension

DEDALO_HTML_FILES_EXTENSION `string`

This parameter defines the standard file type of HTML files.

```ini
DEDALO_HTML_FILES_EXTENSION=html
```

> Default: `html`

---

## Upload variables

### Defining upload service chunk files

DEDALO_UPLOAD_SERVICE_CHUNK_FILES `int`

This parameter defines the number of chunk files used by the upload service.

```ini
DEDALO_UPLOAD_SERVICE_CHUNK_FILES=4
```

> Default: `4`

---

### Defining upload service max concurrent

DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT `int`

This parameter defines the maximum number of concurrent uploads.

```ini
DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT=50
```

> Default: `50`

---

## Geo + entity menu + misc

### Defining geo provider

DEDALO_GEO_PROVIDER `string`

This parameter defines the geo provider to be used.

```ini
DEDALO_GEO_PROVIDER=VARIOUS
```

> Default: `VARIOUS`

---

### Defining entity media area tipo

DEDALO_ENTITY_MEDIA_AREA_TIPO `string`

This parameter defines the tipo of the entity's media area.

```ini
DEDALO_ENTITY_MEDIA_AREA_TIPO=
```

> Default: empty

---

### Defining entity menu skip tipos

DEDALO_ENTITY_MENU_SKIP_TIPOS `array` (JSON)

This parameter defines tipos to be skipped in the entity menu.

```ini
DEDALO_ENTITY_MENU_SKIP_TIPOS=["oh98","dd349","dd355","numisdata1","tch188"]
```

> Default: `[]`

---

### Defining test install

DEDALO_TEST_INSTALL `bool`

This parameter defines if Dédalo will test if it was installed.

On true, checks if the root user has set password at login page; if not set, Dédalo will init the install process.

```ini
DEDALO_TEST_INSTALL=true
```

> Default: `true`

---

### Defining lock components

DEDALO_LOCK_COMPONENTS `bool`

This parameter defines if Dédalo will lock/unlock components to avoid replacement data when more than one user edits the same component.

```ini
DEDALO_LOCK_COMPONENTS=true
```

> Default: `true`

---

### Defining protect media files for external access

DEDALO_PROTECT_MEDIA_FILES `bool`

This parameter defines if the directory of media files will be protected and controlled for undesired/external access.

By default Dédalo does not close the access for media files because they can be accessed by external web pages (false). When active (true), direct access to media files is avoided and only possible via the internal system or the publication API.

```ini
DEDALO_PROTECT_MEDIA_FILES=false
```

> Default: `false`

---

### Defining lock components notifications

DEDALO_NOTIFICATIONS `bool`

This parameter defines if Dédalo will notify the user that other users are editing the same field in the same section.

```ini
DEDALO_NOTIFICATIONS=false
```

> Default: `false`

---

### Defining exclude components

DEDALO_AR_EXCLUDE_COMPONENTS `array` (JSON)

This parameter defines components to be excluded.

Some installations need to block global access to specific components; use this param to remove components by adding the tipo into the array.

```ini
DEDALO_AR_EXCLUDE_COMPONENTS=[]
```

> Default: `[]`

---

### Defining filter user records by id

DEDALO_FILTER_USER_RECORDS_BY_ID `bool`

This parameter defines if sections (records) will be filtered by the section defined in user preferences.

```ini
DEDALO_FILTER_USER_RECORDS_BY_ID=false
```

> Default: `false`

---

### Geonames account

GEONAMES_ACCOUNT_USERNAME `string`

This parameter defines the username of the Geonames account. It is used by development and sync toponymy data to build country hierarchies.

```ini
GEONAMES_ACCOUNT_USERNAME=my_account
```

> Default: not set

---

### Encryption mode

ENCRYPTION_MODE `string`

This parameter defines the encryption engine used to manage the global security system. By default Dédalo uses openSSL to encrypt data.

```ini
ENCRYPTION_MODE=openssl
```

> Default: `openssl`

---

## Diffusion variables

Diffusion defines the configuration variables used by Dédalo to process data and resolve relations to get the version of data defined to be stored into MySQL.

---

### Diffusion domain

DEDALO_DIFFUSION_DOMAIN `string`

This parameter sets the diffusion domain of the project publication. Diffusion domain is the target domain or the part of diffusion ontology that will be used to get the tables, fields, and relation components in the back-end.

```ini
DEDALO_DIFFUSION_DOMAIN=default
```

> Any other 'section_tipo' are accepted and it can be other standard TLDs used in the ontology like oh1 or ich1. If your institution has a specific TLD space in the ontology, you can use your own TLD into the `DEDALO_DIFFUSION_DOMAIN`.

> Default: `default`

---

### Defining resolution levels; going to the deeper information

DEDALO_DIFFUSION_RESOLVE_LEVELS `int`

This parameter sets the number of resolution levels. By default, its value is set to '2'.

The number defines the maximum resolution levels of linked information that Dédalo will resolve in the publication process. Dédalo works with related data connected by locators; every link is a level of information. The parameter limits the quantity of linked data to be resolved in the linked data tree.

Ex: If you have an Oral History interview (level 0) with 1 linked image (level 1) and this image has a person linked as author (level 2) and this author has 1 linked toponym for the birthplace (level 3). For publishing all linked information you need 3 levels of resolution.

If you increase the value of this parameter, the time needed by Dédalo to resolve the linked data will increase in exponential progression.

```ini
DEDALO_DIFFUSION_RESOLVE_LEVELS=2
```

> Default: `2`

---

### Defining media paths resolution

DEDALO_PUBLICATION_CLEAN_URL `bool`

Defines how the paths of the media files will be treated in diffusion processing.

On true, the paths will be simplified to the file name like `rsc37_rsc176_34.pdf` from `/dedalo/media/pdf/web/0/rsc37_rsc176_34.pdf`.

```ini
DEDALO_PUBLICATION_CLEAN_URL=false
```

> Default: `false`

---

### Defining diffusion custom

DIFFUSION_CUSTOM `bool` *optional*

Optional custom diffusion class file path.

It is possible to create additional diffusion class files with static methods to be called from ontology diffusion elements beyond the Dédalo defined diffusion methods.

```ini
DIFFUSION_CUSTOM=false
```

> Default: `false`

---

### Defining API web user code multiple

API_WEB_USER_CODE_MULTIPLE `array` (JSON)

This parameter defines the API web user codes for accessing the publication API.

```ini
API_WEB_USER_CODE_MULTIPLE=[{"db_name":"","code":"","api_ui":null}]
```

> Default: `[{"db_name":"","code":"","api_ui":null}]`

---

### Defining exclude diffusion elements

EXCLUDE_DIFFUSION_ELEMENTS `array` (JSON)

This parameter defines diffusion elements to be excluded.

```ini
EXCLUDE_DIFFUSION_ELEMENTS=[]
```

> Default: `[]`

---

## Structure / ontology / code servers

### Defining structure from server

STRUCTURE_FROM_SERVER `bool`

This parameter defines if the ontology structure will be loaded from a remote server.

```ini
STRUCTURE_FROM_SERVER=true
```

> Default: `true`

---

### Defining is an ontology server

IS_AN_ONTOLOGY_SERVER `bool`

This parameter defines if the server can provide ontology data to other Dédalo servers.

```ini
IS_AN_ONTOLOGY_SERVER=false
```

> Default: `false`

---

### Defining ontology servers

ONTOLOGY_SERVERS `array` (JSON)

This parameter defines ontology server providers. By default the official Dédalo ontology server is defined.

```ini
ONTOLOGY_SERVERS=[{"name":"Official Dédalo Ontology server","url":"https://master.dedalo.dev/dedalo/core/api/v1/json/","code":"x3a0B4Y020Eg9w"}]
```

> Default: official Dédalo ontology server

---

### Defining is a code server

IS_A_CODE_SERVER `bool`

This parameter defines if the server can provide code to other Dédalo servers.

```ini
IS_A_CODE_SERVER=false
```

> Default: `false`

---

### Defining code servers

CODE_SERVERS `array` (JSON)

This parameter defines code server providers.

```ini
CODE_SERVERS=[{"name":"Official Dédalo code server","url":"https://master.dedalo.dev/dedalo/core/api/v1/json/","code":"x3a0B4Y020Eg9w"}]
```

> Default: official Dédalo code server

---

### Defining source version local directory

DEDALO_SOURCE_VERSION_LOCAL_DIR `string`

This parameter defines the path to the local directory to save new code downloaded from the master server repository.

```ini
DEDALO_SOURCE_VERSION_LOCAL_DIR=/tmp/
```

> Default: computed from `DEDALO_BACKUP_PATH_ONTOLOGY`

---

## IP API

### Defining ip api service

IP_API `object` (JSON)

Defines the service to be used in section Activity to resolve source Country from IP address.

By default Dédalo uses the ipapi.co service with free unsigned account. It is possible to configure other services with your specific account.

```ini
IP_API={"url":"https://api.country.is/$ip","href":"https://ip-api.com/#$ip","country_code":"country"}
```

!!! note "IP variable"
    `$ip` string will be replaced by the real IP value in resolution and 'country_code' value property is used to generate the icon flag.

    The URL must be in the format that the provider requires.

---

## CORS + MCP + maintenance

### Defining CORS configuration

DEDALO_CORS `object` (JSON)

Defines the Cross-Origin Resource Sharing configuration.

```ini
DEDALO_CORS={"allowed_origins":["*"],"allowed_methods":["GET","POST","PUT","OPTIONS"],"allowed_headers":["Content-Type","Content-Range","Authorization","X-Requested-With"],"max_age":86400}
```

> Default: permissive (all origins)

---

### Defining MCP proxy URL

DEDALO_MCP_PROXY_URL `string`

Defines the URL for the MCP (Model Context Protocol) proxy server.

```ini
DEDALO_MCP_PROXY_URL=http://localhost:3001
```

> Default: not set

---

### Defining maintenance mode

DEDALO_MAINTENANCE_MODE `bool`

This parameter defines whether the maintenance mode is active or not.

By default the maintenance mode is inactive (false). When active (true), only root user can login and all logged users will be forced to leave the session, the debugger will be activated, and the logger will be changed from WARNING to DEBUG mode.

```ini
DEDALO_MAINTENANCE_MODE=false
```

> Default: `false`

---

## Mailer config

### Mailer configuration

All mailer settings are optional. Configure to enable email notifications.

```ini
MAILER_HOST=smtp.example.com
MAILER_USERNAME=user@example.com
MAILER_PASSWORD=secret
MAILER_SMTP_SECURE=tls
MAILER_PORT=587
MAILER_FROM=noreply@example.com
MAILER_REPLY=noreply@example.com
MAILER_SMTP_AUTH=true
```

> All mailer settings default to not set.

---

## Optional configs (JSON-encoded)

### SAML configuration

SAML_CONFIG `object` (JSON) *optional*

```ini
SAML_CONFIG={"active":true,"url":"/dedalo/core/login/saml","logout_url":"https://idp.example.com/saml","debug":true,"code":"urn:oid:1.3.6.1.4.1.5923.1.1.1.6","idp_ip":["127.0.0.1"]}
```

> Default: not set

---

### Socrata configuration

SOCRATA_CONFIG `object` (JSON) *optional*

```ini
SOCRATA_CONFIG={"app_token":"","socrata_user":"","socrata_password":"","server":"","mode":"pre"}
```

> Default: not set

---

### Init cookie auth addons

INIT_COOKIE_AUTH_ADDONS `array` (JSON) *optional*

```ini
INIT_COOKIE_AUTH_ADDONS=[]
```

> Default: `[]`

---

### Config default file path

CONFIG_DEFAULT_FILE_PATH `string` *optional*

```ini
CONFIG_DEFAULT_FILE_PATH=
```

> Default: not set

---

### Export hierarchy path

EXPORT_HIERARCHY_PATH `string` *optional*

```ini
EXPORT_HIERARCHY_PATH=
```

> Default: not set

---

### Server proxy

SERVER_PROXY `string`

This parameter defines if the access to the master server needs to go through a proxy server.

```ini
SERVER_PROXY=192.0.0.1:3128
```

> In the string you can add user and password as proxy needs. Ex: `my_user:my_pw@192.0.0.1:3128`

> Default: not set

---

## Notice to active users

DEDALO_NOTIFICATION `array`

This parameter activates a message for all registered users. It could be used to advertise if the server will need to shut down or other actions that users should know about.

Properties:

* `msg`. The text to be printed into the user interface
* `class_name`. CSS class to be applied to the msg
