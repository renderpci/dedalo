# Changing parameters of Dédalo areas config file

> **⚠️ Dédalo v7 — this file moved out of the web root to `../private/config_areas.php`.** Its format is unchanged; only the location moved (the area code loads it from `../private/`). Edit it there. See the **[Configuration Administrator Guide](administration.md)** for the full config model. The instructions below still describe the file's contents.

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

Areas refer to different parts of the ontology. Every area has a specific, unique `tipo` (typology of indirect programming object). This configuration file allows or denies access to specific areas. When access to an area is denied, the area is removed from the menu and no user — not even the root user — can reach it. This config file is loaded before the security access check and removes the specified tipos from the ontology. Dédalo uses some private areas in the ontology as private lists of values, such as the Yes/No list, which must not be edited. Those areas are denied in this file.

---

### Allow

./dedalo/config/config_areas.php

areas_allow  `array`

This variable holds a list of tipos (an array of tipos) that can be accessed from the menu and the profiles. By default Dédalo grants access to all areas.

```php
$areas_allow[] = 'dd137';
```

---

### Deny

./dedalo/config/config_areas.php

areas_deny `array`

This variable holds a list of tipos (an array of tipos) that are denied access from the menu and the profiles. By default Dédalo only denies some private lists.

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
>which is the same as:
>
>```php
>$areas_deny = [ 'dd137', 'rsc1', 'hierarchy20' ];
>```
