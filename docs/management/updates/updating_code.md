# Updating code

> See also: [Updating ontology](updating_ontology.md) · [Updating data](updating_data.md) · [Updating code options](updating_code_options.md)

Dédalo is an active, rapidly developing software project. It is therefore important to keep it updated and in good condition for stability and security reasons.

This guide covers the update process for minor versions, fixes and patches. The major upgrades (v4→v5, v5→v6) have their own dedicated guides.

!!! info "Migration from Dédalo v5"
    If you want to switch to Dédalo v6 from the previous release, Dédalo v5, please refer to the dedicated [migration guide](../../update_v5/update_from_v5.md). It explains the differences between the two releases and helps you make the switch.

!!! info "Upgrading a v6 install to v7"
    On the **first** update from v6 to v7, Dédalo **automatically migrates your configuration** from the old `config/config_*.php` files to the new `../private/.env` layout (the legacy files are backed up and quarantined out of the web root). You don't copy or edit config files by hand. See the [Configuration Administrator Guide → Migrating a v6 install](../../config/administration.md#9-migrating-a-v6-install).

The update process is based on the Dédalo cadence numbering. It is incremental and sometimes depends on the ontology version. Update the ontology before updating the Dédalo code, following [this guide](updating_ontology.md).

Updating the Dédalo code should be supervised by the IT team. The update is automatic, but some changes — such as **new configuration settings** — must be applied manually in `../private/.env`, because the update process cannot change your specific configuration.

!!! warning "Update pre-production system and test before update new versions into production system"
    Is highly recommended to test your new Dédalo installation before deploying the changes into the production environment. This will help ensure that the update will not have a negative impact on your catalogue.

