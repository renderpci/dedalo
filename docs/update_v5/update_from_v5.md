# Update V5 to V6

Version 6 is a complete rebuild version. Lot of code has been rebuilt from scratch and some data definitions has been changed.

!!! warning "Upgrading from versions prior to v5"
    V6 only can be update from v5, previous versions (v4, v3, v2, v1, v0) need to be update it to v5 prior to update to version 6.

!!! note "V6 version to use for update"
    The upgrade process from v5 is only supported up to v6.3.1, newer versions use a different ontology schema and the upgrade process does not support it.
    To upgrade from v5 to the latest v6 version you must first upgrade v5 to v6.3.1 and then upgrade via the maintenance panel.

Before you start upgrading to update it is important to be aware of some of these changes in data and Dédalo definitions.

## Important changes from v5

1. In v6 all components data is storage as array, so some components has changed to be array. The update will change the data of these components in your database to convert it to array:
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
    {
        "rsc36": {
            "dato": {
                "lg-nolan": "my data"
            }
        }
    }
    ```

    v6 format as array:

    ```json
    {
        "rsc36": {
            "dato": {
                "lg-nolan": ["my data"]
            }
        }
    }
    ```

2. PDF media files structure has been changed to storage original files and web files.

    In v5 PDF media files do not has original quality and web quality, to unify quality files criteria in all media files, v6 add original quality to stored the PDF files uploaded by users.

    So, the update process will change media file structure duplicating the current /standard directory to /original and /web directories.

    !!! info
        The update will run this commands in ../dedalo/media/pdf directory automatically.

        ```shell
            mv standar original
            cp original web
        ```

        !!! warning ""
            "standar" directory is a typo in the v5 fixed in v6.

    Diffusion: this change could need a update into your diffusion database. Some diffusion configs store the path to media files and will need update his data. The update process will do not this re-publication of your project, it will need a manual re-publication of your data. Check your publication database to see if Documents tables need to be re-publicated.

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
    * Ensure that your code is >= 5.9.7
    * Ensure that your data is updated to 5.8.7
5. Update v5 to last ontology version
    * Ensure that your ontology version is > 01-07-2023
6. Duplicate your current database and rename as your own project. Do not update your current database directly. It is recommended to use a duplicate database. You can do it this step in several ways:

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

    The last compatible version with the v5 model is 6.3.1.

    You can use git, wget or download and upload with ftp.
    Example using wget:

    ```shell
    cd ../httpdocs
    wget https://github.com/renderpci/dedalo/archive/refs/tags/v6.3.1.zip
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
    cp -R dedalo_v5/media dedalo/
    ```

5. Assign the correct permissions to all /dedalo directories and files.

    ```shell
    cd ../httpdocs/
    chown -R my_dedalo_user:my_dedalo_group dedalo
    chmod -R 750 dedalo
    ```

6. Run Dédalo in your browser.

    Dédalo will check all config files and his own installation, if you see an error (in red text), check your php log and fix the issue.
    When all will be ready Dédalo will show the install / update script.

    ![install script](assets/20230403_172538_to_update.png){: .small}

    Select the "To update" to start the process.

7. Login as root (with your v5 root account)

    ![login](assets/20230402_150947_login.png){: .medium}

8. You will see the v6 administration panel.

    ![Administration panel](assets/20230403_171028_admin_panel.png){: .large}

9. Update the Ontology to > 01-07-2023

    ![Update ontology](assets/20230403_171133_ontology_update.png){: .medium}

10. Run the update scripts. It will take time to change your Database and files. It's highly recommended to see your PHP log (`tail -f php_error.log`)

    ![Update data](assets/20230403_171234_update_data.png){: .large}

    Down to last step and click "Ok" button

    ![Ok button in bottom script](assets/20230403_171425_update_data2.png){: .large}

    Wait until you see the ok, this process could be long.

    !!! Note
        The update process will review all records in your database, if your project is a large dataset and you have millions of records in activity or time machine, the update will need time and RAM.
        In large project PHP can exhausted at any time, to avoid it, we recommend to change the `memory_limit` in php.ini to -1 (to use all available memory).

11. Run the tool register.

    ![Tool register](assets/20230403_172746_register_tools.png){: .medium}

12. Done! log out and log in as normal use.
