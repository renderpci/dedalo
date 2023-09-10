# Updating code

Dédalo v6 is an active, rapidly developing software project. It is, therefore, important to keep it updated and in best condition for stability and safety reasons.

This guide is focused into update process of minor, fixes and patches of version 6. Major updates v4 to v5, v5 to v6 has his own dedicate guides.

!!! info "Migration from Dédalo v5"
    If you want to switch to Dédalo v6 from previous release, Dédalo v5, please refer to the dedicated [migration guide](../../update_v5/update_from_v5.md) that will explain all the differences between these two releases and help you make the switch.

The update process is based in the Dédalo cadence numeration, it's a incremental process and sometimes it depends of the ontology version. Update the ontology previously to update Dédalo code following this [guide](updating_ontology.md).

Update Dédalo code will need a control by IT team. The update is automatic but some changes as changes into config files will need changed manually because the update process can not change your specific configuration.

!!! warning "Update pre-production system and test before update new versions into production system"
    Is highly recommended to test your new Dédalo installation before deploying the changes into the production environment. This will help ensure that the update will not have a negative impact on your catalogue.

## Updating tasks

1. Closing the access to work system.

    Before update the code, is highly recommended change Dédalo status to maintenance. Follow [this guide](../maintenace_status.md) to change the Dédalo status and disable Dédalo access.

2. Enter into maintenance panel.

    Login as root user and go to Maintenance panel, it is located into:
    > System administration -> Maintenance

   1. **Optional** make a backup of the database

         Is highly recommended to create a backup before update Dédalo code. You can follow [this guide](../backup.md#backup-the-work-system) to create a backup of the database

3. Locate "Update code" control panel"

    ![Updating ontology control panel](assets/20230910_141614_updating_code_panel.png)

    Press the button "Update Dédalo code to the latest version", wait and when the process will finessed will show the result.

    ![Updating ontology control panel](assets/20230910_175045_updating_ontology_result.png)

4. Check the changes into sample.config files

   Some code updates can change the config necessities and is necessary to add or remove manually. It will indicate into the "Check config" control panel.

   If you config need to be updated, open the sample.config and your equivalent config file that was indicated and add the new variable/s.

5. Open the access to work system.

   Revert the maintenance status to `false`

6. Logout and re-login with a normal user.
