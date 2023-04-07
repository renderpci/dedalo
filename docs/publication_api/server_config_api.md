# Changing the parameters of Dédalo API server config file

**server_config_api.php**

This config file sets specific values to configure the publication API.
The server API could be on a separate server and therefore you will have to edit and reformulate some existing values in the Dédalo configuration files, such as those for connection to the database or the user code.

1. Locate the file into the directory: ../dedalo/publication/server_api/v1/config_api/

    ```shell
    cd ../dedalo/lib/dedalo/publication/server_api/v1/config_api/
    ```

2. Edit the server_config_api.php.

    ```shell
    nano server_config_api.php
    ```

3. Locate and change the PROPERTIES with the proper configuration.

---

## Setting the root directory for the API server

**server_config_api.php**

API_ROOT `string`

Defines the main server API directory. This constant is used to set a root directory for access to the files and libs of the server API.

```php
define('API_ROOT', dirname(dirname(__FILE__)));
```

---

### Setting the API entity

**server_config_api.php**

API_ENTITY `string`

Set the entity name that is publication data.

```php
define('API_ENTITY', 'my_entity');
```

---

### Setting the default lang to get data

**server_config_api.php**

DEFAULT_LANG `string`

Set the default lang to get data from DDBB. If the request to the API don't get information in other language, the API will do a fallback to the language defined here.

```php
$DEFAULT_LANG = 'lg-spa';
```

> Dédalo uses the pattern: lg-xxx
> lg = identify the term as language
> xxx = with the official tld of the ISO 639-6, Alpha-4 code for comprehensive coverage of language variants.
>
>
> | Value  | Diffusion language |
> | -------- | -------------------- |
> | lg-spa | Spanish            |
> | lg-cat | Catalan            |
> | lg-eus | Basque             |
> | lg-eng | English            |
> | lg-fra | French             |
>

---

### Setting the API default database

**server_config_api.php**

DEFAULT_DDBB `string`

Set the default database to do API calls.

```php
$DEFAULT_DDBB = 'web_XXXXXXXXX';
```

---

### Setting the API web URL

**server_config_api.php**

__CONTENT_BASE_URL__ `string`

Set the default URL of the web, the root domain of the public website. Some API calls need to be a relative or absolute URL and need to be referenced by this paramenter. The API is linked the this main domain to get the media and create the
relative links between data.

Web base URL from where the contents are served.

```php
$WEB_BASE_URL = 'https://my_organization.es';
define('__CONTENT_BASE_URL__', $WEB_BASE_URL);
```

---

### Setting the API code, authorisation code

**server_config_api.php**

API_WEB_USER_CODE `string`

Set authorization code that will use in the clients to get API server calls.

All calls to the public API must have this code, it prevents unwanted / unauthorized calls. The access to the public API is controlled with this code. This code can be public or private, if you want open access to your public data you can share this code.

```php
define('API_WEB_USER_CODE', 'My_API_code');
```

> Is possible use the variable $skip_api_web_user_code_verification to bypass the code check.
>
> For use this functionality you can send skip_api_web_user_code_verification=true to the server as POST or GET request that will set into the var $skip_api_web_user_code_verification by the json/index.php file.
>
> Example of query: https://my_domain.org/server_api/json/?skip_api_web_user_code_verification=true
>
> It will be pass the code:
>
> ```php
> if (isset($skip_api_web_user_code_verification) && $skip_api_web_user_code_verification===true) {
>   // Ignore api code verification mode
> }else{
>   if (empty($code)) {
>   	echo json_encode("Error. Empty user code");
>   	die();
>   }elseif ($code!==API_WEB_USER_CODE) {
>   	echo json_encode("Error. Invalid user code '$code' " . API_ENTITY);
>   	die();
>   }
> }
> ```
>

---

### Setting MySQL database

**server_config_api.php**

MYSQL_DEDALO_DATABASE_CONN `string`

Set the database name will be use to read the public data into MySQl.

