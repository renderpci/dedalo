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

Every config file has its own parameters that need to be changed with the your own project environment.

1. Changing the parameters of global Dédalo config file.
2. Changing the parameters of database config file.
3. Cahngins parameters of areas config file.
