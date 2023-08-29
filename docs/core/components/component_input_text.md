# component_input_text

## Overview

```json
{
    "could_be_translatable" : true,
    "is_literal": true,
    "is_related": false,
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
            "view"    : "text | mini | default",
            "mode"    : "edit | list"
        },
        {
            "view"    : "line | print",
            "mode"    : "edit"
        },       
        {
            "view"    : "ip",
            "mode"    : "list"
        }
    ],
    "data": "object",
    "sample_data": {
        "lg-spa":["mi título", "Otro nombre"],
        "lg-eng":["my title", "Other name"]
    },
    "value": "array of strings",
    "sample_value": ["my title", "Other name"]
}
```

## Definition

Component input text is a basic text component to manage plain strings without format. Value do not support HTML code. Data could be non translatable, translatable or transliterated.

## Data model

**Data:** `object` with languages as properties.

**Value:** `array` of `strings`, or `null`

**Storage:** In database component input text save his data as object with the languages as property and values as array of strings.

```json
{
    "lg-spa" : ["mi título", "Otro nombre"],
    "lg-eng" : ["my title", "Other name"]
}
```

When the component is instantiated, the component get his data from his section and only get the value in the languages that is instantiated.

When the component is instantiated as not translatable the lang is defined as `lg-nolan`

```json
{
    "lg-nolan" : ["Augustus"]
}
```

When the component is instantiated as transliterated the main lang is defined as `lg-nolan` and it's possible to add other translations.

```json
{
    "lg-nolan"  : ["Augustus"],
    "lg-spa"    : ["Augusto"]
}
```

## Import model

By default import model use the JSON format of his data, an object with lang properties and values in array.

```json
{
    "lg-spa" : ["mi dato para importar", "Otro dato"],
    "lg-eng" : ["my import data", "Other data to import"]
}
```

See the full text import definition [here](../importing_data.md#plain-text).

## Properties

`with_lang_versions`

options: true | false

Used for transliterate components. When is set to true, the component remain to non translatable but it can be transliterated to other languages. The main lang of the component will be `lg-nolan` but it can handle other languages with the `tool_lang`

Used to export data with all languages in JSON format.

`unique`

options: true | false

Add a request to the component to search equal values in all records in the section, when is set to true, an alert will show when the user introduce a duplicate value in the component.

`mandatory`

options: true | false

Inform to users that this component need a data value (user need to introduce any value, it's mandatory).

`multi_line` : *deprecated* (use a component_text_area instead)

options: true | false

Used to admit multiple lines, the input will replace to textarea HTML node in render
