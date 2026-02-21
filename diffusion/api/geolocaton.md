# Geolocation

## for nodes with `component_text_area` as relation component.

Sometimes they have this defintion in propiedades:

```json
{
    "process_dato": "diffusion_sql::build_geolocation_data_geojson",
    "process_dato_arguments": {
        "fallback": {
            "tipo": "hierarchy31",
            "method": "get_diffusion_value_as_geojson"
        }
    }
}
```

the new property can add a `fn` to get the geojson data from a component.

get_geojson_data()

```json

{
  "process": {
    "fn": "get_geojson_data"
  }
}

```

Don't process any other geojson configuration properties. 
