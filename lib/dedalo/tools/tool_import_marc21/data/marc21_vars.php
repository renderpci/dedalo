<?php
/**
* MARC21_VARS . Dédalo standar vars
* Define correspondences from marc21 file vars to Dédalo tipos
	$marc21_vars[] = array("Field" 	=> "110",
							"Indicator" => "",
							"Subfield" 	=> "",
							"dd_component"=>"rsc350",
							);
*/

$marc21_vars = array();


//Record (Biblio) / Número de control (DEBE SER EL PRIMERO !!!)
	$marc21_vars[] = array( "Field" 	=> "907",
							"Subfield" 	=> "a",
							"dd_component"=>"rsc137",
							);

// NEXR 	

//Dipósit Legal
	$marc21_vars[] = array( "Field" 	=> "017",
							"dd_component"=>"rsc250"
							);
//ISBN
	$marc21_vars[] = array("Field" 			=> "020",
							"dd_component"  =>"rsc147",
							"dd_action" 	=>'{"rsc249":[{"section_id":"1","section_tipo":"dd292"}]}',
							"skip_on_empty" => true
							);
//ISSN
	$marc21_vars[] = array("Field" 		   => "022",
							"dd_component" =>"rsc147",
							"dd_action"    =>'{"rsc249":[{"section_id":"2","section_tipo":"dd292"}]}',
							"skip_on_empty" => true
							);
//Nom personal
	$marc21_vars[] = array("Field" 	=> "100",
							"dd_component"=>"rsc349",
							);
//Nom d'entitat
	$marc21_vars[] = array( "Field" 	  => "110",
							"dd_component"=>"rsc350",
							);
//Nom de congrés
	$marc21_vars[] = array( "Field" 	  => "111",
							"dd_component"=>"rsc351",
							);
//Títol uniforme
	$marc21_vars[] = array( "Field" 	  => "130",
							"dd_component"=>"rsc225",
							);	
//Menció de títol
	$marc21_vars[] = array("Field" 		  => "245",
							"dd_component"=>"rsc140"
							);
//Menció de edició
	$marc21_vars[] = array("Field" 		  => "250",
							"dd_component"=>"rsc141"
							);
//Publicació distribució, peu de imprenta
	$marc21_vars[] = array("Field"			=> "260",
							"Subfield"		=> "a",
							"dd_component"	=>"rsc144"
							);
//Publicació editor
	$marc21_vars[] = array("Field"			=> "260",
							"Subfield"		=> "b",
							"dd_component"	=>"rsc219"
							);
//Publicació fecha
	$marc21_vars[] = array("Field"					=> "260",
							"Subfield"				=> "c",
							"dd_component"			=>"rsc224",
							"partial_left_content" 	=> 4,
							"date_format" 			=> "year"
							);

//Publicació distribució, peu de imprenta
	$marc21_vars[] = array("Field"			=> "264",
							"Subfield"		=> "a",
							"dd_component"	=>"rsc144"
							);
//Publicació editor
	$marc21_vars[] = array("Field"			=> "264",
							"Subfield"		=> "b",
							"dd_component"	=>"rsc219"
							);
//Publicació fecha
	$marc21_vars[] = array("Field"					=> "264",
							"Subfield"				=> "c",
							"dd_component"			=>"rsc224",
							"partial_left_content"	=> 4,
							"date_format"			=> "year"
							);	

//Descripció física
	$marc21_vars[] = array("Field" 		  => "300",
							"dd_component"=>"rsc223",
							);

//Nota general
	$marc21_vars[] = array( "Field" 		=> "500",
							"dd_component"  =>"rsc145",
							);

//Nota de bibliografia
	$marc21_vars[] = array( "Field" 		=> "504",
							"dd_component" 	=>"rsc344",
							);

//Nota de contingut formatada
	$marc21_vars[] = array( "Field" 		=> "505",
							"dd_component" 	=>"rsc345",
							);

//Nota de crèdits de creació/producció
	$marc21_vars[] = array("Field" 			=> "508",
							"dd_component" 	=>"rsc346",
							);

//Nota de participants o intèrprets
	$marc21_vars[] = array("Field" 			=> "511",
							"dd_component" 	=>"rsc347",
							);

//Nota de data/hora i lloc d'un esdeveniment
	$marc21_vars[] = array( "Field" 		=> "518",
							"dd_component" 	=>"rsc348",
							);

//Resum, etc.
	$marc21_vars[] = array( "Field" 		=> "520",
							"dd_component" 	=>"rsc221",
							);

