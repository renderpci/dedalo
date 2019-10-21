export const config = {
	"name": "tool_lang",
	"version": "6.0.0",
	"dd_version": "6.0.0",
	"description": {
		"lg-eng": "Tool for translate the content to other langs",
		"lg-spa": "herramienta de traducción de contenido a otras lenguas"
	},
	"icon": "../img/translatable.svg",
	"show": {
		"inspector": true,
		"component": true
	},
	"conponents_config": {
		"requeriments": {
			"translatable": true,
		},
		"models": [
			"compoment_input_text",
			"compoment_text_area"
		],
	},
	//"label" : {
	//	"name":"tool_lang",
	//	"lg-eng": "Language",
	//	"lg-spa": "Lenguaje"
	//},
	"ontology": [{
			"type": "main",
			"parent": "oh80",
			"model": "section_tool",
			"term": {
				"lg-spa": "Traducción",
				"lg-eng": "Translation"
			},
			"translatable": false,
			"properties": {
				"context": {
					"context_name": "section_tool",
					"tool_section_tipo": "oh85",
					"top_tipo": "oh1",
					"target_section_tipo": "rsc167",
					"target_component_tipo": "rsc36",
					"target_tool": "tool_lang"
				}
			}
		},
		{
			"type": "children",
			"model": "section_list",
			"term": {
				"lg-spa": "Listado",
				"lg-eng": "List"
			},
			"translatable": false,
			"tr": [
				"rsc21", "rsc19", "rsc23", "rsc263", "rsc36", "rsc35"
			]

		},
	],
	"translator_engine": [{
		"name": "babel",
		"uri": "https://babel.render.es/babel_engine/"
	}]
}
