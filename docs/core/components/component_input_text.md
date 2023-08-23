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

When the component is instantiated as transliterated the main lang is defined as `lg-nolan` and it's possible to add other translations.

```json
{
    "lg-nolan"  : ["Augustus"],
    "lg-spa"    : ["Augusto"]
}
```

## Import model

By default import model use the JSON format of his data, a object with lang properties and values in array.

```json
{
    "lg-spa" : ["mi dato para importar", "Otro dato"],
    "lg-eng" : ["my import data", "Other data to import"]
}
```

Alternative forms to import:

1. An array of values

    ```json
    ["mi dato para importar", "Otro dato"]
    ```

    In this case the import process assume the Dédalo data lang defined by the user in menu and will save into this lang, or if the component is non translatable will use `lg-nolan` to save import data.

2. Plain text

    ```json
    new data to import
    ```

    In this case the import process assume the Dédalo data lang defined by the user in menu and will import the value ass unique value in the array, if exists previous data it will be replace with a new array with the import value.

    If the previous data is:

    ```json
    {
        "lg-spa" : ["mi dato para importar", "Otro dato"],
        "lg-eng" : ["my import data", "Other data to import"]
    }
    ```

    and the Dédalo data lang is set to English, the final data will be after import plain text:

     ```json
    {
        "lg-spa" : ["mi dato para importar", "Otro dato"],
        "lg-eng" : ["new data to import"]
    }
    ```

    Plain text is easy to import, but it is limited in the data control. take account of the language set in the menu.

## Properties

`multi_line`

used to admit multiple lines, the input will replace to textarea HTML node in render

`with_lang_versions`

Used for transliterate components. When is set to true, the component remain to non translatable but it can be transliterated to other languages. The main lang of the component will be `lg-nolan` but it can handle other languages with the `tool_lang`

Used to export data with all languages in JSON format.

`unique`


`mandatory`

Inform to users that this component need a data value (user need to introduce any value, it's mandatory).

## buttons