# component_number

## Overview

```json
{
    "could_be_translatable" : false,
    "is_literal": true,
    "is_related": false,
    "is_media": false,
    "modes": ["edit","list","tm","search"],
    "default_tools" : [
        "tool_time_machine", 
        "tool_replace_component_data", 
        "tool_add_component_data"
    ],
    "render_views" :[
        {
            "view"    : "mini | default",
            "mode"    : "edit | list"
        },
        {
            "view"    : "line | print",
            "mode"    : "edit"
        },       
        {
            "view"    : "text",
            "mode"    : "list"
        }
    ],
    "data": "object",
    "sample_data": {
        "lg-nolan":[5.27]
    },
    "value": "array of numbers",
    "sample_value": [4,-25,7.89]
}
```

## Definition

Manage numbers with specific precision.
Component number manage any kind of numbers, int, float. Data is non translatable and use `lg-nolan` to define his language.

## Data model

**Data:** `object` with `lg-nolan` as property.

**Value:** `array` of `numbers`, or `null`

**Storage:** In database component number save his data as object with `lg-nolan` as property and values as array of numbers.

**Types supported:** int | float

**Default type:** float

**Default precision:** 2

```json
{
    "lg-nolan" : [104,-75.35]
}
```

Data storage format does not support internationalization for numbers, the float point is always set with . and does not use thousand separator. Component number can render an internationalization formats it in render->view to accommodate to specific formats as Spanish format 1.234,56 from data 1234.56.

When the component is instantiated, the component get his data from his section and only get the value without lang.

## Import model

By default import model use the JSON format of his value, as the component do not use languages the main format to import is the array of values.

```json
[104,-75.35]
```

See the full number import definition [here](../importing_data.md#numbers).

## Properties

`type`

options: int | float

Defines the type of number to use, when is set with float is possible to define his precision.

Example to set type for int

```json
{
    "type"      : "int"
}
```

`precision`

Defines the precision of the float numbers.

Example to set precision with 4 decimals

```json
{
    "type"      : "float",
    "precision" : 4
}
```
