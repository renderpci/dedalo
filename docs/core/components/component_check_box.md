# component_check_box

## Overview

```json
{
    "could_be_translatable" : false,
    "is_literal": false,
    "is_related": true,
    "is_media": false,
    "modes": ["edit","list","tm","search"],
    "default_tools" : [
        "tool_time_machine",
        "tool_lang",
        "tool_replace_component_data",
        "tool_add_component_data"
    ],
    "render_views" :[
        {
            "view"    : "default",
            "mode"    : "edit | list"
        },
        {
            "view"    : "tools | line | print",
            "mode"    : "edit"
        },
        {
            "view"    : "mini | text",
            "mode"    : "list"
        }
    ],
    "data": "object",
    "server_sample_data": {
        "relations":[
            {"type":"dd151","section_id":"1","section_tipo":"rsc723","from_component_tipo":"tch191"},
            {"type":"dd151","section_id":"2","section_tipo":"rsc723","from_component_tipo":"tch191"}
        ]
    },
    "client_sample_data": {
        "section_id": "1",
        "section_tipo": "tch2",
        "tipo": "tch191",
        "lang": "lg-nolan",
        "from_component_tipo": "tch191",
        "datalist":[
            {"value":{"section_id":"1","section_tipo":"rsc723"},"label":"adquisición","section_id":"1"},
            {"value":{"section_id":"2","section_tipo":"rsc723"},"label":"donación","section_id":"2"}
        ],
        "row_section_id": "1",
        "parent_tipo": "tch2",
    },
    "value": "array of locators",
    "sample_value": [
        {"type":"dd151","section_id":"1","section_tipo":"rsc723","from_component_tipo":"tch191"},
        {"type":"dd151","section_id":"2","section_tipo":"rsc723","from_component_tipo":"tch191"}
    ]
}

```

## Definition

Component checkbox is a related component to manage a closed list of values. Normally component checkbox points to a specific section in a list of values section. Data is non translatable, and it can manage multiple values. In client, display a check box's group with the possible values to be checked.

## Data model

**Data:** `object` In server, his data is saved in relations object. In client, data object has the `datalist` with the possible values resolution.

**Value:** `array` of `locators`, or `null`

**Storage:** In database, component checkbox saves his data as a part of relations array. All relation components store his locators inside this container.

```json
{
   "relations":[
        {"type":"dd151","section_id":"1","section_tipo":"rsc723","from_component_tipo":"tch191"},
        {"type":"dd151","section_id":"2","section_tipo":"rsc723","from_component_tipo":"tch191"}
    ]
}
```

When the component is instantiated, get his data from his section and use `lg-nolan` to define his language.

## Import model

By default, import model use the JSON format of his data, an array of [locator](../locator.md).

```json
[{"type":"dd151","section_id":"2","section_tipo":"rsc723","from_component_tipo":"tch191"}]
```

As Dédalo import, use a CSV without format, JSON data need to be stringified in this way:

The table to import

| section_id    | tch191                                              |
| ------------  | :----------------------------------------------:  |
| 1             | \[{"type":"dd151","section_id":"2","section_tipo":"rsc723","from_component_tipo":"tch191"}]|

Will need to be encoded in CSV format as:

```csv
section_id;tch191
1;"[{""type"":""dd151"", ""section_id"":""2"", ""section_tipo"":""rsc723"", ""from_component_tipo"":""tch191""}]"
```

It's possible to remove the `type` and `from_component_tipo` properties because the head of the columns specify the value of `from_component_tipo` and the component knows his own `type`. So, is possible to define previous locator to import in this way:

```json
[{"section_id":"2","section_tipo":"rsc723"}]
```

Alternative forms to import:

1. A comma separate int (as section_id):

    ```json
    1,4,6
    ```

    To import this data, is necessary to specify, in the column head of the component, the section_tipo using the '_' character between them:

    `component_tipo + '_' + section_tipo`

    Example:

     **tch191_rsc723**

    In this case, the import process assumes that all int values are section_id, the section_tipo comes from the second tipo in the name of column head, from_component_tipo comes from the first tipo in the name of column head and type is calculated asking to the component in server.

    Example:

    section_id | tch191_rsc723
    --- | ---
    1 | 1,4,6

    will be parse as:

    ```json
    [
        {"type":"dd151","section_id":"1","section_tipo":"rsc723","from_component_tipo":"tch191"},
        {"type":"dd151","section_id":"4","section_tipo":"rsc723","from_component_tipo":"tch191"},
        {"type":"dd151","section_id":"6","section_tipo":"rsc723","from_component_tipo":"tch191"}
    ]
    ```

    When the component points to multiple sections, this import way will not respect other sections values in his data. Previous data pointed to sections, others than the section indicates in the head, will be removed.

    1. Importing unique values

        Is it possible to import unique int as section_tipo

        Example:

        section_id | tch191_rsc723
        --- | ---
        1 | 6

    2. Removing section_tipo reference in head.

        Is possible remove the section_tipo in the head of the column when the component use only 1 pointed section.

        Example:

        section_id | tch191
        --- | ---
        1 | 1,4,6

        !!! warning "Components using with multiple sections"
            This possibility is only available when the component point to 1 section. Multiple sections are not allowed to import in this way.

        In this case the import process will ask to component in the server to get the section_tipo to be used, if the component has multiple sections it will fail to import, to avoid errors and inconsistencies.

## Properties

`config_relation`

object

properties: `relation_type`

`relation_type`

Used to define specific relation types of the component. By default the type of the component is set to `dd151` as normal link between data.

options:

| typology | tipo
|---|---
| Link | dd151
| Indexation | dd96
| Child | dd48
| Parent | dd47
| Filter | dd675
| Ontology | dd77

Example, set the component as indexation:

```json
{
    "config_relation": {
        "relation_type": "dd96"
    }
}
```

`fields_separator`

Used to define the character to be used between fields of the target section when the component render as text. Used to export, and show data inside other components.

Example:

```json
{
    "fields_separator": ", "
}
```

Will join text of the fields in this way (surname [rsc86](https://dedalo.dev/ontology/rsc86), name [rsc85](https://dedalo.dev/ontology/rsc85)): Ramón y Cajal, Santiago

`records_separator`

Used to define the character to be used between locators (records) when the component render as text. Used to export, and show data inside other components.

Example:

```json
{
    "fields_separator": " | "
}
```

Will join locators (records) as text in this way: Santiago Ramón y Cajal | Gerty Cori

`mandatory`

options: true | false

Inform to users that this component needs a data value (user must to introduce any value, it's mandatory).
