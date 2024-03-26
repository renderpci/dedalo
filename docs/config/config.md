# Changing parameters of global Dédalo config file

./dedalo/config/config.php

1. Locate the file into the directory: ../httpdocs/dedalo/config/

    ```shell
    cd ../httpdocs/dedalo/config/
    ```

2. Edit the config.php

    ```shell
    nano config.php
    ```

3. Locate and change the PROPERTY with the proper configuration.

## **Main variables:** Paths

### Defining host

./dedalo/config/config.php

DEDALO_HOST `string`

This parameter use the name of the domain or ip of your installation. Used the header from the current request, if there is one, and store the domain or ip of the call.

```php
define('DEDALO_HOST', $_SERVER['HTTP_HOST'] );
```

---

### Defining protocol

./dedalo/config/config.php

DEDALO_PROTOCOL `string`

This parameter define the internet protocol used by the server to connect all system. It is recommended to use the HTTPS protocol for installation with SSL certification, it is not mandatory but it ensures that your server connection will be protected with encryption.

```php
define('DEDALO_PROTOCOL', (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS']==='on') ? 'https://' : 'http://');
```

---

### Defining root path

./dedalo/config/config.php

DEDALO_ROOT_PATH `string`

This parameter define the root directory for Dédalo installation. It is used to define the relative paths inside the server used by internal server commands in the terminal or basic load and server code files. The path is define by you server directory configuration and apache directory configuration.

> Example: /home/www/httpdocs/dedalo
>

```php
define('DEDALO_ROOT_PATH', dirname(dirname(__FILE__)));
```

---

### Defining root web directory

./dedalo/config/config.php

DEDALO_ROOT_WEB `string`

Used to define the the uri path to the root Dédalo installation. This uri will be used to call to other Dédalo paths and files by the client. Used to create html and js with the uri paths to different Dédalo services.

> Example: <https://dedalo.dev/dedalo>

```php
define('DEDALO_ROOT_WEB', '/' . explode('/', $_SERVER["REQUEST_URI"])[1]);
```

---

### Defining base paths

./dedalo/config/config.php

Define the names of the config files. This constants are used for build paths to config files. It is possible to change the name of the configuration files changing this values.

DEDALO_CONFIG `string`
DEDALO_CORE  `string`
DEDALO_SHARED `string`
DEDALO_TOOLS `string`
DEDALO_LIB  `string`

```php
define('DEDALO_CONFIG', 'config');
define('DEDALO_CORE', 'core');
define('DEDALO_SHARED', 'shared');
define('DEDALO_TOOLS', 'tools');
define('DEDALO_LIB', 'lib');
```

---

### Defining config path

./dedalo/config/config.php

DEDALO_CONFIG_PATH `string`

Used to define the the main config directory. Config directory has all specific files of Dédalo installation. This files are not changed by the system because every installation has his own configuration as connection to DDBB. The exception is the `config_core` file that is used by Dédalo to store the state of the installation.

To update the config constants you will need to see the version changes in the sample_* files because this files will be sync by updates.

```php
define('DEDALO_LIB_BASE_PATH', dirname( dirname(__FILE__) ));
```

---

### Defining core path

./dedalo/config/config.php

DEDALO_CORE_PATH `string`

Defines the core directory. Core directory contains the main code of Dédalo as section, area or components code.

```php
define('DEDALO_CORE_PATH',  DEDALO_ROOT_PATH .'/'. DEDALO_CORE);
```

---

### Defining core URL

./dedalo/config/config.php

DEDALO_CORE_URL `string`

Defines the the uri for the core directory. Core directory contains the main code of Dédalo as section, area or components code.
The uri path will be use to do calls from API to load and different components.

```php
define('DEDALO_CORE_URL',  DEDALO_ROOT_WEB .'/'. DEDALO_CORE );
```

---

### Defining shared path

./dedalo/config/config.php

DEDALO_SHARED_PATH `string`

Defines the shared directory path. Share directory contains shared code of Dédalo use by core, tools and diffusion system. It contains some classes with common code use in the work system as public webs. If you want create a diffusion system, without work system, you will need copy this directory because public API will use it.

```php
define('DEDALO_SHARED_PATH', DEDALO_ROOT_PATH .'/'. DEDALO_SHARED);
```

---

### Defining shared URL

./dedalo/config/config.php

DEDALO_SHARED_URL `string`

Defines the the uri for the shared directory. Share directory contains shared code of Dédalo use by core, tools and diffusion system. It contains some classes with common code use in the work system as public webs. If you want create a diffusion system, without work system, you will need copy this directory because public API will use it.

```php
define('DEDALO_SHARED_URL',  DEDALO_ROOT_WEB  .'/'. DEDALO_SHARED );
```

> Example: <https://dedalo.dev/dedalo/shared/>

---

### Defining tools path

./dedalo/config/config.php

DEDALO_TOOLS_PATH `string`

Defines the tools directory path. Tools directory contains the code for each of them. The tools can be developed outside of the main Dédalo code and can be extended by external developers. Dédalo by default includes specific tools such as image importers or workspaces such as interview indexing. Tools can use core code as sections, components or services to create specific workspaces.

```php
define('DEDALO_TOOLS_PATH',  DEDALO_ROOT_PATH .'/'. DEDALO_TOOLS);
```

---

### Defining tools URL

./dedalo/config/config.php

DEDALO_TOOLS_URL `string`

Defines the uri for the tools directory. Tools directory contains the code for each of them. The tools can be developed outside of the main Dédalo code and can be extended by external developers. Dédalo by default includes specific tools such as image importers or workspaces such as interview indexing. Tools can use core code as sections, components or services to create specific workspaces.

```php
define('DEDALO_TOOLS_URL',  DEDALO_ROOT_WEB .'/'. DEDALO_TOOLS );
```

---

### Defining lib path

./dedalo/config/config.php

DEDALO_LIB_PATH `string`

Used to define the libraries directory path. Lib directory contains the external libraries used by Dédalo for specific tasks, tools or functionalities. Libraries such as Leaflet, ckEditor or Paperjs.

```php
define('DEDALO_LIB_PATH',  DEDALO_ROOT_PATH .'/'. DEDALO_LIB);
```

---

### Defining library uri

./dedalo/config/config.php

DEDALO_LIB_URL `string`

This parameter define the uri path for the lib directory. Lib directory has the external libraries used by Dédalo for specific tasks, tools or functionalities. Libraries such as Leaflet , or Paperjs.
The uri path will be use to create html and js to load and call different tools or functionalities by client.

```php
define('DEDALO_LIB_URL',  DEDALO_ROOT_WEB .'/'. DEDALO_LIB );
```

> Example: <https://dedalo.dev/dedalo/lib/>

---

### Defining widgets path

./dedalo/config/config.php

DEDALO_WIDGETS_PATH `string`

This parameter defines the widgets path. Widgets are pieces of code to be used by areas, sections or components to extend his functionality. For ex: Some components needs a summation or formula to calculate his value, so the component will has a definition of the formula in properties that will call to specific widget to be apply, widget will process the data and return it to the component as his value.

```php
define('DEDALO_WIDGETS_PATH', DEDALO_CORE_PATH . '/widgets');
```

---

### Defining widgets URL

./dedalo/config/config.php

DEDALO_WIDGETS_URL `string`

This parameter defines the uri for widgets directory. Widgets are pieces of code to be used by areas, sections or components to extend his functionality. For ex: Some components needs a summation or formula to calculate his value, so the component will has a definition of the formula in properties that will call to specific widget to be apply, widget will process the data and return it to the component as his value.

```php
define('DEDALO_WIDGETS_URL', DEDALO_CORE_URL . '/widgets');
```

> Example: <https://dedalo.dev/dedalo/core/widgets/>

---

### Defining extras path

./dedalo/config/config.php

DEDALO_EXTRAS_PATH  `string`

This parameter defines the extras path directory. Extras path contains specific code for some installations, like tools or widgets, that the specific entity use to extend default Dédalo behavior. The extras directory is linked by the tld of the ontology used. If you install Dédalo for oral history project, you will need load the 'oh' extras directory, because it has a extension tools for this research field.

> Example: /home/www/httpdocs/dedalo/core/extras

```php
define('DEDALO_EXTRAS_PATH', DEDALO_CORE_PATH . '/extras');
```

> This parameter use previous constant definition:
>
> DEDALO_CORE_PATH
>
> It ensure the a changes in the lib path will be implemented in the extras path.

---

### Defining extras uri

./dedalo/config/config.php

DEDALO_EXTRAS_URL  `string`

This parameter defines the extras path directory. Extras path contains specific code for some installations, like tools or widgets, that the specific entity use to extend default Dédalo behavior. The extras directory is linked by the tld of the ontology used. If you install Dédalo for oral history project, you will need load the 'oh' extras directory, because it has a extension tools for this research field.

```php
define('DEDALO_EXTRAS_URL',  DEDALO_CORE_URL . '/extras');
```

> Example: <https://dedalo.dev/dedalo/core/extras/>
>
> This parameter use previous constant definition:
>
> DEDALO_CORE_PATH
>
> It ensure the a changes in the lib path will be implemented in the extras path.

## Salt

### Defining salt string (string used for encryption)

./dedalo/config/config.php

DEDALO_SALT_STRING `string`

Salt string to be used by the encryption system. Used to generated random string that is added to each password as part of the hashing process.

```php
define('DEDALO_SALT_STRING', 'My_secure_Salt_String!_2046');
```

## Locale

### Defining time zone

./dedalo/config/config.php

DEDALO_TIMEZONE `string`

Used to defines the time zone of the project. It could be different of the server installation or the linux timezone. The time zone will be used to store the time stamp of the changes done by the users.

```php
define('DEDALO_TIMEZONE', 'Europe/Madrid');
```

> The time zone is set in the next code line:
>
> ```php
>date_default_timezone_set(DEDALO_TIMEZONE);
>```
>
> It ensure that PHP has defined the time zone in the parameter.

---

### Defining locale encoding

