# Introduction to components

Components are re-usable objects that can be instantiated by the ontology definition. Components are part of the sections and are used as fields with specific properties.

## Nomenclature of files

Every component definition has its own class, controller, and views. The components have a server part, develop in PHP language, and client part, develop in JavaScript and CSS.

CSS are develop with LESS language and it's not complied by itself, the final CSS is included as part of page.css.

The nomenclature of files follow this paths:

1. **Server files:**

    Sever files are stored directly in the main directory of the component.

    Class: `class.component_xxx.php`

    Controller: `component_xxx_json.php`

2. **Client files:**

    Client files with logical, render and views are stored inside a `/js` directory

    Class: `component_xxx.js`

    Render: `render_yyy_component_xxx_.js`

    View: `render_zzz_yyy_component_xxx_.js`

    CSS client files are stored inside a `/css` directory.

    Style: `component_xxx.less`

-------------

- xxx = specific name, (input_text | text_area | image | etc. )
- yyy = mode, (edit | list | search)
- zzz = view (default | line | mini | text | mosaic | etc.)

## Instantiation

Normally components are called by sections but it's possible instantiate any component without his own section. In the server the components are instantiated by `component_common.php` class.

```php
$component = component_common::get_instance(
    string $component_name      = null, // model or name of the component
    string $tipo                = null, // ontology tipo
    mixed $section_id           = null, // section id
    string $mode                = 'edit', // mode used to load the component with data used to edit or list
    string $lang                = DEDALO_DATA_LANG, // language 
    string $section_tipo        = null,  // the ontology section tipo of the component
    bool $cache                 = true, // load from cache if exist
    object $caller_dataframe    = null // if the component is inside a subsection or dataframe.
 );
 ```

In the client the components are instantiated by `instances.js` class.

```js
const component = get_instance({
    model           : model,        // string, model or name of the component
    tipo            : tipo,         // string, ontology tipo
    section_tipo    : section_tipo, // string, ontology section tipo of the component
    section_id      : section_id,   // string || int, section id
    mode            : mode,         // string, mode used to load the component with data used to edit or list
    lang            : lang          // string, language 
})
 ```

 !!! Note about JavaScript instantiation
    The `instances.js` class is a ES6 module and it can be include in this way:
    ```js
    import {get_instance} from '../../common/js/instances.js'
    ```

## Data management

Components manage his own data, but their are not connected directly to the database, only sections can get and save data in the database, so, components get and save his data through their own section.

## Translatable components

Dédalo is a multi-language system, all information could be translatable in multiple languages. Components are translatable by default, but some components are not translatable as component_number.

Translatable components manage only the instance in the current language and their data will be only the instantiated language part of the data, for example, a component_input_text instantiated in the Català language will only manage the Català part of its data, the component will get its data from the section but you can only get one language at a time.

Non translatable components are instantiated with `lg-nolan` language.