Dédalo could be updated using the integrated update code widget that update [automatic](#automatic-update-tasks) or you can do it [manually](#updating-manually).

## Automatic update tasks

1. Closing the access to work system.

    Before update the code, is highly recommended change Dédalo status to maintenance. Follow [this guide](../maintenace_status.md) to change the Dédalo status and disable Dédalo access.

2. Enter into maintenance panel.

    Login as root user and go to Maintenance panel, it is located into:
    > System administration -> Maintenance

    1. **Optional** make a backup of the database

        Is highly recommended to create a backup before update Dédalo code. You can follow [this guide](../backup.md#backup-the-work-system) to create a backup of the database

3. Locate "Update code" control panel"

    1. Version >= 6.4.0
        In the panel, choose the server to obtain the code, by default, the panel show official Dédalo server, but is possible configure other mirrors or providers via `CODE_SERVERS`, set in `../private/.env` (see the [Configuration Administrator Guide](../../config/administration.md))

        ![Updating code >=6.4.0 control panel](assets/20250226_092214_updating_code_panel_6_4.png)

        Press the "Update Dédalo code"

        and choose the version that you want.

        ![Updating code >=6.4.0 control panel](assets/20250226_092218_updating_code_version_6_4.png)

        and select whether you want [Incremental](updating_code_options.md#incremental) or [Clean](updating_code_options.md#clean), then press the `Update` button.

    2. Version < 6.4.0
        In previous version to 6.4.0 the panel update directly to the latest version and the code is obtained from the server provider configured in `DEDALO_SOURCE_VERSION_URL` (in v7, set in `../private/.env`)

        ![Updating code <6.4.0 control panel](assets/20230910_141614_updating_code_panel.png)

        Press the button "Update Dédalo code to the latest version", wait and when the process will finessed will show the result.

        ![Updating code control panel](assets/20230910_175045_updating_ontology_result.png)

    !!! warning "Re-login after update"
        Is important after updating the code, log out and log in to Dédalo to safely refresh the browser's cache files.

4. Check for new settings

    Some code updates add or change configuration settings; the "Check config" control panel flags these.

    In v7 settings live in `../private/.env`. Regenerate the documented reference with `php dev/gen_sample_env.php` (it writes `../private/sample.env`), compare it with your `.env`, and add any new `DEDALO_*` variable(s) there. See the [Configuration Administrator Guide](../../config/administration.md).

5. Follow the update instructions and update data.

    Locate the update code panel and check if the panel indicate some instructions to do. Some code updates has data process or changes into the files and configuration.

    Follow the specific instructions and [update data](updating_data.md)

6. Open the access to work system.

    Revert the maintenance status to `false`

7. Logout and re-login with a normal user.

## Updating manually

A typical Dédalo installation use a vhost of a GNU/Linux user with a directory structure similar to:

```bash
├── home
│    ├── dedalo_user
│    │    ├── sessions
│    │    ├── httpdocs
│    │    │    ├── dedalo
│    │    │    │    ├── config/
│    │    │    │    ├── core/
│    │    │    │    ├── docs/
│    │    │    │    ├── .editorconfig
│    │    │    │    ├── favicon.ico
│    │    │    │    ├── .gitignore
│    │    │    │    ├── .htaccess
│    │    │    │    ├── index.php
│    │    │    │    ├── install/
│    │    │    │    ├── .jshintrc
│    │    │    │    ├── lib/
│    │    │    │    ├── License.md
│    │    │    │    ├── media/
│    │    │    │    ├── publication/
│    │    │    │    ├── Readme.md
│    │    │    │    ├── shared/
│    │    │    │    ├── stub.php
│    │    │    │    ├── test/
│    │    │    │    ├── tools/
│    │    │    │    └── Updates.md
│    │    │    └── private/   # ../private: .env, state.php, secrets — OUTSIDE dedalo/, preserved across code updates
│    │    ├── backups
│    │    │    ├── code/
│    │    │    ├── db/
│    │    │    ├── mysql/
│    │    │    ├── ontology/
│    │    │    └── temp/
│    │    └── logs/
```

**Where:**

* `dedalo_user` is the GNU/Linux user home directory and the PHP user (defined in the PHP-FPM pool).
* `httpdocs` is the Document directory of the Apache HTTP server (the public virtual host).
* `dedalo` is the Dedalo code directory.
* `private` holds your per-install configuration and secrets (`../private/.env`, `state.php`); it lives **outside** the `dedalo` code directory, so it is preserved when you replace the code. Keep it outside the web root (see the [Configuration Administrator Guide](../../config/administration.md)).

Please note that `sessions`, `backup`, and `logs` are located outside of `httpdocs` and are not accessible to Apache.

Adapt the following tasks to your own virtual host directory structure.

1. Close Dédalo installation and put it in maintenance mode.

    Before update the code, is highly recommended change Dédalo status to maintenance. Follow [this guide](../maintenace_status.md) to change the Dédalo status and disable Dédalo access.

2. Move your current installation. You can use the `backups/code` directory.

    ```bash
    cd /home/dedalo_user
    mv httpdocs/dedalo backups/code/dedalo_old
    ```

3. Download the latest stable version:

    ```shell
    sudo wget https://github.com/renderpci/dedalo/archive/master.zip
    ```

    Or you can choose another release from [GitHub releases list](https://github.com/renderpci/dedalo/releases)

4. Copy the release files into the **dedalo** directory inside **httpdocs** and unzip and rename it

    ```shell
    sudo unzip master.zip
    sudo mv dedalo-master dedalo
    ```

5. Set the permissions of the 'dedalo' directory according to your Apache and PHP-FPM settings.

6. Your configuration is preserved automatically — nothing to copy.

    In v7 all per-install configuration and secrets live in `../private/` (the `.env` file, `state.php`, …), **outside** the `dedalo/` code directory. Replacing the code does not touch it, so there are **no config files to copy** (unlike v6, where `config_*.php` lived inside the code directory).

    > Upgrading from v6? The first v7 boot **auto-migrates** your old `config/config_*.php` into `../private/.env` and quarantines the legacy files — see the [Configuration Administrator Guide → Migrating a v6 install](../../config/administration.md#9-migrating-a-v6-install).

7. Copy your **media** directory to the new installation

    ```shell
    cd /home/dedalo_user
    cp backups/code/dedalo_old/media httpdocs/dedalo/media
    ```

    **Optional:**, If you don't have too much space, you can move `media` directory:

    ```shell
    cd /home/dedalo_user
    mv backups/code/dedalo_old/media httpdocs/dedalo/media
    ```

8. Check for new settings

    Some code updates add or change configuration settings; the "Check config" control panel flags these. In v7, regenerate `../private/sample.env` with `php dev/gen_sample_env.php`, compare it with your `../private/.env`, and add any new `DEDALO_*` variable(s) there. See the [Configuration Administrator Guide](../../config/administration.md).

9. Follow the update instructions and update data.

    Log-in with root user into Dédalo and go to maintenance panel.

    Locate the update code panel and check if the panel indicate some instructions to do. Some code updates has data process or changes into the files and configuration.
    Follow the specific instructions and [update data](updating_data.md)

10. Open the access to work system.

    Revert the maintenance status to `false`

11. Logout and re-login with a normal user.

## Issues

Sometimes the update process asks you to log out and log in to set the correct files and refresh the browser cache. In some cases the update is left unfinished and some config variables are not assigned; the login may then show an alert as an error.

![Login error messages](assets/20250226_111925_login_errors.png)

Don't panic and press `continue` button. Navigate to the area maintenance and check the messages in the `Update data` or `Check config` panels about the errors.