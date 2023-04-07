# Changing parameters of Dédalo areas config file

./dedalo/config/config_areas.php

1. Locate the file into the directory: ../httpdocs/dedalo/config/

    ```shell
    cd ../httpdocs/dedalo/config/
    ```

2. Edit the config_areas.php

    ```shell
    nano config_areas.php
    ```

3. Locate and change the PROPERTY with the proper configuration.

## Allowing / denying access variables

Areas are referred to different parts in the ontology. Every Area has a specific and unique tipo (typology of indirect programming object). This configuration file allow or deny the access to specific areas. When deny access to specific areas it will removed from the menu and do not possible get access by any user, included root user. This config file is loaded previously than the security access, and remove specific tipos from the ontology. Dédalo use some private areas in the ontology as private lists of values, like Yes/no list, that is not accessible to be changed. This areas are deny in this file.

---

### Allow

./dedalo/config/config_areas.php

areas_allow  `array`

This variable has a list of tipos (array of tipos) that will be able to access by the menu and the profiles. By default Dédalo will access to all areas.

```php
$areas_allow['dd137'];
```

---

### Deny

./dedalo/config/config_areas.php

areas_deny `array`

This variable has a list of tipos (array of tipos) that will be deny to acces by the menu and the profiles. By default Dédalo will only deny some private list.

```php
$areas_deny[] = 'dd137';
```

>You can use the direct format to create the array or add the tipo in this way:
>
>```php
>$areas_deny[] = 'dd137'; // Private list of values
>$areas_deny[] = 'rsc1'; // Media real section
>$areas_deny[] = 'hierarchy20'; // Thesaurus real section
>```
>
>It's the same that:
>
>```php
>$areas_deny[ 'dd137', 'rsc1', hierarchy20'];
>```
