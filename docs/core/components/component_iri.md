# component_iri

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
        "lg-nolan": [
            {
                "iri" : "https://dedalo.dev",
                "title": "Dédalo website"
            }
        ]
    },
    "value": "array of dd_iri objects",
    "sample_value": [
        {
            "iri" : "https://dedalo.dev",
            "title": "Dédalo website"
        }
    ]
}
```

## Definition

Component iri manage uris in standard format. Data could be translatable or not translatable, when is set as non translatable it use `lg-nolan` to define his language.

## Data model

**Data:** `object` with lang as properties, in non translatable option it will use `lg-nolan` as property.

**Value:** `array` of `objects`, or `null`

**Storage:** In database component iri save his data as object with language as property (`lg-eng`,`lg-deu`, etc) and values as array of objects.

**Definition:**

properties of the dd_iri:

- iri ( string ): indicate uri direction, with the protocol, `http://`, `https://``
- title  (optional string): Some label to identify the direction, in some cases title is used to include the link to the uri, using the `<a href>` HTML tag.

properties of the dd_date:

Example of link to dedalo.dev.

```json
[{
    "iri" : "https://dedalo.dev",
    "title": "Dédalo website"
}]
```

In some cases it will be render as:

```html
<a href="https://dedalo.dev">Dédalo website</a>
```

When the component is instantiated, the component get his data from his section and only get the value without lang.

### Translatable uris.

Is possible to define the component as translatable, in those cases, the component will use the translation tools.

```json
{
    "lg-spa": [
        {
            "iri" : "https://es.wikipedia.org/wiki/Arse"
        }
    ],
    "lg-cat": [
        {
            "iri" : "https://ca.wikipedia.org/wiki/Saguntum"
        }
    ]
}
```

## Import model

By default import model use the JSON format of his value, as the component do not use languages the main format to import is the array of dd_iri objects.

```json
[{
   "iri" : "https://dedalo.dev",
   "title": "Dédalo website"
}]
```

See the full import definition [here](../importing_data.md#uri).

## Properties

`use_active_check`

options: bool, default `false`

Used to create or remove the active checkbox. When the component is associated to some media components, as component_image, the component_iri could storage the uri of external media, in those cases the active checkbox field is used to indicate if the uri will be used as media source.

Example to set a range:

```json
{
    "use_active_check" : true
}
```

`use_title`

options: bool, default `true`

Used to create or remove the title input text field

```json
{
    "use_title" : false
}
```



`fields_separator`

Used to define the character/s to be used between uris. Used to export, and show data inside other components.

Example:

```json
{
    "fields_separator": ", "
}
```

Will join as text version of the uri (title, uri): mib, https://monedaiberica.org

`records_separator`

Used to define the character to be used between multiple values of the component.

Example:

```json
{
    "fields_separator": " | "
}
```

Will join locators (records) as text in this way: mib, https://monedaiberica.org | https:/dedalo.dev

`mandatory`

options: true | false

Inform to users that this component need a data value (user need to introduce any value, it's mandatory).