```php
define('MYSQL_DEDALO_DATABASE_CONN', 'dedalo_public');
```
> Is possible use the variable $db_name for change the database used in MySQL connection.
>
> For use this functionality you can send the name of the database to the server as POST or GET request that will set into the var $db_name by the json/index.php file.
>
> Example of query: https://my_domain.org/server_api/json/?db_name=my_other_public_database
>
> You can configure it with this sample code:
>
> ```php
> $db_name = !empty($db_name)
>   ? $db_name 			// use db_name
>   : $DEFAULT_DDBB;	// fallback to default DDBB
> define('MYSQL_DEDALO_DATABASE_CONN', $db_name);
> ```

---

### Setting MySQL connection

**server_config_api.php**

MYSQL_DEDALO_HOSTNAME_CONN `string`

Set the hostname of the MySQl server.

```php
define('MYSQL_DEDALO_HOSTNAME_CONN','localhost');
```

> Is possible set the hostname with 'localhost' or the name of the server host or use the ip to connect external server
>

---

### Setting MySQL username

**server_config_api.php**

MYSQL_DEDALO_USERNAME_CONN `string`

Set the username that will use the API server to read MySQl database. For the API server, the MySQL user can be read-only user.

```php
define('MYSQL_DEDALO_USERNAME_CONN','dedalo_api_demo');
```

> The username used in this config file is used only for the front-end, don't use the priviledged user of the back-end, for the API use a read-only user.


---

### Setting MySQL password

**server_config_api.php**

MYSQL_DEDALO_PASSWORD_CONN `string`

Set the password to connect the MySQl database.

```php
define('MYSQL_DEDALO_PASSWORD_CONN','MyRead-Only_SecurePassword8763210!');
```

> Is very recommendable to use a strong password for this connection. And don't use the same pasword of the priviledged user used in the back-end.


---

### Setting MySQL port

**server_config_api.php**

MYSQL_DEDALO_DB_PORT_CONN `string`

Set the port used in the connection. By default MariaDB / MySQL uses the 3306 port but it is very recommendable to change it to avoid DOS attacks.

```php
define('MYSQL_DEDALO_DB_PORT_CONN', '3306');
```

---

### Setting MySQL socket

**server_config_api.php**

MYSQL_DEDALO_SOCKET_CONN `string`

Set the socket used in the connection. The name of the Unix socket file to use for connections made using a named pipe to a local server. The default Unix socket file name is /tmp/mysql.sock.

```php
define('MYSQL_DEDALO_SOCKET_CONN','/tmp/mysql.sock');
```

---

### Setting subtitles directory

**server_config_api.php**

TEXT_SUBTITLES_URL_BASE `string`

Set the main directory used to locate subtitles files.

```php
define('TEXT_SUBTITLES_URL_BASE', $WEB_BASE_URL.'/dedalo/publication/server_api/v1/subtitles/');
```

---

### Setting the media directory URI

**server_config_api.php**

DEDALO_MEDIA_BASE_URL  `string`

Set the main directory used to locate media files like images, audiovisual, pdf, etc.

```php
define('DEDALO_MEDIA_BASE_URL', '/dedalo/media');
```

---

### Setting the default quality for audiovisual footage

**server_config_api.php**

DEDALO_AV_QUALITY_DEFAULT `string`

Set the default quality version that will use to get the audiovisual file.

```php
define('DEDALO_AV_QUALITY_DEFAULT', '404');
```

> By defaul Dédalo use a '404' version (720x404).
>
>
> | Value    | Quality                           | Media Path           |
> | ---------- | ----------------------------------- | ---------------------- |
> | original | Multiple. The quality of the file | ../media/av/original |
> | 1080     | 1920x1080                         | ../media/av/1080     |
> | 720      | 1280x720                          | ../media/av/720      |
> | 576      | 768x576                           | ../media/av/576      |
> | 404      | 720x404                           | ../media/av/404      |
> | 240      | 320x240                           | ../media/av/240      |
> | audio    | none                              | ../media/av/audio    |