./dedalo/config/config.php

DEDALO_LOCALE `string`

Defines the internal php locale will be use to encode text. By default Dédalo use UTF8 encoding for Spanish 'es_ES.utf8'.

It is possible change it for specific languages, see the php documentation.

```php
define('DEDALO_LOCALE', 'es-ES');
```

> The locale is set in the next code line:
>
> ```php
>setlocale(LC_ALL, DEDALO_LOCALE);
>```
>
> It ensure that PHP has defined the time zone in the parameter.

---

### Defining date order

./dedalo/config/config.php

Defines the default order for the date input by users and to be showed in component_date. By default Dédalo use dmy (European dates format).

Options:

* dmy : common way order day/moth/year
* mdy : USA way order moth/day/year
* ymd : China, Japan, Korean, Iran way year/month/day

```php
define('DEDALO_DATE_ORDER', 'dmy');
```

## Entity

### Defining entity

./dedalo/config/config.php

DEDALO_ENTITY `string`

This parameter defines the name of the entity proprietary of the Dédalo installation. Dédalo entity will be used to access to databases, to encrypt passwords or to publish data into the specific publication ontology and should NOT be changed after installation.

```php
define('DEDALO_ENTITY', 'my_entity_name');
```

> Use secure characters to define the entity, without spaces, accents or other special characters that could create conflicts with other server parts, such as database connection. If you want define the full name of the entity, use DEDALO_ENTITY_LABEL definition.

---

### Defining entity label

./dedalo/config/config.php

DEDALO_ENTITY_LABEL `string`

Defines the entity label, the real name of the entity. Due the entity definition is use to encrypt passwords or access to databases, sometimes you will need define the real name of the entity with characters such as 'ñ' or accents.

```php
define('DEDALO_ENTITY_LABEL', DEDALO_ENTITY);
```

> By default Dédalo use:
>
> DEDALO_ENTITY
>
> to define the real name of the entity as "Museu de Prehistòria de València"
>

---

### Entity id

./dedalo/config/config.php

DEDALO_ENTITY_ID `int`

This parameter defines the normalized id for the entity. The id of the entity could be used to create a locator to obtain information between Dédalo installations, the id will be added to the locator with the key: "entity_id" when the locator point to external resource.

```php
define('DEDALO_ENTITY_ID', 0);
```

---

### Developer server

./dedalo/config/config.php

DEVELOPMENT_SERVER `bool`

It defines if the server will be used to do develop tasks. When the server is defined to be a developer server, Dédalo will activate the debug mode and will add the developer sections in the menu.

With the debugger active Dédalo will show lot of messages in the php log and js console taking time to process the data. Do not use developer mode in a production server.

```php
define('DEVELOPMENT_SERVER', false);
```

---

## Cache

### Defining cache manager

./dedalo/config/config.php

DEDALO_CACHE_MANAGER `bool || object`

This parameter configure the cache manager to use. By default the cache manager use files in tmp directory.

```php
define('DEDALO_CACHE_MANAGER', (object)[
    'manager'  => 'files',
    'files_path' => '/tmp'
]);
```

> When cache manager is set to `files` it will write cache files with complex resolved data of current logged user (like profiles data). You can deactivate it in this way:
>
> ```php
> define('DEDALO_CACHE_MANAGER', false );
> ```

## Core require

### Basic functions

./dedalo/config/config.php

Dédalo need to include core_functions.php file, it has definitions of some basic functions that will use for all Dédalo
class and methods like encoding or encryption data. This file will be loaded before the session start.

```php
include(DEDALO_CORE_PATH . '/base/core_functions.php');
```

---

### Defining configuration path

./dedalo/config/config.php

This command include the config core file to control the status of installation.

```php
include(DEDALO_CONFIG_PATH . '/config_core.php');
```

---

### Defining fixed tipos

./dedalo/config/config.php

Dédalo need to import dd_tipos.php file, with the definition of some fixed ontology tipos, that will use to assign
directly to some functionalities, without call the ontology.
This file acts as cache of some common tipos, some times when Dédalo need access to fixed part of the ontology is faster use a prefixed tipo than load the ontology and resolve the tipo, this calls are not loaded dynamically.

```php
include(DEDALO_CONFIG_PATH . '/dd_tipos.php');
```

> Tipo = Typology of Indirect Programming Object/s.

---

### Version

./dedalo/config/config.php

This command include the version file to control the correspondence between code and data versions.

```php
include(DEDALO_CONFIG_PATH . '/version.inc');
```

---

### Database config  / connection

./dedalo/config/config.php

Dédalo need to import the config4_db.php file to load the database connection configuration. This file contains the PostgreSQL and MariaDB / MySQL connections. Dédalo interface will use the PostgreSQL connection to manage all datasets, the ontology, etc, and will use the MySQL connection to transform and save the publication versions of the data.

```php
include(DEDALO_CONFIG_PATH . '/config_db.php');
```

### Session

---

### Defining session handler

./dedalo/config/config.php

DEDALO_SESSION_HANDLER `string`

This parameter defines the method used to manage php session for the installation. It could be configured as files, memcached, user or postgresql by default this parameter is defined as `files`, it means that php will use a file stored in the server to save the users sessions.

If you are using memcached, you can activate it to save the sessions in RAM.

Sessions store information about the user connection or the last search done, it will use to reopen Dédalo in the same section of the last session browse by the user or reload the filter with the last search configuration.

```php
define('DEDALO_SESSION_HANDLER', 'files');
```

---

### Session lifetime

./dedalo/config/config.php

session_duration_hours `int`
timeout_seconds `int`

Session lifetime is defined by one calculation of hours convert to seconds. Normally the sessions in Dédalo define 1 journal session (8 hours) and this time will be the max duration of dedalo user session. The session will be deleted when it exceeds this time.

```php
$session_duration_hours = 8;
$timeout_seconds = intval($session_duration_hours*3600);
```

---

### Starting the session

./dedalo/config/config.php

Starting the session ensure that the session is open and alive when the user login. The session will start with the format defined.

Session needs to define the if the protocol to store cookies is https or not. Besides if the cookie `samesite` is Lax or Strict, by default is define as `Strict` the timeout and the session_name (using DEDALO_ENTITY parameter).

```php
$cookie_secure  = (DEDALO_PROTOCOL==='https://');
$cookie_samesite = (DEVELOPMENT_SERVER===true) ? 'Lax' : 'Strict';
session_start_manager([
    'save_handler'    => 'files',
    'timeout_seconds'  => $timeout_seconds,
    'prevent_session_lock' => defined('PREVENT_SESSION_LOCK') ? PREVENT_SESSION_LOCK : false,
    'session_name'    => 'dedalo_'.DEDALO_ENTITY
    'cookie_secure'   => $cookie_secure, // Only https (true | false)
    'cookie_samesite'  => $cookie_samesite // (None | Lax | Strict)
]);
```

## Developer variables

### Show debug

./dedalo/config/config.php

SHOW_DEBUG `bool`

This parameter active or deactivate the debugger. Used to show the log warnings and errors, it will be always active when the user logged is a superuser.

```php
define('SHOW_DEBUG',
    (isset($_SESSION['dedalo']['auth']['user_id']) && $_SESSION['dedalo']['auth']['user_id']==DEDALO_SUPERUSER)
        ? true
        : false // default false
);
```

---

### Show developer

./dedalo/config/config.php

SHOW_DEVELOPER  `bool`

Sets, as environment constant, the current logged user profile status (developer: bool true/false). This value is set in the user record option 'Developer' by Dédalo administrators and stored in session on login.

When is true, the logged user can access and view specific develop information like component configuration (tipo, parent, etc.) hidden to regular users to avoid too much noise.

```php
define('SHOW_DEVELOPER',
    (isset($_SESSION['dedalo']['auth']['is_developer']) && $_SESSION['dedalo']['auth']['is_developer']===true)
        ? true
        : false // default false
);
```

## Loader / required

### Loader

./dedalo/config/config.php

DEDALO_CORE_PATH `string`

Dédalo needs to include some common classes and tools to be operative. The loader is the responsible for loading the core classes into memory before start the users login process.

```php
include DEDALO_CORE_PATH . '/base/class.loader.php';
```

### Backup variables

---

### Defining backup on login

./dedalo/config/config.php

DEDALO_BACKUP_ON_LOGIN  `bool`

This parameter defines if Dédalo will do a backup when the users login. It prevents that issues doing to the data could repair quickly.

If this constant is set to `true` Dédalo will check if the last backup is a copy done after the time defined by DEDALO_BACKUP_TIME_RANGE and will create new one if the time exceed this parameter. Dédalo will use the `.pgpass` file to connect to PostgreSQL and will create a `.backup` file in the backup directory.

```php
define('DEDALO_BACKUP_ON_LOGIN'  , true);
```

---

### Defining backup time range

./dedalo/config/config.php

DEDALO_BACKUP_TIME_RANGE `int`

This parameter defines the time lapse between backup copies in hours. Dédalo check in every user login if the last backup exceed this time lapse, in affirmative case, it will create new one.

```php
define('DEDALO_BACKUP_TIME_RANGE', 8);
```

---

### Defining backups directory

./dedalo/config/config.php

DEDALO_BACKUP_PATH `string`

This parameter defines the backups directory path. By default the backups directory will be out of httpdocs scope for security.

```php
define('DEDALO_BACKUP_PATH' , dirname(dirname(DEDALO_ROOT_PATH)) . '/backups');
```

---

### Defining temporary backup

./dedalo/config/config.php

DEDALO_BACKUP_PATH_TEMP `string`

This parameter defines the temporary backups directory path. Dédalo will use this directory to store download ontology data before update the ontology.

```php
define('DEDALO_BACKUP_PATH_TEMP' , DEDALO_BACKUP_PATH . '/temp');
```

---

### Defining main db backup

./dedalo/config/config.php

DEDALO_BACKUP_PATH_DB `string`

This parameter defines the main database backups directory path. Dédalo will use this directory to store the full backup of PostgreSQL.

