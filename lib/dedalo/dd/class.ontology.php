<?php

class ontology {



	/**
	* EXPORT
	* @return object $data
	*/
	public static function export($tipo) {
		
		$data = ontology::parse($tipo);

		return $data;
	}//end export



	/**
	* PARSE
	* Get and convert ontology term and childrens to file in JSON format
	* @return
	*/
	public static function parse($tipo) {

		$ar_data = [];

		// current term data
			$item = ontology::tipo_to_json_item($tipo);
			$ar_data[] = $item;

		// childrens
			$childrens = RecordObj_dd::get_ar_recursive_childrens($tipo);
			foreach ($childrens as $children_tipo) {
				$ar_data[] = ontology::tipo_to_json_item($children_tipo);
			}
		
		#dump($ar_data, '$ar_data ++ '.to_string());
		
		return $ar_data;
	}//end parse



	/**
	* TIPO_TO_JSON_ITEM
	* Resolve full dd item data from tipo
	* @param string $tipo
	* @return object $item
	*/
	public static function tipo_to_json_item($tipo) {

		$RecordObj_dd = new RecordObj_dd($tipo);
		$RecordObj_dd->get_dato();

		// descriptors
			$strQuery = "SELECT dato, tipo, lang FROM \"matrix_descriptors_dd\" WHERE parent = '$tipo'";
			$result	  = JSON_RecordObj_matrix::search_free($strQuery);
			$ar_descriptors = [];
			while ($row = pg_fetch_assoc($result)) {

				$type = $row['tipo']==='termino' ? 'term' : $row['tipo'];

				$ar_descriptors[] = (object)[
					'value' => $row['dato'],
					'lang' 	=> $row['lang'],
					'type' 	=> $type
				];
			}

		// relations
			$current_relations = $RecordObj_dd->get_relaciones();		
			if (!empty($current_relations)) {
				
				$relations = array_map(function($element){
					$element = is_array($element) ? (object)$element : $element;
					$current_obj = new stdClass();
						$current_obj->tipo = property_exists($element, 'tipo') ? $element->tipo : reset($element);
	    			return $current_obj;
	    		}, $current_relations);
			}

		$item = (object)[
			'tipo' 			=> $tipo,
			'tld' 			=> $RecordObj_dd->get_tld(),
			'model' 		=> RecordObj_dd::get_modelo_name_by_tipo($tipo,true),
			'model_tipo' 	=> $RecordObj_dd->get_modelo(),
			'parent' 		=> $RecordObj_dd->get_parent(),
			'order' 		=> (int)$RecordObj_dd->get_norden(),
			'translatable' 	=> $RecordObj_dd->get_traducible()==='si',
			'properties' 	=> $RecordObj_dd->get_propiedades(true),
			'relations' 	=> $relations ?? null,
			'descriptors' 	=> $ar_descriptors
		];
		#dump($item, ' item ++ '.PHP_EOL.json_encode($item, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

		return $item;
	}//end tipo_to_json_item



	/**
	* IMPORT
	* @return 
	*/
	public static function import(array $data) {

		$data = !is_array($data) ? array($data) : $data;

		foreach ($data as $key => $item) {
			
			// jer_dd
				$esmodelo = $item->is_model ?? 'si';
				$traducible = $item->translatable===true ? 'si' : 'no';

				$RecordObj_dd_edit 	= new RecordObj_dd_edit($item->tipo, $item->tld);	
					# Defaults
					$RecordObj_dd_edit->set_esdescriptor('si');
					$RecordObj_dd_edit->set_visible('si');	
					$RecordObj_dd_edit->set_parent($item->parent);
					$RecordObj_dd_edit->set_esmodelo($esmodelo);
					$RecordObj_dd_edit->set_norden($item->order);
					$RecordObj_dd_edit->set_traducible($traducible);
					$RecordObj_dd_edit->set_relaciones($item->relations);
					$RecordObj_dd_edit->set_propiedades($item->properties);
					$RecordObj_dd_edit->set_modelo($item->model_tipo);
					$RecordObj_dd_edit->set_tld($item->tld);

			
				
				# SAVE : After save, we can recover new created terminoID (prefix+autoIncrement)
				$created_id_matrix = $RecordObj_dd_edit->Save();
					dump($created_id_matrix, ' created_id_matrix ++ '.to_string());

				

				$descriptor = $item->descriptors;

				foreach ($descriptor as $current_descriptor) {

					$term = $current_descriptor->type==='term' ? 'termino' : $current_descriptor->type;
					
					$RecordObj_descriptors_dd 	= new RecordObj_descriptors_dd(
						'matrix_descriptors_dd', NULL, $item->tipo,$current_descriptor->lang, $term
					);
						dump($RecordObj_descriptors_dd, ' RecordObj_descriptors_dd ++ '.to_string());

					$RecordObj_descriptors_dd->set_dato($current_descriptor->value);
					$RecordObj_descriptors_dd->Save();
				}// end foreach ($descriptor)

		}//end foreach ($data as $key => $item)
	
		


	}//end import



}//end ontology

DBi::_getConnection();
include('class.RecordObj_dd_edit.php');
$data = json_decode('[
  {
    "tipo": "oh81",
    "tld": "oh",
    "model": "section_tool",
    "model_tipo": "dd125",
    "parent": "oh80",
    "order": 1,
    "translatable": false,
    "properties": {
      "context": {
        "context_name": "section_tool",
        "tool_section_tipo": "oh81",
        "top_tipo": "oh1",
        "target_section_tipo": "rsc167",
        "target_component_tipo": "rsc35",
        "target_tool": "tool_transcription",
        "prueba":"Hola test 2"
      }
    },
    "relations": null,
    "descriptors": [
      {
        "value": "Transcription nuevisimo",
        "lang": "lg-eng",
        "type": "term"
      },
      {
        "value": "Transcripción entrevistas",
        "lang": "lg-spa",
        "type": "term"
      },
      {
        "value": "Transcripció dentrevistes",
        "lang": "lg-cat",
        "type": "term"
      },
      {
        "value": "Μεταγραφή συνεντεύξεις",
        "lang": "lg-ell",
        "type": "term"
      }
    ]
  },
  {
    "tipo": "oh82",
    "tld": "oh",
    "model": "section_list",
    "model_tipo": "dd91",
    "parent": "oh81",
    "order": 1,
    "translatable": false,
    "properties": null,
    "relations": [
      {
        "tipo": "rsc21"
      },
      {
        "tipo": "rsc19"
      },
      {
        "tipo": "rsc23"
      },
      {
        "tipo": "rsc263"
      },
      {
        "tipo": "rsc36"
      },
      {
        "tipo": "rsc244"
      },
      {
        "tipo": "rsc35"
      }
    ],
    "descriptors": [
      {
        "value": "Listado",
        "lang": "lg-spa",
        "type": "term"
      },
      {
        "value": "Llistat",
        "lang": "lg-cat",
        "type": "term"
      },
      {
        "value": "List",
        "lang": "lg-eng",
        "type": "term"
      }
    ]
  }
]');
ontology::import($data);

