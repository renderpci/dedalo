# Updating code options

In versions >= 6.4.1 Dédalo displays two different options to update its code: [Incremental](#incremental) and [Clean](#clean). Version < 6.4.1 only uses the [Incremental](#incremental) option.

## Incremental

The incremental option only replaces the modified files in the new version. It does not alter your `/dedalo` directory into `httpdocs` or your specific alias or other directories outside the Dédalo schema. To verify the changes, use `rsync`. Consequently, some older files will remain in your installation.

This option is valid for patches and certain minor versions. However, in major updates, the most suitable option is to select `clean` because in mayor versions, changes could affect to Dédalo directories schema, moving files from/to a different location into the directory schema.

## Clean

The "clean" option replaces your current `/dedalo` directory with a new and fresh version of the code. It relocates your current code to the `backups/code/` directory, excluding it from the `httpdocs` virtual hosts. Subsequently, it installs the new version in a clean `dedalo` directory. Consequently, all older files will be removed during the installation but preserved in the backup.

In the install process the "clean" option restores your configuration files, specific tools, and media directory from the  backup of your previous code. However, if you have specific aliases, other files, or directories, you will need to restore them manually.

You can see the typical Dédalo directory tree [here](updating_code.md#updating-manually).

### Files and directories restored by the clean installation process

The following files will be restored during the clean installation process:

```bash
config/config.php
config/config_db.php
config/config_areas.php
config/config_core.php
config/config_defaults.json
publication/server_api/v1/config_api/server_config_api.php
publication/server_api/v1/config_api/server_config_headers.php
```

The following directories will be restored during the clean installation process:

```bash
/tools
/media
```

!!! note "About the tools restore from code backup"
    The installation process will only restore tools located within the tools directory developed by a third party (specific tools). The official Dédalo tools will be installed from scratch.

All other specific files or directories must be restored manually.

### Permissions

The clean installation process assumes a standard `750` permission for the `/dedalo` directory in your vhost and the process will assign that permissions to the new `/dedalo` directory.

If you needs different configuration you must change it manually.

### Issues

In the clean installation process some issues can arise.

#### About chroot configuration of vhosts

If you have [chrooted](https://httpd.apache.org/docs/2.4/mod/mod_unixd.html#chrootdir) your virtual hosts, the clean process will fail to create, move, restore and set permission into the new installation. To prevent this failure, set the `/httpdocs` owner to the GNU/Linux dedalo user (the same user that PHP is using). Once the installation is complete, restore the chroot configuration.