```php
define('DEDALO_BACKUP_PATH_DB' , DEDALO_BACKUP_PATH . '/db');
```

---

### Defining ontology backup

./dedalo/config/config.php

DEDALO_BACKUP_PATH_ONTOLOGY `string`

This parameter defines the main ontology backups directory path. Dédalo will use this directory to store the full ontology backup.

```php
define('DEDALO_BACKUP_PATH_ONTOLOGY'  , DEDALO_BACKUP_PATH . '/ontology');
```

## Logs and errors

Store application activity data info and errors into `activity` table in DDBB.

---

### Logger level

./dedalo/config/config.php

LOGGER_LEVEL `class constant`

This parameter defines the level of the information shown in the logger. Normally, when Dédalo is in production, the logger uses the 'WARNING' level that only shows informative information of the action when it has inconsistencies. When Dédalo’s debugger is active, the lever of the logger will be more verbose with debug information, errors, and warnings.

The server error log level by default is: `ERROR` (will be change to `DEBUG` when SHOW_DEBUG===true)

| Level error codes ||
| --- | --- |
| DEBUG | 100 |
| INFO | 75 |
| NOTICE | 50 |
| WARNING | 25 |
| ERROR | 10 |
| CRITICAL| 5 |

```php
define('LOGGER_LEVEL', (SHOW_DEBUG===true)
    ? logger::DEBUG // log all messages
    : logger::ERROR // log only errors
);
```

> Note that log outputs files are defined in the `php.ini` config file / `error_log` definition like `/var/log/fpm-php.log`. You can view the server log using terminal command `tail -f /var/log/php_errors.log` with your own log path.

---

### Activity log database

./dedalo/config/config.php

Dedalo store the activity in the table matrix_activity in PostgreSQL, the logger need to be configured to use this
table.
Logger wil save all user activity and the application errors and messages.

```php
logger::register('activity' , 'activity://auto:auto@auto:5432/log_data?table=matrix_activity');
logger::$obj['activity'] = logger::get_instance('activity');
```

---

### Update log file

./dedalo/config/config.php

UPDATE_LOG_FILE `string`

Defines the directory path to store the update log.

The maintenance update process uses the update log to store the status of each update task. This log is useful to know what happens in the update process. If the update fails, you can consult the last status to restore the update process at this last point.

Default directory for this file has set inside Dédalo config folder, take account that if you move to other location fix the permissions to be private as a directory outside httpdocs folder.

```php
define('UPDATE_LOG_FILE', DEDALO_CONFIG_PATH . '/update.log');
```

---

## Languages

### Defining structure lang

./dedalo/config/config.php

DEDALO_STRUCTURE_LANG `string`

This parameter defines the default language that the ontology will use as main language. The ontology (abstracted structure) is the definition of areas, sections, fields, connections between data and definition models. All terms used in the ontology can be translated to any language, but this main language defined here will be use as mandatory language, if Dédalo is configured in other language that is not defined in the ontology translations Dédalo will do a fall back to this main language, if these main language is not present, Dédalo will use any other language to show the interface and explanations.

This parameter do not define the main data language, it only affect to the Dédalo interface and definitions in the ontology.

