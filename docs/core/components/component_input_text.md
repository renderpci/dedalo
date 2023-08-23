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
            "view"    : "text | mini | default"
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

Component input text is a basic text component to manage plain strings without format. Value do not support HTML code.

## context

## Data model

**Data:** `object` with languages as properties.

**Value:** `array` the `strings`, or `null`

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

When the component is instantiated as transliterable the main lang is defined as `lg-nolan` and it's possible to add other translations.

```json
{
    "lg-nolan"  : ["Augustus"],
    "lg-spa"    : ["Augusto"]
}
```


## Import model

## Properties

`multi_line`

used to admit multiple lines, the input will replace to textarea HTML node in render

`with_lang_versions`

used to export data with all languages in JSON format

`unique`


`mandatory`

## buttons