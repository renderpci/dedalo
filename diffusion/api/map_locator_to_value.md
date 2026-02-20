# map_locator_to_value

For diffusion fields that have related components, we need to map the values of the field to the values of the related component.

some of them have this property:


```json
{
  "process_dato": "diffusion_sql::map_locator_to_value",
  "process_dato_arguments": {
    "map": {
      "1": 1,
      "2": 0
    }
  }
}
```

it means that use the section_id of the locator as key to get the value from the map.

You can use the existing parsers to obtain the map. as the Enum parser. Is the same logic.

````
{
  "process": {
    "parser": [
      {
        "fn": "parser_locator::get_section_id",
        "id": "a"
      },
      {
        "fn": "parser_locator::get_first",
        "id": "a"
      },
      {
        "fn": "parser_text::map_value",
        "options": {
          "map": [
            {
              "a": {
                "1": 1,
                "2": 0
              }
            }
          ]
        }
      }
    ]
  }
}
````