```php
define('DEDALO_STRUCTURE_LANG', 'lg-spa');
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

./dedalo/config/config.php

DEDALO_APPLICATION_LANGS `object` (php: serialized associative array)

This parameter defines the languages that Dédalo will use for the data and user interface. Dédalo is a true multi-language application, any text field can be defined as translatable and this configuration define the languages that the installation will use to store and translate text data. When the user select one of those languages Dédalo will change the data showed or the user interface, so it will render all data with this new language.

```php
define('DEDALO_APPLICATION_LANGS', serialize([
    'lg-spa' => 'Castellano',
    'lg-cat' => 'Català',
    'lg-eus' => 'Euskara',
    'lg-eng' => 'English',
    'lg-fra' => 'French'
]));
```

> See the Dédalo structure lang for see the languages definitions.

---

### Defining default application language

./dedalo/config/config.php

DEDALO_APPLICATION_LANGS_DEFAULT `string`

Defines the main language will used in the user interface.

Dédalo can be translated to any language, the translations of the interface are done in the ontology. The users can change the Dédalo interface to use it in his language. In Dédalo the user interface and the data language are separated concepts and it is possible have a interface in one language and the data in other. This main language will be used as primary option and as fall back language when the element does not have the translation available.

```php
define('DEDALO_APPLICATION_LANGS_DEFAULT', 'lg-eng');
```

> See the Dédalo structure lang for see the languages definitions.

---

### Defining application language

./dedalo/config/config.php

DEDALO_APPLICATION_LANG `string`

This parameter defines the language will us Dédalo for the user interface.

This is a dynamic parameter and it can be changed when the user login, or in application menu. When the language is changed it is saved into the user's session and it is read to maintain coherence in the diary workflow. If the user's session does not have defined the application language then Dédalo will use the application default language definition.

```php
define('DEDALO_APPLICATION_LANG', 'lg-spa');
```

> This parameter use the method 'fix_cascade_config_var' to calculate the value. The result of this function will be a string with the correct language value in string format. You can define it as fixed data value, but is recommended do not change the definition, if you want change the default language for the interface use the: DEDALO_APPLICATION_LANGS_DEFAULT.

---

### Defining default data language

./dedalo/config/config.php

DEDALO_DATA_LANG_DEFAULT `string`

Defines the main language will used by Dédalo to manage and process data.

The main language is the mandatory language for the text data in the catalog or inventory. Dédalo is a real multi-language application, it can manage multiple translation of the textual information.

In a multi-language situation, when you require some translated information but it is not present (because it is not done), Dédalo will need to use the main language to do a fall back process to main language to show the data. If the main language data is not present, Dédalo will use any other language to show those data.

```php
define('DEDALO_DATA_LANG_DEFAULT', 'lg-spa');
```

---

### Defining data language

./dedalo/config/config.php

DEDALO_DATA_LANG `string`

It defines the data language used by Dédalo to process and render textual information.

This is a dynamic parameter that can be changed by the user in any moment. Dédalo is a real multi-language application, it can manage information in multiple languages and process it as unique information block (the field store any translated version of his data). The user can translate any information directly or using specific tools. This parameter define the current language used.

```php
define('DEDALO_DATA_LANG', 'lg-spa');
```

> This parameter use the method 'fix_cascade_config_var' to calculate the value. The result of this function will be a string with the correct language value in string format. You can define it as fixed data value, but is recommended do not change the definition, if you want change the default language for the data use the: [DEDALO_DATA_LANG_DEFAULT](#defining-default-data-language).

---

### Defining data language selector

./dedalo/config/config.php

DEDALO_DATA_LANG_SELECTOR `bool`

It defines if the menu show or hide the data language selector.

When the selector is showed the user can change the data language independently of the interface language. If the selector is hide the data language is synchronous to the interface language a change in the interface language will be a change in the data language.

```php
define('DEDALO_DATA_LANG_SELECTOR', true);
```

---

### Defining data language sync

./dedalo/config/config.php

DEDALO_DATA_LANG_SYNC `bool`

Defines whether the application language and data language selection remain synchronized.

When set to ' true', it forces to keep DEDALO_APPLICATION_LANG and DEDALO_DATA_LANG synchronized across changes.
The default value is 'false', which allows the application language and data language to be selected independently.

```php
define('DEDALO_DATA_LANG_SYNC', false);
```

---

### Defining data without language (no lang)

./dedalo/config/config.php

DEDALO_DATA_NOLAN `string`

This parameter defines the tld used by Dédalo to tag data without translation possibility.

Dédalo is multi language by default, all information could be translated to other languages that the main lang, but some data is not susceptible to be translated, like numbers, dates or personal names. In these cases Dédalo defines this kind of data as "not translatable" with the specific tld define in this parameter.

By default and for global Dédalo definition for non translatable data this tld is: `lg-nolan`

```php
define('DEDALO_DATA_NOLAN', 'lg-nolan');
```

---

### Defining default projects languages

./dedalo/config/config.php

DEDALO_PROJECTS_DEFAULT_LANGS `array`

This parameter defines the languages that will use for export and publish data.

This definition control the amount of languages that will be processed to export data or publish data in the publication process.

When Dédalo export data or publish data, it check the languages of every field of every record to create a fixed version of the data with the language processed or his own correspondences of the main languages when the data is not available in the current language. This parameter reduce the amount languages used in those processes.

```php
define('DEDALO_PROJECTS_DEFAULT_LANGS', [ 'lg-spa', 'lg-cat', 'lg-eng', ]);
```

> The parameter use the Dédalo tld definition for languages. See DEDALO_APPLICATION_LANGS definition to show some examples.

---

### Defining diffusion languages

./dedalo/config/config.php

DEDALO_DIFFUSION_LANGS `array`

This parameter defines the languages that Dédalo will use to publish data.

This definition control the amount of languages that will be processed to publish data in the publication process. When Dédalo publish data, it check the languages of every field of every record to create a fixed version of the data with the language processed or his own correspondences of the main languages when the data is not available in the current language. This parameter reduce the amount languages used in this process.

This parameter is configured with the same values as DEDALO_PROJECTS_DEFAULT_LANGS, but it can be changed to other values to separate the export languages from the diffusion languages.

```php
define('DEDALO_DIFFUSION_LANGS', [ 'lg-spa', 'lg-cat', 'lg-eng', ]);
```

>The parameter use the Dédalo tld definition for languages. See DEDALO_APPLICATION_LANGS definition to show some examples.

---

### Defining translator url

./dedalo/config/config.php

DEDALO_TRANSLATOR_URL `string`

This parameter define the external service to translate data.

You can define the URI for external API service that will use in the translation tool. External services provide different APIs and URIs that can be configured here.

```php
define('DEDALO_TRANSLATOR_URL', 'http://babel.render.net/babel_engine/');
```

>You will need an account in the external service. Dédalo has full integration with [Apertium](https://www.apertium.org) server (open source machine translation). Other external services, like Google translation, IBM Watson, etc will need a developer integration of his API.
>
>If you want to use a machine translation for developer proposes, you can talk with [Render](https://render.es), that support the Dédalo development to get a free account to his machine translation server.

## Default variables

### Defining prefix tipos

./dedalo/config/config.php

DEDALO_PREFIX_TIPOS `array`

This parameter defines the ontology tipos to be used in the Dédalo installation.

Every tipo (typology of indirect programming object) defines a heritage field, a data model, a structuring tools and definitions. Dédalo is a multi heritage application with ontologies for Archeology, Ethnology, Oral History, Numismatics, etc. Every project or institution can add any tipos that it demands. An archaeologic museum will use the model for archeological catalogs, but it will not need the ethnological definitions. In the same way that Oral History project will don't use the archeological or numismatic definitions.

By default Dédalo load some common tipos for all project types.

| **TLD** | **Defintion** |
| --- | --- |
| **dd** | dedalo. Definition of default list and common uses and tools such as translation tools. |
| **rsc** | resources. Definition for areas and sections commons to all projects such as people, images, audiovisual files, publications, documents, bibliography, etc. |
| **hierarchy** | thesaurus. Definition for sections as toponymy, onomastic, chronologies, techniques, material, etc. |
| **lg** | languages, Definition for the languages in the thesaurus (used for all application to translate data and interface) |
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

```php
define('DEDALO_PREFIX_TIPOS', [ 'dd', 'rsc', 'hierarchy', 'lg', 'oh', 'ich' ]);
```

!!! note "Thesaurus dependencies"
    Some tld has a thesaurus dependency, if you want to use a `tch` Dédalo installation will need to create the `material`, `technique`, or `objects` hierarchies. This hierarchies are not included into the main tld, because the hierarchies need to be activate and created by the users. [See the table of dependencies](thesaurus_dependeces.md#dependencies).

!!! note "Applying changes in DEDALO_PREFIX_TIPOS"
    Any change in `DEDALO_PREFIX_TIPOS` will need a update of the ontology, this changes are not directly applied. Dédalo needs to get the ontology tld and install it, to do that update the ontology in [maintenance](../management/maintenace_status.md) control panel.

!!! note "Activities"
    The `actv` tld should be used as model to implement a virtual sections with more specific activities as hierarchies of toponymy does into the thesaurus using it as `hierarchy20`, the main section to implement in this way is `actv1` and his model `actv2`. The virtual sections should be defined with a prefix `actv` into the new tld, in this way:
    - for exhibitions section the tld could be: `actvexhibition`
    - for conferences section the tld could be: `actvconference`

---

### Defining main fallback section

./dedalo/config/config.php

MAIN_FALLBACK_SECTION `string`

It defines the section will loaded by default when the user login.
The main section of the project that will used, normally will be a inventory or catalog section.

```php
define('MAIN_FALLBACK_SECTION', 'oh1');
```

---

### Defining numerical matrix value for yes

./dedalo/config/config.php

NUMERICAL_MATRIX_VALUE_YES `int`

Definition of the section_id of the 'yes' value. This value will use to access directly to this value without call to the database.

```php
define('NUMERICAL_MATRIX_VALUE_YES', 1);
```

---

### Defining numerical matrix value for no

./dedalo/config/config.php

NUMERICAL_MATRIX_VALUE_NO `int`

Definition of the section_id of the 'no' value. This value will use to access directly to this value without call to the database.

```php
define('NUMERICAL_MATRIX_VALUE_NO', 2);
```

---

### Defining maximum rows per page

./dedalo/config/config.php

DEDALO_MAX_ROWS_PER_PAGE `int`

It defines the maximum rows that will loaded in the lists.

This value is the default number of rows that Dédalo will load, but is possible to change this value directly in the filter by the users, when they make a search, if the user do not define the maximum rows, Dédalo will use the value of this parameter.

```php
define('DEDALO_MAX_ROWS_PER_PAGE', 10);
```

---

### Defining default profile

./dedalo/config/config.php

DEDALO_PROFILE_DEFAULT `int`

This parameter defines the section_id of the default profile that Dédalo will use to create new user.

The profile define where the user can access inside the system, and if they can access to tools or administrative areas. By default Dédalo will use the profile definition for normal 'users' (section_id : 2, the section_id : 1 is for administrators users).

```php
define('DEDALO_PROFILE_DEFAULT', 2);
```

---

### Defining default project

./dedalo/config/config.php

DEDALO_DEFAULT_PROJECT `int`

This parameter defines the default project that Dédalo will use to create new sections (records in the DDBB).

Dédalo use the project component (component_filter) to group sections by the research criteria. The project field is mandatory in every section, because an user that can access to a project will no see the records of the other projects and, therefore, is necessary that all sections can be searchable by projects. If the user forget introduce project data, Dédalo will use this parameter to introduce it.

```php
define('DEDALO_DEFAULT_PROJECT', 1);
```

---

### Defining filter section tipo default

./dedalo/config/config.php

DEDALO_FILTER_SECTION_TIPO_DEFAULT `int`

This parameter defines the section that has the projects information inside the ontology.

Dédalo will use this parameter to define the locator of the filter by projects to apply to any search of sections. By default Dédalo has a predefined section to store the projects that administrators users can enlarge. The default section_tipo is 'dd153' and it is located below 'Administration' area in the menu. Every project field target this section to define the specific project of the current record.

```php
define('DEDALO_FILTER_SECTION_TIPO_DEFAULT', DEDALO_SECTION_PROJECTS_TIPO );
```

> By default this definition get the section_tipo from the predefined constant DEDALO_SECTION_PROJECTS_TIPO inside 'dd_tipos.php' file. Target filter section (current 'dd153' - Projects section). Do not change this param.

---

## Media variables

Media as images, pdf, audiovisual, svg and other are files that Dédalo use inside the sections.

Media is referenced by locator and all files are name in the server with the locator that call it. Dédalo has a media directories definition that can be change with this parameter, for ex: is possible define the amount of image copies in different qualities for images.

---

### Defining media base path

./dedalo/config/config.php

DEDALO_MEDIA_PATH `string`

This parameter defines the root media directory in the directory tree.

Normally this directory is located in the top Dédalo directory, but it can be define in other paths. remember that Dédalo will need access to this directory as owner with read / write permissions.

```php
define('DEDALO_MEDIA_PATH', DEDALO_ROOT_PATH . '/media');
```

---

### Defining media base url

./dedalo/config/config.php

DEDALO_MEDIA_URL `string`

This parameter defines the root media url to be accessed by the client.

Dédalo will use this parameter to create the uri's to the media accessible to the clients.

```php
define('DEDALO_MEDIA_URL', DEDALO_ROOT_WEB . '/media');
```

---

### Defining audiovisual directory

./dedalo/config/config.php

DEDALO_AV_FOLDER `string`

This parameter defines the main directory for the audiovisual files.

```php
define('DEDALO_AV_FOLDER', '/av');
```

---

### Defining audiovisual extension (type of file)

./dedalo/config/config.php

DEDALO_AV_EXTENSION `string`

This parameter defines the standard file type of encapsulation for the audiovisual files.

By default Dédalo use mp4 encapsulation definition for the audiovisual files with codec h264 or h265. All other formats will be compressed to this parameters.

```php
define('DEDALO_AV_EXTENSION', 'mp4');
```

---

### Defining audiovisual extensions supported

./dedalo/config/config.php

DEDALO_AV_EXTENSIONS_SUPPORTED `array`

This parameter defines the standards file type admitted for the audiovisual files.

Dédalo will use this parameter to identify the file format of the original files uploaded by the users before compress it to the standard defined in the DEDALO_AV_EXTENSION parameter.

```php
define('DEDALO_AV_EXTENSIONS_SUPPORTED', ['mp4','wave','wav','aiff','aif','mp3','mov','avi','mpg','mpeg','vob','zip','flv']);
```

---

### Defining audiovisual mime type

./dedalo/config/config.php

DEDALO_AV_MIME_TYPE `string`

This parameter defines the standard mime type for the audiovisual files.

This parameter will use to create the correct http header for the standard define in DEDALO_AV_EXTENSION.

```php
define('DEDALO_AV_MIME_TYPE', 'video/mp4');
```

---

### Defining audiovisual codec type

./dedalo/config/config.php

DEDALO_AV_TYPE `string`

This parameter define the standard code type for the audiovisual files. This parameter will use to compress the audiovisual original format to the codec defined by this parameter. By default Dédalo use the h264 or h265 codec to compress the av files.

```php
define('DEDALO_AV_TYPE', 'h264/AAC');
```

---

### Defining audiovisual quality for original files

./dedalo/config/config.php

DEDALO_AV_QUALITY_ORIGINAL `string`

This parameter defines the quality original for the audiovisual files.

This parameter will use to identify the uploaded files to with specific quality. Dédalo admit lots of different formats from different sources and qualities, and it define this files as "original" quality. Dédalo will compress all formats to web standard format, unify all different qualities and codecs, and will store the original file without touch. In some cases, if the institution has a protocol for manage av files, is possible to use one specific quality for the files that users can upload. By default Dédalo do not limit the original format to be uploaded using a "original" quality denomination.

```php
define('DEDALO_AV_QUALITY_ORIGINAL', 'original');
```

---

### Defining audiovisual quality for processed files

./dedalo/config/config.php

DEDALO_AV_QUALITY_DEFAULT `string`

This parameter defines the default quality used for the audiovisual files.

This parameter will use to compress all audiovisual files to specific quality, unifying the quality used by all sections. By default Dédalo use 720x404 h264 quality.

```php
define('DEDALO_AV_QUALITY_DEFAULT', '404');
```

---

### Defining audiovisual qualities definition

./dedalo/config/config.php

DEDALO_AV_AR_QUALITY `string`

This parameter defines the different qualities that can be used for compress the audiovisual files.

This parameter will use to compress audiovisual files to specific quality. The compression will use the original file and will compress to those qualities when the user demand a specific quality.

```php
define('DEDALO_AV_AR_QUALITY', [DEDALO_AV_QUALITY_ORIGINAL,'4k','1080','720','576','404','240','audio']);
```

---

### Defining posterframe filetype extension for audiovisual files

./dedalo/config/config.php

DEDALO_AV_POSTERFRAME_EXTENSION `string`

This parameter defines the type of the image file used to create the posterframe of the audiovisual files.

The posterframe is the image that will show before load the audiovisual files and identify it. This parameter define the type of this image. By default Dédalo use jpg standard to create the posterframe.

```php
define('DEDALO_AV_POSTERFRAME_EXTENSION', 'jpg');
```

---

### Defining audiovisual processor filepath (ffmpeg path)

./dedalo/config/config.php

DEDALO_AV_FFMPEG_PATH `string`

This parameter defines the path to the ffmpeg library in the server. ffmpeg will use to compress the audiovisual files.

```php
define('DEDALO_AV_FFMPEG_PATH', '/usr/bin/ffmpeg');
```

---

### Defining audiovisual processor settings (ffmpeg settings)

./dedalo/config/config.php

DEDALO_AV_FFMPEG_SETTINGS `string`

This parameter defines the path to the ffmpeg settings in the server. This settings configure the parameters of the qualities to be used to compress audiovisual files.

```php
define('DEDALO_AV_FFMPEG_SETTINGS', DEDALO_CORE_PATH . '/media_engine/lib/ffmpeg_settings');

