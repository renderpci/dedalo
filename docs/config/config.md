# Configuration

Dédalo has four different config files in the ../dedalo/config/ directory:

* config.php
* config_db.php
* config_areas
* config_core.php

Every file configure a specific part of the installation.

The configuration files are "static" files that is necessary update manually, because these files has your database connection (with name, passwords, etc) and other specific parameters for your installation.

> Note: You will need review the "sample" files of the new versions to add or remove the changes specify in the new version. Dédalo will not change your specific configuration files when it's updated automatically.

## Rename Dédalo configuration files

In the installation process you will has rename the sample files to active files, removing the "sample_" text of the filename. If you not did this step complete it before config your installation.

When Dédalo is downloaded from GitHub, some config files should be configured with the proper parameters. All those config files come with a 'sample' prefix that need to be removed from the names to get the functionality.

The first step would be locating and renaming config files from their original value in GitHub to target file names that Dédalo can will locate and use.

### Rename global Dédalo config file

**config.php**

This is the main config for all Dédalo system, this file is used to configure Dédalo with the entity, languages the will used in the projects, media formats, directories to use.

1. Locate the file into the directory: ../httpdocs/dedalo/config/

	```shell
	cd ../httpdocs/dedalo/config/
	```
2. Rename the sample.config.php to config.php

	```shell
	mv sample.config.php config.php
	```

### Dédalo DB config file

**config_db.php**

This config file set the Dédalo connection to databases. This file will be used to configure both PostgreSQL and MySQL databases connections. PostgreSQL will be used for the working system and MySQL will be used to publish data.

1. Locate the file into the directory: ../httpdocs/dedalo/config/

	```shell
	cd ../httpdocs/dedalo/config/
	```
2. Rename the sample.config_db.php to config_db.php

	```shell
	mv sample.config_db.php config_db.php
	```

### Dédalo Areas config file

**config_areas.php**

This config file set the Dédalo areas that are usable or can be accessed or denied his access. The areas are the main group of information, it could be any "cultural field" of the research such as Oral Memory or Archeological heritage. Allowing or denying access to an area you are allowing or removing the access to all sections that this area has.

1. Locate the file into the directory: ../httpdocs/dedalo/config/

	```shell
	cd ../httpdocs/dedalo/config/
	```
2. Rename the sample.config_areas.php to config_areas.php

	```shell
	mv sample.config_areas.php config_areas.php
	```

### Dédalo core config file

**config_core.php**

This config file is used by Dédalo to set and get the status of the installation, you do not need change it manually.

1. Locate the file into the directory: ../httpdocs/dedalo/config/

	```shell
	cd ../httpdocs/dedalo/config/
	```
2. Rename the sample.config_core.php to config_core.php

	```shell
	mv sample.config_core.php config_core.php
	```

## Set up Dédalo configuration files

Every config file has its own parameters that need to be changed with the our project environment.

### Changing the parameters of global Dédalo config file.

**config.php**

1. Locate the file into the directory: ../httpdocs/dedalo/config/

	```shell
	cd ../httpdocs/dedalo/config/
	```
2. Edit the config.php

	```shell
	nano config.php
	```
