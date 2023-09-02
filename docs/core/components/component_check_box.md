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

See the full import relation data definition [here](../importing_data.md#related-data).

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