```

---

### Defining audiovisual processor settings (faststart)

./dedalo/config/config.php

DEDALO_AV_FASTSTART_PATH `string`

This parameter defines the path to the qt-faststart library in the server.

qt-faststart is used to move the av header from last bytes of the av file to the start of the av file, this change improve the load of the av because the header is at the beginning of the file and it can read first when loads begin.

```php
define('DEDALO_AV_FASTSTART_PATH', '/usr/bin/qt-faststart');
```

---

### Defining audiovisual ffprobe path

./dedalo/config/config.php

DEDALO_AV_FFPROBE_PATH `string`

This parameter defines the path to the ffprobe library in the server. ffprobe is used to analyze the audiovisual files and get his metadata.

```php
define('DEDALO_AV_FFPROBE_PATH', '/usr/bin/ffprobe');
```

---

### Defining audiovisual streamer

./dedalo/config/config.php

DEDALO_AV_STREAMER `string`

This parameter defines the path to the audiovisual streaming server to be used.

By default Dédalo do not use a streaming server but is possible to setup a streaming video server.

```php
define('DEDALO_AV_STREAMER', NULL);
```

---

### Defining audiovisual watermark file

./dedalo/config/config.php

DEDALO_AV_WATERMARK_FILE `string`

This parameter defines the path to the image file that will be used to create the watermark for audiovisual files.

The watermark is an image superimposed on audiovisual files to identify the entity that has the rights to the av files. Dédalo will use to render the av files with this image and will create the copies of the av files with this watermark. By default, Dédalo uses a background-less png to overlay it as a watermark.

```php
define('DEDALO_AV_WATERMARK_FILE', DEDALO_MEDIA_PATH .'/'. DEDALO_AV_FOLDER . '/watermark/watermark.png');

```

---

### Defining audiovisual subtitles directory

./dedalo/config/config.php

DEDALO_SUBTITLES_FOLDER `string`

This parameter defines the path to the subtitles directory.

Dédalo will store the VTT files generated by the subtitle engine in this directory.

```php
define('DEDALO_SUBTITLES_FOLDER', '/subtitles');
```

---

### Defining audiovisual subtitles type extension

./dedalo/config/config.php

DEDALO_AV_SUBTITLES_EXTENSION `string`

This parameter defines the standard used to create the subtitles.

By default Dédalo use VTT format to create the subtitles.

```php
define('DEDALO_AV_SUBTITLES_EXTENSION', 'vtt');
```

---

### Defining audiovisual re-compress all uploaded files

./dedalo/config/config.php

DEDALO_AV_RECOMPRESS_ALL `int`

This parameter defines if Dédalo will process al audiovisual files uploaded to the server to the default quality.

By default Dédalo will compress all files (1 value), but it can be deactivated with 0 value.

```php
define('DEDALO_AV_RECOMPRESS_ALL', 1);
```

---

### Defining image directory

./dedalo/config/config.php

DEDALO_IMAGE_FOLDER `string`

This parameter defines the main directory for the image files.

```php
define('DEDALO_IMAGE_FOLDER', '/image');
```

---

### Defining image extension (type of file)

./dedalo/config/config.php

DEDALO_IMAGE_EXTENSION `string`

This parameter defines the standard file type of image files.

By default Dédalo use jpg standard definition for the image files. All other formats will be compressed to this standard.

```php
define('DEDALO_IMAGE_EXTENSION', 'jpg');
```

---

### Defining image mime type

./dedalo/config/config.php

DEDALO_IMAGE_MIME_TYPE `string`

This parameter define the standard mime type for the image files. This parameter will use to create the correct http header for the standard define in DEDALO_IMAGE_EXTENSION.

```php
define('DEDALO_IMAGE_MIME_TYPE', 'image/jpeg');
```

---

### Defining image type

./dedalo/config/config.php

DEDALO_IMAGE_TYPE `string`

This parameter defines the standard type for the image files.

This parameter will use to compress the original image format to the codec defined by this parameter. By default Dédalo use the jpeg codec to compress the image files.

```php
define('DEDALO_IMAGE_TYPE', 'jpeg');
```

---

### Defining image extensions supported

./dedalo/config/config.php

DEDALO_IMAGE_EXTENSIONS_SUPPORTED `array`

This parameter defines the standards file type admitted for the image files.

Dédalo will use this parameter to identify the file format of the original files uploaded by the users before compress it to the standard defined in the DEDALO_IMAGE_EXTENSION parameter.

```php
define('DEDALO_IMAGE_EXTENSIONS_SUPPORTED', ['jpg','jpeg','png','tif','tiff','bmp','psd','raw','webp','heic']);
```

### Defining alternative image extensions of image files

./dedalo/config/config.php

DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS `array` *optional*

This parameter defines the standards file types that will use to create versions of the uploaded image files.

Dédalo will use this parameter to create alternative versions of the images uploaded, the files formats that will use to convert from the original files uploaded by the users. This parameter is optional and can be used to add other image formats. When the parameter is active, every image uploaded will be processed in every quality with every format define it.

```php
define('DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS', ['avif','png']);
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

### Defining image quality for original files

./dedalo/config/config.php

DEDALO_IMAGE_QUALITY_ORIGINAL `string`

This parameter defines the quality original for the image files.

This parameter will use to identify the uploaded files to with specific quality. Dédalo admit lots of different formats from different sources and qualities, and it define this files as "original" quality. Dédalo will compress all formats to web standard format, unify all different qualities and codecs, and will store the original file without touch. In some cases, if the institution has a protocol for manage image files, is possible to use one specific quality for the files that users can upload. By default Dédalo do not limit the original format to be uploaded using a "original" quality denomination.

```php
define('DEDALO_IMAGE_QUALITY_ORIGINAL', 'original');
```

---

### Defining image quality for the retouched files

./dedalo/config/config.php

DEDALO_IMAGE_QUALITY_RETOUCHED `string`

This parameter defines the quality for the image files that has been retouched.

Retouched images are the processed images to improve the image, this quality will be a copy of the original that has any kind of process (color balance, background removed, contrasted, etc)

```php
define('DEDALO_IMAGE_QUALITY_RETOUCHED', 'modified');
```

---

### Defining image default quality

./dedalo/config/config.php

DEDALO_IMAGE_QUALITY_DEFAULT `string`

This parameter defines the default quality used for the image files.

This parameter will use to compress all image files to specific quality, unifying the quality used by all sections. By default Dédalo use 1.5MB file size (524.217px or 887x591px) quality.

```php
define('DEDALO_IMAGE_QUALITY_DEFAULT', '1.5MB');
```

---

### Defining image thumb default

./dedalo/config/config.php

DEDALO_IMAGE_THUMB_DEFAULT `string`

This parameter defines the thumb quality definition that can be used for compress the image files.

This parameter will use to compress and store image files used in lists. The compression will use the original file and will compress with smaller version or thumb version of the image.

```php
define('DEDALO_IMAGE_THUMB_DEFAULT', 'thumb');
```

---

### Defining image qualities definition

./dedalo/config/config.php

DEDALO_IMAGE_AR_QUALITY `serialized array`

This parameter defines the different qualities that can be used for compress the image files.

This parameter will use to compress image files to specific quality. The compression will use the original file and will compress to those qualities when the user demand a specific quality.

```php
define('DEDALO_IMAGE_AR_QUALITY', [DEDALO_IMAGE_QUALITY_ORIGINAL,DEDALO_IMAGE_QUALITY_RETOUCHED,'25MB','6MB','1.5MB',DEDALO_IMAGE_THUMB_DEFAULT]);
```

---

### Defining image print resolution definition

./dedalo/config/config.php

DEDALO_IMAGE_PRINT_DPI `int`

This parameter defines the resolution in pixels per inch that will be used in the image compression to be apply when the images will be printed.

```php
define('DEDALO_IMAGE_PRINT_DPI', 150);
```

---

### Defining image engine processor URL

./dedalo/config/config.php

DEDALO_IMAGE_FILE_URL `string`

This parameter defines the image processor engine URL to be used when images need to be compressed.

```php
define('DEDALO_IMAGE_FILE_URL', DEDALO_CORE_URL . '/media_engine/img.php');
```

---

### Defining Image Magick path

./dedalo/config/config.php

MAGICK_PATH `string`

This parameter defines the path to image magick library in the server (when image magick library is installed)

```php
define('MAGICK_PATH', '/usr/bin/');
```

---

### Defining Color profiles paths

./dedalo/config/config.php

COLOR_PROFILES_PATH `string`

This parameter defines the path to image profiles that will apply to the images when they are processed.

Dédalo use the icc (international color consortium) standard for the color profiles.

