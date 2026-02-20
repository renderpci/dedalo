# Output format

In version 6 the output format was done by every component when it was called to generate the diffusion data object.

## v6 Formats rules

Two different component outpus by the model of the component.

- if the node has a related components that is a relation component, the output is an array.
- if the node has a related components that is not a relation component, the output is an string.

But some components like `component_input_text` can have a `"data_to_be_used": "dato"` and the output is an array.
Or some relation component can have a `propiedades` with a `"process_dato": "diffusion_sql::map_quality_to_int"` the final format is an int, or by default the `componnent_autocomplete_hi` resolve its data with parents and returns an string joining the values.

In version 6, PHP functions define by itself the final format for the SQL fields.

## v7 Formats rules

In version 7 the output format is done by the PHP diffusion API (dd_diffusion_api). And all components include a method `get_diffusion_data` that returns the data to be used in the diffusion and all values are an array of objects. Literal components and relation components output use the same format.

The final format is done by the parsers in the bun diffusion API (diffusion_api).

The parsers can process the data in a parser chain process, so, the parsers has to matain the same output / input format.

So, we need to define the final format in the PHP diffusion API (dd_diffusion_api) and we need to create a final parser in the bun diffusion API (diffusion_api) to convert the data to the final SQL field format, an stringifyed array or int or a join the array into a flat string.

example:
json array -> stringifyed array "[\"value1\", \"value2\"]"
json object -> stringifyed object "{\"value1\": \"value2\"}"
int -> int 1
string -> string "value1, value2"

The main idea is to calculate the final format in the context of the datum when the diffusion API call to components. And it can be override by the new properties of the diffusion ontology nodes.

### Plan

By default the output format of the relation components are an array and the literal components are an string.

define 3 diffusion ontology nodes properties:
- output_format: json, int, string


- We need to create a way to define the default output format of the components.
- We need to add a process into resolve context of the datum in the diffusion API (dd_diffusion_api) to calculate the final format of the component. and preserve it into all diffusion data flow.
- We need to create a final parser in the bun diffusion API (diffusion_api) to convert the data to the final SQL field format, an stringifyed array or int or a join the array into a flat string.
- We need to define the current v6 output format into new diffusion ontology nodes properties, for example when the v6 definition as `"data_to_be_used": "dato"` for literal components than it don't match with the default format of the component and we need to define the final format in the diffusion ontology node as `"output_format": "json"`.



Create a plan and ask me if you have questions.

