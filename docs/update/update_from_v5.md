<link rel="stylesheet" href="docs.css">
<link rel="stylesheet" href="update.css">

# Update V5 to V6

Version 6 is a complete rebuild version. Lot of code has been rebuilt from scratch and some data definitions has been changed.

Before you strat updgrading to update it is important to be aware of some of these changes in data and Dédalo definitions.

## Important changes from v5

1. In v6 all components data is storage as array, so some components has changed to be array. The update will change the data of these components in your DDBB to convert it to array:
	* component_text_area
	* component_number
	* component_geolocation
	* component_json
	* component_av
	* component_image
	* component_pdf
	* component_svg

See an example of component_text_area:

v5 format as string:

```json
"rsc36": {
	"dato": {
		"lg-nolan": "my data"
	}
}
```

v6 format as array:

```json
"rsc36": {
	"dato": {
		"lg-nolan": ["my data"]
	}
}
```

2. PDF media files structure has been changed to storage original files and web files.

In v5 PDF media files do not has original quality and web quality, to unify quality files criteria in all media files, v6 add original quality to stored the PDF files uploaded by users.

So, the update process will change media file structure duplicating the currect /standar directory to /original and /web directories.

The update will run this commands in ../dedalo/media/pdf directory:

```shell
	mv standar orginal
	cp original web
```

Diffusion: this change could need a update into your difusion DDBB. Some diffusion configs store the path to media files and will need update his data. The update process will do not this re-publication of your project, it will need a manual re-publication of your data. Check your publication DDBB to see if Documents tables need to be re-publicated.

3. Update the config files.

The update script will not change your config files. You will need update your configurations manually.
V6 has a new files structure for /config directory and files outside the /core Dédalo structure.

V5 config directory:

```shell
../dedalo/lib/dedalo/config
```

V6 config directory:

```shell
../dedalo/config
```

## Preparing your current v5 installation

Before update you will prepare your v5 installation doing:

1. Log in as root into current v5.
2. Go to Administration panel.
3. Make backup of your Dédalo installation.
4. Update v5 to last code.
	* Ensure that your code is >= 5.9.5
	* Ensure that your data is updated to 5.8.2
5. Update v5 to last ontolgy version
	* Ensure that your ontology version is > 01-04-2023
6. Duplicate your current DDBB and rename as your own project. Do not update your current database directly. It is recommended to use a duplicate DDBB. You can do it this step in several ways:

* If you want duplicate with SQL you could use something as:

```sql
CREATE DATABASE my_new_database TEMPLATE my_old_database;
```

* If you want duplicate in shell you could use something as:

```shell
pg_dump -Fc -f olddb.pgdump -d olddb &&\
createdb newdb &&\
pg_restore -d newdb olddb.pgdump
```

## Updating process

Ready to update.

1. Rename your v5 directory as dedalo_v5.

```shell
cd ../httpdocs
mv dedalo dedalo_v5
```

2. Download the v6 from our repository and add it to ./httpdocs dir.

You can use git, wget or download and upload with ftp.
Example using wget:

```shell
cd ../httpdocs
wget https://github.com/renderpci/dedalo/archive/refs/heads/master.zip
unzip master.zip
mv dedalo-master dedalo
```

3. Config Dédalo to use your databases and your own media, etc.

Duplicate sample config files and rename it to config

```shell
cd ../httpdocs/dedalo/config
cp sample.config.php config.php
cp sample.config_db.php config_db.php
cp sample.config_core.php config_core.php
cp sample.config_areas.php config_areas.php
```

Check your v5 config to add your custom properties.

4. Duplicate or move your media directory
	It's highly recommended to duplicate your media directory instead move it.

```shell
cd ../httpdocs
cp dedalo_v5/media dedalo/
```

5. Asing the correct permisions to all /dedalo directories and files.

```shell
cd ../httpdocs/
chown -R my_dedalo_user:my_dedalo_group dedalo
chmod -R 750 dedalo
```

6. Run Dédalo in your browser.

You will see the install / update script.

![small](assets/20230403_172538_to_update.png)

Select the "To update" to start the process.

1. Login as root (with your v5 root account)

![medium](assets/20230402_150947_login.png)

8. You will see the v6 administration panel.

![large](assets/20230403_171028_admin_panel.png)

1. Update the Ontology to > 01-04-2023

![medium](assets/20230403_171133_ontology_update.png)

1. Run the update scripts. It will take time to change your Database and files. It's highly recommended to see your PHP log (`tail -f php.log`)

![large](assets/20230403_171234_update_data.png)

Down to last step and clik "Ok" button

![large](assets/20230403_171425_update_data2.png)

Wait until you see the ok, this process could be long.

1. Run the tool register.

![medium](assets/20230403_172746_register_tools.png)

1. Done! log out and log in as normal use.