```php
define('COLOR_PROFILES_PATH', DEDALO_CORE_PATH . '/media_engine/lib/color_profiles_icc/');
```

---

### Defining image thumb width size

./dedalo/config/config.php

DEDALO_IMAGE_THUMB_WIDTH `int`

This parameter defines width size in pixels to the thumb images, it will be used to compress the images with the thumb quality (the smaller version to be used in lists).

```php
define('DEDALO_IMAGE_THUMB_WIDTH', 222);
```

---

### Defining image thumb height size

./dedalo/config/config.php

DEDALO_IMAGE_THUMB_HEIGHT `int`

This parameter defines height size in pixels to the thumb images, it will be used to compress the images with the thumb quality (the smaller version to be used in lists).

```php
define('DEDALO_IMAGE_THUMB_HEIGHT', 148);
```

---

### Defining image web directory

./dedalo/config/config.php

DEDALO_IMAGE_WEB_FOLDER `string`

This parameter defines path for the images uploaded by the user in the component_html, this component can layout html freely and it use a image system outside the resource definition for all images managed by Dédalo. Those images don't use the locator definition and can not re-used by the rest of the system. Normally those images are aesthetic images for institutional explanations and are not part of the catalog.

```php
define('DEDALO_IMAGE_WEB_FOLDER', '/web');
```

---

### Defining pdf directory

./dedalo/config/config.php

DEDALO_PDF_FOLDER `int`

This parameter defines the main directory for the pdf files.

```php
define('DEDALO_PDF_FOLDER', '/pdf');
```

---

### Defining pdf extension (type of file)

./dedalo/config/config.php

DEDALO_PDF_EXTENSION `string`

This parameter defines the standard file type of pdf files.

```php
define('DEDALO_PDF_EXTENSION', 'pdf');
```

---

### Defining pdf extensions supported

./dedalo/config/config.php

DEDALO_PDF_EXTENSIONS_SUPPORTED `serialized array`

This parameter define the standards file type admitted for the pdf files. Dédalo will use this parameter to identify the file format of the original files uploaded by the users.

```php
define('DEDALO_PDF_EXTENSIONS_SUPPORTED', serialize(['pdf']));
```

---

### Defining pdf quality for default files

./dedalo/config/config.php

DEDALO_PDF_QUALITY_DEFAULT `string`

This parameter define the default quality used to manage pdf files.

```php
define('DEDALO_PDF_QUALITY_DEFAULT', 'standar');
```

---

### Defining pdf qualities definition

./dedalo/config/config.php

DEDALO_PDF_AR_QUALITY `array`

This parameter defines the different qualities that can be used for pdf files.

This parameter will use to compress pdf files to specific quality. The compression will use the original file and will compress to those qualities when the user demand a specific quality.

```php
define('DEDALO_PDF_EXTENSIONS_SUPPORTED', ['pdf']);
```

---

### Defining pdf mime type

./dedalo/config/config.php

DEDALO_PDF_MIME_TYPE `string`

This parameter defines the standard mime type for the pdf files.

This parameter will use to create the correct http header for the standard define in DEDALO_PDF_EXTENSION.

```php
define('DEDALO_PDF_MIME_TYPE', 'application/pdf');
```

---

### Defining pdf type

./dedalo/config/config.php

DEDALO_PDF_TYPE `string`

This parameter define the standard type for the pdf files.

This parameter will use to compress the original pdf format to the codec defined by this parameter.

```php
define('DEDALO_PDF_TYPE', 'pdf');
```

---

### Defining pdf quality for original files

./dedalo/config/config.php

DEDALO_PDF_QUALITY_ORIGINAL `string`

This parameter defines the quality original for the pdf files.

This parameter will use to identify the uploaded files to with specific quality. Dédalo admit hight quality for PDF files (print formats or preservation formats), and it define this files as "original" quality. Dédalo will compress to web standard format, unify all different qualities and will store the original file without touch. In some cases, if the institution has a protocol for manage PDF files, is possible to use a specific quality for the files that users can upload. By default Dédalo do not limit the original format to be uploaded using a "original" quality denomination.

```php
define('DEDALO_PDF_QUALITY_ORIGINAL', 'original');
```

---

### Defining pdf quality default

./dedalo/config/config.php

DEDALO_PDF_QUALITY_DEFAULT `string`

This parameter defines the default quality used for the PDF files.

This parameter will use to compress all pdf files to specific format, unifying the quality used by all sections. By default Dédalo will compress images to jpg for web quality.

```php
define('DEDALO_PDF_QUALITY_DEFAULT', 'web');
```

---

### Defining pdf quality for processed files

./dedalo/config/config.php

DEDALO_PDF_AR_QUALITY `array`

This parameter defines the different qualities that can be used for compress the PDF files.

This parameter will use to compress PDF files to specific quality. The compression will use the original file and will compress to those qualities when the user demand a specific quality.

```php
define('DEDALO_PDF_AR_QUALITY', [DEDALO_PDF_QUALITY_ORIGINAL, DEDALO_PDF_QUALITY_DEFAULT]);
```

---

### Defining pdf thumb default

./dedalo/config/config.php

DEDALO_PDF_THUMB_DEFAULT `string`

This parameter defines the thumb quality definition that can be used for compress the pdf files.

This parameter will use to compress and store image files used in lists. The compression will use the original file and will compress the first page with smaller version or thumb version of the pdf. Only will be compress the first pdf page to thumb quality.

```php
define('DEDALO_PDF_THUMB_DEFAULT', 'thumb');
```

---

### Defining main 3d directory

./dedalo/config/config.php

DEDALO_3D_FOLDER `string`

This parameter define the main directory for the 3d files.

```php
define('DEDALO_3D_FOLDER', '/3d');
```

---

### Defining 3d extension (type of file)

./dedalo/config/config.php

DEDALO_3D_EXTENSION `string`

This parameter defines the standard file type of 3d files.

By default Dédalo use glb standard definition for the 3d files. All other formats will be exported to this standard.

```php
define('DEDALO_3D_EXTENSION', 'glb');
```

---

### Defining 3d extensions supported

./dedalo/config/config.php

DEDALO_IMAGE_EXTENSIONS_SUPPORTED `array`

This parameter defines the standards file type admitted for the 3d files.

Dédalo will use this parameter to identify the file format of the original files uploaded by the users before transform it to the standard defined in the DEDALO_3D_EXTENSION parameter.

```php
define('DEDALO_3D_EXTENSIONS_SUPPORTED', ['glb']);
```

> Note: in current version only glb files are available, in future versions other format files will be supported: as 'gltf', 'obj', 'fbx', 'dae', 'zip'

---

### Defining 3d mime type

./dedalo/config/config.php

DEDALO_3D_MIME_TYPE `string`

This parameter defines the standard mime type for the 3d files.

This parameter will use to create the correct http header for the standard define in DEDALO_3D_EXTENSION.

```php
define('DEDALO_3D_MIME_TYPE', 'model/gltf-binary');
```

---

### Defining 3d quality for original files

./dedalo/config/config.php

DEDALO_3D_QUALITY_ORIGINAL `string`

This parameter defines the quality original for the 3d files.

This parameter will use to identify the uploaded files to with specific quality. Dédalo admit lots of different formats from different sources and qualities, and it define this files as "original" quality. Dédalo will transform all supported formats to web standard format, unify all different qualities and codecs, and will store the original file without touch. In some cases, if the institution has a protocol for manage image files, is possible to use one specific quality for the files that users can upload. By default Dédalo do not limit the original format to be uploaded using a "original" quality denomination.

```php
define('DEDALO_3D_QUALITY_ORIGINAL', 'original');
```

---

### Defining 3d quality for processed files

./dedalo/config/config.php

DEDALO_3D_QUALITY_DEFAULT `string`

This parameter defines the default quality used for the 3d files.

This parameter will use to transform all 3d files to specific format, unifying the quality used by all sections. By default Dédalo use glb format for web quality.

```php
define('DEDALO_3D_QUALITY_DEFAULT', 'web');
```

---

### Defining 3d thumb default

./dedalo/config/config.php

DEDALO_3D_THUMB_DEFAULT `string`

This parameter defines the thumb quality definition that can be used for compress the 3d files.

This parameter will use to render, compress and store image files used in lists. The compression will use the 3d original file and will render it and compress at 720x404 jpg version or thumb version of the image.

```php
define('DEDALO_3D_THUMB_DEFAULT', 'thumb');
```

---

### Defining 3d qualities definition

./dedalo/config/config.php

DEDALO_3D_AR_QUALITY `array`

This parameter defines the different qualities that can be used for store 3d files.

This parameter will use to store files to specific quality.

```php
define('DEDALO_3D_AR_QUALITY', [DEDALO_3D_QUALITY_ORIGINAL, DEDALO_3D_QUALITY_DEFAULT]);
```

---

### Defining 3d gltfpack converter

./dedalo/config/config.php

DEDALO_3D_GLTFPACK_PATH `string`

This parameter defines the gltfpack library path.

This parameter will use to locate the gltfpack library, it will use to compress and store 3d files from gltf format to glb.

```php
define('DEDALO_3D_GLTFPACK_PATH', '/usr/local/bin/gltfpack');
```

---

### Defining 3d FBX2glTF converter

./dedalo/config/config.php

DEDALO_3D_FBX2GLTF_PATH `string`

This parameter defines the FBX2glTF library path.

This parameter will use to locate the FBX2glTF library, it will use to compress and store 3d files from fbx format to glb.

```php
define('DEDALO_3D_FBX2GLTF_PATH', '/usr/local/bin/FBX2glTF');
```

---

### Defining 3d COLLADA2GLTF converter

./dedalo/config/config.php

DEDALO_3D_COLLADA2GLTF_PATH `string`

This parameter defines the COLLADA2GLTF library path.

This parameter will use to locate the COLLADA2GLTF library, it will use to compress and store 3d files from Collada format to glb.

```php
define('DEDALO_3D_COLLADA2GLTF_PATH', '/usr/local/bin/COLLADA2GLTF-bin');
```