//Entrada secundària - Nom personal
	$marc21_vars[] = array("Field" 			=> "700",
							"dd_component" 	=>"rsc352",
							);

//Entrada secundària - Nom d'entitat
	$marc21_vars[] = array("Field" 	=> "710",
							"dd_component"=>"rsc353",
							);

//Entrada secundària - Nom de congrés 
	$marc21_vars[] = array( "Field" 	=> "711",
							"dd_component"=>"rsc354",
							);

//Entrada secundària - Títol analític/relacionat no controlat
	$marc21_vars[] = array( "Field" 	=> "740",
							"dd_component"=>"rsc355",
							);

//Entrada secundària de col·lecció - Títol uniforme
	$marc21_vars[] = array("Field" 	=> "830",
						"dd_component"=>"rsc356",
						);

//Localització i accés electrònics
	$marc21_vars[] = array( "Field" 		=> "856",
							"dd_component" 	=>"rsc217",
							);
//MEMORIAL


//Topogràfic
	$marc21_vars[] = array( "Field" 		=> "945",
							"Subfield" 		=> "a",
							"dd_component" 	=>"rsc359",
							"marc21_conditional" => '{"Subfield":"j","value":"193"}'
							);

//Volum
	$marc21_vars[] = array( "Field" 		=> "945",
							"Subfield" 		=> "c",
							"dd_component" 	=>"rsc360",
							"marc21_conditional" => '{"Subfield":"j","value":"193"}'
							);
//Codi  de barres
	$marc21_vars[] = array("Field" 			=> "945",
							"Subfield" 		=> "i",
							"dd_component"  =>"rsc361",
							"marc21_conditional" => '{"Subfield":"j","value":"193"}'
							);

//Missatge de text 
	$marc21_vars[] = array( "Field" 		=> "945",
							"Subfield" 		=> "m",
							"dd_component" 	=>"rsc362",
							"marc21_conditional" => '{"Subfield":"j","value":"193"}'
							);

//Record (Item) /Número de registre d'exemplar
	$marc21_vars[] = array("Field" 			=> "945",
							"Subfield" 		=> "y",
							"dd_component" 	=>"rsc222",
							"marc21_conditional" => '{"Subfield":"j","value":"193"}'
							);


//Tipus de material
	$marc21_vars[] = array("Field" 			=> "998",
							"Subfield" 		=> "d",
							"dd_component" 	=>"rsc138",
							"dd_data_map" 	=> '{
								"a":[{"section_id":"1","section_tipo":"dd810"}],
								"b":[{"section_id":"2","section_tipo":"dd810"}],
								"g":[{"section_id":"20","section_tipo":"dd810"}],
								"i":[{"section_id":"21","section_tipo":"dd810"}],
								"j":[{"section_id":"22","section_tipo":"dd810"}],
								"l":[{"section_id":"11","section_tipo":"dd810"}],
								"m":[{"section_id":"23","section_tipo":"dd810"}],
								"n":[{"section_id":"4","section_tipo":"dd810"}],
								"r":[{"section_id":"24","section_tipo":"dd810"}],
								"t":[{"section_id":"19","section_tipo":"dd810"}],
								"z":[{"section_id":"5","section_tipo":"dd810"}]
								}'
							);		

//Idioma
	$marc21_vars[] = array("Field" 	=> "998",
							"Subfield" 	=> "f",
							"dd_component"=>"rsc251",
							"dd_data_map"=> '{
								"cat":[{"section_id":"3032","section_tipo":"lg1"}],
								"spa":[{"section_id":"17344","section_tipo":"lg1"}],
								"fre":[{"section_id":"5450","section_tipo":"lg1"}],
								"baq":[{"section_id":"5223","section_tipo":"lg1"}],
								"bos":[{"section_id":"2355","section_tipo":"lg1"}],
								"chi":[{"section_id":"21449","section_tipo":"lg1"}],
								"eng":[{"section_id":"5101","section_tipo":"lg1"}],
								"ger":[{"section_id":"4253","section_tipo":"lg1"}],
								"glg":[{"section_id":"5960","section_tipo":"lg1"}],
								"hun":[{"section_id":"7054","section_tipo":"lg1"}],
								"ita":[{"section_id":"7466","section_tipo":"lg1"}],
								"mul":[],
								"por":[{"section_id":"14895","section_tipo":"lg1"}],
								"swe":[{"section_id":"17921","section_tipo":"lg1"}],
								"und":[]
							}'
						);
?>