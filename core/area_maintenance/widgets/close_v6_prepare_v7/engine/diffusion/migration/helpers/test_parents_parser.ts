
import { parents } from '../../api/v1/lib/parsers/parser_locator';

const mock_data: any = [
	{
		tipo: "rsc",
		lang: null,
		value: [
			{ section_tipo: "es1", section_id: "1257" }, // Bilbao
			{ section_tipo: "fr1", section_id: "3" }    // Abergement-Clémenciat
		],
		parents: {
			"es1_1257": [
				{ 
					section_tipo: "es1", section_id: "1257", 
					term: [{ lang: "lg-spa", value: "Bilbao" }],
					typology_section_tipo: "geo", typology_section_id: "city"
				},
				{ 
					section_tipo: "es1", section_id: "8844", 
					term: [{ lang: "lg-spa", value: "Bizkaia" }],
					typology_section_tipo: "geo", typology_section_id: "province"
				},
				{ 
					section_tipo: "es1", section_id: "8864", 
					term: [{ lang: "lg-spa", value: "País Vasco" }],
					typology_section_tipo: "geo", typology_section_id: "region"
				},
				{ 
					section_tipo: "es1", section_id: "1", 
					term: [{ lang: "lg-spa", value: "España" }],
					typology_section_tipo: "geo", typology_section_id: "country"
				}
			],
			"fr1_3": [
				{ 
					section_tipo: "fr1", section_id: "3", 
					term: [{ lang: "lg-spa", value: "Abergement-Clémenciat (L')" }],
					typology_section_tipo: "geo", typology_section_id: "city"
				},
				{ 
					section_tipo: "fr1", section_id: "36686", 
					term: [{ lang: "lg-spa", value: "Bourg-en-Bresse" }],
					typology_section_tipo: "geo", typology_section_id: "arrondissement"
				},
				{ 
					section_tipo: "fr1", section_id: "37027", 
					term: [{ lang: "lg-spa", value: "Ain" }],
					typology_section_tipo: "geo", typology_section_id: "department"
				},
				{ 
					section_tipo: "fr1", section_id: "1", 
					term: [{ lang: "lg-spa", value: "France" }],
					typology_section_tipo: "geo", typology_section_id: "country"
				}
			]
		}
	}
];

function run_test(name: string, options: any) {
	console.log(`\n--- Test: ${name} ---`);
	const result = parents(mock_data, options);
	if (result && result.length > 0) {
		console.log(JSON.stringify(result[0].value, null, 2));
	} else {
		console.log("NULL result");
	}
}

// Existing basic scenarios
run_test("rsc273 (basic string)", {
	value: "term",
	fields_separator: " - ",
	records_separator: ", "
});

// New filtering scenarios
run_test("Truncate by term_id [es1_8864] (País Vasco)", {
	value: "term",
	parent_end_by_term_id: ["es1_8864"],
	fields_separator: " - ",
	records_separator: ", "
});

run_test("Truncate by typology_term_id [geo_department] (Ain)", {
	value: "term",
	parent_end_by_typology_term_id: ["geo_department"],
	fields_separator: " - ",
	records_separator: ", "
});

run_test("Filter by section_tipo array ['es1']", {
	value: "term",
	parent_section_tipo: ["es1"],
	fields_separator: " - ",
	records_separator: ", "
});

run_test("Splice chain [1, -1] (remove middle)", {
	value: "term",
	parents_splice: [1, 2], // Remove 2 elements starting at index 1
	fields_separator: " - ",
	records_separator: ", "
});

run_test("Truncation + Splice (Splice should NOT act)", {
	value: "term",
	parent_end_by_term_id: ["es1_8864"],
	parents_splice: [0, 1], // Would remove Bilbao if it acted
	fields_separator: " - ",
	records_separator: ", "
});