---

### Defining html render to pdf library path

./dedalo/config/config.php

DEDALO_PDF_RENDERER `string`

This parameter defines the path to the library, normally wkhtmltopdf, to be used for process the html pages to pdf format, this library will be used to create a print version of the records.

```php
define('DEDALO_PDF_RENDERER', '/usr/bin/wkhtmltopdf');
```

---

### Pdf automatic transcription engine

./dedalo/config/config.php

PDF_AUTOMATIC_TRANSCRIPTION_ENGINE `string`

This parameter defines the path to the library, normally xpdf (pdftotext), to be used for process the pdf to extract the information, this library will be used get the text fo the pdf files and store in the component_text_area. The text will be use to search inside the pdf information.

```php
define('PDF_AUTOMATIC_TRANSCRIPTION_ENGINE', '/usr/bin/pdftotext');
```

---

### Defining directory for html files

./dedalo/config/config.php

DEDALO_HTML_FILES_FOLDER `string`

This parameter defines the directory for the html files.

```php
define('DEDALO_HTML_FILES_FOLDER', '/html_files');
```

---

### Defining html files extension (type of file)

./dedalo/config/config.php

DEDALO_HTML_FILES_EXTENSION `string`

This parameter defines the standard file type of pdf files.

```php
define('DEDALO_HTML_FILES_EXTENSION', 'html');
```

---

### Defining main directory for svg files

./dedalo/config/config.php

DEDALO_SVG_FOLDER `string`

This parameter defines the main directory for the svg files.

```php
define('DEDALO_SVG_FOLDER', '/svg');
```

---

### Defining svg extension (type of file)

./dedalo/config/config.php

DEDALO_SVG_EXTENSION `string`

This parameter defines the standard file type of svg files.

```php
define('DEDALO_SVG_EXTENSION', 'svg');
```

---

### Defining svg extensions supported

./dedalo/config/config.php

DEDALO_SVG_EXTENSIONS_SUPPORTED `array`

This parameter defines the standards file type admitted for the svg files.

Dédalo will use this parameter to identify the file format of the original files uploaded by the users.

```php
define('DEDALO_SVG_EXTENSIONS_SUPPORTED', ['svg']);
```

---

### Defining svg mime type

./dedalo/config/config.php

DEDALO_SVG_MIME_TYPE `string`

This parameter defines the standard mime type for the svg files.

This parameter will use to create the correct svg header for the standard define in DEDALO_SVG_EXTENSION.

```php
define('DEDALO_SVG_MIME_TYPE', 'image/svg+xml');
```

---

### Defining svg quality for original files

./dedalo/config/config.php

DEDALO_SVG_QUALITY_ORIGINAL `string`

This parameter defines the quality original for the svg files.

This parameter will use to identify the uploaded files to with specific quality. Dédalo admit different editing vector formats, and it define this files as "original" quality, Dédalo will store the original file without touch. In some cases, if the institution has a protocol for manage SVG files, is possible to use a specific quality for the files that users can upload. By default Dédalo do not limit the original format to be uploaded using a "original" quality denomination.

```php
define('DEDALO_SVG_QUALITY_ORIGINAL', 'original');
```

---

### Defining svg quality for processed files

./dedalo/config/config.php

DEDALO_SVG_QUALITY_DEFAULT `string`

This parameter defines the default quality used for the SVG files.

This parameter will use to store all svg files, unifying the quality used by all sections. By default Dédalo will use a flat svg for web quality.

```php
define('DEDALO_SVG_QUALITY_DEFAULT', 'web');
```

---

### Defining svg qualities for processed files

./dedalo/config/config.php

DEDALO_PDF_AR_QUALITY `array`

This parameter defines the different qualities that can be used transformed svg files.

This parameter will use to store different svg version files to specific quality.

```php
define('DEDALO_SVG_AR_QUALITY', [DEDALO_SVG_QUALITY_DEFAULT, DEDALO_SVG_QUALITY_DEFAULT]);
```

---

### Defining upload temporary directory

./dedalo/config/config.php

DEDALO_UPLOAD_TMP_DIR `string`

This parameter defines the temporary directory used for upload files.

This parameter will use to store different chunks or files previous to be processed.

```php
define('DEDALO_UPLOAD_TMP_DIR', DEDALO_MEDIA_PATH . '/upload/service_upload/tmp');
```

---

### Defining upload split files in chunks

./dedalo/config/config.php

DEDALO_UPLOAD_SERVICE_CHUNK_FILES `int || bool`

When has a int this parameter defines the size to split into chunk files.

When the parameter is `false` the files will not chunked, the upload will be without split.

This parameter will use to split files at specific size into small chunks or blobs. The value is expressed in MB, but do not use the MB string, the value is a integer, for ex: 95 will be interpreted as 95MB.

```php
define('DEDALO_UPLOAD_SERVICE_CHUNK_FILES', false); // 5 = 5MB
```

### Georeferencing variables

Dédalo use a georeference system based in leaflet library to create maps for the heritage.

---

### Defining georeference provider

./dedalo/config/config.php

DEDALO_GEO_PROVIDER `string`

This parameter defines the tile maps provider to be used.

The param can be change the provider to specific configurations, for ex, if you want to use the ancient roman map and the actual OSM map you can use the "NUMISDATA" provider that include both maps. values supported: OSM | ARCGIS | GOOGLE | VARIOUS | ARCGIS | NUMISDATA

```php
define('DEDALO_GEO_PROVIDER', 'VARIOUS');
```

## Menu variables

### Defining media area tipo for specific entity model

./dedalo/config/config.php

DEDALO_ENTITY_MEDIA_AREA_TIPO `string`

This parameter defines the media area tipo that will removed from the menu. This area is the ontology definition for media files for the entity.

By default Dédalo do not use this parameter because the default installation use the standard media area for all media definitions. This parameter can be used by the entities to define his media model in the ontology for ex: mupreva260.

```php
define('DEDALO_ENTITY_MEDIA_AREA_TIPO', '');
```

---

### Defining skip tipos from menu

./dedalo/config/config.php

DEDALO_ENTITY_MENU_SKIP_TIPOS `array`

This parameter defines the tipos to be skipped from the menu.

The ontology sometimes define long hierarchy to access to the sections, and could be convenient to remove some tipo from the menu to access more quickly to the sections. Add the tipo to the array to be removed it from menu.

```php
define('DEDALO_ENTITY_MENU_SKIP_TIPOS', []);
```

---

### Defining test install

./dedalo/config/config.php

DEDALO_TEST_INSTALL `bool`

This parameter defines if Dédalo will test if was installed.

On true, check if the root user has set password at login page, if not set Dédalo will init the install process.

```php
define('DEDALO_TEST_INSTALL', true);
```

---

### Defining section_id temporal

./dedalo/config/config.php

DEDALO_SECTION_ID_TEMP `string`

This parameter defines the section_id used to create temporal sections on the fly.

Temporal sections are previous version of the section, created before it has a section_id assigned by the database counter. The temporal section_id identify those sections to be managed before that the section will saved into database.

```php
define('DEDALO_SECTION_ID_TEMP', 'tmp');
```

## Tools variables

### Defining path of the export tool files directory

./dedalo/config/config.php

DEDALO_TOOL_EXPORT_FOLDER_PATH `string`

This parameter defines the path of the directory to be used by the tool export to save the data in the different formats such as .csv .html, etc

```php
define('DEDALO_TOOL_EXPORT_FOLDER_PATH', DEDALO_MEDIA_PATH . '/export/files');
```

---

### Defining uri of the export tool files directory

./dedalo/config/config.php

DEDALO_TOOL_EXPORT_FOLDER_URL `string`

This parameter defines the uri of the directory to get the files exported by the export tool, it will be used by the client to get the different formats such as .csv .html, etc

```php
define('DEDALO_TOOL_EXPORT_FOLDER_URL' , DEDALO_MEDIA_BASE_URL . '/export/files');
```

---

### Defining path of the import tool files directory

./dedalo/config/config.php

DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH `string`

This parameter defines the path to the directory to be used by the import tool. This path will be read to get the csv files inside it.

```php
define('DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH', DEDALO_MEDIA_BASE_PATH . '/import/files');
```

## Security variables

### Defining lock components

./dedalo/config/config.php

DEDALO_LOCK_COMPONENTS `bool`

This parameter defines if Dédalo will lock / unlock components to avoid replacement data when more than one user edit the same component or Dédalo do not manage the user edition unlocking all components. By default Dédalo do not manage the editions (option false).

```php
define('DEDALO_LOCK_COMPONENTS', false);
```

---

### Defining lock components notifications

./dedalo/config/config.php

DEDALO_NOTIFICATIONS `bool`

This parameter defines if Dédalo will notify to the user than other users are editing the same field in the same section when the user try to edit the field.

```php
define('DEDALO_NOTIFICATIONS', false);
```

---

### Defining protect media files for external access

./dedalo/config/config.php

DEDALO_PROTECT_MEDIA_FILES `bool`

This parameter defines if the directory of the media files (av, images, pdf, ...) will be protected and controlled for undesired/external access.

By default Dédalo do not close the access for media files because it can access by external web pages (false option), when the option is active (true) the direct access to media files are avoided and only is possible access by the internal system or the publication API .

```php
define('DEDALO_PROTECT_MEDIA_FILES', false);
```

---

### Defining node js library path

./dedalo/config/config.php

DEDALO_NODEJS `string`

This parameter defines the path of the node js library in the server. Dédalo uses node to create and manage the notification system.

```php
define('DEDALO_NODEJS', '/usr/bin/node');
```

---

### Defining node js pm2 library path

./dedalo/config/config.php

DEDALO_NODEJS_PM2 `string`

This parameter defines the path of the node js pm2 library in the server.

```php
define('DEDALO_NODEJS_PM2', '/usr/bin/pm2');
```

---

### Defining exclude components

./dedalo/config/config.php

DEDALO_AR_EXCLUDE_COMPONENTS `array`

