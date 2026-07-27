# relation_list rule

For nodes with `relation_list` as relation component.

Sometimes they have this defintion in propiedades:

"{
    "option_obj": {
        "add_parents": true,
        "resolve_value": true,
        "parent_section_tipo": "cult1",
        "divisor": " - ",
          "records_separator": " - "
        "process_dato_arguments": {
            "custom_parents": {
                "parents_splice": [
                    0,
                    -1
                ]
            },
             "parent_end_by_term_id": [
                "on1_2705",
                "on1_2748"
            ],
            parent_end_by_model": [
                "es_8871"
            ]

        }
    }
}"

with some combinations, sometimes they have "process_dato_arguments" and somethimes not, but the propeiedades are the same, look `numisdata958`and `mdcat2343`.

it means:

1. "resolve_value": true

use the `term` in parent chain if it is not present or is false, use the `section_id` to resolve the string chain

2. "parent_section_tipo": "cult1"

use only the parents that have set "section_tipo" = "cult1"

3. "parents_splice": [0,-1]

splice the parent chain to use only the selection

4. "parent_end_by_term_id": [ "on1_2705","on1_2748"]

don't use the parents after section_tipo = "on1" and section_id = 2705 OR  section_tipo = "on1" and section_id = 2748

5. parent_end_by_model": [ "es2_8871" ]

don't use the parents after typology_section_tipo = "es2" and typology_section_id = 8871

6. "divisor": " - " OR "records_separator": " - " (same meaning, a duplicated propiedad to unify)

use the " - " as records separator into the final join