---

### Setting the main directory for audiovisual footage

**server_config_api.php**

DEDALO_AV_FOLDER `string`

Set the main directory used to locate audiovisual media.

```php
define('DEDALO_AV_FOLDER', '/av');
```

---

### Setting the posterframe image format with file extension

**server_config_api.php**

DEDALO_AV_POSTERFRAME_EXTENSION `string`

Set the main image format used for the audivisual posterframe. By deaful Dédalo use 'jpg'.

```php
define('DEDALO_AV_POSTERFRAME_EXTENSION', 'jpg');
```

---

### Switching the debugger

**server_config_api.php**

SHOW_DEBUG `bool`

Enabling or disambling the debugger for the server API. This parameter is used for development purposes.

```php
define('SHOW_DEBUG', false);
```

---

### Define the section used for stored audiovisual resources

**server_config_api.php**

DEDALO_SECTION_RESOURCES_AV_TIPO `string`

Defines the 'section_tipo' in Dédalo ontology used for stored the audiovisual information.

This param is used in combination with the DEDALO_COMPONENT_RESOURCES_AV_TIPO to conform the full name of the audiovisual file.

The name of audiovisual files has his own locator to find it. The locator is used in the flat format: 'component_tipo'_'section_tipo'_'section_id' + extension
Example: rsc35_rsc167_36.mp4

```php
define('DEDALO_SECTION_RESOURCES_AV_TIPO', 'rsc167');
```

---

### Define the 'field' with component_tipo used for stored audiovisual resources

**server_config_api.php**

DEDALO_COMPONENT_RESOURCES_AV_TIPO `string`

Defines the 'component_tipo' in Dédalo ontology used for stored the audiovisual file.

This param is used in combination with the DEDALO_SECTION_RESOURCES_AV_TIPO to conform the full name of the audiovisual file.

The name of audiovisual files has his own locator to find it. The locator is used in the flat format: 'component_tipo'_'section_tipo'_'section_id' + extension
Example: rsc35_rsc167_36.mp4

```php
define('DEDALO_COMPONENT_RESOURCES_AV_TIPO', 'rsc35');
```

---

### Define the component_tipo used for store the duration for audiovisual resources

**server_config_api.php**

DEDALO_COMPONENT_RESOURCES_AV_DURATION_TIPO `string`

Defines the 'component_tipo' in Dédalo ontology used for stored the duration of the audiovisual files.

This param is used for get the duration of the audiovisual file in the real time cuts and don't calculate it every time.

```php
define('DEDALO_COMPONENT_RESOURCES_AV_TIPO', 'rsc35');
```

---

### Define the component_tipo used for store the transcription of audiovisual resources

**server_config_api.php**

DEDALO_COMPONENT_RESOURCES_TR_TIPO `string`

Defines the 'component_tipo' in Dédalo ontology used for stored the transcription of the audiovisual files.

This param is used for get the full transcription locator used in indexations.

```php
define('DEDALO_COMPONENT_RESOURCES_TR_TIPO', 'rsc36');
```

---

### Define the component_tipo used for store the transcription annotations

**server_config_api.php**

DEDALO_NOTES_TEXT_TIPO `string`

Define the 'component_tipo' in Dédalo ontology used for stored the annotations in the transcriptions of the audiovisual files.

This param is used for get the annotations locator used in transcriptions.

```php
define('DEDALO_NOTES_TEXT_TIPO', 'rsc329');
```

---

### Setting the current lang to get data

**server_config_api.php**

WEB_CURRENT_LANG_CODE `string`

Set the current request language to get data.

```php
define('WEB_CURRENT_LANG_CODE', !empty($lang) ? $lang : $DEFAULT_LANG);
```