3. Locate and change the PROPERTY with the proper configuration.

	### **Main variables**
	### paths
	---

	#### Dédalo host

	**config.php**

	DEDALO_HOST	`string`

	This parameter use the name of the domain or ip of your installation. Used the header from the current request, if there is one, and store the domain or ip of the call.


	```php
	define('DEDALO_HOST', $_SERVER['HTTP_HOST'] );
	```
	---

	#### Dédalo protocol

	**config.php**

	DEDALO_PROTOCOL	`string`

	This parameter define the internet protocol used by the server to connect all system. It is recommended to use the HTTPS protocol for installation with SSL certification, it is not mandatory but it ensures that your server connection will be protected with encryption.

	```php
	define('DEDALO_PROTOCOL',	(isset($_SERVER['HTTPS']) && $_SERVER['HTTPS']==='on') ? 'https://' : 'http://');
	```
	---

	#### Dédalo root path

	**config.php**

	DEDALO_ROOT_PATH	`string`

	This parameter define the root directory for Dédalo installation. It is used to define the relative paths inside the server used by internal server commands in the terminal or basic load and server code files. The path is define by you server directory configuration and apache directory configuration.

	> Example: /home/www/httpdocs/dedalo
	>

	```php
	define('DEDALO_ROOT_PATH',	dirname(dirname(__FILE__)));
	```
	---

	#### Dédalo root web directory

	**config.php**

	DEDALO_ROOT_WEB	`string`

	Used to define the the uri path to the root Dédalo installation. This uri will be used to call to other Dédalo paths and files by the client. Used to create html and js with the uri paths to different Dédalo services.

	> Example: https://dedalo.dev/dedalo
	>

	```php
	define('DEDALO_ROOT_WEB',	'/' . explode('/', $_SERVER["REQUEST_URI"])[1]);
	```
	---

	#### Dédalo base paths

	**config.php**

	Define the names of the config files. This constants are used for build paths to config files. It is possible to change the name of the configuration files changing this values.

	DEDALO_CONFIG	`string`  
	DEDALO_CORE		`string`  
	DEDALO_SHARED	`string`  
	DEDALO_TOOLS	`string`  
	DEDALO_LIB		`string`  

	```php
	define('DEDALO_CONFIG',	'config');
	define('DEDALO_CORE',	'core');
	define('DEDALO_SHARED',	'shared');
	define('DEDALO_TOOLS',	'tools');
	define('DEDALO_LIB',	'lib');
	```
	
	---

	#### Dédalo config path

	**config.php**

	DEDALO_CONFIG_PATH	`string`

	Used to define the the main config directory. Config directory has all specific files of Dédalo installation. This files are not changed by the system because every intallation has his own configuration as connection to DDBB. The exception is the `config_core` file that is used by Dédalo to store the state of the installation.

	To update the config contants you will need to see the version changes in the sample_* files because this files will be sync by updates.

	```php
	define('DEDALO_LIB_BASE_PATH', dirname( dirname(__FILE__) ));
	```

	---

	#### Dédalo core path

	**config.php**

	DEDALO_CORE_PATH	`string`

	Defines the core directory. Core directory contains the main code of Dédalo as section, area or components code.

	```php
	define('DEDALO_CORE_PATH',		DEDALO_ROOT_PATH .'/'. DEDALO_CORE);
	```

	---

	#### Dédalo core URL

	**config.php**

	DEDALO_CORE_URL	`string`

	Defines the the uri for the core directory. Core directory contains the main code of Dédalo as section, area or components code.
	The uri path will be use to do calls from API to load and different components.

	```php
	define('DEDALO_CORE_URL',		DEDALO_ROOT_WEB .'/'. DEDALO_CORE );
	```

	---

	#### Dédalo shared path

	**config.php**

	DEDALO_SHARED_PATH	`string`

	Defines the shared directory path. Share directory contains shared code of Dédalo use by core, tools and diffusion system. It contains some classes with common code use in the work system as public webs. If you want create a diffusion system, without work system, you will need copy this directory because public API will use it.

	```php
	define('DEDALO_SHARED_PATH',	DEDALO_ROOT_PATH .'/'. DEDALO_SHARED);
	```

	---

	#### Dédalo shared URL

	**config.php**

	DEDALO_SHARED_URL	`string`

	Defines the the uri for the shared directory. Share directory contains shared code of Dédalo use by core, tools and diffusion system. It contains some classes with common code use in the work system as public webs. If you want create a diffusion system, without work system, you will need copy this directory because public API will use it.

	```php
	define('DEDALO_SHARED_URL',		DEDALO_ROOT_WEB  .'/'. DEDALO_SHARED );
	```
	
	> Example: https://dedalo.dev/dedalo/shared/

	---

	#### Dédalo tools path

	**config.php**

	DEDALO_TOOLS_PATH	`string`

	Defines the tools directory path. Tools directory contains the code for each of them. The tools can be developed outside of the main Dédalo code and can be extended by external developers. Dédalo by default includes specific tools such as image importers or workspaces such as interview indexing. Tools can use core code as sections, components or services to create specific workspaces.

	```php
	define('DEDALO_TOOLS_PATH',		DEDALO_ROOT_PATH .'/'. DEDALO_TOOLS);
	```

	---

	#### Dédalo tools URL

	**config.php**

	DEDALO_TOOLS_URL	`string`

	Defines the uri for the tools directory. Tools directory contains the code for each of them. The tools can be developed outside of the main Dédalo code and can be extended by external developers. Dédalo by default includes specific tools such as image importers or workspaces such as interview indexing. Tools can use core code as sections, components or services to create specific workspaces.

	```php
	define('DEDALO_TOOLS_URL',		DEDALO_ROOT_WEB .'/'. DEDALO_TOOLS );
	```

	---

	#### Dédalo lib path

	**config.php**

	DEDALO_LIB_PATH	`string`

	Used to define the libraries directory path. Lib directory contains the external libraries used by Dédalo for specific tasks, tools or functionalities. Libraries such as Leaflet, ckEditor or Paperjs.


	```php
	define('DEDALO_LIB_PATH',		DEDALO_ROOT_PATH .'/'. DEDALO_LIB);
	```

	---

	#### Dédalo library uri

	**config.php**

	DEDALO_LIB_URL	`string`

	This parameter define the uri path for the lib directory. Lib directory has the external libraries used by Dédalo for specific tasks, tools or functionalities. Libraries such as Leaflet , or Paperjs.
	The uri path will be use to create html and js to load and call different tools or functionalities by client.

	```php
	define('DEDALO_LIB_URL',		DEDALO_ROOT_WEB .'/'. DEDALO_LIB );
	```

	> Example: https://dedalo.dev/dedalo/lib/

	---

	#### Dédalo widgets path

	**config.php**

	DEDALO_WIDGETS_PATH	`string`

	This parameter defines the widgets path. Widgets are pieces of code to be used by areas, sections or components to extend his functionality. For ex: Some components needs a sumatory or formula to calculate his value, so the component will has a definition of the formula in properties that will call to specific widget to be apply, widget will process the data and return it to the component as his value.

	```php
	define('DEDALO_WIDGETS_PATH',	DEDALO_CORE_PATH . '/widgets');
	```
	---

	#### Dédalo widgets URL

	**config.php**

	DEDALO_WIDGETS_URL	`string`

	This parameter defines the uri for widgets directory. Widgets are pieces of code to be used by areas, sections or components to extend his functionality. For ex: Some components needs a sumatory or formula to calculate his value, so the component will has a definition of the formula in properties that will call to specific widget to be apply, widget will process the data and return it to the component as his value.

	```php
	define('DEDALO_WIDGETS_URL',	DEDALO_CORE_URL . '/widgets');
	```

	> Example: https://dedalo.dev/dedalo/core/widgets/

	---

	#### Dédalo extras path

	**config.php**

	DEDALO_EXTRAS_PATH 	`string`

	This parameter defines the extras path directory. Extras path contains specific code for some installations, like tools or widgets, that the specific entity use to extend default Dédalo behaviour. The extras directory is linked by the tld of the ontology used. If you install Dédalo for oral history project, you will need load the 'oh' extras directory, because it has a extension tools for this research field.

	> Example: /home/www/httpdocs/dedalo/core/extras

	```php
	define('DEDALO_EXTRAS_PATH',	DEDALO_CORE_PATH . '/extras');
	```

	> This parameter use previous constant definition:
	>
	> DEDALO_CORE_PATH
	>
	> It ensure the a changes in the lib path will be implemented in the extras path.
	
	---

	#### Dédalo extras uri

	**config.php**

	DEDALO_EXTRAS_URL 	`string`

	This parameter defines the extras path directory. Extras path contains specific code for some installations, like tools or widgets, that the specific entity use to extend default Dédalo behaviour. The extras directory is linked by the tld of the ontology used. If you install Dédalo for oral history project, you will need load the 'oh' extras directory, because it has a extension tools for this research field.

	```php
	define('DEDALO_EXTRAS_URL',		DEDALO_CORE_URL . '/extras');
	```

	> Example: https://dedalo.dev/dedalo/core/extras/

	> This parameter use previous constant definition:
	>
	> DEDALO_CORE_PATH
	>
	> It ensure the a changes in the lib path will be implemented in the extras path.
	

	### Salt
	---

	#### Dédalo salt string (string used for encryption)

	**config.php**

	DEDALO_SALT_STRING	`string`

	Salt string to be used by the encryption systen. Used to generated random string that is added to each password as part of the hashing process.

	```php
	define('DEDALO_SALT_STRING', 'My_secure_Salt_String!_2046');
	```

	### Locale
	---

	#### Dédalo time zone

	**config.php**

	DEDALO_TIMEZONE	`string`

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
	>

	---

	#### Dédalo locale encoding

	**config.php**

	DEDALO_LOCALE	`string`

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

	#### Dédalo date order

	**config.php**

	Defines the default order fo the date imput by users and to be showed in component_date. By default Dédalo use dmy (European dates formant).

	Options:
	*	dmy = common way order day/moth/year
	*	mdy = USA way order moth/day/year
	*	ymd = China, Japan, Korean, Iran way year/month/day

	```php
	define('DEDALO_DATE_ORDER', 'dmy');
	```


	### Entity

	---

	#### Dédalo entity

	**config.php**

	DEDALO_ENTITY	`string`

	This parameter defines the name of the entity proprietary of the Dédalo installation. Dédalo entity will be used to access to databases, to encrypt passwords or to publish data into the specific publication ontology and should NOT be changed after installation.

	```php
	define('DEDALO_ENTITY', 'my_entity_name');
	```
	> Use secure characters to define the entity, without spaces, accents or other special characters that could create conflicts with other server parts, such as database connection. If you want define the full name of the entity, use DEDALO_ENTITY_LABEL definition.
	>

	---

	#### Dédalo entity label

	**config.php**

	DEDALO_ENTITY_LABEL	`string`

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

	#### Entity id

	**config.php**

	DEDALO_ENTITY_ID	`int`

	This parameter defines the normalised id for the entity. The id of the entity could be used to create a locator to obtain information between Dédalo installations, the id will be added to the locator with the key: "entity_id" when the locator point to external resource.

	```php
	define('DEDALO_ENTITY_ID', 0);
	```

	---

	#### Developer server

	**config.php**

	DEVELOPMENT_SERVER	`bool`

	It defines if the server will be used to do develop tasks. When the server is defined to be a developer server, Dédalo will activate the debug mode and will add the developer sections in the menu.

	With the debugger active Dédalo will show lot of messages in the php log and js console taking time to process the data. Do not use developer mode in a production server.

	```php
	define('DEVELOPMENT_SERVER', false);
	```
	---

	### Cache

	---

	#### Dédalo cache manager

	**config.php**

	DEDALO_CACHE_MANAGER	`bool || object`

	This parameter configure the cache manager to use. By default the cache manager use files in tmp directory.

	```php
	define('DEDALO_CACHE_MANAGER', (object)[
		'manager'		=> 'files',
		'files_path'	=> '/tmp'
	]);
	```
	> When cache manager is set to `files` it will write cache files with complex resolved data of current logged user (like profiles data). You can desactivate it in this way:
	> ```php
	> define('DEDALO_CACHE_MANAGER', false );
	> ```

	### Core require

	---

	#### Basic functions

	**config.php**

	Dédalo need to include core_functions.php file, it has definitions of some basic functions that will use for all Dédalo
	class and methods like encoding or encryption data. This file will be loaded before the sesion start.

	```php
	include(DEDALO_CORE_PATH . '/base/core_functions.php');
	```
	---

	#### Version

	**config.php**

	This command include the config core file to control the status of installation.

	```php
	include(DEDALO_CONFIG_PATH . '/config_core.php');
	```

	---

	#### Dédalo fixed tipos

	**config.php**

	Dédalo need to import dd_tipos.php file, with the definition of some fixed ontology tipos, that will use to assign
	directly to some functionalities, without call the ontology.
	This file acts as cache of some common tipos, some times when Dédalo need access to fixed part of the ontology is faster use a prefixed tipo than load the ontology and resolve the tipo, this calls are not loaded dynamically.

	```php
	include(DEDALO_CONFIG_PATH . '/dd_tipos.php');
	```
	> Tipo = Typology of Indirect Programming Object/s.

	---

	#### Version

	**config.php**

	This command include the version file to control the correspondence between code and data versions.

	```php
	include(DEDALO_CONFIG_PATH . '/version.inc');
	```
	---

	#### Database config  / connection

	**config.php**

	Dédalo need to import the config4_db.php file to load the database connection configuration. This file contains the
	PostgreSQL and MariaDB / MySQL connections. Dédalo interface will use the PostgreSQL connection to manage all datasets, the ontology, etc, and will use the MySQL connection to transform and save the publication versions of the data.

	```php
	include(DEDALO_CONFIG_PATH . '/config_db.php');
	```
	---

	### Session

	---

	#### Dédalo session handler

	**config.php**

	DEDALO_SESSION_HANDLER	`string`

	This parameter defines the method used to manage php session for the installation. It could be configured as files, memcached, user or postgresql by default this parameter is defined as `files`, it means that php will use a file stored in the server to save the users sessions.

	If you are using memcached, you can activate it to save the sessions in RAM.

	Sessions store information about the user connection or the last search done, it will use to reopen Dédalo in the same section of the last session browse by the user or reload the filter with the last search configuration.

	```php
	define('DEDALO_SESSION_HANDLER', 'files');
	```
	---

	#### Session lifetime

	**config.php**

	session_duration_hours	`int`
	timeout_seconds `int`

	Session lifetime is defined by one calculation of hours convert to seconds. Normally the sessions in Dédalo define 1 journal session (8 hours) and this time will be the max duration of dedalo user session. The session will be deleted when it exceeds this time.

	```php
	$session_duration_hours = 8;
	$timeout_seconds = intval($session_duration_hours*3600);
	```

	---

	#### Starting the session

	**config.php**

	Starting the session ensure that the session is open and alive when the user login. The session will start with the
	format defined.
	
	Session needs to define the if the protocol to store cookies is https or not. Besides if the cookie samesite is Lax or Strict, by default is define as `Strict`
	
	 the timeout and the session_name (using DEDALO_ENTITY parameter).

	```php
	$cookie_secure		= (DEDALO_PROTOCOL==='https://');
	$cookie_samesite	= (DEVELOPMENT_SERVER===true) ? 'Lax' : 'Strict';
	session_start_manager([
		'save_handler' 			=> 'files',
		'timeout_seconds'		=> $timeout_seconds,
		'prevent_session_lock'	=> defined('PREVENT_SESSION_LOCK') ? PREVENT_SESSION_LOCK : false,
		'session_name' 			=> 'dedalo_'.DEDALO_ENTITY
		'cookie_secure'			=> $cookie_secure, // Only https (true | false)
		'cookie_samesite'		=> $cookie_samesite // (None | Lax | Strict)
	]);
	```

	### Developer variables

	---
	#### Show debug

	**config.php**

	SHOW_DEBUG	`bool`

	This parameter active or deactive the debugger. Used to show the log warnings and errors, it will be always active when the user logged is a superuser.

	```php
	define('SHOW_DEBUG',
		(isset($_SESSION['dedalo']['auth']['user_id']) && $_SESSION['dedalo']['auth']['user_id']==DEDALO_SUPERUSER)
			? true
			: false // default false
	);
	```

	---

	#### Show developer

	**config.php**

	SHOW_DEVELOPER 	`bool`

	Sets, as environment constant, the current logged user profile status (developer: bool true/false). This value is set in the user record option 'Developer' by Dédalo administrators and stored in session on login.

	When is true, the logged user can access and view specific develop information like component configuration (tipo, parent, etc.) hidden to regular users to avoid too much noise.

	```php
	define('SHOW_DEVELOPER',
		(isset($_SESSION['dedalo']['auth']['is_developer']) && $_SESSION['dedalo']['auth']['is_developer']===true)
			? true
			: false // default false
	);
	```



	### Loader required

	---

	#### Loader

	**config.php**

	DEDALO_CORE_PATH	`string`

	Dédalo needs to include some common classes and tools to be operative. The loader is the responsible for loading the core classes into memory before start the users login process.
	
	```php
	include DEDALO_CORE_PATH . '/base/class.loader.php';
	```
	
	### Backup variables

	---

	#### Dédalo backup on loggin

	**config.php**

	DEDALO_BACKUP_ON_LOGIN 	`bool`

	This parameter defines if Dédalo will do a backup when the users login. It prevents that issues doing to the data could repair quickly. 
	If this constant is set to `true` Dédalo will check if the last backup is a copy done after the time defined by DEDALO_BACKUP_TIME_RANGE and will create new one if the time exceed this parameter. Dédalo will use the `.pgpass` file to connect to PostgreSQL and will create a `.backup` file in the backup directory.

	```php
	define('DEDALO_BACKUP_ON_LOGIN'	 , true);
	```

	---

	#### Dédalo backup time range

	**config.php**

	DEDALO_BACKUP_TIME_RANGE	`int`

	This parameter defines the time lapse between backup copies in hours. Dédalo check in every user login if the last backup exceed this time lapse, in affirmative case, it will create new one.

	```php
	define('DEDALO_BACKUP_TIME_RANGE', 8);
	```
	
	---

	#### Dédalo backups directory

	**config.php**

	DEDALO_BACKUP_PATH	`string`

	This parameter defines the backups directory path. By default the backups directory will be out of httpdocs scope for security.

	```php
	define('DEDALO_BACKUP_PATH'	, dirname(dirname(DEDALO_ROOT_PATH)) . '/backups');
	```
	
	---

	#### Dédalo temporary backup

	**config.php**

	DEDALO_BACKUP_PATH_TEMP	`string`

	This parameter defines the temporary backups directory path. Dédalo will use this directory to strore download ontology data before update the ontology.

	```php
	define('DEDALO_BACKUP_PATH_TEMP'	, DEDALO_BACKUP_PATH . '/temp');
	```
	
	---

	#### Dédalo main db backup

	**config.php**

	DEDALO_BACKUP_PATH_DB	`string`

	This parameter defines the main database backups directory path. Dédalo will use this directory to strore the full backup of PostgreSQL.

	```php
	define('DEDALO_BACKUP_PATH_DB'	, DEDALO_BACKUP_PATH . '/db');
	```
	
	---

	#### Dédalo ontology backup

	**config.php**

	DEDALO_BACKUP_PATH_ONTOLOGY	`string`

	This parameter defines the main ontology backups directory path. Dédalo will use this directory to strore the full ontology backup.

	```php
	define('DEDALO_BACKUP_PATH_ONTOLOGY' 	, DEDALO_BACKUP_PATH . '/ontology');
	```
	
	### Logs and errors

	Store application activity data info and errors into `activity` table in DDBB.

	---

	#### Logger level

	**config.php**

	LOGGER_LEVEL	`class constant`

	This parameter defines the level of the information shown in the logger. Normally, when Dédalo is in production, the logger uses the 'WARNING' level that only shows informative information of the action when it has inconsistencies. When Dédalo’s debugger is active, the lever of the logger will be more verbose with debug information, errors, and warnings.

	The server error log level by default is: `ERROR` (will be change to `DEBUB` when SHOW_DEBUG===true)

	|	Level error codes	||
	| --- | --- |
	|	DEBUG	| 100	|
	|	INFO	| 75	|
	|	NOTICE	| 50	|
	|	WARNING	| 25	|
	|	ERROR	| 10	|
	|	CRITICAL| 5		|

	```php
	define('LOGGER_LEVEL', (SHOW_DEBUG===true)
		? logger::DEBUG // log all messages
		: logger::ERROR // log only errors
	);
	```
	> Note that log outputs files are defined in the `php.ini` config file / `error_log` definition like `/var/log/fpm-php.log`. You can view the server log using terminal command `tail -f /var/log/php_errors.log` with your own log path.

	---

	#### Activity log database

	**config.php**

	Dedalo store the activity in the table matrix_activity in PostgreSQL, the logger need to be configured to use this
	table.
	Logger wil save all user activity and the application errors and messages.

	```php
	logger::register('activity'	, 'activity://auto:auto@auto:5432/log_data?table=matrix_activity');
	logger::$obj['activity'] = logger::get_instance('activity');
	```

	### Languages
	---

	#### Dédalo structure lang

	**config.php**

	DEDALO_STRUCTURE_LANG	`string`

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
	>| Value |	Diffusion language |
	>| --- | --- |
	>| lg-spa	| Spanish	|
	>| lg-cat	| Catalan	|
	>| lg-eus	| Basque	|
	>| lg-eng	| English	|
	>| lg-fra	| French	|
	>| lg-ita	| Italian	|
	>| lg-por	| Portuguese	|
	>| lg-deu	| German	|
	>| lg-ara	| Arabian	|
	>| lg-ell	| Greek	|
	>| lg-rus	| Russian	|
	>| lg-ces	| Czech	|
	>| lg-jpn	| Japanese	|

	---

	#### Dédalo application languages

	**config.php**

	DEDALO_APPLICATION_LANGS	`object` (php: serialized associative array)

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

	#### Dédalo default application language

	**config.php**

	DEDALO_APPLICATION_LANGS_DEFAULT	`string`

	Defines the main language will used in the user interface.

	Dédalo can be translated to any language, the translations of the interface are done in the ontology. The users can change the Dédalo interface to use it in his language. In Dédalo the user interface and the data language are separated concepts and it is possible have a interface in one language and the data in other. This main language will be used as primary option and as fall back language when the element does not have the translation available.
	
	```php
	define('DEDALO_APPLICATION_LANGS_DEFAULT', 'lg-eng');
	```

	> See the Dédalo structure lang for see the languages definitions.

	---

	#### Dédalo application language

	**config.php**

	DEDALO_APPLICATION_LANG	`string`

	This parameter defines the language will us Dédalo for the user interface.

	This is a dynamic parameter and it can be changed when the user login, or in application menu. When the language is changed it is saved into the user's session and it is read to maintain coherence in the diary workflow. If the user's session does not have defined the application language then Dédalo will use the application default language definition.

	```php
	define('DEDALO_APPLICATION_LANG', 'lg-spa');
	```

	> This parameter use the method 'fix_cascade_config_var' to calculate the value. The result of this function will be a string with the correct language value in string format. You can define it as fixed data value, but is recommended do not change the definition, if you want change the default language for the interface use the: DEDALO_APPLICATION_LANGS_DEFAULT.

	---

	#### Dédalo default data language

	**config.php**

	DEDALO_DATA_LANG_DEFAULT	`string`

	Defines the main language will used by Dédalo to manage and process data.

	The main language is the mandatory language for the text data in the catalog or inventory. Dédalo is a real multi-language application, it can manage multiple translation of the textual information.

	In a multi-language situation, when you require some tanslated information but it is not present (because it is not done), Dédalo will need to use the main language to do a fall back proccess to main language to show the data. If the main language data is not present, Dédalo will use any other language to show those data.

	```php
	define('DEDALO_DATA_LANG_DEFAULT', 'lg-spa');
	```

	---

	#### Dédalo data language

	**config.php**

	DEDALO_DATA_LANG	`string`

	It defines the data language used by Dédalo to process and render textual information.
	
	This is a dynamic parameter that can be changed by the user in any moment. Dédalo is a real multi-language application, it can manage information in multiple languages and process it as unique information block (the field store any translated version of his data). The user can translate any information directly or using specific tools. This parameter define the current language used.

	```php
	define('DEDALO_DATA_LANG', 'lg-spa');
	```

	> This parameter use the method 'fix_cascade_config_var' to calculate the value. The result of this function will be a string with the correct language value in string format. You can define it as fixed data value, but is recommended do not change the definition, if you want change the default language for the data use the: [DEDALO_DATA_LANG_DEFAULT](#dédalodefaultdatalanguage).

	---

	#### Dédalo data language selector

	**config.php**

	DEDALO_DATA_LANG_SELECTOR	`bool`

	It defines if the menu show or hide the data language selector. 
	
	When the selector is showed the user can change the data language independently of the interface language. If the selector is hide the data language is synchronous to the interface language a change in the interface language will be a change in the data language.
	
	```php
	define('DEDALO_DATA_LANG_SELECTOR',	true);
	```

	---

	#### Dédalo data without language (no lang)

	**config.php**

	DEDALO_DATA_NOLAN	`string`

	This parameter defines the tld used by Dédalo to tag data without translation possibility.

	Dédalo is multi language by default, all information could be translated to other languages that the main lang, but some data is not susceptible to be translated, like numbers, dates or personal names. In these cases Dédalo defines this kind of data as "not translatable" with the specific tld define in this parameter.

	By default and for global Dédalo definition for non translatable data this tld is: `lg-nolan`
	
	```php
	define('DEDALO_DATA_NOLAN', 'lg-nolan');
	```

	---

	#### Dédalo default projects languages

	**config.php**

	DEDALO_PROJECTS_DEFAULT_LANGS	`array`

	This parameter defines the languages that will use for export and publish data.

	This definition control the amount of languages that will be processed to export data or publish data in the publication process. 
	
	When Dédalo export data or publish data, it check the languages of every field of every record to create a fixed version of the data with the language processed or his own correspondences of the main languages when the data is not available in the current language. This parameter reduce the amount languages used in those proceses.
	
	```php
	define('DEDALO_PROJECTS_DEFAULT_LANGS',	[ 'lg-spa', 'lg-cat', 'lg-eng', ]);
	```

	> The parameter use the Dédalo tld definition for languages. See DEDALO_APPLICATION_LANGS definition to show some examples.

	---

	#### Dédalo diffusion languages

	**config.php**

	DEDALO_DIFFUSION_LANGS	`array`

	This parameter defines the languages that Dédalo will use to publish data.

	This definition control the amount of languages that will be processed to publish data in the publication process. When Dédalo publish data, it check the languages of every field of every record to create a fixed version of the data with the language processed or his own correspondences of the main languages when the data is not available in the current language. This parameter reduce the amount languages used in this process.

	This parameter is configured with the same values as DEDALO_PROJECTS_DEFAULT_LANGS, but it can be changed to other values to separate the export languages from the diffusion languages.

	```php
	define('DEDALO_DIFFUSION_LANGS', [ 'lg-spa', 'lg-cat', 'lg-eng', ]);
	```

	>The parameter use the Dédalo tld definition for languages. See DEDALO_APPLICATION_LANGS definition to show some examples.

	---

	#### Dédalo translator url

	**config.php**

	DEDALO_TRANSLATOR_URL	`string`

	This parameter define the external service to translate data.

	You can define the URI for external API service that will use in the translation tool. External services provide different APIs and URIs that can be configured here.

	```php
	define('DEDALO_TRANSLATOR_URL', 'http://babel.render.net/babel_engine/');
	```

	>You will need an account in the external service. Dédalo has full integration with [Apertium](https://www.apertium.org) server (open source machine translation). Other external services, like Google translation, IBM Watson, etc will need a developer integration of his API.
	>
	>If you want to use a machine translation for developer proposes, you can talk with [Render](https://render.es), that support the Dédalo development to get a free account to his machine translation server.
	>	

	### Default variables

	---

	#### Dédalo prefix tipos

	**config.php**

	DEDALO_PREFIX_TIPOS	`array`

	This parameter defines the ontology tipos to be used in the Dédalo installation.

	Every tipo (typology of indirect programming object) defines a heritage field, a data model, a structuration tools and definitions. Dédalo is a multi heritage application with ontologies for Archeology, Ethnology, Oral History, Numismatics, etc. Every project or institution can add any tipos that it demands. An archeologic museum will use the model for archeological catalogs, but it will not need the ethnological definitions. In the same way that Oral History project will don't use the archeological or numismatic definitions.

	By default Dédalo load some common tipos for all project types.

	| | |
	| --- | --- |
	| **dd** | dedalo. Definition of default list and common uses and tools such as translation tools. |
	| **rsc** | resources. Definition for areas and sections commons to all projects such as people, images, audiovisual files, publications, documents, bibliography, etc. |
	| **hierarchy** | thesaurus. Definition for sections as toponymy, onomastic, chronologies, techniques, material, etc. |
	| **lg** | languages, Definition for the languages in the thesaurus (used for all application to translate data and interface) |

	Besides, every installation can import the ontology tipo that will use in the inventory or research:

	| |	|
	| --- | --- |
	| **oh** | Oral History, the definition sections and tools to be used for oral history projects such as interviews, transcription, indexation, etc. |
	| **ich** |	Intangible Cultural Heritage, the definition sections and tools to use for intangible heritage, such as elements, processes, communities, symbolic acts, etc. |
	| **numisdata** | Numismatic heritage,  the definition sections and tools to use for numismatics projecte, such as mints, types, legends, hoards, finds, etc. |
	| **mupreva** | Archeological heritage, the definition of sections and tools to use for archeological heritage, such as archeological places, deposit, catalog, etc. |
	| **qdp** | Ethnological heritage, the definition of sections and tools to use for ethnological heritage, such as objects, collectors, informants, etc |
	| **dmm** |	Memory and documentary heritage, the definition of sections and tools to be used for the heritage of memory, such as graves, deportees, exiles, tortured, etc. |

	
	```php
	define('DEDALO_PREFIX_TIPOS', [ 'dd', 'rsc', 'hierarchy', 'lg', 'oh', 'ich' ]);
	```

	---

	#### Main fallback section

	**config.php**

	MAIN_FALLBACK_SECTION	`string`

	It defines the section will loaded by default when the user login.
	The main section of the project that will used, normally will be a inventory or catalog section.
	
	```php
	define('MAIN_FALLBACK_SECTION', 'oh1');
	```

	---

	#### Numerical matrix value for yes

	**config.php**

	NUMERICAL_MATRIX_VALUE_YES	`int`

	Definition of the section_id of the 'yes' value. This value will use to access directly to this value without call to the database.
	
	```php
	define('NUMERICAL_MATRIX_VALUE_YES', 1);
	```

	---

	#### Numerical matrix value for no

	**config.php**

	NUMERICAL_MATRIX_VALUE_NO	`int`

	Definition of the section_id of the 'no' value. This value will use to access directly to this value without call to the database.

	```php
	define('NUMERICAL_MATRIX_VALUE_NO', 2);
	```

	---

	#### Dédalo maximum rows per page

	**config.php**

	DEDALO_MAX_ROWS_PER_PAGE	`int`

	It defines the maximum rows that will loaded in the lists.

	This value is the default number of rows that Dédalo will load, but is possible to change this value directly in the filtre by the users, when they make a search, if the user do not define the maximum rows, Dédalo will use the value of this parameter.

	```php
	define('DEDALO_MAX_ROWS_PER_PAGE', 10);
	```

	---

	#### Dédalo default profile

	**config.php**

	DEDALO_PROFILE_DEFAULT	`int`

	This parameter defines the section_id of the default profile that Dédalo will use to create new user.

	The profile define where the user can access inside the system, and if they can access to tools or administrative areas. By default Dédalo will use the profile definition for normal 'users' (section_id : 2, the section_id : 1 is for administrators users).

	```php
	define('DEDALO_PROFILE_DEFAULT', 2);
	```

	---

	#### Dédalo default project

	**config.php**

	DEDALO_DEFAULT_PROJECT	`int`

	This parameter defines the default project that Dédalo will use to create new sections (records in the DDBB).

	Dédalo use the project component (component_filter) to group sections by the research criteria. The project field is mandatory in every section, because an user that can access to a project will no see the records of the other projects and, therfore, is necessary that all sections can be searchable by projects. If the user forget introduce project data, Dédalo will use this parameter to introduce it.

	```php
	define('DEDALO_DEFAULT_PROJECT', 1);
	```

	---

	#### Dédalo filter section tipo default

	**config.php**

	DEDALO_FILTER_SECTION_TIPO_DEFAULT	`int`

	This parameter defines the section that has the projects information inside the ontology. 
	
	Dédalo will use this parameter to define the locator of the filter by projects to apply to any search of sections. By default Dédalo has a predefined section to store the projects that administrators users can enlarge. The default section_tipo is 'dd153' and it is located below 'Administration' area in the menu. Every project field target this section to define the specific project of the current record.

	```php
	define('DEDALO_FILTER_SECTION_TIPO_DEFAULT', DEDALO_SECTION_PROJECTS_TIPO );
	```

	> By default this definition get the section_tipo from the predefined constant DEDALO_SECTION_PROJECTS_TIPO inside 'dd_tipos.php' file. Target filter section (current 'dd153' - Projects section). Do not change this param.

	---

	## Media variables
	Media as images, pdf, audiovisual, svg and other are files that Dédalo use inside the sections. 
	
	Media is referenced by locator and all files are name in the server with the locator that call it. Dédalo has a media directories definition that can be change with this paramenters, for ex: is possible define the amount of image copies in different qualities for images.

	---

	#### Dédalo media base path

	**config.php**

	DEDALO_MEDIA_PATH `string`

	This parameter defines the root media directory in the directory tree.

	Normally this directory is located in the top Dédalo directory, but it can be define in other paths. remember that Dédalo will need acces to this directory as owner with read/writte permisions.

	```php
	define('DEDALO_MEDIA_PATH', DEDALO_ROOT_PATH . '/media');
	```

	---

	#### Dédalo media base url

	**config.php**

	DEDALO_MEDIA_URL `string`

	This parameter defines the root media url to be accesed by the client. 
	
	Dédalo will use this parameter to create the uri's to the media accesible to the clients.

	```php
	define('DEDALO_MEDIA_URL', DEDALO_ROOT_WEB . '/media');
	```

	---

	#### Dédalo audiovisual directory

	**config.php**

	DEDALO_AV_FOLDER `string`

	This parameter defines the main directory for the audiovisual files.

	```php
	define('DEDALO_AV_FOLDER', '/av');
	```

	---

	#### Dédalo audiovisual extension (type of file)

	**config.php**

	DEDALO_AV_EXTENSION `string`

	This parameter defines the standard file type of encapsulation for the audiovisual files. 
	
	By default Dédalo use mp4 encapsulation definition for the audiovisual files with codec h264 or h265. All other formats will be compresed to this parameters.

	```php
	define('DEDALO_AV_EXTENSION', 'mp4');
	```

	---

	#### Dédalo audiovisual extensions supported

	**config.php**

	DEDALO_AV_EXTENSIONS_SUPPORTED `array`

	This parameter defines the standards file type admited for the audiovisual files.
	
	Dédalo will use this parameter to indentify the file format of the original files uploaded by the users before compres it to the standard defined in the DEDALO_AV_EXTENSION parameter.

	```php
	define('DEDALO_AV_EXTENSIONS_SUPPORTED', ['mp4','wave','wav','aiff','aif','mp3','mov','avi','mpg','mpeg','vob','zip','flv']);
	```

	---

	#### Dédalo audiovisual mime type

	**config.php**

	DEDALO_AV_MIME_TYPE `string`

	This parameter defines the standard mime type for the audiovisual files.
	
	This parameter will use to create the correct http header for the standar define in DEDALO_AV_EXTENSION.

	```php
	define('DEDALO_AV_MIME_TYPE', 'video/mp4');
	```

	---

	#### Dédalo audiovisual codec type

	**config.php**

	DEDALO_AV_TYPE `string`

	This parameter define the standard code type for the audiovisual files. This parameter will use to compress the audiovisual original format to the codec defined by this parameter. By default Dédalo use the h264 or h265 codec to compress the av files.

	```php
	define('DEDALO_AV_TYPE', 'h264/AAC');
	```

	---

	#### Dédalo audiovisual quality for original files

	**config.php**

	DEDALO_AV_QUALITY_ORIGINAL `string`

	This parameter defines the quality original for the audiovisual files. 
	
	This parameter will use to identify the uploaded files to with specific quality. Dédalo admit lots of differents format from different sources and qualities, and it define this files as "original" quality. Dédalo will compress all formats to web standard format, unify all different qualities and codecs, and will store the original file witout touch. In some cases, if the institution has a protocol for manage av files, is possible to use one specific quality for the files that users can upload. By default Dédalo do not limit the original format to be uploaded using a "original" quality denomination.

	```php
	define('DEDALO_AV_QUALITY_ORIGINAL', 'original');
	```

	---

	#### Dédalo audiovisual quality for procesed files

	**config.php**

	DEDALO_AV_QUALITY_DEFAULT `string`

	This parameter defines the default quality used for the audiovisual files. 
	
	This parameter will use to compress all audiovisual files to specific quality, unifying the quality used by all sections. By deafult Dédalo use 720x404 h264 quality.

	```php
	define('DEDALO_AV_QUALITY_DEFAULT', '404');
	```

	---

	#### Dédalo audiovisual qualities definiton

	**config.php**

	DEDALO_AV_AR_QUALITY `string`

	This parameter defines the different qualities that can be used for compress the audiovisual files. 
	
	This parameter will use to compress audiovisual files to specific quality. The compresion will use the original file and will compress to those qualities when the user demand a specific quality.

	```php
	define('DEDALO_AV_AR_QUALITY', [DEDALO_AV_QUALITY_ORIGINAL,'4k','1080','720','576','404','240','audio']);
	```

	---

	#### Dédalo posterframe filetype extension for audiovisual files

	**config.php**

	DEDALO_AV_POSTERFRAME_EXTENSION `string`

	This parameter defines the type of the image file used to create the posterframe of the audiovisual files. 
	
	The posterframe is the image that will show before load the audivisual files and identify it. This parameter define the type of this image. By deafult Dédalo use jpg standard to create the posterframe.

	```php
	define('DEDALO_AV_POSTERFRAME_EXTENSION', 'jpg');
	```

	---

	#### Dédalo audiovisual processor filepath (ffmpeg path)

	**config.php**

	DEDALO_AV_FFMPEG_PATH `string`

	This parameter defines the path to the ffmpeg library in the server. ffmpeg will use to compress the audivisual files.

	```php
	define('DEDALO_AV_FFMPEG_PATH', '/usr/bin/ffmpeg');
	```

	---

	#### Dédalo audiovisual processor settings (ffmpeg settings)

	**config.php**

	DEDALO_AV_FFMPEG_SETTINGS `string`

	This parameter defines the path to the ffmpeg settings in the server. This settings configure the parameters of the qualities to be used to compress audiovisual files.

	```php
	define('DEDALO_AV_FFMPEG_SETTINGS', DEDALO_CORE_PATH . '/media_engine/lib/ffmpeg_settings');

	```

	---

	#### Dédalo audiovisual processor settings (ffmpeg settings)

	**config.php**

	DEDALO_AV_FFMPEG_SETTINGS `string`

	This parameter define the path to the ffmpeg settings directory in the server. The specific setting will configure the parameters of the quality to be used to compress audiovisual files.

	```php
	define('DEDALO_AV_FFMPEG_SETTINGS', DEDALO_LIB_BASE_PATH . '/media_engine/lib/ffmpeg_settings');
	```

	---

	#### Dédalo audiovisual ffprobe path

	**config.php**

	DEDALO_AV_FFPROBE_PATH `string`

	This parameter define the path to the ffprobe library in the server. Ffprobe is used to analyze the audivisual files and get his metadata.

	```php
	define('DEDALO_AV_FFPROBE_PATH', '/usr/bin/ffprobe');
	```

	---

	#### Dédalo audiovisual streamer

	**config.php**

	DEDALO_AV_STREAMER `string`

	This parameter define the path to the audiovisual streaming server to be used.

	```php
	define('DEDALO_AV_STREAMER', NULL);
	```

	---

	#### Dédalo audiovisual watermark file

	**config.php**

	DEDALO_AV_WATERMARK_FILE `string`

	This parameter defines the path to the image file that will be used to create the watermark for audiovisual files. The watermark is an image superimposed on audiovisual files to identify the entity that has the rights to the av files. Dédalo will use to render the av files with this image and will create the copies of the av files with this watermark. By default, Dédalo uses a backgroundless png to overlay it as a watermark.

	```php
	define('DEDALO_AV_STREAMER', NULL);
	```

	---

	#### Dédalo audiovisual subtitles engine

	**config.php**

	TEXT_SUBTITLES_ENGINE `string`

	This parameter defines the path to the subtitles processor. This tool transform the transcription texts to VTT format to be used as subtitles of the audiovisual files.

	```php
	define('TEXT_SUBTITLES_ENGINE', DEDALO_LIB_BASE_PATH . '/tools/tool_subtitles');
	```

	---

	#### Dédalo audiovisual subtitles directory

	**config.php**

	DEDALO_SUBTITLES_FOLDER `string`

	This parameter defines the path to the subtitles directory. Dédalo will store the VTT files generated by the subtitle engine in this directory.

	```php
	define('DEDALO_SUBTITLES_FOLDER', '/subtitles');
	```

	---

	#### Dédalo audiovisual subtitles type extension

	**config.php**

	DEDALO_AV_SUBTITLES_EXTENSION `string`

	This parameter defines the standard used to create the subtitles. By default Dédalo use VTT format to create the subtitles.

	```php
	define('DEDALO_AV_SUBTITLES_EXTENSION', 'vtt');
	```

	---

	#### Dédalo audiovisual recompress all uploaded files

	**config.php**

	DEDALO_AV_RECOMPRESS_ALL `int`

	This parameter defines if Dédalo will process al audiovisula files uploaded to the server to the default quality. By default Dédalo will compress all files (1 value), but it can be desactivated with 0 value.

	```php
	define('DEDALO_AV_RECOMPRESS_ALL', 1);
	```

	---

	#### Dédalo image directory

	**config.php**

	DEDALO_IMAGE_FOLDER `string`

	This parameter define the directory for the image files.

	```php
	define('DEDALO_IMAGE_FOLDER', '/image');
	```

	---

	#### Dédalo image extension (type of file)

	**config.php**

	DEDALO_IMAGE_EXTENSION `string`

	This parameter define the standard file type of image files. By default Dédalo use jpg standard definition for the image files. All other formats will be compresed to this standard.

	```php
	define('DEDALO_IMAGE_EXTENSION', 'jpg');
	```

	---

	#### Dédalo image extensions supported

	**config.php**

	DEDALO_IMAGE_EXTENSIONS_SUPPORTED `serialized array`

	This parameter define the standards file type admited for the image files. Dédalo will use this parameter to indentify the file format of the original files uploaded by the users before compres it to the standard defined in the DEDALO_IMAGE_EXTENSION parameter.

	```php
	define('DEDALO_IMAGE_EXTENSIONS_SUPPORTED', serialize(['jpg','jpeg','png','tif','tiff','bmp','psd','raw']));
	```

	---

	#### Dédalo image mime type

	**config.php**

	DEDALO_IMAGE_MIME_TYPE `string`

	This parameter define the standard mime type for the image files. This parameter will use to create the correct http header for the standar define in DEDALO_IMAGE_EXTENSION.

	```php
	define('DEDALO_IMAGE_MIME_TYPE', 'image/jpeg');
	```

	---

	#### Dédalo image type

	**config.php**

	DEDALO_IMAGE_TYPE `string`

	This parameter define the standard type for the image files. This parameter will use to compress the original image format to the codec defined by this parameter. By default Dédalo use the jpeg codec to compress the image files.

	```php
	define('DEDALO_IMAGE_TYPE', 'jpeg');
	```

	---

	#### Dédalo image quality for the reotuched files

	**config.php**

	DEDALO_IMAGE_QUALITY_RETOUCHED `string`

	This parameter define the quality for the image files that has benn retouched. Reouched images are the procesed images to improve the image, this quality will be a copy of the original that has any kind of process (color balance, background removed, contrasted, etc)

	```php
	define('DEDALO_IMAGE_QUALITY_RETOUCHED', 'modified');
	```

	---

	#### Dédalo image quality for original files

	**config.php**

	DEDALO_IMAGE_QUALITY_ORIGINAL `string`

	This parameter define the quality original for the image files. This parameter will use to identify the uploaded files to with specific quality. Dédalo admit lots of differents format from different sources and qualities, and it define this files as "original" quality. Dédalo will compress all formats to web standard format, unify all different qualities and codecs, and will store the original file witout touch. In some cases, if the institution has a protocol for manage image files, is possible to use one specific quality for the files that users can upload. By default Dédalo do not limit the original format to be uploaded using a "original" quality denomination.

	```php
	define('DEDALO_IMAGE_QUALITY_ORIGINAL', 'original');
	```

	---

	#### Dédalo image quality for procesed files

	**config.php**

	DEDALO_IMAGE_QUALITY_DEFAULT `string`

	This parameter define the default quality used for the image files. This parameter will use to compress all image files to specific quality, unifying the quality used by all sections. By deafult Dédalo use 1.5MB filesize (524.217px or 887x591px) quality.

	```php
	define('DEDALO_IMAGE_QUALITY_DEFAULT', '1.5MB');
	```

	---

	#### Dédalo image thumb default

	**config.php**

	DEDALO_IMAGE_THUMB_DEFAULT `string`

	This parameter define the thumb quality definition that can be used for compress the image files. This parameter will use to compress and store image files used in lists. The compresion will use the original file and will compress with smaller verision or thumb version of the image.

	```php
	define('DEDALO_IMAGE_THUMB_DEFAULT', 'thumb');
	```

	---

	#### Dédalo image qualities definiton

	**config.php**

	DEDALO_IMAGE_AR_QUALITY `serialized array`

	This parameter define the different qualities that can be used for compress the image files. This parameter will use to compress image files to specific quality. The compresion will use the original file and will compress to those qualities when the user demand a specific quality.

	```php
	define('DEDALO_IMAGE_AR_QUALITY', serialize([DEDALO_IMAGE_QUALITY_ORIGINAL,DEDALO_IMAGE_QUALITY_RETOUCHED,'25MB','6MB','1.5MB',DEDALO_IMAGE_THUMB_DEFAULT]));
	```

	---

	#### Dédalo image print resolution definiton

	**config.php**

	DEDALO_IMAGE_PRINT_DPI `int`

	This parameter define the resolution in pixels per inch that will be used in the image compression to be apply when the images will be printed.

	```php
	define('DEDALO_IMAGE_PRINT_DPI', 150);
	```

	---

	#### Dédalo image library is installed

	**config.php**

	DEDALO_IMAGE_LIB `bool`

	This parameter define if the server can work with images and it has an image library installed

	```php
	define('DEDALO_IMAGE_LIB', true);
	```

	---

	#### Dédalo image engine procesor uri

	**config.php**

	DEDALO_IMAGE_FILE_URL `string`

	This parameter define the image processor engine uri to be used when images will be compressed.

	```php
	define('DEDALO_IMAGE_FILE_URL', DEDALO_LIB_BASE_URL . '/media_engine/img.php');
	```

	---

	#### Image magick path

	**config.php**

	MAGICK_PATH `string`

	This parameter define the path to image magick library in the server (when image magick libray is installed)

	```php
	define('MAGICK_PATH', '/usr/bin/');
	```

	---

	#### Color profiles paths

	**config.php**

	COLOR_PROFILES_PATH `string`

	This parameter define the path to image profiles that will apply to the images when they are processed. Dédalo use the icc (international color consortium) standard for the color profiles.

	```php
	define('COLOR_PROFILES_PATH', DEDALO_LIB_BASE_PATH . '/media_engine/lib/color_profiles_icc/');
	```

	---

	#### Dédalo image thumb width size

	**config.php**

	DEDALO_IMAGE_THUMB_WIDTH `int`

	This parameter define width size in pixels to the thumb images, it will be used to compress the images with the thumb quality (the smaller verison to be used in lists).

	```php
	define('DEDALO_IMAGE_THUMB_WIDTH', 102);
	```

	---

	#### Dédalo image thumb height size

	**config.php**

	DEDALO_IMAGE_THUMB_HEIGHT `int`

	This parameter define height size in pixels to the thumb images, it will be used to compress the images with the thumb quality (the smaller verison to be used in lists).

	```php
	define('DEDALO_IMAGE_THUMB_HEIGHT', 57);
	```

	---

	#### Dédalo image web directory

	**config.php**

	DEDALO_IMAGE_WEB_FOLDER `int`

	This parameter define path for the images uploaded by the user in the component_html, this component can layout html freely and it use a image system outside the resource definition for all images managed by Dédalo. Those images don't use the locator definition and can not re-used by the rest of the system. Normally those images are stetic images for institutional explanations and are not part of the catalog.

	```php
	define('DEDALO_IMAGE_THUMB_HEIGHT', 57);
	```

	---

	#### Dédalo pdf directory

	**config.php**

	DEDALO_PDF_FOLDER `int`

	This parameter define the directory for the pdf files.

	```php
	define('DEDALO_PDF_FOLDER', '/pdf');
	```

	---

	#### Dédalo pdf extension (type of file)

	**config.php**

	DEDALO_PDF_EXTENSION `string`

	This parameter define the standard file type of pdf files.

	```php
	define('DEDALO_PDF_EXTENSION', 'pdf');
	```

	---

	#### Dédalo pdf extensions supported

	**config.php**

	DEDALO_PDF_EXTENSIONS_SUPPORTED `serialized array`

	This parameter define the standards file type admited for the pdf files. Dédalo will use this parameter to indentify the file format of the original files uploaded by the users.

	```php
	define('DEDALO_PDF_EXTENSIONS_SUPPORTED', serialize(['pdf']));
	```

	---

	#### Dédalo pdf quality for default files

	**config.php**

	DEDALO_PDF_QUALITY_DEFAULT `string`

	This parameter define the default quality used to magane pdf files.

	```php
	define('DEDALO_PDF_QUALITY_DEFAULT', 'standar');
	```

	---

	#### Dédalo pdf qualities definiton

	**config.php**

	DEDALO_PDF_AR_QUALITY `serialized array`

	This parameter define the different qualities that can be used for pdf files. This parameter will use to compress pdf files to specific quality. The compresion will use the original file and will compress to those qualities when the user demand a specific quality.

	```php
	define('DEDALO_PDF_AR_QUALITY', serialize([DEDALO_PDF_QUALITY_DEFAULT]));
	```

	---

	#### Dédalo pdf mime type

	**config.php**

	DEDALO_PDF_MIME_TYPE `string`

	This parameter define the standard mime type for the pdf files. This parameter will use to create the correct http header for the standar define in DEDALO_PDF_EXTENSION.

	```php
	define('DEDALO_PDF_MIME_TYPE', 'application/pdf');
	```

	---

	#### Dédalo pdf type

	**config.php**

	DEDALO_PDF_TYPE `string`

	This parameter define the standard type for the pdf files. This parameter will use to compress the original pdf format to the codec defined by this parameter.

	```php
	define('DEDALO_PDF_TYPE', 'pdf');
	```

	---

	#### Dédalo pdf thumb default

	**config.php**

	DEDALO_PDF_THUMB_DEFAULT `string`

	This parameter define the thumb quality definition that can be used for compress the pdf files. This parameter will use to compress and store image files used in lists. The compresion will use the original file and will compress with smaller verision or thumb version of the pdf. Only will be compress the first pdf page to thumb quality.

	```php
	define('DEDALO_PDF_THUMB_DEFAULT', 'thumb');
	```

	---

	#### Dédalo html render to pdf library path

	**config.php**

	DEDALO_PDF_RENDERER `string`

	This parameter define the path to the library, normally wkhtmltopdf, to be used for process the html pages to pdf format, this libray will be used to create a print version of the records.

	```php
	define('DEDALO_PDF_RENDERER', '/usr/bin/wkhtmltopdf');
	```

	---

	#### Pdf automatic transcription engine

	**config.php**

	PDF_AUTOMATIC_TRANSCRIPTION_ENGINE `string`

	This parameter define the path to the library, normally xpdf (pdftotext), to be used for process the pdf to extract the infomation, this libray will be used get the text fo the pdf files and store in the component_text_area. The text will be use to search inside the pdf information.

	```php
	define('PDF_AUTOMATIC_TRANSCRIPTION_ENGINE', '/usr/bin/pdftotext');
	```

	---

	#### Dédalo directory for html files

	**config.php**

	DEDALO_HTML_FILES_FOLDER `string`

	This parameter define the directory for the html files.

	```php
	define('DEDALO_HTML_FILES_FOLDER', '/html_files');
	```

	---

	#### Dédalo html files extension (type of file)

	**config.php**

	DEDALO_HTML_FILES_EXTENSION `string`

	This parameter define the standard file type of pdf files.

	```php
	define('DEDALO_HTML_FILES_EXTENSION', 'html');
	```

	---

	#### Dédalo directory for svg files

	**config.php**

	DEDALO_SVG_FOLDER `string`

	This parameter define the directory for the svg files.

	```php
	define('DEDALO_SVG_FOLDER', '/svg');

	```
	---

	#### Dédalo svg extension (type of file)

	**config.php**

	DEDALO_SVG_EXTENSION `string`

	This parameter define the standard file type of svg files.

	```php
	define('DEDALO_SVG_EXTENSION', 'svg');
	```

	---

	#### Dédalo svg mime type

	**config.php**

	DEDALO_SVG_MIME_TYPE `string`

	This parameter define the standard mime type for the svg files. This parameter will use to create the correct svg header for the standar define in DEDALO_SVG_EXTENSION.

	```php
	define('DEDALO_SVG_MIME_TYPE', 'image/svg+xml');
	```

	---

	#### Dédalo svg extensions supported

	**config.php**

	DEDALO_SVG_EXTENSIONS_SUPPORTED `serialized array`

	This parameter define the standards file type admited for the svg files. Dédalo will use this parameter to indentify the file format of the original files uploaded by the users.

	```php
	define('DEDALO_SVG_EXTENSIONS_SUPPORTED', serialize(['svg']));
	```



	### Media uploader variables
	Media uploader is the engine to be used by Dédalo to manage multiple upload files.

	---

	#### Dédalo uploader library directory

	**config.php**

	DEDALO_UPLOADER_DIR `string`

	This parameter define the directory path of the upload library in the server.

	```php
	define('DEDALO_UPLOADER_DIR', DEDALO_ROOT . '/lib/jquery/jQuery-File-Upload');
	```

	---

	#### Dédalo uploader library uri

	**config.php**

	DEDALO_UPLOADER_URL `string`

	This parameter define the uri path of the upload library to be accessed by the client calls.

	```php
	define('DEDALO_UPLOADER_URL', DEDALO_ROOT_WEB . '/lib/jquery/jQuery-File-Upload');
	```
	
	
	### Georeference variables
	Dédalo use a georeference system based in leaflet library to create maps for the heritage.

	---

	#### Dédalo georeference provider

	**config.php**

	DEDALO_GEO_PROVIDER `string`

	This parameter define the tile maps provider to be used. The param can be change the provider to specific configurations, for ex, if you want to use the ancient roman map and the actual OSM map you can use the "NUMISDATA" provider that include both maps.

	```php
	define('DEDALO_GEO_PROVIDER', 'VARIOUS');
	```


	### Menu variables

	---

	#### Dédalo media area tipo for specific entity model

	**config.php**

	DEDALO_ENTITY_MEDIA_AREA_TIPO `string`

	This parameter define the media area tipo that will removed from the menu. This area is the ontolgy definiton for media files for the entity. By default Dédalo do not use this parameter because the default instalation use the standard media area for all media definitons. This parameter can be used by the entities to define his media model in the ontology.

	```php
	define('DEDALO_ENTITY_MEDIA_AREA_TIPO', 'mupreva260');
	```

	---

	#### Dédalo skip tipos from menu

	**config.php**

	DEDALO_ENTITY_MENU_SKIP_TIPOS `serialized array`

	This parameter define the tipos to be skipped from the menu. The ontology sometimes define long hierarchy to access to the sections, and could be convenient to remove some tipo from the menu to access more quickly to the sections.

	```php
	define('DEDALO_ENTITY_MENU_SKIP_TIPOS', serialize( array()));
	```


	### Tools variables

	---

	#### Dédalo section_id temporal

	**config.php**

	DEDALO_SECTION_ID_TEMP	`string`

	This parameter define the section_id used to create temporal sections on the fly. Temporal sections are previous version of the section before it has a section_id asigned by the database counter. The temporal section_id identify those sections to be managed bafore that the section will saved into database.
	
	```php
	define('DEDALO_SECTION_ID_TEMP', 'tmp');
	```

	---

	#### Dédalo path of the export tool files directory

	**config.php**

	DEDALO_TOOL_EXPORT_FOLDER_PATH `string`

	This parameter define the path of the directory to be used by the tool export to save the data in the different formats such as .csv .html, etc

	```php
	define('DEDALO_TOOL_EXPORT_FOLDER_PATH', DEDALO_MEDIA_BASE_PATH . '/export/files');
	```

	---

	#### Dédalo uri of the export tool files directory

	**config.php**

	DEDALO_TOOL_EXPORT_FOLDER_URL `string`

	This parameter define the uri of the directory to get the files exported by the export tool, it will be used by the client to get the different formats such as .csv .html, etc

	```php
	define('DEDALO_TOOL_EXPORT_FOLDER_URL' , DEDALO_MEDIA_BASE_URL . '/export/files');
	```

	---

	#### Dédalo path of the import tool files directory

	**config.php**

	DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH `string`

	This parameter define the path to the directory to be used by the import tool. This path will be read to get the csv files inside it.

	```php
	define('DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH', DEDALO_MEDIA_BASE_PATH . '/import/files');
	```


	### Security variables

	---

	#### Dédalo lock components

	**config.php**

	DEDALO_LOCK_COMPONENTS `bool`

	This parameter define if Dédalo will lock and unlock components to avoid replacement data when more than one user edit the same component or Dédalo do not manage the user edition unlocking all components. By default Dédalo do not manage the editons (false option).

	```php
	define('DEDALO_LOCK_COMPONENTS', false);
	```

	---

	#### Dédalo lock components notifications

	**config.php**

	DEDALO_NOTIFICATIONS `bool`

	This parameter define if Dédalo will notify to the user than other users are editing the same field in the same section when the user try to edit the field.

	```php
	define('DEDALO_NOTIFICATIONS', false);
	```

	---

	#### Dédalo node js library path

	**config.php**

	DEDALO_NODEJS `string`

	This parameter define the path of the node js library in the server. Dédalo uses node to create and manage the notification system.

	```php
	define('DEDALO_NODEJS', '/usr/local/bin/node');
	```

	---

	#### Dédalo node js pm2 library path

	**config.php**

	DEDALO_NODEJS_PM2 `string`

	This parameter define the path of the node js pm2 library in the server.

	```php
	define('DEDALO_NODEJS_PM2', '/usr/local/bin/pm2');
	```

	---

	#### Dédalo protect media files for external acces

	**config.php**

	DEDALO_PROTECT_MEDIA_FILES `bool`

	This parameter define if the directory of the media files (av, images, pdf, ...) will be protected and controlled for undesired/external access. By default Dédalo do not close the access for media files because it can access by external web pages (false option), when the option is active (true) the direct acces to media files are avoided and only is possible acces by theinternal system or the publication API .

	```php
	define('DEDALO_PROTECT_MEDIA_FILES', false);
	```

	---

	#### Dédalo filter user records by id

	**config.php**

	DEDALO_FILTER_USER_RECORDS_BY_ID `bool`

	This parameter define if the sections (records) will be filtered by the section is defined in user preferences. This filter is apply at every search and list done by the specific user.

	```php
	define('DEDALO_FILTER_USER_RECORDS_BY_ID', false);
	```

	---

	#### Encription mode

	**config.php**

	ENCRYPTION_MODE `string`

	This parameter define the encryption engine used to manage the global security system. By default Dédalo uses openSSL to encrypt data.

	```php
	define('ENCRYPTION_MODE', 'openssl');
	```

	> If the encryption mode is not defined, will be calculated from current data version. 
	Version after 4.6.1 use openSSL
	Versions prior to 4.6.1 it was used Mcrypt


	### CSS variables

	Dédalo use a generic css styles for sections and components, but the ontology can change the default style with specific css for every node (section, grouper, component, ...) this setting can activate or deactive if Dédalo will apply those specific styles.

	---

	#### Dédalo strucrure css

	**config.php**

	DEDALO_STRUCTURE_CSS `bool`

	This parameter defines whether the specific CSS defined in the ontology will be applied to render sections, components, groupers, etc. By default it is active (true) and the rendering will be rendered with those specific styles.

	```php
	define('DEDALO_STRUCTURE_CSS', true);
	```

	> Specific CSS is defined in the node properties of the ontology in JSON format:
	>
	> Example:
	> Json CSS definition in the ontology:
	>	```json
	>	{
	>		"css": {
	>			".wrap_component": {
	>				"mixin": [
	>					".vertical"
	>				],
	>				"style": {
	>					"width": "40%",
	>					"float": "left"
	>				}
	>			},
	>			".content_data": {
	>				"style": {
	>					"padding-left": "5%"
	>				}
	>			},
	>			".group": {
	>				"style": {
	>					"display": "grid",
	>					"grid-template-columns": "40% 60%"
	>				}
	>			}
	>		}
	>	}
	>	```
	>
	> will be processed in CSS standard as:
	>
	>	```css
	>	.sgc_edit>.wrap_component_dd191 {
	>		min-height: 4.667em;
	>		border-right: 1px solid #ebebeb;
	>		padding-left: 10px;
	>		padding-right: 10px;
	>		width: 40%;
	>		float: left;
	>	}
	>	.sgc_edit>.wrap_component_dd191 .content_data {
	>		padding-left: 5%;
	>	}
	>	.sgc_edit>.wrap_component_dd191 .group {
	>		display: grid;
	>		grid-template-columns: 40% 60%;
	>	}
	>	```

	---

	#### Dédalo aditional css

	**config.php**

	DEDALO_ADITIONAL_CSS `bool`

	This parameter defines if Dédalo will use specific CSS files defined in the ontology will be loaded and applied to render sections. By default it is desactive (false) and the additional css files will not loaded and applyed.

	```php
	define('DEDALO_ADITIONAL_CSS', false);
	```

	> Additional CSS files are defined in node properties of the ontology in JSON format:
	>
	>	```json
	>	{
	>		"additional_css" : ["/extras/oh1/my_addtional_css_file.css"]
	>	}
	> ```
	>
	> Those files are stored by default in DEDALO_LIB_BASE_URL adding the path defined in the property:
	>
	> `../dedalo/lib/dedalo/extras/oh1/my_addtional_css_file.css`


	### Diffusion variables

	Diffusion define the configuration variables to be used by Dédalo to process data and resolve relations to get the version of data defined to be stored into MySQL

	---

	#### Diffusion domain

	**config.php**

	DEDALO_DIFFUSION_DOMAIN `string`

	This parameter would be set with the diffusion domain of our project publication, diffusion domain is the target domain or the part of diffusion ontology that will be used to get the tables and fields and the relation components in the back-end.
	The definition for diffusion domain in the configuration file can set only one ontology diffusion_domain for our installation, it can have different diffusion groups or diffusion elements with different databases and tables.

	```php
	define('DEDALO_DIFFUSION_DOMAIN', 'default')
	```

	> Any other 'section_tipo' are accepted and it can be other standard tlds used in the ontology like oh1 or ich1. If your institution has a specific tld space in the ontology, you can use your own tld into the DEDALO_DIFFUSION_DOMAIN.

	---

	#### Seting the API web user code for multiple DDBB

	**config.php**

	API_WEB_USER_CODE_MULTIPLE `array`

	The access to the public API is controlled with a code that we can define and store into the parameter. This code can be public or private, if you want open access to your public data you can share this code.
	The array specifies two key params; 'db_name' and 'code'. The combination of these two params get the access to the data.

	```php
	define('API_WEB_USER_CODE_MULTIPLE' , [
			[
				'db_name'	=> 'dedalo_public',
				'code'		=> 'Udeluf$udj371J2_dj3!udn_ucC29x'
			]
		]);
	```
	> In a simple installation with only one DDBB you can use the param 'API_WEB_USER_CODE'.

	---

	#### Diffusion languages

	**config.php**

	DEDALO_DIFFUSION_LANGS `serialized array`

	This parameter would be set with the diffusion languages, the languages we would like to publish as an output to the public side. As a result, in the target table it would be created a row per language (see some examples in DEDALO PUBLICATION DATA FORMAT).

	```php
	define('DEDALO_DIFFUSION_LANGS', serialize( ['lg-spa','lg-eng'] ));
	```

	> Dédalo uses the pattern: lg-xxx
	> lg = identify the term as language
	> xxx = with the official tld of the ISO 639-6, Alpha-4 code for comprehensive coverage of language variants.
	>
	>|	Value	|	Diffusion language	|
	>| 	--- 	| 	---	|
	>|	lg-spa |	Spanish	|
	>|	lg-cat |	Catalan	|
	>|	lg-eus |	Basque	|
	>|	lg-eng |	English	|
	>|	lg-fra |	French	|

	---

	#### Resolution levels; going to the deeper information

	**config.php**

	DEDALO_DIFFUSION_RESOLVE_LEVELS `int`

	This parameter would be set with the number of resolution levels we would like to accomplish. By default, its value is set to '2' (see a resolution level explanation in image below).

	```php
	define('DEDALO_DIFFUSION_RESOLVE_LEVELS', 2)
	```

	> Every other positive, numerical value will be accepted.
	
	The resolution of linked information that Dédalo can be resolved in the publication process. The information inside Dédalo has a relation model resolved by locators, and one section can have a lot of ramifications to different resources, thesaurus, etc. every linked information from portals or autocompletes is a level of information. The direct linked information to the main level is the first level, the information that is linked to the first level is the second, etc..
	
	Ex: If you have 1 interview of oh with 1 linked image and this image has a person linked as author that has 1 linked toponym for the birthplace. For publishing all linked information will be necessary 3 levels of resolution:
	
	If you increase the value of this parameter, the time needed by Dédalo to resolve the linked data in the publication process will also increase.

	---

	#### Check the publication state

	**config.php**

	skip_publication_state_check `int`

	When one user publishes some record, Dédalo checks if this information has changes that are not published, if Dédalo found new data to publish the diffusion process began and the information will be replaced in MySQL. If the register doesn't have new information the process is stopped for this record.
	Checking the publication status prevent double, triple o more publications of the same record and all process will be faster (some records will not published), but in some cases can be useful that Dédalo don't check the diffusion state, and perform the publication process for every record has new information or no.
	This property configures the publication process to check the new data status or ignore it. This property is stored into the global Dédalo $_SESSION.

	```php
	$_SESSION['dedalo4']['config']['skip_publication_state_check'] = 1;
	```
	|	Value	|	skip state check?	|
	| 	---	| 	---		|
	|	0	|	don't check	|
	|	1	|	check		|

	---

	#### Dédalo publication alert

	**config.php**

	DEDALO_PUBLICATION_ALERT `bool`

	Deprecated constant to control publication user alerts in some contexts. Do not use it anymore.

	```php
	define('DEDALO_PUBLICATION_ALERT', false);
	```

	---

	#### Dédalo publication clean uri

	**config.php**

	DEDALO_PUBLICATION_CLEAN_URL `bool`

	This parameter defines whether the specific CSS defined in the ontology will be applied to render sections, components, groupers, etc. By default it is active (true) and the rendering will be rendered with those specific styles.

	```php
	define('DEDALO_PUBLICATION_CLEAN_URL', false);
	```

	---

	#### Dédalo diffusion custom

	**config.php**

	DIFFUSION_CUSTOM `string || bool`

	Optional custom diffusion class file path.
	It is able to create additional diffusion class file with static methods to be called from ontology diffusion elements beyond the Dédalo defined diffusion methods.
	Default is false.

	```php
	define('DIFFUSION_CUSTOM', DEDALO_LIB_BASE_PATH . '/extras/my_entity/diffusion/class.diffusion_my_entity.php');
	```

	### Maintenance variables
	
	Maintenance configure the variables that Dédalo will use to update the ontology, the code or check if the system is working properly.

	---

	#### Dédalo test install

	**config.php**

	DEDALO_TEST_INSTALL `bool`

	This parameter defines if the current admin user credentials will be checked on login.

	```php
	define('DEDALO_TEST_INSTALL', true);
	```

	---

	#### Sync ontology from master server

	**config.php**

	STRUCTURE_FROM_SERVER `bool`

	This parameter defines if the installation will be updated his ontology using the master server versions.

	```php
	define('STRUCTURE_FROM_SERVER', true);
	```

	---

	#### Ontology master server code

	**config.php**

	STRUCTURE_SERVER_CODE `string`

	This parameter defines the valid code to be send to get access to the master server

	```php
	define('STRUCTURE_SERVER_CODE', 'ZdUs7asdasdhRsw4!sp');
	```

	---

	#### Ontology master server uri

	**config.php**

	STRUCTURE_SERVER_URL `string`

	This parameter defines the uri to the master server

	```php
	define('STRUCTURE_SERVER_URL', 'https://master.dedalo.dev/dedalo/lib/dedalo/extras/str_manager/');
	```

	---

	#### Ontology download directory

	**config.php**

	STRUCTURE_DOWNLOAD_DIR `string`

	This parameter defines the directory to downolad the ontology files in the server.

	```php
	define('STRUCTURE_DOWNLOAD_DIR', DEDALO_LIB_BASE_PATH . '/backup/backups_structure/srt_download');
	```

	---

	#### Ontology in json format download directory

	**config.php**

	STRUCTURE_DOWNLOAD_JSON_FILE `string`

	This parameter defines the directory on the server to download the ontology files in json format.

	```php
	define('STRUCTURE_DOWNLOAD_JSON_FILE', STRUCTURE_DOWNLOAD_DIR);
	```

	---

	#### Proxy server

	**config.php**

	SERVER_PROXY `string`

	This parameter defines if the access to the master server will need to be accessed through a proxy server.

	```php
	define('SERVER_PROXY', '192.0.0.1:3128');
	```
	> In the string could add user and pasword as proxy needs. Ex: my_user:my_pw@192.0.0.1:3128
	---

	#### Dédalo source verions uri

	**config.php**

	DEDALO_SOURCE_VERSION_URL `string`

	This parameter defines the master server uri repository to get the new Dédalo code for update / upgrade.

	```php
	define('DEDALO_SOURCE_VERSION_URL', 'https://github.com/renderpci/dedalo/archive/refs/heads/master.zip');
	```

	> It's possible get the Dédalo code from different sources. If you want specify the version to download you can access to the specific version in GitHub and use it.
	>
	> Examples:
	> for the version 5.8.2 
	> https://github.com/renderpci/dedalo/archive/refs/tags/V5.8.2.zip
	> 
	> for the version 5.7.77
	> https://github.com/renderpci/dedalo/archive/refs/tags/v5.7.77.zip
	>
	> Or you can use the developer version
	> https://github.com/renderpci/dedalo/archive/refs/heads/developer.zip

	---

	#### Dédalo source versions local directory to save the new code

	**config.php**

	DEDALO_SOURCE_VERSION_LOCAL_DIR `string`

	This parameter defines the path to the local directory to save the new code downloaded from the master server repository.

	```php
	define('DEDALO_SOURCE_VERSION_LOCAL_DIR', '/tmp/'.DEDALO_ENTITY);
	```

	---

	#### Dédalo maintenance mode

	**config.php**

	DEDALO_MAINTENANCE_MODE `bool`

	This parameter defines whether the maintenance mode is active or not.
	By default the maintenance mode is inactive (false). When it is active (true) only root user can login and all logged users will be forced to leave the sesion, the debugger will be activated and the logger will be changed from WARNING to DEBUG mode.

	```php
	define('DEDALO_MAINTENANCE_MODE', false);
	```

	---

	#### Notice to active users

	**config.php**

	notice_to_active_users() `function`

	This function activates a message for all registered users, it could be used to advertise if the server will need to shut down or other actions that users should know about. This function admin two different parameters, the message and the mode.
	
	```php
	notice_to_active_users(array('msg'=>'Please leave the session', 'mode'=>"warning"));
	```









































	### Database connection

	---

	#### Slow query

	**config.php**

	SLOW_QUERY_MS	`int`

	This parameter define the time limit to query calls, if the query done to database is higher that the value of this parameter, Dédalo will alert in php log and will try to index this query. By default this parameter is set to 1200 ms (1,2 seconds).

	```php
	define('SLOW_QUERY_MS' , 1200);
	```
	---