This parameter defines components to be excluded.

Some installations need to block the global access to specific components, use this param to remove the components adding the tipo into the array.

```php
define('DEDALO_AR_EXCLUDE_COMPONENTS', []);
```

---

### Defining filter user records by id

./dedalo/config/config.php

DEDALO_FILTER_USER_RECORDS_BY_ID `bool`

This parameter defines if the sections (records) will be filtered by the section is defined in user preferences.

This filter is applied on every search and list made by the specific user.

```php
define('DEDALO_FILTER_USER_RECORDS_BY_ID', false);
```

---

### Geonames account

./dedalo/config/config.php

GEONAMES_ACCOUNT_USERNAME `string`

This parameter defines the username of the geonames account. It use by develop and sync toponomy data to build countries hierarchies.

```php
define('GEONAMES_ACCOUNT_USERNAME', 'my_account');
```

---

### Encryption mode

./dedalo/config/config.php

ENCRYPTION_MODE `string`

This parameter define the encryption engine used to manage the global security system. By default Dédalo uses openSSL to encrypt data.

```php
define('ENCRYPTION_MODE', 'openssl');
```

## Diffusion variables

Diffusion defines the configuration variables to be used by Dédalo to process data and resolve relations to get the version of data defined to be stored into MySQL

---

### Diffusion domain

./dedalo/config/config.php

DEDALO_DIFFUSION_DOMAIN `string`

This parameter would be set with the diffusion domain of our project publication, diffusion domain is the target domain or the part of diffusion ontology that will be used to get the tables and fields and the relation components in the back-end.

The definition for diffusion domain in the configuration file can set only one ontology diffusion_domain for our installation, it can have different diffusion groups or diffusion elements with different databases and tables.

```php
define('DEDALO_DIFFUSION_DOMAIN', 'default')
```

> Any other 'section_tipo' are accepted and it can be other standard tlds used in the ontology like oh1 or ich1. If your institution has a specific tld space in the ontology, you can use your own tld into the DEDALO_DIFFUSION_DOMAIN.

---

### Defining resolution levels; going to the deeper information

./dedalo/config/config.php

DEDALO_DIFFUSION_RESOLVE_LEVELS `int`

This parameter set the number of resolution levels we would like to accomplish. By default, its value is set to '2'.

```php
define('DEDALO_DIFFUSION_RESOLVE_LEVELS', 2)
```

> Every other positive, numerical value will be accepted.

The number defines the maximum resolution levels of linked information that Dédalo will resolved in the publication process. Dédalo work with related data connected by locators, every link is a level of information, the parameter limit the quantity of linked data will be resolve in the linked data tree.

Ex: If you have an Oral History interview (level 0) with 1 linked image (level 1) and this image has a person linked as author (level 2) and these author 1 linked toponym for the birthplace (level 3). For publishing all linked information will be necessary 3 levels of resolution:

If you increase the value of this parameter, the time needed by Dédalo to resolve the linked data in the publication process will also increase in exponential progression.

---

### Defining media paths resolution

./dedalo/config/config.php

DEDALO_PUBLICATION_CLEAN_URL `boolean`

Defines how the paths of the media files will be treated in diffusion processing. Default value: false.

```php
define('DEDALO_PUBLICATION_CLEAN_URL', false)
```

> If isset as true, the path will be lost and you will have to reconstruct it later, on the web page.

On true, the paths will be simplified to the file name like 'rsc37_rsc176_34.pdf' from '/dedalo/media/pdf/web/0/rsc37_rsc176_34.pdf'.

---

### Check the publication state

./dedalo/config/config.php

skip_publication_state_check `int`

When one user publishes some record, Dédalo checks if this information has changes that are not published, if Dédalo found new data to publish the diffusion process began and the information will be replaced in MySQL. If the register doesn't have new information the process is stopped for this record.

Checking the publication status prevent double, triple o more publications of the same record and all process will be faster (some records will not published), but in some cases can be useful that Dédalo don't check the diffusion state, and perform the publication process for every record has new information or no.

This property configures the publication process to check the new data status or ignore it. This property is stored into the global Dédalo $_SESSION.

```php
$_SESSION['dedalo4']['config']['skip_publication_state_check'] = 1;
```

| Value | skip state check? |
|  --- |  ---  |
| 0 | don't check |
| 1 | check  |

---

### Defining diffusion custom

./dedalo/config/config.php

DIFFUSION_CUSTOM `string || bool` *optional*

Optional custom diffusion class file path.

It is able to create additional diffusion class file with static methods to be called from ontology diffusion elements beyond the Dédalo defined diffusion methods.

Default is false.

It is possible to specify a class file for ex: `/extras/my_entity/diffusion/class.diffusion_my_entity.php`

```php
define('DIFFUSION_CUSTOM', DEDALO_LIB_BASE_PATH . false);
```

---

### Setting the API web user code for multiple DDBB

./dedalo/config/config.php

API_WEB_USER_CODE_MULTIPLE `array`

The access to the public API is controlled with a code that we can define and store into the parameter. This code can be public or private, if you want open access to your public data you can share this code.

The array specifies two key params; 'db_name' and 'code'. The combination of these two params get the access to the data.

```php
define('API_WEB_USER_CODE_MULTIPLE' , [
        [
            'db_name' => 'dedalo_public',
            'code'  => 'My_code_for_public_API'
        ]
    ]);
```

> In a simple installation with only one DDBB you can use the param 'API_WEB_USER_CODE'.

## Maintenance variables

Maintenance configure the variables that Dédalo will use to update the ontology, the code or check if the system is working properly.

---

### Sync ontology from master server

./dedalo/config/config.php

STRUCTURE_FROM_SERVER `bool`

This parameter defines if the installation will be updated his ontology using the master server versions.

```php
define('STRUCTURE_FROM_SERVER', true);
```

---

### Ontology master server code

./dedalo/config/config.php

STRUCTURE_SERVER_CODE `string`

This parameter defines the valid code to be send to get access to the master server.

```php
define('STRUCTURE_SERVER_CODE', 'ZdUs7asdasdhRsw4!sp');
```

---

### Ontology master server uri

./dedalo/config/config.php

STRUCTURE_SERVER_URL `string`

This parameter defines the uri to the master server

```php
define('STRUCTURE_SERVER_URL', 'https://master.dedalo.dev/dedalo/lib/dedalo/extras/str_manager/');
```

---

### Ontology download directory

./dedalo/config/config.php

ONTOLOGY_DOWNLOAD_DIR `string`

This parameter defines the directory to download the ontology files in the server.

```php
define('ONTOLOGY_DOWNLOAD_DIR', DEDALO_BACKUP_PATH_ONTOLOGY . '/download');
```

---

### Ontology in json format download directory

./dedalo/config/config.php

STRUCTURE_DOWNLOAD_JSON_FILE `string`

This parameter defines the directory on the server to download the ontology files in json format.

```php
define('STRUCTURE_DOWNLOAD_JSON_FILE', DEDALO_BACKUP_PATH_ONTOLOGY);
```

---

### Proxy server

./dedalo/config/config.php

SERVER_PROXY `string`

This parameter defines if the access to the master server will need to be accessed through a proxy server.

```php
define('SERVER_PROXY', '192.0.0.1:3128');
```

> In the string could add user and password as proxy needs. Ex: my_user:my_pw@192.0.0.1:3128
---

### Defining source version uri

./dedalo/config/config.php

DEDALO_SOURCE_VERSION_URL `string`

This parameter defines the master server uri repository to get the new Dédalo code for update / upgrade.

```php
define('DEDALO_SOURCE_VERSION_URL', 'https://github.com/renderpci/dedalo/archive/refs/heads/master.zip');
```

>It's possible get the Dédalo code from different sources. If you want specify the version to download you can access to the specific version in GitHub and use it.
>
>Examples:
>for the version 5.8.2
><https://github.com/renderpci/dedalo/archive/refs/tags/V5.8.2.zip>
>
>for the version 5.7.77
><https://github.com/renderpci/dedalo/archive/refs/tags/v5.7.77.zip>
>
>Or you can use the developer version
><https://github.com/renderpci/dedalo/archive/refs/heads/developer.zip>

---

### Defining source versions local directory to save the new code

./dedalo/config/config.php

DEDALO_SOURCE_VERSION_LOCAL_DIR `string`

This parameter defines the path to the local directory to save the new code downloaded from the master server repository.

```php
define('DEDALO_SOURCE_VERSION_LOCAL_DIR', '/tmp/'.DEDALO_ENTITY);
```

---

### Defining ip api service

./dedalo/config/config.php

IP_API `array`

Defines the service to be used in section Activity to resolve source Country from IP address.

By default Dédalo use the ipapi.co service with free unsigned account. Is possible to configure other services with your specific account. If you want to use a http instead https you can use `ip-api.com`

```php
define('IP_API', [
    'url'           => 'https://ipapi.co/$ip/json/', // https capable as free
    'href'          => 'https://ipapi.co/?q=$ip', // page to jump on click
    'country_code'  => 'country_code' // / property where look country code for flag
]);
```

!!! note "IP variable"
    `$ip` string will be replaced by the real IP value in resolution and 'country_code' value property is used to generate the icon flag.

    The URL must be in the format that the provider requires.

---

### Defining maintenance mode

./dedalo/config/config.php

DEDALO_MAINTENANCE_MODE `bool`

This parameter defines whether the maintenance mode is active or not.

By default the maintenance mode is inactive (false). When it is active (true) only root user can login and all logged users will be forced to leave the session, the debugger will be activated and the logger will be changed from WARNING to DEBUG mode.

```php
define('DEDALO_MAINTENANCE_MODE', false);
```

---

### Notice to active users

./dedalo/config/config.php

notice_to_active_users() `function`

This function activates a message for all registered users, it could be used to advertise if the server will need to shut down or other actions that users should know about. This function admin two different parameters, the message and the mode.

```php
notice_to_active_users(array('msg'=>'Please leave the session', 'mode'=>"warning"));
```