> Dédalo uses the pattern: lg-xxx
> lg = identify the term as language
> xxx = with the official tld of the ISO 639-6, Alpha-4 code for comprehensive coverage of language variants.
>
>| Value | Diffusion language |
>| --- | ---|
>| lg-spa | Spanish |
>| lg-cat | Catalan |
>| lg-eus | Basque |
>| lg-eng | English |
>| lg-fra | French |

---

### Setting the main audiovisual URI

**server_config_api.php**

WEB_VIDEO_BASE_URL `string`

Set the public URI of the audiovisual files.

```php
define('WEB_VIDEO_BASE_URL', DEDALO_MEDIA_BASE_URL .'/'. DEDALO_AV_FOLDER .'/'. DEDALO_AV_QUALITY_DEFAULT);
```

---

### Adding required files

**server_config_api.php**

Some files need to be load to manage data and connections. Do not change this includes.

```php
// DDBB connection manager
include API_ROOT .'/common/class.DBi.php';
// utilities
include API_ROOT .'/common/utils.php';
// web_data
include API_ROOT .'/common/class.web_data.php';
// JSON API manager
include API_ROOT .'/common/class.manager.php';
```

---

### Setting the locator used as restriction

**server_config_api.php**

TERM_ID_RESTRICTED `string`

Set the locator, in flat mode, of the term used in the indexation for remove parts in audiovisual files. Restricted parts of audiovisual files can not be showed. This term is defined into special thesaurus and it is used to create exclude indexations. All indexations in this term will be removed and avoid to be publish.

```php
define('TERM_ID_RESTRICTED', 'ts1_23');
```

