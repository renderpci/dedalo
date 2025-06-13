# How do I backup and restore the Dédalo data?

Dédalo manage two different databases, the main database is work system, it has a full dataset with the ontology and all data. The second one is the publishing system, it is a copy with only the public data. If you want to create a backup you will need to make the backup of the two systems.

!!! note "Recreating a publication database with work data"
    Publishing system is a copy and is possible recreate it doing a publication in work system. But some times will be necessary a copy because the work system is not ready to publish his data.

## Backup the work system

Work system use PostgreSQL database, doing a backup of this database you will create the full copy of your data.

You can perform a backup in different ways:

### Automatic backup

By default Dédalo make backup automatically, if users change data. It's possible change this backup configuration as; directory, cadence and other parameters in config file changing Dédalo [bakup](../config/config.md#backup-variables) variables.

### Manual backup

But in some times you will need do a backup manually to fix a specific point. It can be useful to update major version or change the server.

To create a full copy of Dédalo work system manually, follow this:

1. Login as global administrator or root account
2. Enter into Maintenance panel:

    > System administration -> Maintenance

3. Locate the "Make Backup" panel
4. Press the "Make backup" button.
5. Wait to be finished.

The panel will indicate the directory of the copy, it will be storage into bk directory in the server and it will be named with the date, name of the database, as:

> 2023-09-09_205044.my_dedalo_db.postgresql_1_forced_dbv6-0-0.backup

### Making a manual backup in the server shell

If you want create a backup using the server shell, you can easily backup full Dédalo data using the following command.

```shell
pg_dump -h /tmp -p 5432 -U "dedalo_database_user" -F c -b dedalo_database_name  > "../dedalo_backup_database.backup"
```

You can see `pg_dump` official documentation [here](https://www.postgresql.org/docs/current/app-pgdump.html).

## Restore a backup for the work system

To restore a Dédalo backup you will need to access to your sever with administration privileges.

To import the file that you previously created, or restore the DB backup by running the following commands:

- If you want restore into a existent database go to point 4,
- If you want restore into a fresh Dédalo database follow all points.

1. Enter into `psql`:

    ```shell
    su - postgres
    psql
    ```

2. Create a Dédalo user:

    ```sql
    CREATE USER dedalo_database_user PASSWORD 'My_super_Secret_pw';
    ```

3. Create a Dédalo database and comment it:

    ```sql
    CREATE DATABASE dedalo_database_name
    WITH ENCODING='UTF8'
    OWNER=dedalo_user
    CONNECTION LIMIT=-1
    TABLESPACE=pg_default;
    ```

    ```sql
    COMMENT ON DATABASE dedalo_database_name
    IS 'Dédalo: Cultural Heritage and Memory management system';
    ```

4. Restore the backup

    ```shell
    pg_restore --host localhost --port 5432 --username "dedalo_database_user" --dbname "dedalo_database_name" --role "dedalo_database_user" --no-owner --no-privileges --clean --verbose "../dedalo_backup_database.backup"
    ```

    You can see `pg_restore` official documentation [here](https://www.postgresql.org/docs/current/app-pgrestore.html).

## Backup of media files

Media files are the most large data to be backup, usually it will be a large list of image, audiovisual, pdf, and other documents. If your Dédalo project has large audiovisual files, or thousands or millions image files, you will expect a server with large storage (TBs instead GBs) and your backup storage need to be set to retain almost 3 copies of the media files.

To achieve backup of all media files, if your system has a large set of media files, should not possible a full daily backup, so the plan will be to create a rsync or similar script to create a incremental backup of the media files coping  only the daily changes, but not the full backup. In incremental backup the old files are not copied daily, and to prevent errors in the backup your scrip need to create a full backup at week or month.

### Creating an incremental script for media files

You can use rsync with a cron or other backup solution to create a incremental script.

```shell
rsync -avzui --human-readable --links --progress --log-file="../my_backup_scrip_log$(date +%Y%m%d%H%M%S).log" -e "ssh -p 33333" "../dedalo/media" my_user@my_backup_sever.dedalo.dev:/backup/my_host/daily
```

!!! note "ssh access to backup host"
    If you want to run the script automatically, maybe you will need to create a ssh keys access to backup system to log it directly without password. You can set it following this [instructions](https://help.ubuntu.com/community/SSH/OpenSSH/Keys) or [this](https://www.digitalocean.com/community/tutorials/how-to-set-up-ssh-keys-on-rocky-linux-8).

And you can create a con job to execute it as:

```cron
00 01 * * * ../dd_backup_rsync/my_backup_daily.sh
```

You can read about rsync [here](https://rsync.samba.org)

You can add more scripts to create a weekly or monthly backups in the same way.

## Backup the publishing system

The publishing system uses the MariaDB/MySQL database. By backing up this database, you will create a copy of the data that was published, a copy of the public data.

### Manual backup

To create a full copy of Dédalo publishing system manually, follow this:

1. Login as global administrator or root account
2. Enter into Maintenance panel:

    > System administration -> Maintenance

3. Locate the "Make Backup" panel
4. Press the "Make a publishing backup" button.
5. Wait to be finished.

The panel will indicate the directory of the copy, it will be storage into bk directory in the server and it will be named with the date, name of the database, as:

> 2023-09-09_205044.mysql_dump_my_publishing_database.sql

### Making a manual backup in the server shell

 The simplest way to make a full copy of the MariaDB/MySQL database is to run the mysqldump command with this set of parameters:

```shell
mysqldump -u publishing_bd_user_name -p -v my_publishing_database > mysql_dump_my_publishing_database.sql
```

!!! note "Using MariaDB"
    If you are using a MariaBD > 11.0, you will need to use `mariadb-dump` instead `mysqldump`

Optional: if you want to compress the backup:

```shell
tar zcf mmysql_dump_my_publishing_database-$(date +%Y-%m-%d-%H.%M.%S).sql.tar.gz mysql_dump_my_publishing_database.sql
```

## Restore a backup of publishing system

You can use phpmyadmin, adminer or other tools to import the file that you previously created, or restore the DB backup by running the following command:

```shell
mysql -u publishing_bd_user_name -p -v  mysql_dump_my_publishing_database < mysql_dump_my_publishing_database.sql
```

## Backup a Dédalo config files

Config files store your environment, database configuration access, API access and other important information. Backup the config files ensure you that this information will be preserved in case of server failure, and it that could be necessary to restore a backup because the password encryption system need a keys stored into the config files.

The most important situations will happen in  case you lose the configuration files could be:

- you can loose the access to the database user, and will need use a pw reset in postgreSQL or MariaDB
- you will need to rebuild all Dédalo passwords
  
Both situations are reversible but are not simple processes.

Configuration files do not change every day and usually only change when new features are required or some changes are set into the work system, so it's not mandatory to create a daily backup, but it's high recommendable create a script to automate the backup process. We recommended a monthly backup of the config files.

For transfer the files to the backup server consider compress the files in this way:

```shell
tar cvfz dedalo_configuration.tar.gz ../dedalo/config
```
