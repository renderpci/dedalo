<?php
/*

	SET_UP_VARS
	Define all field correspondences between databases of FileMaker -> Dédalo

*/


		#
		# TABLES DEFINE
		#
			# Location Tesauro
			/*$Location = new stdClass();	
				$Location->FM_database 	= 'Tesauros';
				$Location->FM_table 	= 'Location';
				$Location->DD_table 	= 'jer_xa';
				$Location->DD_tld 		= 'xa';
				$Location->FM_layout 	= 'web-Location';
				$Location->fields = array(
										'ID' 		=>'id',
										'IDparent'	=>'parent',
										'order'		=>'norder',
										'web'		=>'visible',
										'VALtitle'	=>'dato',
										'VALresume'	=>'dato',
										'VALbody'	=>'dato',
										'CAStitle'	=>'dato',
										'CASresume'	=>'dato',
										'CASbody'	=>'dato',
										'ENtitle'	=>'dato',
										'ENresume'	=>'dato',
										'ENbody'	=>'dato',
										'FRtitle'	=>'dato',
										'FRresume'	=>'dato',
										'FRbody'	=>'dato',
									);
			*/

		# TESAUROS ******************************************************************************************

			#
			# GROUP TABLE
			$Group = new stdClass();	
				$Group->FM_database 	= 'Tesauros';
				$Group->FM_table 		= 'Group';
				$Group->FM_layout 		= 'web-Group';
				$Group->filter 			= array('mupreva134' => array('1' => 2 ));
				$Group->fields 			= new stdClass();
				$Group->fields->section_tipo='mupreva126';
				$Group->fields->section_id 	='ID';
				$Group->fields->mupreva304 	='web';
				$Group->fields->mupreva130 	='notes';
				$Group->fields->mupreva128 	=array('lg-vlca' => 'VALtitle',
													'lg-spa' => 'CAStitle');
				$Group->fields->mupreva129 	=array('lg-vlca' => 'VALbody',
													'lg-spa' => 'CASbody');

			#
			# OBJECT TABLE
			$Object = new stdClass();	
				$Object->FM_database 	= 'Tesauros';
				$Object->FM_table 		= 'Object';
				$Object->FM_layout 		= 'web-Object';
				$Object->filter 		= array('mupreva314' => array('1' => 2 ));
				$Object->fields 		= new stdClass();
					$Object->fields->section_tipo ='mupreva305';
					$Object->fields->section_id 	='ID';
					$Object->fields->mupreva307 	='web';
					$Object->fields->mupreva310 	='notes';					
					$Object->fields->mupreva308 	=array( 'lg-vlca' => 'VALtitle',
															'lg-spa' => 'CAStitle');
					$Object->fields->mupreva309 	=array( 'lg-vlca' => 'VALbody',
															'lg-spa' => 'CASbody');

			#
			# PERIOD TABLE
			$Period = new stdClass();	
				$Period->FM_database 	= 'Tesauros';
				$Period->FM_table 		= 'Period';
				$Period->FM_layout 		= 'web-Period';
				$Period->filter 		= array('mupreva328' => array('1' => 2 ));
				$Period->fields 		= new stdClass();
					$Period->fields->section_tipo 	='mupreva315';
					$Period->fields->section_id 	='ID';
					$Period->fields->mupreva317 	='web';
					$Period->fields->mupreva324 	='notes';
					$Period->fields->mupreva318 	='dateIni';
					$Period->fields->mupreva319 	='dateEnd';
					$Period->fields->mupreva320 	='IDparent';						
					$Period->fields->mupreva322 	=array( 'lg-vlca' => 'VALtitle',
															'lg-spa' => 'CAStitle');
					$Period->fields->mupreva323 	=array( 'lg-vlca' => 'VALbody',
															'lg-spa' => 'CASbody');

			#
			# MATERIAL TABLE
			$Material = new stdClass();	
				$Material->FM_database 		= 'Tesauros';
				$Material->FM_table 		= 'Material';
				$Material->FM_layout 		= 'web-Material';
				$Material->filter 			= array('mupreva336' => array('1' => 2 ));
				$Material->fields 			= new stdClass();
					$Material->fields->section_tipo ='mupreva329';
					$Material->fields->section_id 	='ID';
					$Material->fields->mupreva331 	='web';
					$Material->fields->mupreva335 	='notes';
					$Material->fields->mupreva332 	='IDparent';						
					$Material->fields->mupreva333 	=array( 'lg-vlca' => 'VALtitle',
															'lg-spa' => 'CAStitle');
					$Material->fields->mupreva334 	=array( 'lg-vlca' => 'VALbody',
															'lg-spa' => 'CASbody');

			#
			# TECHNIC TABLE
			$Technic = new stdClass();	
				$Technic->FM_database 		= 'Tesauros';
				$Technic->FM_table 			= 'Technic';
				$Technic->FM_layout 		= 'web-Technic';
				$Technic->filter 			= array('mupreva143' => array('1' => 2 ));
				$Technic->fields 			= new stdClass();
					$Technic->fields->section_tipo 	='mupreva135';
					$Technic->fields->section_id 	='ID';
					$Technic->fields->mupreva340 	='web';
					$Technic->fields->mupreva139 	='notes';					
					$Technic->fields->mupreva137 	=array( 'lg-vlca' => 'VALtitle',
															'lg-spa' => 'CAStitle');
					$Technic->fields->mupreva138 	=array( 'lg-vlca' => 'VALbody',
															'lg-spa' => 'CASbody');

			#
			# CONSERVATION TABLE
			$Conservation = new stdClass();	
				$Conservation->FM_database 	= 'Tesauros';
				$Conservation->FM_table 	= 'Conservation';
				$Conservation->FM_layout 	= 'web-Conservation';
				$Conservation->filter 		= array('mupreva287' => array('1' => 2 ));
				$Conservation->fields 		= new stdClass();
					$Conservation->fields->section_tipo ='mupreva144';
					$Conservation->fields->section_id 	='ID';
					#$Conservation->fields->mupreva340 	='web';
					$Conservation->fields->mupreva285 	=array( 'lg-vlca' => 'VALtitle',
																'lg-spa' => 'CAStitle');
					$Conservation->fields->mupreva286 	=array( 'lg-vlca' => 'VALbody',
																'lg-spa' => 'CASbody');

			#
			# FINDTYPE TABLE
			$FindType = new stdClass();	
				$FindType->FM_database 		= 'Tesauros';
				$FindType->FM_table 		= 'FindType';
				$FindType->FM_layout 		= 'web-FindType';
				$FindType->filter 			= array('mupreva345' => array('1' => 2 ));
				$FindType->fields 			= new stdClass();
					$FindType->fields->section_tipo ='mupreva341';
					$FindType->fields->section_id 	='ID';
					#$FindType->fields->mupreva340 	='web';					
					$FindType->fields->mupreva343 	=array( 'lg-vlca' => 'VALtitle',
															'lg-spa' => 'CAStitle');
					$FindType->fields->mupreva344 	=array( 'lg-vlca' => 'VALbody',
															'lg-spa' => 'CASbody');

			#
			# ACQUISITION TABLE
			$Acquisition = new stdClass();	
				$Acquisition->FM_database 	= 'Tesauros';
				$Acquisition->FM_table 		= 'Acquisition';
				$Acquisition->FM_layout 	= 'web-Acquisition';
				$Acquisition->filter 		= array('mupreva353' => array('1' => 2 ));
				$Acquisition->fields 		= new stdClass();
					$Acquisition->fields->section_tipo ='mupreva349';
					$Acquisition->fields->section_id 	='ID';
					#$Acquisition->fields->mupreva340 	='web';
					$Acquisition->fields->mupreva351 	=array('lg-vlca' => 'VALtitle',
														'lg-spa' => 'CAStitle');
					$Acquisition->fields->mupreva352 	=array('lg-vlca' => 'VALbody',
														'lg-spa' => 'CASbody');


			#
			# PRODUCTIONTYPE TABLE			
			$ProductionType = new stdClass();	
				$ProductionType->FM_database	= 'Tesauros';
				$ProductionType->FM_table 		= 'ProductionType';
				$ProductionType->FM_layout 		= 'web-ProductionType';
				$ProductionType->filter 		= array('mupreva364' => array('1' => 2 ));
				$ProductionType->fields 		= new stdClass();
					$ProductionType->fields->section_tipo 	='mupreva357';
					$ProductionType->fields->section_id 	='ID';
					$ProductionType->fields->mupreva359 	='web';
					$ProductionType->fields->mupreva363 	='notes';
					$ProductionType->fields->mupreva360 	='IDparent';				
					$ProductionType->fields->mupreva361 	=array( 'lg-vlca' => 'VALtitle',
																	'lg-spa' => 'CAStitle');
					$ProductionType->fields->mupreva362 	=array( 'lg-vlca' => 'VALbody',
																	'lg-spa' => 'CASbody');
			
			#
			# PRODUCTIONPLACE TABLE
			$ProductionPlace = new stdClass();	
				$ProductionPlace->FM_database	= 'Tesauros';
				$ProductionPlace->FM_table 		= 'ProductionPlace';
				$ProductionPlace->FM_layout 	= 'web-ProductionPlace';
				$ProductionPlace->filter 		= array('mupreva376' => array('1' => 2 ));
				$ProductionPlace->fields 		= new stdClass();
					$ProductionPlace->fields->section_tipo  ='mupreva368';
					$ProductionPlace->fields->section_id 	='ID';
					$ProductionPlace->fields->mupreva370 	='web';
					$ProductionPlace->fields->mupreva375 	='notes';
					$ProductionPlace->fields->mupreva371 	='IDparentSite';
					$ProductionPlace->fields->mupreva372 	='IDparentPlace';
					$ProductionPlace->fields->mupreva373 	=array( 'lg-vlca' => 'VALtitle',
																	'lg-spa' => 'CAStitle');
					$ProductionPlace->fields->mupreva374 	=array( 'lg-vlca' => 'VALbody',
																	'lg-spa' => 'CASbody');

			#
			# PLACE TABLE
			$Place = new stdClass();	
				$Place->FM_database		= 'Tesauros';
				$Place->FM_table 		= 'Place';
				$Place->FM_layout 		= 'web-Place';
				$Place->filter 			= array('mupreva387' => array('1' => 2 ));
				$Place->fields 			= new stdClass();
					$Place->fields->section_tipo ='mupreva380';
					$Place->fields->section_id 	='ID';
					$Place->fields->mupreva382 	='web';
					$Place->fields->mupreva383 	='IDparent';
					$Place->fields->mupreva385 	='IDdisambiguation';					
					$Place->fields->mupreva384 	=array('lg-vlca' => 'VALtitle',
														'lg-spa' => 'CAStitle');
					$Place->fields->mupreva386 	='VALtitleNormal';


			#
			# PLACEDISAMBIGUATION TABLE
			$PlaceDisambiguation = new stdClass();	
				$PlaceDisambiguation->FM_database	= 'Tesauros';
				$PlaceDisambiguation->FM_table 		= 'DisambiguationRel';
				$PlaceDisambiguation->FM_layout 	= 'web-PlaceDisambiguation';
				$PlaceDisambiguation->filter 		= array('mupreva394' => array('1' => 2 ));
				$PlaceDisambiguation->fields 		= new stdClass();
					$PlaceDisambiguation->fields->section_tipo ='mupreva391';
					$PlaceDisambiguation->fields->section_id 	='ID';
					#$PlaceDisambiguation->fields->mupreva382 	='web';
					#$PlaceDisambiguation->fields->mupreva383 	='IDparent';		
					$PlaceDisambiguation->fields->mupreva393 	=array( 'lg-vlca' => 'VALtitle',
																		'lg-spa' => 'CAStitle');

			#
			# AUTHORITY TABLE
			$Authority = new stdClass();	
				$Authority->FM_database		= 'Tesauros';
				$Authority->FM_table 		= 'Authority';
				$Authority->FM_layout 		= 'web-Authority';
				$Authority->filter 			= array('mupreva404' => array('1' => 2 ));
				$Authority->fields 			= new stdClass();
					$Authority->fields->section_tipo='mupreva398';
					$Authority->fields->section_id 	='ID';
					$Authority->fields->mupreva400 	='web';
					$Authority->fields->mupreva401 	='IDparent';					
					$Authority->fields->mupreva402 	=array('lg-vlca' => 'VALtitle',
														'lg-spa' => 'CAStitle');
					$Authority->fields->mupreva403 	=array('lg-vlca' => 'VALbody',
														'lg-spa' => 'CASbody');
					$Authority->fields->mupreva2188 ='NOMISMAtitle';	

			#
			# CERTAINTY TABLE
			$Certainty = new stdClass();	
				$Certainty->FM_database		= 'Tesauros';
				$Certainty->FM_table 		= 'Certainty';
				$Certainty->FM_layout 		= 'web-Certainty';
				$Certainty->filter 			= array('mupreva411' => array('1' => 2 ));
				$Certainty->fields 			= new stdClass();
					$Certainty->fields->section_tipo ='mupreva408';
					$Certainty->fields->section_id 	='ID';
					$Certainty->fields->mupreva410 	=array('lg-vlca' => 'VALtitle',
														'lg-spa' => 'CAStitle');
					$Certainty->fields->mupreva2189 ='ENtitle';	

			#
			# AUTHENTICITY TABLE
			$Authenticity = new stdClass();	
				$Authenticity->FM_database		= 'Tesauros';
				$Authenticity->FM_table 		= 'Authenticity';
				$Authenticity->FM_layout 		= 'web-Authenticity';
				$Authenticity->filter 			= array('mupreva421' => array('1' => 2 ));
				$Authenticity->fields 			= new stdClass();
					$Authenticity->fields->section_tipo ='mupreva415';
					$Authenticity->fields->section_id 	='ID';
					$Authenticity->fields->mupreva419 	=array('lg-vlca' => 'VALtitle',
														'lg-spa' => 'CAStitle');
					$Authenticity->fields->mupreva420 	='alias';


			#
			# LANGUAGE TABLE
			$Language = new stdClass();	
				$Language->FM_database		= 'Tesauros';
				$Language->FM_table 		= 'Language';
				$Language->FM_layout 		= 'web-Language';
				$Language->filter 			= array('mupreva426' => array('1' => 2 ));
				$Language->fields 			= new stdClass();
				$Language->fields->section_tipo ='mupreva417';
				$Language->fields->section_id 	='ID';				
				$Language->fields->mupreva425 	=array('lg-vlca' => 'VALtitle',
													'lg-spa' => 'CAStitle',
													'lg-eng' => 'ENtitle',
													'lg-fra' => 'FRtitle');

			#
			# CATEGORY TABLE
			$Category = new stdClass();	
				$Category->FM_database		= 'Tesauros';
				$Category->FM_table 		= 'Category';
				$Category->FM_layout 		= 'web-Category';
				$Category->filter 			= array('mupreva436' => array('1' => 2 ));
				$Category->fields 			= new stdClass();
					$Category->fields->section_tipo ='mupreva432';
					$Category->fields->section_id 	='ID';
					$Category->fields->mupreva434 	='IDparent';					
					$Category->fields->mupreva435 	=array('lg-vlca' => 'VALtitle',
															'lg-spa' => 'CAStitle',
															'lg-eng' => 'ENtitle',
															'lg-fra' => 'FRtitle');

			#
			# BIODATA TABLE
			$Biodata = new stdClass();	
				$Biodata->FM_database	= 'Tesauros';
				$Biodata->FM_table 		= 'Biodata';
				$Biodata->FM_layout 	= 'web-Biodata';
				$Biodata->filter 		= array('mupreva447' => array('1' => 2 ));
				$Biodata->fields 		= new stdClass();
					$Biodata->fields->section_tipo  ='mupreva440';
					$Biodata->fields->section_id 	='ID';
					$Biodata->fields->mupreva442 	='web';
					$Biodata->fields->mupreva446 	='notes';
					$Biodata->fields->mupreva443 	='IDparent';					
					$Biodata->fields->mupreva444 	=array( 'lg-vlca' => 'VALtitle',
															'lg-spa' => 'CAStitle');
					$Biodata->fields->mupreva445 	=array( 'lg-vlca' => 'VALbody',
															'lg-spa' => 'CASbody');

			#
			# THEMES TABLE
			$Themes = new stdClass();	
				$Themes->FM_database	= 'Tesauros';
				$Themes->FM_table 		= 'Themes';
				$Themes->FM_layout 		= 'web-Themes';
				$Themes->filter 		= array('mupreva458' => array('1' => 2 ));
				$Themes->fields 		= new stdClass();
					$Themes->fields->section_tipo 	='mupreva451';
					$Themes->fields->section_id 	='ID';
					$Themes->fields->mupreva453 	='web';
					$Themes->fields->mupreva457 	='notes';
					$Themes->fields->mupreva454 	='IDparent';					
					$Themes->fields->mupreva455 	=array( 'lg-vlca' => 'VALtitle',
															'lg-spa' => 'CAStitle');
					$Themes->fields->mupreva456 	=array( 'lg-vlca' => 'VALbody',
															'lg-spa' => 'CASbody');

			#
			# CLASS TABLE
			$Class = new stdClass();	
				$Class->FM_database		= 'Tesauros';
				$Class->FM_table 		= 'Class';
				$Class->FM_layout 		= 'web-Class';
				$Class->filter 			= array('mupreva468' => array('1' => 2 ));
				$Class->fields 			= new stdClass();
					$Class->fields->section_tipo='mupreva462';
					$Class->fields->section_id 	='ID';
					$Class->fields->mupreva464 	='web';
					$Class->fields->mupreva467 	='notes';
					#$Class->fields->mupreva454 	='IDparent';					
					$Class->fields->mupreva465 	=array('lg-vlca' => 'VALtitle',
														'lg-spa' => 'CAStitle');
					$Class->fields->mupreva466 	=array('lg-vlca' => 'VALbody',
														'lg-spa' => 'CASbody');


		# DIGITAL ******************************************************************************************

			# DIGITAL GALERIA TABLE
			$DigitalGaleria = new stdClass();	
				$DigitalGaleria->FM_database 	= 'Digital';
				$DigitalGaleria->FM_table 		= 'Digital';
				$DigitalGaleria->FM_layout 		= 'web-Digital';// 'web-Digital';
				$DigitalGaleria->filter 		= array('mupreva518' => array('1' => 2 ));
				$DigitalGaleria->fields 		= new stdClass();
					$DigitalGaleria->fields->section_tipo ='mupreva473';
					$DigitalGaleria->fields->section_id 	='ID';
					$DigitalGaleria->fields->mupreva731 	='web';
					$DigitalGaleria->fields->mupreva475 	='datePhoto';
					$DigitalGaleria->fields->mupreva476 	=array( 'lg-vlca' => 'VALtitle',
																'lg-spa' => 'CAStitle');
					$DigitalGaleria->fields->mupreva477 	=array( 'lg-vlca' => 'VALbody',
																'lg-spa' => 'CASbody');
					$DigitalGaleria->fields->mupreva478 	=array( 'lg-vlca' => 'VALfootprint',
																'lg-spa' => 'CASfootprint');
					$DigitalGaleria->fields->mupreva479 	='notes';
					$DigitalGaleria->fields->mupreva491 	='IDauthorPhoto';
					$DigitalGaleria->fields->mupreva489 	='IDcategory';

					$DigitalGaleria->fields->mupreva484 	='IDsite';
					$DigitalGaleria->fields->mupreva490 	='IDcontext';
					$DigitalGaleria->fields->mupreva485 	='IDconjunt';
					$DigitalGaleria->fields->mupreva486 	='IDexposicio';
					$DigitalGaleria->fields->mupreva487 	='IDactivitat';
					$DigitalGaleria->fields->mupreva488 	='IDespai';
					$DigitalGaleria->fields->mupreva2175 	='IDexcavacio';


				$DigitalGaleria->portalize = new stdClass();
					$DigitalGaleria->portalize->IDsite = new stdClass();
						$DigitalGaleria->portalize->IDsite->section_tipo 		= 'mupreva500';
						$DigitalGaleria->portalize->IDsite->portal_tipo  		= 'mupreva517';
					$DigitalGaleria->portalize->IDcontext = new stdClass();
						$DigitalGaleria->portalize->IDcontext->section_tipo 	= 'mupreva530';
						$DigitalGaleria->portalize->IDcontext->portal_tipo  	= 'mupreva550';
					$DigitalGaleria->portalize->IDconjunt = new stdClass();
						$DigitalGaleria->portalize->IDconjunt->section_tipo 	= 'mupreva494';
						$DigitalGaleria->portalize->IDconjunt->portal_tipo  	= 'mupreva598';
					$DigitalGaleria->portalize->IDexposicio = new stdClass();
						$DigitalGaleria->portalize->IDexposicio->section_tipo 	= 'mupreva86';
						$DigitalGaleria->portalize->IDexposicio->portal_tipo  	= 'mupreva567';
					$DigitalGaleria->portalize->IDactivitat = new stdClass();
						$DigitalGaleria->portalize->IDactivitat->section_tipo 	= 'mupreva70';
						$DigitalGaleria->portalize->IDactivitat->portal_tipo  	= 'mupreva604';
					$DigitalGaleria->portalize->IDespai = new stdClass();
						$DigitalGaleria->portalize->IDespai->section_tipo 		= 'mupreva290';
						$DigitalGaleria->portalize->IDespai->portal_tipo		= 'mupreva606';
					$DigitalGaleria->portalize->IDexcavacio = new stdClass();
						$DigitalGaleria->portalize->IDexcavacio->section_tipo 	= 'mupreva1410';
						$DigitalGaleria->portalize->IDexcavacio->portal_tipo  	= 'mupreva1426';


			# DIGITAL ITEMS TABLE
			$DigitalItems = new stdClass();	
				$DigitalItems->FM_database 		= 'Digital';
				$DigitalItems->FM_table 		= 'DigitalItems';
				$DigitalItems->FM_layout 		= 'web-DigitalItems';// 'web-DigitalItems';
				$DigitalItems->filter 		= array('mupreva210' => array('1' => 2 ));
				$DigitalItems->fields 		= new stdClass();
					$DigitalItems->fields->section_tipo ='mupreva268';
					$DigitalItems->fields->section_id 	=array( 'search' => 'mupreva203');
					$DigitalItems->fields->mupreva203 	='ID';
					$DigitalItems->fields->mupreva202 	='web';
					$DigitalItems->fields->mupreva219 	='datePhoto';
					$DigitalItems->fields->mupreva205 	=array( 'lg-vlca' => 'VALtitle',
																'lg-spa' => 'CAStitle');
					$DigitalItems->fields->mupreva217 	=array( 'lg-vlca' => 'VALbody',
																'lg-spa' => 'CASbody');
					$DigitalItems->fields->mupreva216 	=array( 'lg-vlca' => 'VALfootprint',
																'lg-spa' => 'CASfootprint');
					#$DigitalItems->fields->mupreva479 	='notes';
					$DigitalItems->fields->mupreva220 	='IDphotographer';
					$DigitalItems->fields->mupreva1327 	='IDcategory';

					$DigitalItems->fields->mupreva1251 	='IDsite';
					$DigitalItems->fields->mupreva1252 	='IDcontext';
					$DigitalItems->fields->mupreva1253 	='IDconjunt';
					$DigitalItems->fields->mupreva1254 	='IDexposicio';
					$DigitalItems->fields->mupreva1255 	='IDactivitat';
					$DigitalItems->fields->mupreva1256 	='IDespai';
					$DigitalItems->fields->mupreva1503 	='IDexcavacio';


				$DigitalItems->portalize = new stdClass();
					$DigitalItems->portalize->IDsite = new stdClass();
						$DigitalItems->portalize->IDsite->section_tipo 		= 'mupreva500';
						$DigitalItems->portalize->IDsite->portal_tipo  		= 'mupreva514';
					$DigitalItems->portalize->IDcontext = new stdClass();
						$DigitalItems->portalize->IDcontext->section_tipo 	= 'mupreva530';
						$DigitalItems->portalize->IDcontext->portal_tipo  	= 'mupreva546';
					$DigitalItems->portalize->IDconjunt = new stdClass();
						$DigitalItems->portalize->IDconjunt->section_tipo 	= 'mupreva494';
						$DigitalItems->portalize->IDconjunt->portal_tipo  	= 'mupreva570';
					/*$DigitalItems->portalize->IDexposicio = new stdClass();
						$DigitalItems->portalize->IDexposicio->section_tipo = 'mupreva86';
						$DigitalItems->portalize->IDexposicio->portal_tipo  = 'mupreva567';
					$DigitalItems->portalize->IDactivitat = new stdClass();
						$DigitalItems->portalize->IDactivitat->section_tipo = 'mupreva70';
						$DigitalItems->portalize->IDactivitat->portal_tipo  = 'mupreva604';*/
					$DigitalItems->portalize->IDespai = new stdClass();
						$DigitalItems->portalize->IDespai->section_tipo 	= 'mupreva290';
						$DigitalItems->portalize->IDespai->portal_tipo  	= 'mupreva900';
					$DigitalItems->portalize->IDexcavacio = new stdClass();
						$DigitalItems->portalize->IDexcavacio->section_tipo = 'mupreva1410';
						$DigitalItems->portalize->IDexcavacio->portal_tipo  = 'mupreva1418';


		# DIAPOSITIVAS ******************************************************************************************

			# DIAPOSITIVAS GALERIA TABLE
			$DiapositivasGaleria = new stdClass();	
				$DiapositivasGaleria->FM_database 	= 'Diapositives';
				$DiapositivasGaleria->FM_table 		= 'Diapositives';
				$DiapositivasGaleria->FM_layout 	= 'web-Diapositives';// 'web-Diapositives';
				$DiapositivasGaleria->filter 		= array('mupreva717' => array('1' => 2 ));
				$DiapositivasGaleria->fields 		= new stdClass();
					$DiapositivasGaleria->fields->section_tipo ='mupreva710';
					$DiapositivasGaleria->fields->section_id 	='ID';
					$DiapositivasGaleria->fields->mupreva733 	='web';
					$DiapositivasGaleria->fields->mupreva713 	='datePhoto';
					$DiapositivasGaleria->fields->mupreva714 	=array( 'lg-vlca' => 'VALtitle',
																'lg-spa' => 'CAStitle');
					$DiapositivasGaleria->fields->mupreva715 	=array( 'lg-vlca' => 'VALbody',
																'lg-spa' => 'CASbody');
					$DiapositivasGaleria->fields->mupreva716 	=array( 'lg-vlca' => 'VALfootprint',
																'lg-spa' => 'CASfootprint');
					#$DiapositivasGaleria->fields->mupreva479 	='notes';
					$DiapositivasGaleria->fields->mupreva1182 	='IDauthorPhoto';
					$DiapositivasGaleria->fields->mupreva720 	='IDcategory';

					$DiapositivasGaleria->fields->mupreva721 	='IDsite';
					$DiapositivasGaleria->fields->mupreva722 	='IDcontext';
					$DiapositivasGaleria->fields->mupreva723 	='IDconjunt';
					$DiapositivasGaleria->fields->mupreva725 	='IDexposicio';
					$DiapositivasGaleria->fields->mupreva726 	='IDactivitat';
					$DiapositivasGaleria->fields->mupreva724 	='IDespai';
					$DiapositivasGaleria->fields->mupreva2047 	='IDexcavacio';


				$DiapositivasGaleria->portalize = new stdClass();
					$DiapositivasGaleria->portalize->IDsite = new stdClass();
						$DiapositivasGaleria->portalize->IDsite->section_tipo 		= 'mupreva500';
						$DiapositivasGaleria->portalize->IDsite->portal_tipo  		= 'mupreva737';
					$DiapositivasGaleria->portalize->IDcontext = new stdClass();
						$DiapositivasGaleria->portalize->IDcontext->section_tipo 	= 'mupreva530';
						$DiapositivasGaleria->portalize->IDcontext->portal_tipo  	= 'mupreva739';
					$DiapositivasGaleria->portalize->IDconjunt = new stdClass();
						$DiapositivasGaleria->portalize->IDconjunt->section_tipo 	= 'mupreva494';
						$DiapositivasGaleria->portalize->IDconjunt->portal_tipo  	= 'mupreva608';
					$DiapositivasGaleria->portalize->IDexposicio = new stdClass();
						$DiapositivasGaleria->portalize->IDexposicio->section_tipo 	= 'mupreva86';
						$DiapositivasGaleria->portalize->IDexposicio->portal_tipo  	= 'mupreva743';
					$DiapositivasGaleria->portalize->IDactivitat = new stdClass();
						$DiapositivasGaleria->portalize->IDactivitat->section_tipo 	= 'mupreva70';
						$DiapositivasGaleria->portalize->IDactivitat->portal_tipo	= 'mupreva741';
					$DiapositivasGaleria->portalize->IDespai = new stdClass();
						$DiapositivasGaleria->portalize->IDespai->section_tipo 		= 'mupreva290';
						$DiapositivasGaleria->portalize->IDespai->portal_tipo		= 'mupreva745';
					$DiapositivasGaleria->portalize->IDexcavacio = new stdClass();
						$DiapositivasGaleria->portalize->IDexcavacio->section_tipo 	= 'mupreva1410';
						$DiapositivasGaleria->portalize->IDexcavacio->portal_tipo  	= 'mupreva1428';



			# DIAPOSITIVAS ITEMS TABLE
			$DiapositivasItems = new stdClass();	
				$DiapositivasItems->FM_database 	= 'Diapositives';
				$DiapositivasItems->FM_table 		= 'DiapositivesItems';
				$DiapositivasItems->FM_layout 		= 'web-DiapositivesItems';// 'web-DiapositivesItems';
				$DiapositivasItems->filter 		= array('mupreva210' => array('1' => 2 ));
				$DiapositivasItems->fields 		= new stdClass();
					$DiapositivasItems->fields->section_tipo ='mupreva22';
					$DiapositivasItems->fields->section_id 	='ID';
					$DiapositivasItems->fields->mupreva202 	='web';
					$DiapositivasItems->fields->mupreva219 	='datePhoto';
					$DiapositivasItems->fields->mupreva205 	=array( 'lg-vlca' => 'VALtitle',
																'lg-spa' => 'CAStitle');
					$DiapositivasItems->fields->mupreva217 	=array( 'lg-vlca' => 'VALbody',
																'lg-spa' => 'CASbody');
					$DiapositivasItems->fields->mupreva216 	=array( 'lg-vlca' => 'VALfootprint',
																'lg-spa' => 'CASfootprint');
					$DiapositivasItems->fields->mupreva209 		='notes';
					$DiapositivasItems->fields->mupreva220 		='IDauthorPhoto';
					$DiapositivasItems->fields->mupreva1327 	='IDcategory';

					$DiapositivasItems->fields->mupreva1251 	='IDsite';
					$DiapositivasItems->fields->mupreva1252 	='IDcontext';
					$DiapositivasItems->fields->mupreva1253 	='IDconjunt';
					$DiapositivasItems->fields->mupreva1254 	='IDexposicio';
					$DiapositivasItems->fields->mupreva1255 	='IDactivitat';
					$DiapositivasItems->fields->mupreva1256 	='IDespai';
					#$DiapositivasItems->fields->mupreva1503 	='IDexcavacio';
					$DiapositivasItems->fields->mupreva2135 	='IDparent';


				$DiapositivasItems->portalize = new stdClass();
					$DiapositivasItems->portalize->IDsite = new stdClass();
						$DiapositivasItems->portalize->IDsite->section_tipo 		= 'mupreva500';
						$DiapositivasItems->portalize->IDsite->portal_tipo  		= 'mupreva1498';
					$DiapositivasItems->portalize->IDcontext = new stdClass();
						$DiapositivasItems->portalize->IDcontext->section_tipo 		= 'mupreva530';
						$DiapositivasItems->portalize->IDcontext->portal_tipo  		= 'mupreva1499';
					$DiapositivasItems->portalize->IDconjunt = new stdClass();
						$DiapositivasItems->portalize->IDconjunt->section_tipo 		= 'mupreva494';
						$DiapositivasItems->portalize->IDconjunt->portal_tipo  		= 'mupreva1500';
					/*$DiapositivasItems->portalize->IDexposicio = new stdClass();
						$DiapositivasItems->portalize->IDexposicio->section_tipo 	= 'mupreva86';
						$DiapositivasItems->portalize->IDexposicio->portal_tipo  	= 'mupreva567';
					$DiapositivasItems->portalize->IDactivitat = new stdClass();
						$DiapositivasItems->portalize->IDactivitat->section_tipo 	= 'mupreva70';
						$DiapositivasItems->portalize->IDactivitat->portal_tipo  	= 'mupreva604';*/
					$DiapositivasItems->portalize->IDespai = new stdClass();
						$DiapositivasItems->portalize->IDespai->section_tipo 	= 'mupreva290';
						$DiapositivasItems->portalize->IDespai->portal_tipo  	= 'mupreva1501';
					/*$DiapositivasItems->portalize->IDexcavacio = new stdClass();
						$DiapositivasItems->portalize->IDexcavacio->section_tipo 	= 'mupreva1410';
						$DiapositivasItems->portalize->IDexcavacio->portal_tipo  	= 'mupreva1502';*/
					$DiapositivasItems->portalize->IDparent = new stdClass();
						$DiapositivasItems->portalize->IDparent->section_tipo 		= 'mupreva710';
						$DiapositivasItems->portalize->IDparent->portal_tipo  		= 'mupreva729';


		# NEGATIVOS ******************************************************************************************

			# NEGATIVOS GALERIA TABLE
			$NegativosGaleria = new stdClass();	
				$NegativosGaleria->FM_database 	= 'Negatius';
				$NegativosGaleria->FM_table 	= 'Negatius';
				$NegativosGaleria->FM_layout 	= 'web-Negatius';// 'web-Negatius';
				$NegativosGaleria->filter 		= array('mupreva704' => array('1' => 2 ));
				$NegativosGaleria->fields 		= new stdClass();
					$NegativosGaleria->fields->section_tipo ='mupreva690';
					$NegativosGaleria->fields->section_id 	='ID';
					$NegativosGaleria->fields->mupreva732 	='web';
					$NegativosGaleria->fields->mupreva692 	='datePhoto';
					$NegativosGaleria->fields->mupreva696 	=array( 'lg-vlca' => 'VALtitle',
																'lg-spa' => 'CAStitle');
					$NegativosGaleria->fields->mupreva697 	=array( 'lg-vlca' => 'VALbody',
																'lg-spa' => 'CASbody');
					$NegativosGaleria->fields->mupreva698 	=array( 'lg-vlca' => 'VALfootprint',
																'lg-spa' => 'CASfootprint');
					#$NegativosGaleria->fields->mupreva479 	='notes';
					$NegativosGaleria->fields->mupreva1180 	='IDauthorPhoto';
					$NegativosGaleria->fields->mupreva719 	='IDcategory';

					$NegativosGaleria->fields->mupreva700 	='IDsite';
					$NegativosGaleria->fields->mupreva703 	='IDcontext';
					$NegativosGaleria->fields->mupreva701 	='IDconjunt';
					$NegativosGaleria->fields->mupreva1325 	='IDexposicio';
					$NegativosGaleria->fields->mupreva1326 	='IDactivitat';
					$NegativosGaleria->fields->mupreva702 	='IDespai';
					$NegativosGaleria->fields->mupreva2048 	='IDexcavacio';


				$NegativosGaleria->portalize = new stdClass();
					$NegativosGaleria->portalize->IDsite = new stdClass();
						$NegativosGaleria->portalize->IDsite->section_tipo 		= 'mupreva500';
						$NegativosGaleria->portalize->IDsite->portal_tipo  		= 'mupreva736';
					$NegativosGaleria->portalize->IDcontext = new stdClass();
						$NegativosGaleria->portalize->IDcontext->section_tipo 	= 'mupreva530';
						$NegativosGaleria->portalize->IDcontext->portal_tipo  	= 'mupreva738';
					$NegativosGaleria->portalize->IDconjunt = new stdClass();
						$NegativosGaleria->portalize->IDconjunt->section_tipo 	= 'mupreva494';
						$NegativosGaleria->portalize->IDconjunt->portal_tipo  	= 'mupreva607';
					$NegativosGaleria->portalize->IDexposicio = new stdClass();
						$NegativosGaleria->portalize->IDexposicio->section_tipo = 'mupreva86';
						$NegativosGaleria->portalize->IDexposicio->portal_tipo  = 'mupreva742';
					$NegativosGaleria->portalize->IDactivitat = new stdClass();
						$NegativosGaleria->portalize->IDactivitat->section_tipo = 'mupreva70';
						$NegativosGaleria->portalize->IDactivitat->portal_tipo  = 'mupreva740';
					$NegativosGaleria->portalize->IDespai = new stdClass();
						$NegativosGaleria->portalize->IDespai->section_tipo 	= 'mupreva290';
						$NegativosGaleria->portalize->IDespai->portal_tipo  	= 'mupreva744';
					$NegativosGaleria->portalize->IDexcavacio = new stdClass();
						$NegativosGaleria->portalize->IDexcavacio->section_tipo = 'mupreva1410';
						$NegativosGaleria->portalize->IDexcavacio->portal_tipo  = 'mupreva1427';



			# NEGATIVOS ITEMS TABLE
			$NegativosItems = new stdClass();	
				$NegativosItems->FM_database 	= 'Negatius';
				$NegativosItems->FM_table 		= 'NegatiusItems';
				$NegativosItems->FM_layout 		= 'web-NegatiusItems';// 'web-NegatiusItems';
				$NegativosItems->filter 		= array('mupreva210' => array('1' => 2 ));
				$NegativosItems->fields 		= new stdClass();
					$NegativosItems->fields->section_tipo ='mupreva20';
					$NegativosItems->fields->section_id 	='ID';
					$NegativosItems->fields->mupreva202 	='web';
					$NegativosItems->fields->mupreva219 	='datePhoto';
					$NegativosItems->fields->mupreva205 	=array( 'lg-vlca' => 'VALtitle',
																'lg-spa' => 'CAStitle');
					$NegativosItems->fields->mupreva217 	=array( 'lg-vlca' => 'VALbody',
																'lg-spa' => 'CASbody');
					$NegativosItems->fields->mupreva216 	=array( 'lg-vlca' => 'VALfootprint',
																'lg-spa' => 'CASfootprint');
					$NegativosItems->fields->mupreva209 	='notes';
					$NegativosItems->fields->mupreva220 	='IDphotographer';
					$NegativosItems->fields->mupreva1327 	='IDcategory';
					$NegativosItems->fields->mupreva694 	='Mides';
					$NegativosItems->fields->mupreva695 	='Ubicacio';

					$NegativosItems->fields->mupreva1251 	='IDsite';
					$NegativosItems->fields->mupreva1252 	='IDcontext';
					$NegativosItems->fields->mupreva1253 	='IDconjunt';
					$NegativosItems->fields->mupreva1254 	='IDexposicio';
					$NegativosItems->fields->mupreva1255 	='IDactivitat';
					$NegativosItems->fields->mupreva1256 	='IDespai';
					$NegativosItems->fields->mupreva1503 	='IDexcavacio';
					$NegativosItems->fields->mupreva2134 	='IDparent';


				$NegativosItems->portalize = new stdClass();
					$NegativosItems->portalize->IDsite = new stdClass();
						$NegativosItems->portalize->IDsite->section_tipo 		= 'mupreva500';
						$NegativosItems->portalize->IDsite->portal_tipo  		= 'mupreva515';
					$NegativosItems->portalize->IDcontext = new stdClass();
						$NegativosItems->portalize->IDcontext->section_tipo 	= 'mupreva530';
						$NegativosItems->portalize->IDcontext->portal_tipo  	= 'mupreva548';
					$NegativosItems->portalize->IDconjunt = new stdClass();
						$NegativosItems->portalize->IDconjunt->section_tipo 	= 'mupreva494';
						$NegativosItems->portalize->IDconjunt->portal_tipo  	= 'mupreva586';
					/*$NegativosItems->portalize->IDexposicio = new stdClass();
						$NegativosItems->portalize->IDexposicio->section_tipo 	= 'mupreva86';
						$NegativosItems->portalize->IDexposicio->portal_tipo  	= 'mupreva567';
					$NegativosItems->portalize->IDactivitat = new stdClass();
						$NegativosItems->portalize->IDactivitat->section_tipo 	= 'mupreva70';
						$NegativosItems->portalize->IDactivitat->portal_tipo  	= 'mupreva604';*/
					$NegativosItems->portalize->IDespai = new stdClass();
						$NegativosItems->portalize->IDespai->section_tipo 		= 'mupreva290';
						$NegativosItems->portalize->IDespai->portal_tipo  		= 'mupreva901';
					$NegativosItems->portalize->IDexcavacio = new stdClass();
						$NegativosItems->portalize->IDexcavacio->section_tipo 	= 'mupreva1410';
						$NegativosItems->portalize->IDexcavacio->portal_tipo  	= 'mupreva566';
					$NegativosItems->portalize->IDparent = new stdClass();
						$NegativosItems->portalize->IDparent->section_tipo 		= 'mupreva690';
						$NegativosItems->portalize->IDparent->portal_tipo  		= 'mupreva707';


		# PERSONAS ******************************************************************************************

							
			# PERSONES TABLE
			$PersonesTable = new stdClass();	
				$PersonesTable->FM_database 	= 'Persones';
				$PersonesTable->FM_table 		= 'Persones';
				$PersonesTable->FM_layout 		= 'web-Persones';#'web-Persones';
				$PersonesTable->filter 			= array('mupreva237' => array('1' => 2 ));
				$PersonesTable->fields 			= new stdClass();
				$PersonesTable->fields->section_tipo='mupreva162';
				$PersonesTable->fields->section_id 	='ID';
				$PersonesTable->fields->mupreva234 	='web';
				$PersonesTable->fields->mupreva232 	='name';
				$PersonesTable->fields->mupreva233 	='lastName';
				$PersonesTable->fields->mupreva1238	='IDgenre';
				$PersonesTable->fields->mupreva242 	='mailWork';
				$PersonesTable->fields->mupreva244 	='fax';
				$PersonesTable->fields->mupreva241 	='workPhone';
				$PersonesTable->fields->mupreva243 	='IDentitat';
				$PersonesTable->fields->mupreva277 	='IDjob';
				$PersonesTable->fields->mupreva2160	='order';
				$PersonesTable->fields->mupreva1240	=array('lg-vlca' => 'VALbody',
															'lg-spa' => 'CASbody',);
				$PersonesTable->fields->mupreva1241	='notes';

				$PersonesTable->relatedSets 		= new stdClass();
				$PersonesTable->relatedSets->mupreva235	=array('personesPortalRole'=>'IDrole');


						#
			# PERSONESROLE TABLE
			$PersonesRole = new stdClass();	
				$PersonesRole->FM_database		= 'Persones';
				$PersonesRole->FM_table 		= 'PersonesRole';
				$PersonesRole->FM_layout 		= 'web-PersonesRole';#'web-PersonesRole';
				$PersonesRole->filter 			= array('mupreva167' => array('1' => 2 ));
				$PersonesRole->fields 			= new stdClass();
					$PersonesRole->fields->section_tipo ='mupreva164';
					$PersonesRole->fields->section_id 	='ID';
					$PersonesRole->fields->mupreva166 	=array('lg-vlca' => 'VALtitle',
														'lg-spa' => 'CAStitle',
														'lg-eng' => 'ENtitle',
														'lg-fra' => 'FRtitle');

			# JOB TABLE
			$Job = new stdClass();	
				$Job->FM_database		= 'Persones';
				$Job->FM_table 			= 'Job';
				$Job->FM_layout 		= 'web-Job';#'web-Job';
				$Job->filter 			= array('mupreva281' => array('1' => 2 ));
				$Job->fields 			= new stdClass();
					$Job->fields->section_tipo ='mupreva278';
					$Job->fields->section_id   ='ID';
					$Job->fields->mupreva280   =array('lg-vlca' => 'VALtitle',
														'lg-spa' => 'CAStitle',
														'lg-eng' => 'ENtitle',
														'lg-fra' => 'FRtitle');


		# ENTIDADES ******************************************************************************************

			# ENTIDADES TABLE
			$EntitatsTable = new stdClass();	
				$EntitatsTable->FM_database 	= 'Entitats';
				$EntitatsTable->FM_table 		= 'Entitats';
				$EntitatsTable->FM_layout 		= 'web-Entitats';#'web-Entitats';
				$EntitatsTable->filter 			= array('mupreva768' => array('1' => 2 ));
				$EntitatsTable->fields 			= new stdClass();
				$EntitatsTable->fields->section_tipo='mupreva609';
				$EntitatsTable->fields->section_id 	='ID';
				$EntitatsTable->fields->mupreva1235	='web';
				$EntitatsTable->fields->mupreva238 	=array('lg-vlca' => 'VALname',
															'lg-spa' => 'CASname');
				$EntitatsTable->fields->mupreva498 	='IDparent';
				$EntitatsTable->fields->mupreva1221	=array('lg-vlca' => 'VALbody',
															'lg-spa' => 'CASbody');;
				$EntitatsTable->fields->mupreva1222	='notes';

				$EntitatsTable->fields->mupreva766 	='mailWork';
				$EntitatsTable->fields->mupreva1220 ='fax';
				$EntitatsTable->fields->mupreva764 	='phoneWork';
				$EntitatsTable->fields->mupreva767 	='webSite';
				$EntitatsTable->fields->mupreva752 	='adress';

				$EntitatsTable->relatedSets 		= new stdClass();
				$EntitatsTable->relatedSets->mupreva235 	=array('entitatsPortalRole'=>'IDrole');


			# ENTITATSROLE TABLE
			$EntitatsRole = new stdClass();	
				$EntitatsRole->FM_database		= 'Entitats';
				$EntitatsRole->FM_table 		= 'EntitatsRole';
				$EntitatsRole->FM_layout 		= 'web-EntitatsRole';#'web-EntitatsRole';
				$EntitatsRole->filter 			= array('mupreva623' => array('1' => 2 ));
				$EntitatsRole->fields 			= new stdClass();
					$EntitatsRole->fields->section_tipo ='mupreva620';
					$EntitatsRole->fields->section_id 	='ID';
					$EntitatsRole->fields->mupreva622 	=array('lg-vlca' => 'VALtitle',
														'lg-spa' => 'CAStitle',
														'lg-eng' => 'ENtitle',
														'lg-fra' => 'FRtitle');

		
		# PUBLICACIONES ******************************************************************************************

			$PublicacionsTable = new stdClass();	
				$PublicacionsTable->FM_database 	= 'Publicacions';
				$PublicacionsTable->FM_table 		= 'Publicacions';
				$PublicacionsTable->FM_layout 		= 'web-Publicacions';
				$PublicacionsTable->filter 			= array('mupreva192' => array('1' => 2 ));
				$PublicacionsTable->fields 			= new stdClass();
					$PublicacionsTable->fields->section_tipo ='mupreva153';
					$PublicacionsTable->fields->section_id 	='ID';
					$PublicacionsTable->fields->mupreva628 	='web';
					$PublicacionsTable->fields->mupreva629 	='IDparent';
					$PublicacionsTable->fields->mupreva188 	='IDlanguaje';
					$PublicacionsTable->fields->mupreva174 	='IDserie';
					$PublicacionsTable->fields->mupreva175 	='seriesNumber';	// Ejemplar
					$PublicacionsTable->fields->mupreva181 	='datePublication';
					$PublicacionsTable->fields->mupreva178 	=array('lg-vlca' => 'title',
																	'lg-spa' => 'title',
																	'lg-eng' => 'title',
																	'lg-fra' => 'title');
					$PublicacionsTable->fields->mupreva176 	='pagesBook';
					$PublicacionsTable->fields->mupreva190 	='pagesArticle';
					$PublicacionsTable->fields->mupreva180 	='editionNumber';
					$PublicacionsTable->fields->mupreva191 	='ISBNISSN';
					$PublicacionsTable->fields->mupreva189 	='notes';
					$PublicacionsTable->fields->mupreva182 	='editor';

					$PublicacionsTable->fields->mupreva636 	='IDsite';
					$PublicacionsTable->fields->mupreva637 	='IDconjunt';
					$PublicacionsTable->fields->mupreva638 	='IDexposicio';
					$PublicacionsTable->fields->mupreva639 	='IDactivitat';
					$PublicacionsTable->fields->mupreva640 	='IDespai';


				$PublicacionsTable->relatedSets = new stdClass();
					$PublicacionsTable->relatedSets->mupreva177 =array('publicacionsPortalAuthor'=>'IDauthor');
					$PublicacionsTable->relatedSets->mupreva634 =array('publicacionsPortalEditor'=>'IDentitat');

				$PublicacionsTable->portalize = new stdClass();
					$PublicacionsTable->portalize->IDsite = new stdClass();
						$PublicacionsTable->portalize->IDsite->section_tipo 	 = 'mupreva500';
						$PublicacionsTable->portalize->IDsite->portal_tipo  	 = 'mupreva512';
					$PublicacionsTable->portalize->IDconjunt = new stdClass();
						$PublicacionsTable->portalize->IDconjunt->section_tipo 	 = 'mupreva494';
						$PublicacionsTable->portalize->IDconjunt->portal_tipo  	 = 'mupreva587';
					$PublicacionsTable->portalize->IDexposicio = new stdClass();
						$PublicacionsTable->portalize->IDexposicio->section_tipo = 'mupreva86';
						$PublicacionsTable->portalize->IDexposicio->portal_tipo  = 'mupreva627';
					$PublicacionsTable->portalize->IDactivitat = new stdClass();
						$PublicacionsTable->portalize->IDactivitat->section_tipo = 'mupreva70';
						$PublicacionsTable->portalize->IDactivitat->portal_tipo  = 'mupreva632';
					$PublicacionsTable->portalize->IDespai = new stdClass();
						$PublicacionsTable->portalize->IDespai->section_tipo  = 'mupreva290';
						$PublicacionsTable->portalize->IDespai->portal_tipo   = 'mupreva633';


			# PUBLICACIONSSERIES TABLE
			$PublicacionsSeries = new stdClass();	
				$PublicacionsSeries->FM_database		= 'Publicacions';
				$PublicacionsSeries->FM_table 			= 'SeriePublicacio';
				$PublicacionsSeries->FM_layout 			= 'web-Series';
				$PublicacionsSeries->filter 			= array('mupreva616' => array('1' => 2 ));
				$PublicacionsSeries->fields 			= new stdClass();
					$PublicacionsSeries->fields->section_tipo ='mupreva613';
					$PublicacionsSeries->fields->section_id 	='ID';
					$PublicacionsSeries->fields->mupreva1216 	='web';
					$PublicacionsSeries->fields->mupreva615 	=array('lg-vlca' => 'VALtitle',
																		'lg-spa' => 'CAStitle',
																		'lg-eng' => 'ENtitle',
																		'lg-fra' => 'FRtitle');
					$PublicacionsSeries->fields->mupreva1217 	=array('lg-vlca' => 'VALbody',
																		'lg-spa' => 'CASbody',
																		'lg-eng' => 'ENbody',
																		'lg-fra' => 'FRbody');
					$PublicacionsSeries->fields->mupreva1218 	='notes';
					$PublicacionsSeries->fields->mupreva2082 	='serie';

	
		# ESPAIS ******************************************************************************************

			$EspaisTable = new stdClass();	
				$EspaisTable->FM_database 	= 'Espais';
				$EspaisTable->FM_table 		= 'Espais';
				$EspaisTable->FM_layout 	= 'web-Espais';#'web-Espais';
				$EspaisTable->filter 		= array('mupreva301' => array('1' => 2 ));
				$EspaisTable->fields = new stdClass();
				$EspaisTable->fields->section_tipo 	='mupreva290';
				$EspaisTable->fields->section_id 	='ID';
				$EspaisTable->fields->mupreva295 	='IDparent';
				$EspaisTable->fields->mupreva294 	='order';
				$EspaisTable->fields->mupreva293 	='web';
				$EspaisTable->fields->mupreva2393 	='notes'
				$EspaisTable->fields->mupreva296 	=array('lg-vlca' => 'VALnumber',
														'lg-spa' => 'CASnumber',
														'lg-eng' => 'ENnumber',
														'lg-fra' => 'FRnumber');
				$EspaisTable->fields->mupreva298 	=array('lg-vlca' => 'VALtitle',
														'lg-spa' => 'CAStitle',
														'lg-eng' => 'ENtitle',
														'lg-fra' => 'FRtitle');
				$EspaisTable->fields->mupreva299 	=array('lg-vlca' => 'VALresume',
														'lg-spa' => 'CASresume',
														'lg-eng' => 'ENresume',
														'lg-fra' => 'FRresume');
				$EspaisTable->fields->mupreva303 	=array('lg-vlca' => 'VALbody',
														'lg-spa' => 'CASbody',
														'lg-eng' => 'ENbody',
														'lg-fra' => 'FRbody');
				$EspaisTable->fields->mupreva1246 	=array('lg-vlca' => 'VALslogan',
														'lg-spa' => 'CASslogan',
														'lg-eng' => 'ENslogan',
														'lg-fra' => 'FRslogan');


		# RESTAURACION ******************************************************************************************

			$RestauracionTable = new stdClass();	
				$RestauracionTable->FM_database 	= 'Restauracio';
				$RestauracionTable->FM_table 		= 'Restauracio';
				$RestauracionTable->FM_layout 		= 'web-Restauracio';
				$RestauracionTable->filter 			= array('mupreva792' => array('1' => 2 ));
				$RestauracionTable->fields 			= new stdClass();
					$RestauracionTable->fields->section_tipo ='mupreva770';
					$RestauracionTable->fields->section_id 	='ID';
					$RestauracionTable->fields->mupreva774 	='web';
					#$RestauracionTable->fields->mupreva629 	='IDparent';
					#$RestauracionTable->fields->mupreva188 	='IDlanguaje';
					#$RestauracionTable->fields->mupreva174 	='seriesNumber';
					#$RestauracionTable->fields->mupreva181 	='datePublication';
					$RestauracionTable->fields->mupreva796 	=array('lg-vlca' => 'VALtitle',
																	'lg-spa' => 'CAStitle');
					$RestauracionTable->fields->mupreva797 	=array('lg-vlca' => 'VALbody',
																	'lg-spa' => 'CASbody');
					$RestauracionTable->fields->mupreva1347 =array('lg-vlca' => 'VALresume',
																	'lg-spa' => 'CASresume');
					$RestauracionTable->fields->mupreva1348 =array('lg-vlca' => 'VALslogan',
																	'lg-spa' => 'CASslogan');
					$RestauracionTable->fields->mupreva779 	='Diagnostico';
					$RestauracionTable->fields->mupreva780 	='Neteja';
					$RestauracionTable->fields->mupreva781 	='Consolidacion_Estabilizacion';
					$RestauracionTable->fields->mupreva782 	='Montaje';
					$RestauracionTable->fields->mupreva783 	='Proteccion final';
					$RestauracionTable->fields->mupreva784 	='Reconstruccion volumetrica y cromatica';
					$RestauracionTable->fields->mupreva785 	='Conservació preventiva';

					$RestauracionTable->fields->mupreva798 	='IDprocess';
				$RestauracionTable->relatedSets 		= new stdClass();
					$RestauracionTable->relatedSets->mupreva787 	=array('restauracioPortalRestorer'=>'IDrestorer');

					$RestauracionTable->fields->mupreva788 	='dateIni';
					$RestauracionTable->fields->mupreva789 	='dateEnd';

				$RestauracionTable->portalize = new stdClass();
					$RestauracionTable->portalize->IDcataleg = new stdClass();
						$RestauracionTable->portalize->IDcataleg->section_tipo 	 = 'mupreva1';
						$RestauracionTable->portalize->IDcataleg->portal_tipo  	 = 'mupreva18';
					$RestauracionTable->portalize->IDconjunt = new stdClass();
						$RestauracionTable->portalize->IDconjunt->section_tipo 	 = 'mupreva494';
						$RestauracionTable->portalize->IDconjunt->portal_tipo  	 = 'mupreva595';
					$RestauracionTable->portalize->IDprocess = new stdClass();
						$RestauracionTable->portalize->IDprocess->section_tipo 	 = 'mupreva760';
						$RestauracionTable->portalize->IDprocess->portal_tipo  	 = 'mupreva1342';



			# PROCESOS TABLE
			$RestauracionProcesos = new stdClass();	
				$RestauracionProcesos->FM_database 		= 'Process';
				$RestauracionProcesos->FM_table 		= 'Process';
				$RestauracionProcesos->FM_layout 		= 'web-Process';
				$RestauracionProcesos->filter 			= array('mupreva1343' => array('1' => 2 ));
				$RestauracionProcesos->fields 			= new stdClass();
					$RestauracionProcesos->fields->section_tipo ='mupreva760';
					$RestauracionProcesos->fields->section_id 	='ID';
					$RestauracionProcesos->fields->mupreva1226 	='web';
					$RestauracionProcesos->fields->mupreva1227 	='IDparent';
					$RestauracionProcesos->fields->mupreva1228 	=array('lg-vlca' => 'VALtitle',
																	'lg-spa' => 'CAStitle');
					$RestauracionProcesos->fields->mupreva1338 	=array('lg-vlca' => 'VALbody',
																	'lg-spa' => 'CASbody');

				$RestauracionProcesos->relatedSets 		= new stdClass();
					$RestauracionProcesos->relatedSets->mupreva1341 	=array('processPortalAuthorRecod'=>'IDauthorRecord');


		# YACIMIENTOS ******************************************************************************************

			$YacimientosTable = new stdClass();	
				$YacimientosTable->FM_database 		= 'Jaciments';
				$YacimientosTable->FM_table 		= 'Site';
				$YacimientosTable->FM_layout 		= 'web-Site';#'web-Site';
				$YacimientosTable->filter 			= array('mupreva551' => array('1' => 2 ));
				$YacimientosTable->fields 			= new stdClass();
					$YacimientosTable->fields->section_tipo ='mupreva500';
					$YacimientosTable->fields->section_id 	='ID';
					$YacimientosTable->fields->mupreva502 	='web';
					$YacimientosTable->fields->mupreva503 	='IDplace';
					$YacimientosTable->fields->mupreva2179 	='IDentitat';
					$YacimientosTable->fields->mupreva2178 	='IDruta';
					$YacimientosTable->fields->mupreva507 	='toponimia';
					$YacimientosTable->fields->mupreva509 	='notes';


					$YacimientosTable->fields->mupreva505 	=array('lg-vlca' => 'VALtitle',
																	'lg-spa' => 'CAStitle');

					/*$YacimientosTable->fields->mupreva505 	='title';*/
					$YacimientosTable->fields->mupreva508 	=array('lg-vlca' => 'VALbody',
																	'lg-spa' => 'CASbody');
					$YacimientosTable->fields->mupreva1351 =array('lg-vlca' => 'VALresume',
																	'lg-spa' => 'CASresume');
					$YacimientosTable->fields->mupreva1352 =array('lg-vlca' => 'VALslogan',
																	'lg-spa' => 'CASslogan');

				$YacimientosTable->relatedSets 		= new stdClass();
					$YacimientosTable->relatedSets->mupreva506 	=array('sitePortalPeriod'=>'IDperiod');
					#$YacimientosTable->relatedSets->mupreva506 	=array('sitePortalAuthorRecord'=>'IDpersones');

				$YacimientosTable->geolocation 		= new stdClass();
					$YacimientosTable->geolocation->mupreva511 	=array('lat' => 'latitude',
																		'lon'=>'longitude');

				$YacimientosTable->portalize = new stdClass();
					$YacimientosTable->portalize->IDruta = new stdClass();
						$YacimientosTable->portalize->IDruta->section_tipo 		= 'mupreva1000';
						$YacimientosTable->portalize->IDruta->portal_tipo  		= 'mupreva1004';

				/*Actualización de la web de la ruta*/
				$YacimientosTable->fields->mupreva2243 	=array('lg-vlca' => 'VALhowToGet',
																'lg-spa' => 'CAShowToGet');

				$YacimientosTable->fields->mupreva2244 	=array('lg-vlca' => 'VALvisitingTime',
																'lg-spa' => 'CASvisitingTime');

				$YacimientosTable->fields->mupreva2245 	=array('lg-vlca' => 'VALaccess',
																'lg-spa' => 'CASaccess');


			# CONTEXTOS TABLE
			$ContextosTable = new stdClass();	
				$ContextosTable->FM_database 		= 'Jaciments';
				$ContextosTable->FM_table 			= 'Context';
				$ContextosTable->FM_layout 			= 'web-Context';#'web-Site';
				$ContextosTable->filter 			= array('mupreva541' => array('1' => 2 ));
				$ContextosTable->fields 			= new stdClass();
					$ContextosTable->fields->section_tipo ='mupreva530';
					$ContextosTable->fields->section_id 	='ID';
					$ContextosTable->fields->mupreva1355 	='web';
					$ContextosTable->fields->mupreva532 	='IDsite';
					$ContextosTable->fields->mupreva1356 	='IDperiod';
					$ContextosTable->fields->mupreva535 	='dateIni';
					$ContextosTable->fields->mupreva536 	='dateEnd';
					$ContextosTable->fields->mupreva533 	=array('lg-vlca' => 'VALtitle',
																	'lg-spa' => 'CAStitle');
					$ContextosTable->fields->mupreva534 	=array('lg-vlca' => 'VALbody',
																	'lg-spa' => 'CASbody');
					$ContextosTable->fields->mupreva1357 	=array('lg-vlca' => 'VALresume',
																	'lg-spa' => 'CASresume');
					$ContextosTable->fields->mupreva1358 	=array('lg-vlca' => 'VALslogan',
																	'lg-spa' => 'CASslogan');
					$ContextosTable->fields->mupreva538 	='notes';
					#$ContextosTable->fields->mupreva538 	='bibliography';

				$ContextosTable->geolocation 		= new stdClass();
					$ContextosTable->geolocation->mupreva537 	=array('lat' => 'latitude',
																		'lon'=>'longitude');


		# EXPOSICIONES ******************************************************************************************

			$ExposicionesTable = new stdClass();	
				$ExposicionesTable->FM_database 	= 'Exposicions';
				$ExposicionesTable->FM_table 		= 'Exposicions';
				$ExposicionesTable->FM_layout 		= 'web-Exposicions';#'web-Exposicions';
				$ExposicionesTable->filter 			= array('mupreva90' => array('1' => 2 ));
				$ExposicionesTable->fields 			= new stdClass();
					$ExposicionesTable->fields->section_tipo ='mupreva86';
					$ExposicionesTable->fields->section_id 	='ID';
					$ExposicionesTable->fields->mupreva555 	='web';
					$ExposicionesTable->fields->mupreva556 	='IDcategory';
					$ExposicionesTable->fields->mupreva1369	='IDcicle';
					$ExposicionesTable->fields->mupreva2168	='home';
					#$ExposicionesTable->fields->mupreva557	='dateIni';
					#$ExposicionesTable->fields->mupreva558	='dateEnd';

					$ExposicionesTable->fields->mupreva88 	=array('lg-vlca' => 'VALtitle',
																	'lg-spa' => 'CAStitle',
																	'lg-eng' => 'ENtitle',
																	'lg-fra' => 'FRtitle');
					$ExposicionesTable->fields->mupreva562 	=array('lg-vlca' => 'VALbody',
																	'lg-spa' => 'CASbody',
																	'lg-eng' => 'ENbody',
																	'lg-fra' => 'FRbody');
					$ExposicionesTable->fields->mupreva561 	=array('lg-vlca' => 'VALresume',
																	'lg-spa' => 'CASresume',
																	'lg-eng' => 'ENresume',
																	'lg-fra' => 'FRresume');
					$ExposicionesTable->fields->mupreva563 	=array('lg-vlca' => 'VALslogan',
																	'lg-spa' => 'CASslogan',
																	'lg-eng' => 'ENslogan',
																	'lg-fra' => 'FRslogan');
					$ExposicionesTable->fields->mupreva1382 	='notes';

				$ExposicionesTable->relatedSets 		= new stdClass();
					$ExposicionesTable->relatedSets->mupreva750 	=array('exposicionsPortalCalendari'=>'ID');
					$ExposicionesTable->relatedSets->mupreva751 	=array('exposicionsPortalSites'=>'IDsites');
					$ExposicionesTable->relatedSets->mupreva1380 	=array('exposicionsPortalThemes'=>'IDtheme');
					$ExposicionesTable->relatedSets->mupreva1381 	=array('exposicionsPortalComisaris'=>'IDcomisari');
			

			# CICLOS EXPOSICIONES TABLE
			$CiclosExposicionesTable = new stdClass();	
				$CiclosExposicionesTable->FM_database 	= 'Exposicions';
				$CiclosExposicionesTable->FM_table 		= 'ExposicionsCicle';
				$CiclosExposicionesTable->FM_layout 	= 'web-ExposicionsCicle';#'web-ExposicionsCicle';
				$CiclosExposicionesTable->filter 		= array('mupreva1365' => array('1' => 2 ));
				$CiclosExposicionesTable->fields 		= new stdClass();
					$CiclosExposicionesTable->fields->section_tipo ='mupreva1360';
					$CiclosExposicionesTable->fields->section_id 	='ID';
					$CiclosExposicionesTable->fields->mupreva1362 	='web';
					$CiclosExposicionesTable->fields->mupreva1363 	=array('lg-vlca' => 'VALtitle',
																	'lg-spa' => 'CAStitle');
					$CiclosExposicionesTable->fields->mupreva1364 	=array('lg-vlca' => 'VALbody',
																	'lg-spa' => 'CASbody');


			# ESPACIOS EXPOSITIVOS TABLE
			$EspaciosExposiciones = new stdClass();	
				$EspaciosExposiciones->FM_database 		= 'Exposicions';
				$EspaciosExposiciones->FM_table 		= 'exposicionsPortalCalendari';
				$EspaciosExposiciones->FM_layout 		= 'web-exposicionsPortalCalendari';#'web-Exposicions';
				$EspaciosExposiciones->filter 			= array('mupreva1376' => array('1' => 2 ));
				$EspaciosExposiciones->fields 			= new stdClass();
					$EspaciosExposiciones->fields->section_tipo ='mupreva1370';
					$EspaciosExposiciones->fields->section_id 	='ID';
					$EspaciosExposiciones->fields->mupreva1372 	='web';
					$EspaciosExposiciones->fields->mupreva1373 	='IDespai';
					$EspaciosExposiciones->fields->mupreva1374 	='dateIni';
					$EspaciosExposiciones->fields->mupreva1375 	='dateEnd';


		# ACTIVIDADES ******************************************************************************************

			$ActividadesTable = new stdClass();	
				$ActividadesTable->FM_database 		= 'Activitats';
				$ActividadesTable->FM_table 		= 'Activitats';
				$ActividadesTable->FM_layout 		= 'web-Activitats';#'web-Activitats';
				$ActividadesTable->filter 			= array('mupreva103' => array('1' => 2 ,'2' => 2 ));
				$ActividadesTable->fields 			= new stdClass();
					$ActividadesTable->fields->section_tipo ='mupreva70';
					$ActividadesTable->fields->section_id 	='ID';
					$ActividadesTable->fields->mupreva525 	='web';
					$ActividadesTable->fields->mupreva75 	='IDcategory';
					$ActividadesTable->fields->mupreva1383 	='IDparent';
					$ActividadesTable->fields->mupreva2115 	='reserves';
					$ActividadesTable->fields->mupreva2169	='home';
					#$ActividadesTable->fields->mupreva523 	='dateIni';
					#$ActividadesTable->fields->mupreva524 	='dateEnd';
					$ActividadesTable->fields->mupreva73 	=array('lg-vlca' => 'VALtitle',
																	'lg-spa' => 'CAStitle',
																	'lg-eng' => 'ENtitle',
																	'lg-fra' => 'FRtitle');
					$ActividadesTable->fields->mupreva74 	=array('lg-vlca' => 'VALbody',
																	'lg-spa' => 'CASbody',
																	'lg-eng' => 'ENbody',
																	'lg-fra' => 'FRbody');
					$ActividadesTable->fields->mupreva72 	=array('lg-vlca' => 'VALresume',
																	'lg-spa' => 'CASresume',
																	'lg-eng' => 'ENresume',
																	'lg-fra' => 'FRresume');
					$ActividadesTable->fields->mupreva526 	=array('lg-vlca' => 'VALslogan',
																	'lg-spa' => 'CASslogan',
																	'lg-eng' => 'ENslogan',
																	'lg-fra' => 'FRslogan');

					$ActividadesTable->fields->mupreva527 	='notes';

					$ActividadesTable->fields->mupreva1406 	='IDactivitat';


				$ActividadesTable->portalize = new stdClass();
					$ActividadesTable->portalize->IDactivitat = new stdClass();
						$ActividadesTable->portalize->IDactivitat->section_tipo = 'mupreva86';
						$ActividadesTable->portalize->IDactivitat->portal_tipo  = 'mupreva1407';

				$ActividadesTable->relatedSets 		= new stdClass();
					$ActividadesTable->relatedSets->mupreva528 		=array('activitatsPortalCalendari'=>'ID');
					$ActividadesTable->relatedSets->mupreva529 		=array('activitatsPortalSites'=>'IDsites');
					$ActividadesTable->relatedSets->mupreva1395 	=array('activitatsPortalThemes'=>'IDtheme');
					$ActividadesTable->relatedSets->mupreva1405 	=array('activitatsPortalPublic'=>'IDpublic');

			# ESPACIOS ACTIVIDADES TABLE
			$EspaciosActividades = new stdClass();	
				$EspaciosActividades->FM_database 		= 'Activitats';
				$EspaciosActividades->FM_table 			= 'activitatsPortalCalendari';
				$EspaciosActividades->FM_layout 		= 'web-activitatsPortalCalendari';#'web-activitatsPortalEspais';
				$EspaciosActividades->filter 			= array('mupreva1391' => array('1' => 2 ));
				$EspaciosActividades->fields 			= new stdClass();
					$EspaciosActividades->fields->section_tipo ='mupreva1385';
					$EspaciosActividades->fields->section_id 	='ID';
					$EspaciosActividades->fields->mupreva1387 	='web';
					$EspaciosActividades->fields->mupreva1388 	='IDespai';
					$EspaciosActividades->fields->mupreva1389 	='dateIni';
					$EspaciosActividades->fields->mupreva524 	='dateEnd';
					$EspaciosActividades->fields->mupreva1390 	='hour';


			# PUBLICOS ACTIVIDADES TABLE
			$PublicosActividades = new stdClass();	
				$PublicosActividades->FM_database 		= 'Activitats';
				$PublicosActividades->FM_table 			= 'ActivitatsPublic';
				$PublicosActividades->FM_layout 		= 'web-ActivitatsPublic';#'web-activitatsPortalEspais';
				$PublicosActividades->filter 			= array('mupreva1401' => array('1' => 2 ));
				$PublicosActividades->fields 			= new stdClass();
					$PublicosActividades->fields->section_tipo ='mupreva1396';
					$PublicosActividades->fields->section_id 	='ID';
					$PublicosActividades->fields->mupreva2101 	='web';
					$PublicosActividades->fields->mupreva1399 	=array('lg-vlca' => 'VALtitle',
																		'lg-spa' => 'CAStitle',
																		'lg-eng' => 'ENtitle',
																		'lg-fra' => 'FRtitle');
					$PublicosActividades->fields->mupreva1400 	=array('lg-vlca' => 'VALbody',
																		'lg-spa' => 'CASbody',
																		'lg-eng' => 'ENbody',
																		'lg-fra' => 'FRbody');


		# EXCAVACIONES ******************************************************************************************

			$ExcavacionesTable = new stdClass();	
				$ExcavacionesTable->FM_database 	= 'Excavacions';
				$ExcavacionesTable->FM_table 		= 'Excavacions';
				$ExcavacionesTable->FM_layout 		= 'web-Excavacions';#'web-Excavacions';
				$ExcavacionesTable->filter 			= array('mupreva1420' => array('1' => 2));
				$ExcavacionesTable->fields 			= new stdClass();
					$ExcavacionesTable->fields->section_tipo 	='mupreva1410';
					$ExcavacionesTable->fields->section_id 		='ID';
					$ExcavacionesTable->fields->mupreva1412		='web';
					$ExcavacionesTable->fields->mupreva1416 	='dateIni';
					$ExcavacionesTable->fields->mupreva1417 	='dateEnd';
					$ExcavacionesTable->fields->mupreva1413 	=array('lg-vlca' => 'VALtitle',
																	'lg-spa' => 'CAStitle',
																	'lg-eng' => 'ENtitle',
																	'lg-fra' => 'FRtitle');
					$ExcavacionesTable->fields->mupreva1424 	=array('lg-vlca' => 'VALbody',
																	'lg-spa' => 'CASbody',
																	'lg-eng' => 'ENbody',
																	'lg-fra' => 'FRbody');
					$ExcavacionesTable->fields->mupreva1422 	=array('lg-vlca' => 'VALresume',
																	'lg-spa' => 'CASresume',
																	'lg-eng' => 'ENresume',
																	'lg-fra' => 'FRresume');
					$ExcavacionesTable->fields->mupreva1423 	=array('lg-vlca' => 'VALslogan',
																	'lg-spa' => 'CASslogan',
																	'lg-eng' => 'ENslogan',
																	'lg-fra' => 'FRslogan');

					$ExcavacionesTable->fields->mupreva1414		='IDsite';
					$ExcavacionesTable->fields->mupreva1434		='campaign';

				$ExcavacionesTable->relatedSets 		= new stdClass();
					$ExcavacionesTable->relatedSets->mupreva1415 	=array('excavacionsPortalDirectors'=>'IDdirector');


		# RUTA IBÉRICA ******************************************************************************************

			$RutaIbericaTable = new stdClass();	
				$RutaIbericaTable->FM_database 		= 'Ruta';
				$RutaIbericaTable->FM_table 		= 'Ruta';
				$RutaIbericaTable->FM_layout 		= 'web-Ruta';#'web-Ruta';
				$RutaIbericaTable->filter 			= array('mupreva1006' => array('1' => 2));
				$RutaIbericaTable->fields 			= new stdClass();
					$RutaIbericaTable->fields->section_tipo 	='mupreva1000';
					$RutaIbericaTable->fields->section_id 		='ID';
					$RutaIbericaTable->fields->mupreva1014		='web';
					$RutaIbericaTable->fields->mupreva1437		='IDparent';
					$RutaIbericaTable->fields->mupreva1002 	=array('lg-vlca' => 'VALtitle',
																	'lg-spa' => 'CAStitle',
																	'lg-eng' => 'ENtitle',
																	'lg-fra' => 'FRtitle');
					$RutaIbericaTable->fields->mupreva1003 	=array('lg-vlca' => 'VALbody',
																	'lg-spa' => 'CASbody',
																	'lg-eng' => 'ENbody',
																	'lg-fra' => 'FRbody');
					$RutaIbericaTable->fields->mupreva1005 	=array('lg-vlca' => 'VALresume',
																	'lg-spa' => 'CASresume',
																	'lg-eng' => 'ENresume',
																	'lg-fra' => 'FRresume');
					$RutaIbericaTable->fields->mupreva1436 	=array('lg-vlca' => 'VALslogan',
																	'lg-spa' => 'CASslogan',
																	'lg-eng' => 'ENslogan',
																	'lg-fra' => 'FRslogan');

			#$RutaIbericaTable->relatedSets 		= new stdClass();
			#		$RutaIbericaTable->relatedSets->mupreva1004 	=array('rutaPortalJaciments'=>'IDsite');

			/*Actualización de la web de la ruta
			*Actividades Externas
			*/


		# AUDIO ******************************************************************************************

			# AUDIO GALERIA TABLE
			$AudioGaleria = new stdClass();	
				$AudioGaleria->FM_database 	= 'Audio';
				$AudioGaleria->FM_table 	= 'Audio';
				$AudioGaleria->FM_layout 	= 'web-Audio';// 'web-Audio';
				$AudioGaleria->filter 		= array('mupreva1311' => array('1' => 2 ));
				$AudioGaleria->fields 		= new stdClass();
					$AudioGaleria->fields->section_tipo ='mupreva1296';
					$AudioGaleria->fields->section_id 	='ID';
					$AudioGaleria->fields->mupreva1299 	='web';

					$AudioGaleria->fields->mupreva1302 	='dateAudio';
					$AudioGaleria->fields->mupreva1300 	=array( 'lg-vlca' => 'VALtitle',
																'lg-spa' => 'CAStitle');
					$AudioGaleria->fields->mupreva1301 	=array( 'lg-vlca' => 'VALresume',
																'lg-spa' => 'CASresume');
					$AudioGaleria->fields->mupreva1278 	=array( 'lg-vlca' => 'VALbody',
																'lg-spa' => 'CASbody');
					$AudioGaleria->fields->mupreva1277 	=array( 'lg-vlca' => 'VALcredits',
																'lg-spa' => 'CAScredits');
					$AudioGaleria->fields->mupreva1280 	='notes';
					$AudioGaleria->fields->mupreva1273 	='IDcontents';
					$AudioGaleria->fields->mupreva1264 	='IDcategory';

					$AudioGaleria->fields->mupreva1307 	='IDsite';
					#$AudioGaleria->fields->mupreva490 	='IDcontext';
					#$AudioGaleria->fields->mupreva485 	='IDconjunt';
					$AudioGaleria->fields->mupreva1308 	='IDexposicio';
					$AudioGaleria->fields->mupreva1309 	='IDactivitat';
					$AudioGaleria->fields->mupreva1310 	='IDespai';


				$AudioGaleria->portalize = new stdClass();
					$AudioGaleria->portalize->IDsite = new stdClass();
						$AudioGaleria->portalize->IDsite->section_tipo 		= 'mupreva500';
						$AudioGaleria->portalize->IDsite->portal_tipo  		= 'mupreva1315';
					/*$AudioGaleria->portalize->IDcontext = new stdClass();
						$AudioGaleria->portalize->IDcontext->section_tipo 	= 'mupreva530';
						$AudioGaleria->portalize->IDcontext->portal_tipo  	= 'mupreva550';
					$AudioGaleria->portalize->IDconjunt = new stdClass();
						$AudioGaleria->portalize->IDconjunt->section_tipo 	= 'mupreva494';
						$AudioGaleria->portalize->IDconjunt->portal_tipo  	= 'mupreva598';*/
					$AudioGaleria->portalize->IDexposicio = new stdClass();
						$AudioGaleria->portalize->IDexposicio->section_tipo = 'mupreva86';
						$AudioGaleria->portalize->IDexposicio->portal_tipo  = 'mupreva1317';
					$AudioGaleria->portalize->IDactivitat = new stdClass();
						$AudioGaleria->portalize->IDactivitat->section_tipo = 'mupreva70';
						$AudioGaleria->portalize->IDactivitat->portal_tipo  = 'mupreva1318';
					$AudioGaleria->portalize->IDespai = new stdClass();
						$AudioGaleria->portalize->IDespai->section_tipo 	= 'mupreva290';
						$AudioGaleria->portalize->IDespai->portal_tipo  	= 'mupreva1316';


			# AUDIO TEMAS TABLE
			$AudioTemas = new stdClass();	
				$AudioTemas->FM_database 	= 'Audio';
				$AudioTemas->FM_table 		= 'AudioContents';
				$AudioTemas->FM_layout 		= 'web-AudioContents';// 'web-AudioContents';
				$AudioTemas->filter 		= array('mupreva1269' => array('1' => 2 ));
				$AudioTemas->fields 		= new stdClass();
					$AudioTemas->fields->section_tipo ='mupreva1266';
					$AudioTemas->fields->section_id 	='ID';
					#$AudioTemas->fields->mupreva1299 	='web';
					$AudioTemas->fields->mupreva1268 	=array( 'lg-vlca' => 'VALtitle',
																'lg-spa' => 'CAStitle');


			# AUDIO ITEMS TABLE
			$AudioItem = new stdClass();	
				$AudioItem->FM_database 	= 'Audio';
				$AudioItem->FM_table 		= 'AudioItems';
				$AudioItem->FM_layout 		= 'web-AudioItems';// 'web-AudioItems';
				$AudioItem->filter 		= array('mupreva1281' => array('1' => 2 ));
				$AudioItem->fields 		= new stdClass();
					$AudioItem->fields->section_tipo 	='mupreva472';
					$AudioItem->fields->section_id 		= array( 'search' => 'mupreva1336');
					$AudioItem->fields->mupreva1336		='ID';
					$AudioItem->fields->mupreva1263 	='web';
					$AudioItem->fields->mupreva1265 	='IDlanguage';
					$AudioItem->fields->mupreva1274 	=array( 'lg-vlca' => 'VALtitle',
																'lg-spa' => 'CAStitle');

					$AudioItem->fields->mupreva1294 	='IDactivitat';
					$AudioItem->fields->mupreva1295 	='IDespai';
			

		# VÍDEO ******************************************************************************************

			# AUDIO GALERIA TABLE
			$VideoGaleria = new stdClass();	
				$VideoGaleria->FM_database 	= 'Video';
				$VideoGaleria->FM_table 	= 'Video';
				$VideoGaleria->FM_layout 	= 'web-Video';// 'web-Video';
				$VideoGaleria->filter 		= array('mupreva1455' => array('1' => 2 ));
				$VideoGaleria->fields 		= new stdClass();
					$VideoGaleria->fields->section_tipo ='mupreva1438';
					$VideoGaleria->fields->section_id 	='ID';
					$VideoGaleria->fields->mupreva1441 	='web';
					$VideoGaleria->fields->mupreva1442 	='CC';
					$VideoGaleria->fields->mupreva1443 	='IDlanguage';
					$VideoGaleria->fields->mupreva1444 	='dateVideo';
					$VideoGaleria->fields->mupreva1445 	='IDcategory';
					$VideoGaleria->fields->mupreva1453 	='IDcontents';
					$VideoGaleria->fields->mupreva1439 	='carpetaName';

					$VideoGaleria->fields->mupreva1462 	='IDauthorVideoPersones';
					$VideoGaleria->fields->mupreva1463 	='IDauthorVideoEntitats';

					$VideoGaleria->fields->mupreva1456 	=array( 'lg-vlca' => 'VALtitle',
																'lg-spa' => 'CAStitle');
					$VideoGaleria->fields->mupreva1457 	=array( 'lg-vlca' => 'VALfootprint',
																'lg-spa' => 'CASfootprint');
					$VideoGaleria->fields->mupreva1459 	=array( 'lg-vlca' => 'VALbody',
																'lg-spa' => 'CASbody');
					$VideoGaleria->fields->mupreva1460 	=array( 'lg-vlca' => 'VALcredits',
																'lg-spa' => 'CAScredits');
					$VideoGaleria->fields->mupreva1461 	='notes';

					$VideoGaleria->fields->mupreva1465 	='IDsite';
					$VideoGaleria->fields->mupreva1466 	='IDcontext';
					$VideoGaleria->fields->mupreva1467 	='IDconjunt';
					$VideoGaleria->fields->mupreva1468 	='IDexposicio';
					$VideoGaleria->fields->mupreva1469 	='IDactivitat';
					$VideoGaleria->fields->mupreva1470 	='IDespai';
					$VideoGaleria->fields->mupreva1471 	='IDexcavacio';
					$VideoGaleria->fields->mupreva1472 	='IDrestauracio';


				$VideoGaleria->portalize = new stdClass();
					$VideoGaleria->portalize->IDsite = new stdClass();
						$VideoGaleria->portalize->IDsite->section_tipo 		= 'mupreva500';
						$VideoGaleria->portalize->IDsite->portal_tipo  		= 'mupreva1480';
					$VideoGaleria->portalize->IDcontext = new stdClass();
						$VideoGaleria->portalize->IDcontext->section_tipo 	= 'mupreva530';
						$VideoGaleria->portalize->IDcontext->portal_tipo  	= 'mupreva1481';
					$VideoGaleria->portalize->IDconjunt = new stdClass();
						$VideoGaleria->portalize->IDconjunt->section_tipo 	= 'mupreva494';
						$VideoGaleria->portalize->IDconjunt->portal_tipo  	= 'mupreva1482';
					$VideoGaleria->portalize->IDexposicio = new stdClass();
						$VideoGaleria->portalize->IDexposicio->section_tipo = 'mupreva86';
						$VideoGaleria->portalize->IDexposicio->portal_tipo  = 'mupreva1483';
					$VideoGaleria->portalize->IDactivitat = new stdClass();
						$VideoGaleria->portalize->IDactivitat->section_tipo = 'mupreva70';
						$VideoGaleria->portalize->IDactivitat->portal_tipo  = 'mupreva1484';
					$VideoGaleria->portalize->IDespai = new stdClass();
						$VideoGaleria->portalize->IDespai->section_tipo 	= 'mupreva290';
						$VideoGaleria->portalize->IDespai->portal_tipo  	= 'mupreva1485';
					$VideoGaleria->portalize->IDexcavacio = new stdClass();
						$VideoGaleria->portalize->IDexcavacio->section_tipo = 'mupreva290';
						$VideoGaleria->portalize->IDexcavacio->portal_tipo  = 'mupreva1486';
					$VideoGaleria->portalize->IDrestauracio = new stdClass();
						$VideoGaleria->portalize->IDrestauracio->section_tipo 	= 'mupreva290';
						$VideoGaleria->portalize->IDrestauracio->portal_tipo  	= 'mupreva1487';


			# VÍDEO TIPOLOGIA TABLE
			$VideoTipo = new stdClass();	
				$VideoTipo->FM_database 	= 'Video';
				$VideoTipo->FM_table 		= 'VideoContents';
				$VideoTipo->FM_layout 		= 'web-VideoContents';// 'web-AudioContents';
				$VideoTipo->filter 		= array('mupreva1449' => array('1' => 2 ));
				$VideoTipo->fields 		= new stdClass();
					$VideoTipo->fields->section_tipo 	='mupreva1446';
					$VideoTipo->fields->section_id 		='ID';
					#$VideoTipo->fields->mupreva1299 	='web';
					$VideoTipo->fields->mupreva1448 	=array( 'lg-vlca' => 'VALtitle',
																'lg-spa' => 'CAStitle');

			# VÍDEO MASTER ORIGINAL TABLE
			$VideoMaster = new stdClass();	
				$VideoMaster->FM_database 	= 'Video';
				$VideoMaster->FM_table 		= 'MasterOriginal';
				$VideoMaster->FM_layout 	= 'web-MasterOriginal';// 'web-MasterOriginal';
				$VideoMaster->filter 		= array('mupreva1493' => array('1' => 2 ));
				$VideoMaster->fields 		= new stdClass();
					$VideoMaster->fields->section_tipo ='mupreva1458';
					$VideoMaster->fields->section_id 	='ID';
					#$VideoMaster->fields->mupreva1299 	='web';
					$VideoMaster->fields->mupreva1492 	=array( 'lg-vlca' => 'VALtitle',
																'lg-spa' => 'CAStitle');

			# VÍDEO ITEMS TABLE
			$VideoItem = new stdClass();	
				$VideoItem->FM_database 	= 'Video';
				$VideoItem->FM_table 		= 'VideoItems';
				$VideoItem->FM_layout 		= 'web-VideoItems';// 'web-VideoItems';
				$VideoItem->filter 			= array('mupreva1281' => array('1' => 2 ));
				$VideoItem->fields			= new stdClass();
					$VideoItem->fields->section_tipo ='mupreva1258';
					$VideoItem->fields->section_id 		= array( 'search' => 'mupreva1336');
					$VideoItem->fields->mupreva1336		='ID';
					$VideoItem->fields->mupreva1263 	='web';
					$VideoItem->fields->mupreva1265 	='IDlanguage';
					$VideoItem->fields->mupreva1274 	=array( 'lg-vlca' => 'VALtitle',
																'lg-spa' => 'CAStitle');

					###########DESACTIVADOS################
					#$VideoItem->fields->mupreva1294 	='IDactivitat';
					#$VideoItem->fields->mupreva1295 	='IDespai';
					$VideoItem->fields->mupreva1292 	='IDparent';

				$VideoItem->portalize = new stdClass();
					$VideoItem->portalize->IDparent = new stdClass();
					$VideoItem->portalize->IDparent->section_tipo 		= 'mupreva1438';
					$VideoItem->portalize->IDparent->portal_tipo  		= 'mupreva1474';

			
		# EPHEMERA ******************************************************************************************

			# EPHEMERA GALERIA TABLE
			$EphemeraGaleria = new stdClass();	
				$EphemeraGaleria->FM_database 	= 'Ephemera';
				$EphemeraGaleria->FM_table 		= 'Ephemera';
				$EphemeraGaleria->FM_layout 	= 'web-Ephemera';// 'web-Ephemera';
				$EphemeraGaleria->filter 		= array('mupreva683' => array('1' => 2 ));
				$EphemeraGaleria->fields 		= new stdClass();
					$EphemeraGaleria->fields->section_tipo ='mupreva667';
					$EphemeraGaleria->fields->section_id 	='ID';
					$EphemeraGaleria->fields->mupreva669 	='web';
					$EphemeraGaleria->fields->mupreva670 	='IDcategory';
					$EphemeraGaleria->fields->mupreva671 	='datePublication';

					$EphemeraGaleria->fields->mupreva672 	=array( 'lg-vlca' => 'VALtitle',
																'lg-spa' => 'CAStitle');
					$EphemeraGaleria->fields->mupreva673 	=array( 'lg-vlca' => 'VALbody',
																'lg-spa' => 'CASbody');
					$EphemeraGaleria->fields->mupreva478 	=array( 'lg-vlca' => 'VALfootprint',
																'lg-spa' => 'CASfootprint');
					$EphemeraGaleria->fields->mupreva674 	='notes';
					$EphemeraGaleria->fields->mupreva676 	='IDentitat';

					$EphemeraGaleria->fields->mupreva677 	='IDsite';
					/*$EphemeraGaleria->fields->mupreva490 	='IDcontext';
					$EphemeraGaleria->fields->mupreva485 	='IDconjunt';*/
					$EphemeraGaleria->fields->mupreva678 	='IDexposicio';
					$EphemeraGaleria->fields->mupreva679 	='IDactivitat';
					$EphemeraGaleria->fields->mupreva680 	='IDespai';


				$EphemeraGaleria->portalize = new stdClass();
					$EphemeraGaleria->portalize->IDsite = new stdClass();
						$EphemeraGaleria->portalize->IDsite->section_tipo 		= 'mupreva500';
						$EphemeraGaleria->portalize->IDsite->portal_tipo  		= 'mupreva682';
					/*$EphemeraGaleria->portalize->IDcontext = new stdClass();
						$EphemeraGaleria->portalize->IDcontext->section_tipo 	= 'mupreva530';
						$EphemeraGaleria->portalize->IDcontext->portal_tipo  	= 'mupreva746';
					$EphemeraGaleria->portalize->IDconjunt = new stdClass();
						$EphemeraGaleria->portalize->IDconjunt->section_tipo 	= 'mupreva494';
						$EphemeraGaleria->portalize->IDconjunt->portal_tipo  	= 'mupreva598';*/
					$EphemeraGaleria->portalize->IDexposicio = new stdClass();
						$EphemeraGaleria->portalize->IDexposicio->section_tipo 	= 'mupreva86';
						$EphemeraGaleria->portalize->IDexposicio->portal_tipo  	= 'mupreva687';
					$EphemeraGaleria->portalize->IDactivitat = new stdClass();
						$EphemeraGaleria->portalize->IDactivitat->section_tipo 	= 'mupreva70';
						$EphemeraGaleria->portalize->IDactivitat->portal_tipo  	= 'mupreva688';
					$EphemeraGaleria->portalize->IDespai = new stdClass();
						$EphemeraGaleria->portalize->IDespai->section_tipo 	= 'mupreva290';
						$EphemeraGaleria->portalize->IDespai->portal_tipo  	= 'mupreva689';


			# EPHEMERA ITEMS TABLE
			$EphemeraItem = new stdClass();	
				$EphemeraItem->FM_database 		= 'Ephemera';
				$EphemeraItem->FM_table 		= 'EphemeraItems';
				$EphemeraItem->FM_layout 		= 'web-EphemeraItems';// 'web-EphemeraItems';
				$EphemeraItem->filter 		= array('mupreva663' => array('1' => 2 ));
				$EphemeraItem->fields 		= new stdClass();
					$EphemeraItem->fields->section_tipo ='mupreva159';
					$EphemeraItem->fields->section_id 	= array( 'search' => 'mupreva1324');
					$EphemeraItem->fields->mupreva1324 	='ID';
					$EphemeraItem->fields->mupreva643 	='web';
					$EphemeraItem->fields->mupreva644 	='IDformatPhysical';
					$EphemeraItem->fields->mupreva205 	=array( 'lg-vlca' => 'VALtitle',
																'lg-spa' => 'CAStitle');
					$EphemeraItem->fields->mupreva217 	=array( 'lg-vlca' => 'VALbody',
																'lg-spa' => 'CASbody');
					$EphemeraItem->fields->mupreva216 	=array( 'lg-vlca' => 'VALfootprint',
																'lg-spa' => 'CASfootprint');
					#$EphemeraItem->fields->mupreva479 	='notes';
					$EphemeraItem->fields->mupreva652 	='IDlanguage';
					$EphemeraItem->fields->mupreva656 	='datePublication';
					$EphemeraItem->fields->mupreva653 	='measures';
					$EphemeraItem->fields->mupreva655 	='pages';
					$EphemeraItem->fields->mupreva657 	='editionNumber';
					$EphemeraItem->fields->mupreva2060 	='link';
					$EphemeraItem->fields->mupreva659 	='notes';

				$EphemeraItem->relatedSets 		= new stdClass();
					$EphemeraItem->relatedSets->mupreva658 		=array('itemEphemraPortalAuthor'=>'IDauthor');

					/*$EphemeraItem->fields->mupreva1328 	='IDsite';
					$EphemeraItem->fields->mupreva1252 ='IDcontext';
					$EphemeraItem->fields->mupreva1253 	='IDconjunt';*/
					$EphemeraItem->fields->mupreva1331 	='IDexposicio';
					$EphemeraItem->fields->mupreva2127 	='IDexposicioList';
					$EphemeraItem->fields->mupreva1332 	='IDactivitat';
					$EphemeraItem->fields->mupreva2128 	='IDactivitatList';
					/*$EphemeraItem->fields->mupreva1333 	='IDespai';*/



				$EphemeraItem->portalize = new stdClass();
					/*$EphemeraItem->portalize->IDsite = new stdClass();
						$EphemeraItem->portalize->IDsite->section_tipo 		= 'mupreva500';
						$EphemeraItem->portalize->IDsite->portal_tipo  		= 'mupreva514';
					$EphemeraItem->portalize->IDcontext = new stdClass();
						$EphemeraItem->portalize->IDcontext->section_tipo 	= 'mupreva530';
						$EphemeraItem->portalize->IDcontext->portal_tipo  	= 'mupreva546';
					$EphemeraItem->portalize->IDconjunt = new stdClass();
						$EphemeraItem->portalize->IDconjunt->section_tipo 	= 'mupreva494';
						$EphemeraItem->portalize->IDconjunt->portal_tipo  	= 'mupreva570';*/
					$EphemeraItem->portalize->IDexposicio = new stdClass();
						$EphemeraItem->portalize->IDexposicio->section_tipo = 'mupreva86';
						$EphemeraItem->portalize->IDexposicio->portal_tipo  = 'mupreva564';
					$EphemeraItem->portalize->IDexposicioList = new stdClass();
						$EphemeraItem->portalize->IDexposicioList->section_tipo = 'mupreva86';
						$EphemeraItem->portalize->IDexposicioList->portal_tipo  = 'mupreva2122';
					$EphemeraItem->portalize->IDactivitat = new stdClass();
						$EphemeraItem->portalize->IDactivitat->section_tipo = 'mupreva70';
						$EphemeraItem->portalize->IDactivitat->portal_tipo  = 'mupreva602';
					$EphemeraItem->portalize->IDactivitatList = new stdClass();
						$EphemeraItem->portalize->IDactivitatList->section_tipo = 'mupreva70';
						$EphemeraItem->portalize->IDactivitatList->portal_tipo  = 'mupreva2117';
					/*$EphemeraItem->portalize->IDespai = new stdClass();
						$EphemeraItem->portalize->IDespai->section_tipo 	= 'mupreva290';
						$EphemeraItem->portalize->IDespai->portal_tipo  	= 'mupreva900';*/


			# EPHEMERA TIPOLOGIA TABLE
			$EphemeraTipo = new stdClass();	
				$EphemeraTipo->FM_database 	= 'Ephemera';
				$EphemeraTipo->FM_table 	= 'EphemeraType';
				$EphemeraTipo->FM_layout 	= 'web-EphemeraType';// 'web-EphemeraType';
				$EphemeraTipo->filter 		= array('mupreva1506' => array('1' => 2 ));
				$EphemeraTipo->fields 		= new stdClass();
					$EphemeraTipo->fields->section_tipo ='mupreva1330';
					$EphemeraTipo->fields->section_id 	='ID';
					#$EphemeraTipo->fields->mupreva1299 	='web';
					$EphemeraTipo->fields->mupreva1505 	=array( 'lg-vlca' => 'VALtitle',
																'lg-spa' => 'CAStitle');


			# EPHEMERA FORMATO TABLE
			$EphemeraFormato = new stdClass();	
				$EphemeraFormato->FM_database 	= 'Ephemera';
				$EphemeraFormato->FM_table 		= 'EphemeraFormat';
				$EphemeraFormato->FM_layout 	= 'web-EphemeraFormat';// 'web-EphemeraFormat';
				$EphemeraFormato->filter 		= array('mupreva648' => array('1' => 2 ));
				$EphemeraFormato->fields 		= new stdClass();
					$EphemeraFormato->fields->section_tipo ='mupreva645';
					$EphemeraFormato->fields->section_id 	='ID';
					#$EphemeraFormato->fields->mupreva1299 	='web';
					$EphemeraFormato->fields->mupreva647 	=array( 'lg-vlca' => 'VALtitle',
																'lg-spa' => 'CAStitle');


		# CATALOGO ******************************************************************************************

			# CATALOGO TABLE
			$CatalogoTabla = new stdClass();	
				$CatalogoTabla->FM_database 	= 'Cataleg';
				$CatalogoTabla->FM_table 		= 'Cataleg';
				$CatalogoTabla->FM_layout 		= 'web-Cataleg';// 'web-Cataleg';
				$CatalogoTabla->filter 			= array('mupreva16' => array('1' => 2 ));
				$CatalogoTabla->fields 			= new stdClass();
					$CatalogoTabla->fields->section_tipo ='mupreva1';
					$CatalogoTabla->fields->section_id 	='ID';
					$CatalogoTabla->fields->mupreva1510 ='web';
					$CatalogoTabla->fields->mupreva2232 ='web_nomisma';
					$CatalogoTabla->fields->mupreva1511 ='highlight';
					$CatalogoTabla->fields->mupreva776 	=array( 'lg-vlca' => 'VALtitle',
																'lg-spa' => 'CAStitle');
					$CatalogoTabla->fields->mupreva15 	=array( 'lg-vlca' => 'VALbody',
																'lg-spa' => 'CASbody');

					$CatalogoTabla->fields->mupreva1513 ='IDmagatzem';
					$CatalogoTabla->fields->mupreva1514 ='AltresIdentificacions';
					$CatalogoTabla->fields->mupreva1515 ='IDconservation';
					$CatalogoTabla->fields->mupreva1516 ='IDsite';
					$CatalogoTabla->fields->mupreva1517 ='IDfindtype';
					$CatalogoTabla->fields->mupreva1518 ='IDconjunt';
					$CatalogoTabla->fields->mupreva1519 ='dateFind';
					$CatalogoTabla->fields->mupreva1520 ='IDcontext';
					$CatalogoTabla->fields->mupreva1521 ='siteArea';
					$CatalogoTabla->fields->mupreva1522 ='siteUE';
					$CatalogoTabla->fields->mupreva1523 ='IDobject';
					$CatalogoTabla->fields->mupreva1527 ='IDproductionPlace';
					$CatalogoTabla->fields->mupreva1528 ='IDauthenticiy';
					$CatalogoTabla->fields->mupreva1529 ='IDproductionType';
					$CatalogoTabla->fields->mupreva1530 ='IDauthority';
					$CatalogoTabla->fields->mupreva1531 ='corpusNumber';
					$CatalogoTabla->fields->mupreva1532 ='IDperiod';
					$CatalogoTabla->fields->mupreva1533 ='dateIni';
					$CatalogoTabla->fields->mupreva1534 ='dateEnd';
					$CatalogoTabla->fields->mupreva1535 =array( 'lg-vlca' => 'VALdate',
																'lg-spa' => 'CASdate');
					$CatalogoTabla->fields->mupreva1536 =array( 'lg-vlca' => 'VALmesaures',
																'lg-spa' => 'CASmesaures');
					$CatalogoTabla->fields->mupreva1537 ='weight';
					$CatalogoTabla->fields->mupreva1538 ='dieAxes';
					$CatalogoTabla->fields->mupreva1539 ='notes';
					$CatalogoTabla->fields->mupreva1541 ='IDacquisition';
					$CatalogoTabla->fields->mupreva1543 ='dateAcquisition';
					$CatalogoTabla->fields->mupreva1544 ='notesAcquisiton';
					$CatalogoTabla->fields->mupreva557 	='IDclass';
					$CatalogoTabla->fields->mupreva1545 ='IDespai';
					$CatalogoTabla->fields->mupreva1546 ='notesLocation';
					$CatalogoTabla->fields->mupreva1548 =array( 'lg-vlca' => 'VALquestion',
																'lg-spa' => 'CASquestion');
					$CatalogoTabla->fields->mupreva1549 =array( 'lg-vlca' => 'VALanswer',
																'lg-spa' => 'CASanswer');
					$CatalogoTabla->fields->mupreva558  ='iberic';
					$CatalogoTabla->fields->mupreva2186 ='corpusVolume';
					$CatalogoTabla->fields->mupreva2187 ='IDcertaintyCorpusNumber';
					$CatalogoTabla->fields->mupreva2375 ='publications';

				$CatalogoTabla->relatedSets = new stdClass();
					$CatalogoTabla->relatedSets->mupreva1524 =array('catalegPortalMaterial'=>'IDmaterial');
					$CatalogoTabla->relatedSets->mupreva1525 =array('catalegPortalTechnic'=>'IDtechnic');
					$CatalogoTabla->relatedSets->mupreva1526 =array('catalegPortalThemes'=>'IDtheme');
					$CatalogoTabla->relatedSets->mupreva1540 =array('catalegPortalPublicacions'=>'IDpublicacio');
					$CatalogoTabla->relatedSets->mupreva1542 =array('catalegPortalAcquisitionSource'=>'IDcontactes');

				$CatalogoTabla->portalize = new stdClass();
					$CatalogoTabla->portalize->IDconjunt = new stdClass();
						$CatalogoTabla->portalize->IDconjunt->section_tipo 	= 'mupreva500';
						$CatalogoTabla->portalize->IDconjunt->portal_tipo  	= 'mupreva596';
					$CatalogoTabla->portalize->IDcontext = new stdClass();
						$CatalogoTabla->portalize->IDcontext->section_tipo 	= 'mupreva530';
						$CatalogoTabla->portalize->IDcontext->portal_tipo  	= 'mupreva573';


			# CONJUNTO TABLE
			$ConjuntoTabla = new stdClass();	
				$ConjuntoTabla->FM_database 	= 'Cataleg';
				$ConjuntoTabla->FM_table 		= 'Conjunt';
				$ConjuntoTabla->FM_layout 		= 'web-Conjunt';// 'web-Cataleg';
				$ConjuntoTabla->filter 			= array('mupreva569' => array('1' => 2 ));
				$ConjuntoTabla->fields 			= new stdClass();
					$ConjuntoTabla->fields->section_tipo ='mupreva494';
					$ConjuntoTabla->fields->section_id 	='ID';
					$ConjuntoTabla->fields->mupreva496 	='web';
					$ConjuntoTabla->fields->mupreva497 	='highlight';
					$ConjuntoTabla->fields->mupreva499 	=array( 'lg-vlca' => 'VALtitle',
																'lg-spa' => 'CAStitle');
					$ConjuntoTabla->fields->mupreva571 	='IDsite';
					$ConjuntoTabla->fields->mupreva574 	='IDfindtype';
					$ConjuntoTabla->fields->mupreva575 	='dateFind';
					$ConjuntoTabla->fields->mupreva576 	='IDcontext';
					$ConjuntoTabla->fields->mupreva577 	='siteArea';
					$ConjuntoTabla->fields->mupreva578 	='siteUE';
					$ConjuntoTabla->fields->mupreva572 	='IDperiod';
					$ConjuntoTabla->fields->mupreva580 	='dateIni';
					$ConjuntoTabla->fields->mupreva581 	='dateEnd';
					$ConjuntoTabla->fields->mupreva582 	=array( 'lg-vlca' => 'VALdate',
																'lg-spa' => 'CASdate');
					$ConjuntoTabla->fields->mupreva584 	=array( 'lg-vlca' => 'VALbody',
																'lg-spa' => 'CASbody');
					$ConjuntoTabla->fields->mupreva585 	='notes';
					$ConjuntoTabla->fields->mupreva590 	='dateAcquisition';
					$ConjuntoTabla->fields->mupreva591 	='notesAcquisiton';
					$ConjuntoTabla->fields->mupreva593 	='IDespai';
					$ConjuntoTabla->fields->mupreva594 	='notesLocation';
					$ConjuntoTabla->fields->mupreva1551 =array( 'lg-vlca' => 'VALquestion',
																'lg-spa' => 'CASquestion');
					$ConjuntoTabla->fields->mupreva1552 =array( 'lg-vlca' => 'VALanswer',
																'lg-spa' => 'CASanswer');

				$ConjuntoTabla->relatedSets = new stdClass();
					$ConjuntoTabla->relatedSets->mupreva587	=array('conjuntPortalPublicacions'=>'IDpublicacio');


		# DATABASES ******************************************************************************************


			# TESAUROS DATABASE
			$Tesauros = new stdClass();
				# Add table
				#$Tesauros->Location 			= $Location;
				$Tesauros->Group 				= $Group;
				$Tesauros->Object 				= $Object;
				$Tesauros->Period 				= $Period;
				$Tesauros->Material 			= $Material;
				$Tesauros->Technic 				= $Technic;
				$Tesauros->Conservation 		= $Conservation;
				$Tesauros->FindType 			= $FindType;
				$Tesauros->Acquisition 			= $Acquisition;
				$Tesauros->ProductionType 		= $ProductionType;
				$Tesauros->ProductionPlace 		= $ProductionPlace;
				$Tesauros->Place 				= $Place;
				$Tesauros->DisambiguationRel 	= $PlaceDisambiguation;
				$Tesauros->Authority 			= $Authority;
				$Tesauros->Certainty 			= $Certainty;
				$Tesauros->Authenticity 		= $Authenticity;
				$Tesauros->Language 			= $Language;
				$Tesauros->Category 			= $Category;
				$Tesauros->Biodata 				= $Biodata;
				$Tesauros->Themes 				= $Themes;
				$Tesauros->Class 				= $Class;

			# DIGITAL DATABASE	
			$Digital = new stdClass();
				$Digital->Digital 				= $DigitalGaleria;
				$Digital->DigitalItems 			= $DigitalItems;

			# DIAPOSITIVAS DATABASE	
			$Diapositives = new stdClass();
				$Diapositives->Diapositives 	= $DiapositivasGaleria;
				$Diapositives->DiapositivesItems= $DiapositivasItems;

			# NEGATIVOS DATABASE	
			$Negatius = new stdClass();
				$Negatius->Negatius 			= $NegativosGaleria;
				$Negatius->NegatiusItems		= $NegativosItems;


			# PERSONES DATABASE	
			$Persones = new stdClass();
				$Persones->Persones 			= $PersonesTable;
				$Persones->PersonesRole 		= $PersonesRole;
				$Persones->Job 					= $Job;

			# ENTITATS DATABASE	
			$Entitats = new stdClass();
				$Entitats->Entitats 			= $EntitatsTable;
				$Entitats->EntitatsRole 		= $EntitatsRole;

			# PUBLICACIONES 
			$Publicacions = new stdClass();
				$Publicacions->Publicacions 	= $PublicacionsTable;
				$Publicacions->SeriePublicacio	= $PublicacionsSeries;

			# ESPACIOS 
			$Espais = new stdClass();
				$Espais->Espais 				= $EspaisTable;

			# RESTAURACION 
			$Restauracio = new stdClass();
				$Restauracio->Restauracio 		= $RestauracionTable;
				$Restauracio->Process 			= $RestauracionProcesos;

			# YACIMIENTOS 
			$Jaciments = new stdClass();
				$Jaciments->Site 				= $YacimientosTable;
				$Jaciments->Context				= $ContextosTable;

			# EXPOSICIONES 
			$Exposicions = new stdClass();
				$Exposicions->Exposicions					= $ExposicionesTable;
				$Exposicions->ExposicionsCicle				= $CiclosExposicionesTable;
				$Exposicions->exposicionsPortalCalendari	= $EspaciosExposiciones;

			# ACTIVIDADES 
			$Activitats = new stdClass();
				$Activitats->Activitats					= $ActividadesTable;
				$Activitats->activitatsPortalCalendari	= $EspaciosActividades;
				$Activitats->ActivitatsPublic			= $PublicosActividades;
			
			# ESCAVACIONES 
			$Excavacions = new stdClass();
				$Excavacions->Excavacions 				= $ExcavacionesTable;

			# RUTA 
			$Ruta = new stdClass();
				$Ruta->Ruta 							= $RutaIbericaTable;

			# AUDIO 
			$Audio = new stdClass();
				$Audio->Audio 							= $AudioGaleria;
				$Audio->AudioContents					= $AudioTemas;
				$Audio->AudioItems						= $AudioItem;

			# VÍDEO 
			$Video = new stdClass();
				$Video->Video 							= $VideoGaleria;
				$Video->VideoContents					= $VideoTipo;
				$Video->MasterOriginal					= $VideoMaster;
				$Video->VideoItems						= $VideoItem;
			
			# EPHEMERA 
			$Ephemera = new stdClass();
				$Ephemera->Ephemera 					= $EphemeraGaleria;
				$Ephemera->EphemeraItems 				= $EphemeraItem;
				$Ephemera->EphemeraType 				= $EphemeraTipo;
				$Ephemera->EphemeraFormat 				= $EphemeraFormato;

			# EPHEMERA 
			$Cataleg = new stdClass();
				$Cataleg->Cataleg 						= $CatalogoTabla;
				$Cataleg->Conjunt 						= $ConjuntoTabla;


			# Map object (Add databases here as $this->tables_map->database_name = (object)$database_name )
			$this->tables_map = new stdClass();
				# Add database
				$this->tables_map->Tesauros 	= $Tesauros;
				$this->tables_map->Digital 		= $Digital;
				$this->tables_map->Diapositives = $Diapositives;
				$this->tables_map->Negatius 	= $Negatius;
				$this->tables_map->Persones 	= $Persones;
				$this->tables_map->Entitats 	= $Entitats;
				$this->tables_map->Publicacions = $Publicacions;
				$this->tables_map->Espais 		= $Espais;
				$this->tables_map->Restauracio 	= $Restauracio;
				$this->tables_map->Jaciments 	= $Jaciments;
				$this->tables_map->Exposicions 	= $Exposicions;
				$this->tables_map->Activitats 	= $Activitats;
				$this->tables_map->Excavacions 	= $Excavacions;
				$this->tables_map->Ruta 		= $Ruta;
				$this->tables_map->Audio 		= $Audio;
				$this->tables_map->Video 		= $Video;
				$this->tables_map->Ephemera 	= $Ephemera;
				$this->tables_map->Cataleg 		= $Cataleg;
				#dump($this->tables_map ,'tablas');


		/*
		# PORTALIZE MAP SET
		$this->portalize = new stdClass();
			$this->portalize->IDsite 		= array('host_section'  => 'mupreva500', // Yacimientos
													'Digital'		=> 'mupreva517', // Digital portal	
													);
			 rellenar con los datos correctos
			$this->portalize->IDconjunt 	= array('host_section'  => 'mupreva494', // Conjunto
													'Digital'		=> 'mupreva598', // Digital portal
													);
			$this->portalize->IDexposicio 	= array('host_section'  => 'mupreva86', // Exposiciones
													'Digital'		=> 'mupreva567', // Digital portal
													);
			$this->portalize->IDactivitat 	= array('host_section'  => 'mupreva70', // Actividades
													'Digital'		=> 'mupreva604', // Digital portal
													);
			$this->portalize->IDespai  	= array('host_section'  => 'mupreva290', // Ubicación
													'Digital'		=> 'mupreva606', // Digital portal
													);
			$this->portalize->IDcategory  	= array('host_section'  => 'mupreva432', // Categoría
													'Digital'		=> 'mupreva608', // Digital portal
													);
			$this->portalize->IDcontext   	= array('host_section'  => 'mupreva530', // Contextos (áreas del yacimiento)
													'Digital'		=> 'mupreva550', // Digital portal
													);
			*/





?>