> If you want to use multiple restricted terms you can use the property: [AR_RESTRICTED_TERMS](#setting-multiple-locator-used-as-restriction)

---

### Setting multiple locator used as restriction

**server_config_api.php**

AR_RESTRICTED_TERMS `array`

Set the locators, in flat mode, of the terms used in the indexation for remove parts in audiovisual files. Restricted parts of audiovisual files can not be showed.

```php
define('AR_RESTRICTED_TERMS', json_encode(['ts1_23, 'on_4']));
```

If you want to use only one restricted term you can use the property: [TERM_ID_RESTRICTED](#setting-the-locator-used-as-restriction)

---

### Setting a fixed filter for publication column

**server_config_api.php**

PUBLICACION_FILTER_SQL `array`

Set a global filter to the publication records. It will be apply only to the publication column.

define('PUBLICACION_FILTER_SQL', " ");

> **Warning**
{: .alert .alert-danger}
> Deprecated

!!! danger
    This is the danger admonition body

> **Warning**
> This is a warning

> [!WARNING]
> Dangerous certain consequences of an action.
---

### Setting the multiple locators used as restriction

### Setting the library path

**server_config_api.php**

DEDALO_LIB_BASE_PATH

Set the main directory used to load externa libraries like LeafLet, Boostrap or other libraries. This path is a Linux path, a internal path used by php.
string
define('DEDALO_LIB_BASE_PATH', dirname(dirname(dirname(API_ROOT))) );

---

### Setting the library URI

**server_config_api.php**

DEDALO_LIB_BASE_URL

Set the main directory used to load externa libraries like LeafLet, Boostrap or other library. This path is a uri path, external path will used by the browser to get the libraries.
string
define('DEDALO_LIB_BASE_URL', '/dedalo/lib/dedalo');

---

### Setting the interview table name

**server_config_api.php**

TABLE_INTERVIEW

Set the interview table name that will be used for get if the interview referenced by the resources data is active. Sometimes is possible that an audiovisual resource linked two or more interviews, and one of them could not to be published, and the public data need to banned.
This parameter set the public table for interviews.
string
define('TABLE_INTERVIEW', 'interview');

---

### Setting the informant table name

**server_config_api.php**

TABLE_INFORMANT

Set the informat table name (people from whom we obtain information). This variable will be used for locate informants from the indexations in the thesaurus tables.
string
define('TABLE_INFORMANT', 'informant');

---

### Define the interview summary field name

**server_config_api.php**

FIELD_SUMMARY

Define the field name of the interview summary for the component_tipo 'oh23' in Dédalo ontology. It is used only for Oral history/memory.
string
define('FIELD_SUMMARY', 'abstract');

---

### Define interview date field name

**server_config_api.php**

FIELD_INTERVIEW_DATE

Define the field name of the interview date for the component_tipo 'oh29' in Dédalo ontology. It is used only for Oral history/memory.
string
define('FIELD_INTERVIEW_DATE', 'date');

---

### Define the interview informant field

**server_config_api.php**

FIELD_INFORMANT

Define the field name of the interview informant (interviewed) for the component_tipo 'oh24' in Dédalo ontology. It is used only for Oral history/memory.
string
define('FIELD_INFORMANT', 'informant');

---

### Define the interview image field

**server_config_api.php**

FIELD_IMAGE

Define the field name of the interview image for the component_tipo 'oh17' in Dédalo ontology. It is used only for Oral history/memory.
string
define('FIELD_IMAGE', 'image');

---

### Define the interviewed name field

**server_config_api.php**

FIELD_NAME

Define the field name of the interviewed for the component_tipo 'rsc85' in Dédalo ontology. It is used only for Oral history/memory.
string
define('FIELD_NAME', 'name');

---

### Define the interviewed surname field

**server_config_api.php**

FIELD_SURNAME

Define the field name for the surname of the interviewed for the component_tipo 'rsc86' in Dédalo ontology. It is used only for Oral history/memory.
string
define('FIELD_SURNAME', 'surname');

---

### Define the interviewed birthdate field

**server_config_api.php**

FIELD_BIRTHDATE

Define the field name for the interviewee's birthdate for the component_tipo 'rsc89' in Dédalo ontology. It is used only for Oral history/memory.
string
define('FIELD_BIRTHDATE', 'birthdate');

---

### Define the interviewee's birthplace field

**server_config_api.php**

FIELD_BIRTHPLACE

Define the field name for the interviewee's birthplace for the component_tipo 'rsc91' in Dédalo ontology. It is used only for Oral history/memory.
string
define('FIELD_BIRTHPLACE', 'birthplace');

---

### Define the audiovisual file field name

**server_config_api.php**

FIELD_VIDEO

Define the field name for the audiovisual file for the component_tipo 'rsc35' in Dédalo ontology. It is used only for Oral history/memory.
string
define('FIELD_VIDEO', 'video');

---

### Define the interview code field name

**server_config_api.php**

FIELD_CODE

Define the field name for the interview code for the component_tipo 'oh14' in Dédalo ontology. It is used only for Oral history/memory.
string
define('FIELD_CODE', 'code');

---

### Define the audiovisual interview field name

**server_config_api.php**

FIELD_AUDIOVISUAL

Define the field name for the audiovisual interview, the component_tipo 'oh25' in Dédalo ontology. It is used only for Oral history/memory.
string
define('FIELD_AUDIOVISUAL', 'audiovisual');

---

### Define the transcription component_tipo

**server_config_api.php**

FIELD_TRANSCRIPTION

Define the 'component_tipo' in Dédalo ontology used for stored the transcription of the audiovisual files.
This param is used for get the full transciption locator used in indexations.
string
define('FIELD_TRANSCRIPTION', TRANSCRIPTION_TIPO);

---

### Define the audiovisual section_tipo

**server_config_api.php**

AUDIOVISUAL_SECTION_TIPO

Define the 'section_tipo' in Dédalo ontology used for stored the audiovisual information.
This param is used in combination with the AV_TIPO to comform the full name of the audiovisual file.
The name of audiovisual files has his own locator to find it. The locator is used in the flat format: 'component_tipo'_'section_tipo'_'section_id' + extension
Example: rsc35_rsc167_36.mp4
string
define('AUDIOVISUAL_SECTION_TIPO', 'rsc167');

---

### Define the audiovisual component_tipo

**server_config_api.php**

AV_TIPO

Define the 'component_tipo' in Dédalo ontology used for stored the audiovisual file.
This param is used in combination with the AUDIOVISUAL_SECTION_TIPO to comform the full name of the audiovisual file.
The name of audiovisual files has his own locator to find it. The locator is used in the flat format: 'component_tipo'_'section_tipo'_'section_id' + extension
Example: rsc35_rsc167_36.mp4
string
define('AV_TIPO', 'rsc35');

---

### Define the duration column

**server_config_api.php**

FIELD_DURATION

Define the name in the audiovisual table for the component_tipo 'rsc54' in Dédalo ontology used for stored the duration of the audiovisual files.
This param is used for get the duration of the audiovisual file in the real time cuts and don't calculate it every time.
string
define('FIELD_DURATION', 'duration');

---

### Setting the audiovisual table name

**server_config_api.php**

TABLE_AUDIOVISUAL

Set the audiovisual table name. This variable will be used for locate audiovisual fragments from the indexations in the thesaurus tables.
string
define('TABLE_AUDIOVISUAL', 'audiovisual');

---

### Setting the image table name

**server_config_api.php**

TABLE_IMAGE

Set the image table name. This variable will be used for locate images from the indexations in the thesaurus tables.
string
define('TABLE_IMAGE', 'image');

---

### Define the transcription component_tipo

**server_config_api.php**

TRANSCRIPTION_TIPO

Define the 'component_tipo' in Dédalo ontology used for stored the transcription of the audiovisual files.
This param is used for get the full transciption locator used in indexations.
string
define('TRANSCRIPTION_TIPO', 'rsc36');
Setting the thesaurus tables

---

### Setting the thesaurus table map

**server_config_api.php**

$table_thesaurus_map

This global variable is used to define the map of thesaurus tables and the correspondence with section_tipo defined by locators.
Many backend data are locators that are used to point other information (the locator are a realation between data), the original locator in Dédalo use the section_tipo defined in the ontology to point the target data.
When the data is published, sometimes the section_tipo for the thesaurus definition is changed to be more "human readable" format, but the original locators are not point these new table name. The table resolution will change the locator to point the rigth name, but some times, if the project has a lot thesarus tables, could be convenient create the map for get a fast mapping of the ts tables.
This varibale get the thesaurus map resolved fast to avoid unnecessary union tables, this variable is optional. Is possible use it when you need manage various tables at same time (toponymy for example)
associative array
$table_thesaurus_map = array('ts1'=>'ts_tematics');

---

### Set tables with thesaurus structure

**server_config_api.php**

TABLE_THESAURUS

Set the tables that has thesaurus structure and can be used in common way. The thesaurus tables can be used in common search, unions, and other uses.
string with comma separated values
define('TABLE_THESAURUS', "ts_tematics,ts_ono");

---

### Setting the main hierarchy table

**server_config_api.php**

TABLE_HIERARCHY

Set the hierarchy table for get the main root term of the thesaurus tables. Thesaurus tables has a hierarchy relations between terms and is necesary identify the main or root tem or the tree.
string
define('TABLE_HIERARCHY', 'hierarchy');

---

### Define the locator column name for ts tables

**server_config_api.php**

FIELD_TERM_ID

Define the field name for the locator (in flat mode) that define the tesaure. This paramenter will use for get the terms of the correct tables.
string
define('FIELD_TERM_ID', 'term_id');

---

### Define the field name of the term for ts tables

**server_config_api.php**

FIELD_TERM

Define the field name of the tesaure term for the component_tipo 'hierarchy25' in Dédalo ontology. Used for store the term of descriptors.
string
define('FIELD_TERM', 'term');

---

### Define the order number of thesaurus term field name

**server_config_api.php**

FIELD_NORDER

Define the field name for the order number of the thesaurus term, the component_tipo 'hierarchy36' in Dédalo ontology.
string
define('FIELD_NORDER', 'norder');

---
