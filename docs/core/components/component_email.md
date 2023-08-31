# component_email

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
    "button": [
        "email_multiple"
    ]
    "render_views" :[
        {
            "view"    : " mini | default",
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
        "lg-nolan":["my_email@dedalo.dev"]
    },
    "value": "array of strings",
    "sample_value": ["my_email@dedalo.dev", "other@dedalo.dev"]
}
```

## Definition

Component email is a basic text component to manage plain strings as emails without format. Value do not support HTML code. Data is non translatable.

The component will check the email format to validate it.

## Data model

**Data:** `object` with `lg-nolan` as language property.

**Value:** `array` of `strings`, or `null`

The string value is checked and it need to be in correct email format: local-part, the symbol @, and a domain, which may be a domain name.

The local-part of the email address may be unquoted or may be enclosed in quotation marks.

If unquoted, it may use any of these ASCII characters:

- Uppercase and lowercase Latin letters a to z
- digits 0 to 9
- especial characters: `!#$%&'*+-/=?^_{|}~`
- dot `.` provided that it is not the first or last character and provided also that it does not appear consecutively (e.g., raspa..boss@dedalo.dev is not allowed)

The domain name part of an email address has to conform to strict guidelines: it must match the requirements for a hostname, a list of dot-separated DNS labels, each label being limited to a length of 63 characters and consisting of:

- Uppercase and lowercase Latin letters a to z
- Digits 0 to 9, provided that top-level domain names are not all-numeric
- Hyphen `-` provided that it is not the first or last character.

**Storage:** In database, component email saves his data as object with the `lg-nolan` language as property and values as array of strings.

```json
{
    "lg-nolan" : ["my_email@dedalo.dev", "other@dedalo.dev"]
}
```

When the component is instantiated the lang is defined as `lg-nolan` and the component get his data from his section and only get the value of the `lg-nolan`.

## Import model

By default, import model uses the JSON format of his value, an array with the emails in string format.

```json
["my_email@dedalo.dev", "other@dedalo.dev"]
```

See the full text import definition [here](../importing_data.md#plain-text).

## Properties

`mandatory`

options: true | false

Informs users that this component requires a data value (user must to introduce any value, it's mandatory).

`multi_line` : *deprecated* (use a component_text_area instead)

options: true | false

Used to support multiple lines. The input will be replaced by a text area HTML node on rendering.
