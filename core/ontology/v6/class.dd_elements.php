<?php
/**
* DD_ELEMENTS
* Render thesaurus HTML elements
*
*/
class dd_elements {



	/**********************************************************************
	*	CREACION DE BOTONES
	***********************************************************************/



	/**
	* MAKETSLINE. CREA LINEA DE TESAURO CON ICONOS Y TÉRMINO
	*/
	protected function makeTSline(	string $terminoID,
									?string $termino,
									string $parent,
									string $children,
									string $def,
									string $obs,
									int $hijosD,
									int $hijosND,
									int $nIndexaciones,
									int $ncaptaciones,
									int $nordenV,
									$resalte, // bool|int
									?string $modelo,
									?string $propiedades,
									$properties, // null|object|array
									?string $traducible,
									?string $norden) : string {

		# Linea de iconos y término
		#print("terminoID $terminoID,termino $termino,parent $parent,children $children,def $def,obs $obs,hijosD $hijosD,hijosND $hijosND,ncaptaciones $ncaptaciones,nordenV $nordenV,resalte $resalte,modo $modo ,usableIndex $usableIndex <hr>");

		$html = '<div id="divTsIcons'.$terminoID.'" '.$resalte.' class="divTS">';

			# Render Buttons
			if($this->modo==='tesauro_edit' || $this->modo==='modelo_edit') {

				// if( substr($terminoID, 0,2)==='dd' && DEDALO_DATABASE_CONN!=='dedalo4_master' && DEDALO_DATABASE_CONN!=='dedalo_development' ) {
				//	No buttons are showed
				// }else{
					# Añadir hijo BtnMas
					$html .= $this->renderBtnMas($terminoID, $hijosD, $parent);
					# Borrar termino BtnBorrar
					$html .= $this->renderBtnBorrar($terminoID, $children, $ncaptaciones, $parent, urlencode($termino) );
					# Editar N de Orden BtnNorden
					$html .= $this->renderBtnNorden($terminoID, $parent, $nordenV, $termino, $norden);
					# Editar termino
					$html .= $this->renderBtnEditTermino($terminoID);
				// }
			}
			elseif($this->modo==='tesauro_rel') {
				# Relacionar e Indexar
				#if($usableIndex==='si') {

					if($this->type==='lenguaje') {
						# new languaje in ts_edit and capt edit and jer edit
						$html .= $this->renderBtn_newLang($terminoID);
					}else{
						# terminos relacionados (ts_edit) y indexacion
						$html .= $this->renderBtnAddIndexacion($terminoID, $termino);
					}
				#}
			}


			# Mostrar texto del término
			$html .= $this->renderTextTermino($terminoID,$termino,$parent,$resalte);

			if($traducible==='no') {
				$html .= ' <em>(no trad.)</em>';
			}

			# BUTTON DESPLEGAR TERMINOS RELACIONADOS BtnTR
			$ar_terminos_relacionados = RecordObj_dd_edit::get_ar_terminos_relacionados($terminoID);
			if(count($ar_terminos_relacionados)>0) $html .= $this->renderBtnTR($terminoID);

			# DESPLEGAR DEFINICIÓN BtnInfo
			if(!empty($def)) $html .= $this->renderBtnInfo($terminoID);
			# DESPLEGAR OBSERVACIONES DE USO BtnObs
			if(!empty($obs)) $html .= $this->renderBtnObs($terminoID);
			# DESPLEGAR OBSERVACIONES DE USO BtnObs
			if( !empty($propiedades) ) $html .= $this->renderBtn_propiedades($terminoID,$propiedades);
			// button show properties
			if( !empty($properties) ) $html .= $this->renderBtn_properties($terminoID,$properties);
			# DESPLEGAR NO DESCRIPTORES BtnND
			#if($hijosND >0) $html .= $this->renderBtnND($terminoID);

			# INDEXATIONS : DESPLEGAR INDEXACIONES QUE USAN ESTE termino BtnU
			#if($nIndexaciones >0) $html .= $this->renderBtnU($terminoID,$termino,$nIndexaciones);

			// render_button_duplicate
			$html .= $this->render_button_duplicate($terminoID);

			# MODELO
			if(!empty($modelo) && trim($modelo)!='' && $this->esmodelo!='si') {
				#dump($modelo,"modelo");
				$modelo_name = RecordObj_dd_edit::get_termino_by_tipo($modelo);
				$html .= $this->renderBtnM($terminoID,$modelo,$modelo_name);
			}

			# DESPLEGAR HIJOS BtnFlecha
			#if($hijosD >0) $html .= $this->renderBtnFlecha($terminoID, $children, $desplegado);
			if($hijosD >0) $html .= $this->renderBtnFlecha($terminoID, $children, 0, $parent); // $terminoID, $children=0, $desplegado=0, $parent

		$html .= '</div>';// divTsIcons


			# Render Divs desplegables
			if(count($ar_terminos_relacionados)>0)	$html .= $this->renderDivTR($terminoID); #die('6');
			if(!empty($def))						$html .= $this->renderDivDescripcion($terminoID,$def);
			if(!empty($obs))						$html .= $this->renderDivObservaciones($terminoID,$obs);
			if(!empty($propiedades))				$html .= $this->renderDiv_propiedades($terminoID,$propiedades);
			if(!empty($properties))					$html .= $this->renderDiv_properties($terminoID,$properties);
			#$html .= $this->renderDivND($terminoID,$hijosND);
			#$html .= $this->renderDivCintas($terminoID);

		return $html ;
	}//end makeTSline



	/**
	* RENDERBTNMAS. crea el botón Mas (añádir termino hijo)
	* @param string $terminoID
	* @param string|null $hijosD
	* @param string $parent
	* @return string $node
	*/
	protected static function renderBtnMas(string $terminoID, ?string $hijosD, $parent) : string {
		global $anyadir_hijo_al_descriptor_title;

		$node  = '';
		$node .= ' <div class="bullet_mas" title="'.$anyadir_hijo_al_descriptor_title.'" ';
		$node .= 'onmousedown="dd.insertTS(\''.$terminoID.'\',\''.$hijosD.'\',\''.$parent.'\')" ';
		$node .= '></div>';

		return $node;
	}//end renderBtnMas



	/**
	* RENDERBTNBORRAR. Crea el botón de borrado. Necesita el número de hijos y de indexaciones
	*/
	protected static function renderBtnBorrar(string $terminoID, string $children, $nIndexaciones, $parent, string $termino) : string {
		global $eliminar_este_descriptor_title;

		$obj  = '';
		$obj .= ' <div class="icon_delete " title="'.$eliminar_este_descriptor_title.'" ';
		$obj .= "onmousedown=\"dd.delete_term('divCont$terminoID','$terminoID','$children','$nIndexaciones','$parent','$termino')\" ";
		$obj .= '></div>';

		return $obj ;
	}//end renderBtnBorrar



	/**
	* RENDERBTNNORDEN. crea icono y enlace de Número de Orden
	*/
	protected static function renderBtnNorden(string $terminoID, $parent, $nordenV, string $termino, $norden) : string {
		global $orden_title ;
		global $mostrarNorden ;

		$termino = addslashes($termino);

		$obj = '';

		$mostrarNorden = 1; // force always
		if($mostrarNorden===1)
		{
			$obj .= '<span class="nOrden" title="N. '.$orden_title.' : '.$nordenV.'">';
			$obj .= "<a href=\"javascript:;\" onmousedown=\"dd.cambiar_n_orden('$nordenV','$terminoID','$parent','$termino');\">";
			$obj .= $nordenV;
			if ((int)$nordenV!==(int)$norden) {
				$obj .= ' <span style="color:red">['.$norden.']</span>';
			}else{
				$obj .= ' ['.$norden.']';
			}
			$obj .= '</a>';
			$obj .= '</span>';
		}

        return $obj ;
	}//end renderBtnNorden



	/**
	* RENDERBTNEDITTERMINO. crea el botón de editar
	*/
	protected static function renderBtnEditTermino(string $terminoID) : string {
		global $editar_title;

		$obj = '';

		$obj .= '<div class="icon_edit " title="'.$editar_title.'" ';
		$obj .= "onclick=\"dd.openTSedit('$terminoID');\" ";
		$obj .= '></div>';

		return $obj ;
	}//end renderBtnEditTermino


	/**
	* RENDERBTNADDINDEXACION.
	* Crea el botón de añadir indexación en modo index o el de relacionar los términos en modo ts edit
	* @param string $terminoID
	* @param string $termino
	* @return string $node
	*/
	protected static function renderBtnAddIndexacion(string $terminoID, string $termino) : string {
		global $anyadir_title, $asociar_descriptor_title;

		$node = '';
		$node .= " <div class=\"add_index_btn \" data-termino_id=\"$terminoID\" data-termino=\"$termino\" title=\"$asociar_descriptor_title $terminoID\" ";
		$node .= "onmousedown=\"dd.add_index_common(this)\" ";
		$node .= '></div>';

		return $node;
	}//end renderBtnAddIndexacion



	/**
	* RENDERBTN_NEWLANG. crea el botón de añadir lenguaje en ts edit
	*/
	protected static function renderBtn_newLang(string $terminoID) : string {
		global $anyadir_title, $idioma_title;

		$button_html = '';

		$button_html .= " <div class=\"add_index_btn \" title=\"$anyadir_title $idioma_title [$terminoID]\" ";
		$button_html .= "onmousedown=\"window.opener.newLang('$terminoID');\" ";
		$button_html .= '></div>';

		return $button_html ;
	}//end renderBtn_newLang



	/**
	* RENDERTEXTTERMINO. crea el texto del termino
	*/
	protected function renderTextTermino(string $terminoID,string $termino, $parent, int $resalte=0) : string {
		global $editar_title ;

		$html = '';

		# RESALTE
		if($resalte===1)	{
			$html .= ' <div id="textoTermino_'.$terminoID.'" class="textoTermino resalte">';
		}else{
			$html .= ' <div id="textoTermino_'.$terminoID.'" class="textoTermino">';
		}

		if(isset($this->ts_lang)) {
			$html .= ' <span class="notas">';
			$html .= '['.$this->ts_lang.'] ';
			$html .= '</span>';
		}

		// if( substr($terminoID, 0,2)==='dd' && DEDALO_DATABASE_CONN!='dedalo_master_v5' ) {
		// 	$html .= "\n <span class=\"termino_text\" alt=\"$terminoID\" >";
		// }else{
			$html .= PHP_EOL . ' <span class="termino_text" alt="'.$terminoID.'" ondblclick="dd.edit_inline(this)">';
		// }
		$html .= $termino;
		$html .= '</span>';

		# Si se llega a través de un NO descriptor, notificaremos el hecho, notando el termino por el cúál hemos llegado aquí
		/*
		* Pendiente: Búsqueda de NO descriptores y remarcado de los mismos en el resultado (como en la párte pública)
		*/
		#if($this->noDescripor && $terminoID===$this->terminoIDactual) $obj .= " <span id=\"notaND\">(per $this->noDescripor)</span> ";
		$html .= ' <span class="terminoIDinList" alt="'.$terminoID.'"> ['.$terminoID.']</span>';

		$html .= '</div>';

		return $html ;
	}//end renderTextTermino



	/**
	* RENDERBTNTR. crea el botón Mostrar TR términos relacionados
	*/
	protected static function renderBtnTR(string $terminoID) : string {
		global $mostrar_temas_relacionados_title ;

		$obj		= '';
		$divDestino	= 'tr'.$terminoID;
		$obj		.= '<div class="tesauro_button_show_tr" data-tipo="'.$divDestino.'" title="'.$mostrar_temas_relacionados_title.'" ';
		$obj		.= "onmousedown=\"multiToogle('$divDestino','block','none');\" ";
		$obj		.= '></div>';

		return $obj ;
	}//end renderBtnTR



	/**
	* RENDERBTNINFO. crea el botón info si hay definición o Info
	*/
	protected function renderBtnInfo(string $terminoID) : string {
		global $mostrar_definicion_title ;

		$obj 		= '';
		$divDestino = 'def'.$terminoID;
		if($terminoID)
		{
			$obj .= ' <div class="icon-mostrar-def" title="'.$mostrar_definicion_title.'" ';
			$obj .= "onmousedown=\"multiToogle('$divDestino','block','none');\"";
			$obj .= '></div>';
		}

		return $obj ;
	}//end renderBtnInfo



	/**
	* RENDERBTNOBS crea el botón O si hay observaciones
	*/
	protected static function renderBtnObs(string $terminoID) : string {
		global $mostrar_title ;
		global $observaciones_title;

		$obj 		= '';
		$divDestino = 'obs'.$terminoID;
		if($terminoID)
		{
			$obj .= " <div class=\"mostrar-obs\" title=\"$mostrar_title $observaciones_title\" ";
			$obj .= "onmousedown=\"multiToogle('$divDestino','block','none');\" ";
			$obj .= '></div>';
		}

		return $obj ;
	}//end renderBtnObs



	/**
	* RENDERBTN_PROPIEDADES. crea el botón P si hay propiedades
	*/
	protected static function renderBtn_propiedades(string $terminoID, ?string $propiedades=null) : string {
		global $mostrar_title ;
		global $propiedades_title;

		$add_class	='';
		$ob			= !is_null($propiedades) ? json_decode($propiedades) : null;
		if($ob===null) {
			// $ob is null because the json cannot be decoded
			$add_class = 'json_bad_alert';
		}

		$obj_html	= '';#"\n <!-- Btn Mostrar propiedades -->";
		$divDestino	= 'propiedades_'.$terminoID;
		if($terminoID) {
			#$obj_html .= "\n <div class=\"mostrar-obs\" title=\"$mostrar_title $propiedades_title\" ";
			#$obj_html .= "onclick=\"multiToogle('$divDestino','block','none');\" ";
			#$obj_html .= "></div>";
			$obj_html 	 .= ' <div class="cuadroU btn_propiedades '.$add_class.'" title="'.$mostrar_title.' '.$propiedades_title.'" onmousedown="multiToogle(\''.$divDestino.'\',\'block\',\'none\')"> P </div>';
		}
		return $obj_html ;
	}//end renderBtn_propiedades



	/**
	* RENDERBTN_PROPERTIES crea el botón P si hay properties
	*/
	protected static function renderBtn_properties(string $terminoID, $properties) : string {
		global $mostrar_title;
		global $properties_title;

		$divDestino = 'properties_'.$terminoID;
		$obj_html = '<div class="cuadroU btn_properties" title="'.$mostrar_title.'" onmousedown="multiToogle(\''.$divDestino.'\',\'block\',\'none\')"> P </div>';

		return $obj_html;
	}//end renderBtn_properties



	/**
	* RENDERBTNND. crea el botón Mostrar ND no descriptores
	*/
	protected static function renderBtnND(string $terminoID) : string {
		global $mostrar_NO_descriptors_title ;

		$obj = '';
		$obj .= " <div class=\"mostrar-nd\" title=\"$mostrar_NO_descriptors_title\" ";
		$obj .= "onmousedown=\"multiToogle('nd$terminoID','block','none');\" ";
		$obj .= '></div>';

		return $obj ;
	}//end renderBtnND



	/**
	* RENDERBTNU. Crea el botón Mostrar U usado por (Si este termino tiene indexaciones, se mostrará este botón)
	*/
	protected static function renderBtnU(string $terminoID, string $termino, $nIndexaciones) : string {
		$html 	 = '';
		$termino = urlencode($termino);
		$html 	 .= " <div class=\"cuadroU\" onmousedown=\"dd.show_indexations('$terminoID','$termino');\">U:$nIndexaciones</div>";

		return $html ;
	}//end renderBtnU



	/**
	* RENDERBTNM. crea el botón Mostrar Modelo (tipo Provincia...)
	*/
	protected static function renderBtnM(string $terminoID, string $modelo, string $modelo_name) : string {

		global $mostrar_title ;
		global $modelo_title ;

		$obj = '';
		$obj .= ' <div class="mostrar-modelo" title="'.$mostrar_title.' '.$modelo_title.'" ';
		$obj .= 'onmousedown="$(\'#m_'.$terminoID.'\').toggle()"';
		$obj .= '></div>';

		$obj .= ' <span id="m_'.$terminoID.'" class="btnModelo">';

		$obj .= $modelo_name ;
		#$obj .= Tesauro::modelo2text($modelo) ;
		$obj .= '</span>';

		return $obj ;
	}//end renderBtnM



	/**
	* RENDER_BUTTON_DUPLICATE
	*/
	protected static function render_button_duplicate(string $terminoID) : string {

		$obj = '';
		$obj .= ' <div class="duplicate" title="Duplicate $terminoID" ';
		$obj .= 'onmousedown="dd.duplicate(\''.$terminoID.'\')"';
		$obj .= '>+</div>';


		return $obj ;
	}//end render_button_duplicate



	/**
	* RENDERBTNFLECHA. Crea el botón Flecha Mostrar u ocultar hijos
	*/
	protected static function renderBtnFlecha(string $terminoID, $children=0, $desplegado=0, $parent=null) : string {
		global $mostrar_hijos_title, $ocultar_hijos_title ;

		$obj = '';
		if($children >0)
		{
			$obj .= '<div onmousedown="dd.ToggleTS(\''.$terminoID.'\',\'abrir\',null,\''.$parent.'\')" class="divflechaC">';
			if($desplegado===1)
			{
				$displayFlechaDer 	= 'none';
				$displayFlechaDown 	= 'block';
			}else{
				$displayFlechaDer	= 'block';
				$displayFlechaDown	= 'none';
			}
			$obj .= '<img id="fopen'.$terminoID.'" src="images/flecha_der.gif" style="display:'.$displayFlechaDer.'" title="'.$mostrar_hijos_title.' '.$terminoID.'"/>';
			$obj .= '<img id="fclose'.$terminoID.'" src="images/flecha_down.gif" style="display:'.$displayFlechaDown.'" title="'.$ocultar_hijos_title.'"/>';
			$obj .= '</div>';
		}else{
			$obj .= '<div class="divflechaC"></div>';
		}

		return $obj;
	}//end renderBtnFlecha


	/**********************************************************************
	***********************************************************************
	*	DIVS DE CONTENIDOS DESPLEGABLES (Descripción, observaciones, etc..)
	***********************************************************************
	***********************************************************************/



	/**
	* GET_HTML_LISTADOTR. Genera el listado de términos relacionados con este terminoID
	*/
	protected static function get_html_listadoTR(string $terminoID) : string {

		global $ir_al_termino_relacionado_title, $editar_title  ;
		$html  = '' ;

		#$arrayTR = self::terminosRelacionados($terminoID);
		$ar_terminos_relacionados = (array)RecordObj_dd_edit::get_ar_terminos_relacionados($terminoID);
			#dump($ar_terminos_relacionados,'ar_terminos_relacionados '.$terminoID);

		$html .= "<ul class=\"tesauro_tr_sortable\" id=\"tesauro_tr_sortable_{$terminoID}\" data-termino_id=\"$terminoID\">";
		foreach($ar_terminos_relacionados as $key => $ar_tr) {

			foreach( (array)$ar_tr as $modeloID => $terminoID) {

				$termino 	 = RecordObj_dd_edit::get_termino_by_tipo($terminoID);
				// $modelo_text = RecordObj_dd_edit::get_modelo_name_by_tipo($terminoID); # NO usar el guardado porque puede haberse cambiado en el tiempo (solucionar posibles inconsistencias)
				$modelo_text = RecordObj_dd_edit::get_legacy_model_name_by_tipo($terminoID);

				$html .= "<li class=\"\" data-tipo=\"$terminoID\" data-modelo=\"$modeloID\">";	#<span class="ui-icon ui-icon-arrowthick-2-n-s"></span>Item 1</li>
				#$html .= "<li class=\"\" data-tipo=\"$terminoID\">";

				#$html .= "<span class=\"nOrden\" style=\"margin-left:20px\"> ". intval($key+1) ." </span> ";
				$html .= " [TR] $termino ";
				$html .= "<span class=\"terminoIDinList\"> [".$terminoID."] ";
				$html .= "<div class=\"add_index_btn\" title=\"$ir_al_termino_relacionado_title\" ";
				#$html .= "<img src=\"../images/icon_go1.png\" title=\"$ir_al_termino_relacionado_title\" class=\"btnGo1\" ";
				$html .= "onclick=\"dd.go2termino('$terminoID');\" ";
				$html .= "></div>";
				$html .= " <span class=\"listado_tr_modelo_text\">$modelo_text</span> ";
				$html .= "</span>";

				$html .= "</li>";
			}
			#$html .= "<br>";

			/*
			<ul id="sortable">
			  <li class="ui-state-default"><span class="ui-icon ui-icon-arrowthick-2-n-s"></span>Item 1</li>
			  <li class="ui-state-default"><span class="ui-icon ui-icon-arrowthick-2-n-s"></span>Item 2</li>
			  <li class="ui-state-default"><span class="ui-icon ui-icon-arrowthick-2-n-s"></span>Item 3</li>
			  <li class="ui-state-default"><span class="ui-icon ui-icon-arrowthick-2-n-s"></span>Item 4</li>
			  <li class="ui-state-default"><span class="ui-icon ui-icon-arrowthick-2-n-s"></span>Item 5</li>
			  <li class="ui-state-default"><span class="ui-icon ui-icon-arrowthick-2-n-s"></span>Item 6</li>
			  <li class="ui-state-default"><span class="ui-icon ui-icon-arrowthick-2-n-s"></span>Item 7</li>
			</ul>
			*/
		}
		$html .= '</ul>';

		return $html ;
	}//end get_html_listadoTR



	/**
	* RENDERDIVTR. crea el div de los términos relacionados.
	* Previamente se habrá verificado que los hay.
	*/
	protected static function renderDivTR(string $terminoID) : string {

		$obj = '<div id="tr'.$terminoID.'" class="divLineasInfo none tr_div">';

		$obj .= self::get_html_listadoTR($terminoID);

		$obj .= '</div>';

		return $obj ;
	}//end renderDivTR



	/**
	* RENDERDIVDESCRIPCION. crea el div de la descripcion
	*/
	protected static function renderDivDescripcion(string $terminoID, string $def) : string {
		$obj  = '';
		$obj .= '<div id="def'.$terminoID.'" class="divLineasInfo none">';
		$obj .= '[ I ] ';
		$obj .= "$def "; if($def==='') $obj .= ' definició n/d ';
		$obj .= '</div>';

		return $obj ;
	}//end renderDivDescripcion



	/**
	* RENDERDIVOBSERVACIONES. crea el div de las observaciones
	*/
	protected static function renderDivObservaciones(string $terminoID, string $obs) : string {
		$obj  = '';
		$obj .= '<div id="obs'.$terminoID.'" class="divLineasInfo none">';
		$obj .= '[ O ] ';
		$obj .= "$obs "; if(!$obs || $obs==='') $obs .= ' obs n/d ';
		$obj .= '</div>';

		return $obj ;
	}//end renderDivObservaciones



	/**
	* RENDERDIV_PROPIEDADES. crea el div de las propiedades
	*/
	protected static function renderDiv_propiedades(string $terminoID, ?string $propiedades=null) {

		$add_class='';

		// check JSON valid
			if (!empty($propiedades)) {
				if(!$ob = json_decode($propiedades)) {
					// $ob is null because the json cannot be decoded
					$add_class = 'json_bad_alert';
				}
				$propiedades = json_encode($ob, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
			}

		$obj_html  = '';
		$obj_html .= '<div id="propiedades_'.$terminoID.'" class="divLineasInfo div_propiedades none '.$add_class.'">';
		#$obj_html .= "[ P ] ";
		#if (empty($propiedades)) {
		#	$obj_html .= ' propiedades n/d ' ;
		#}else{
			#$p = json_encode($propiedades);
			#$propiedades = json_encode($propiedades, JSON_PRETTY_PRINT);
			$obj_html .= '<pre>'.$propiedades.'</pre>';
		#}
		$obj_html .= '</div>';

		return $obj_html ;
	}//end renderDiv_propiedades



	/**
	* RENDERDIV_PROPERTIES
	* crea el div de las properties
	*/
	protected static function renderDiv_properties(string $terminoID, $properties) : string {
		$add_class='';

		$properties_text = !empty($properties)
			? json_encode($properties, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
			: '';

		$obj_html = '<div id="properties_'.$terminoID.'" class="divLineasInfo div_properties none $add_class">';

		// properties
		$obj_html .= '<pre>'.$properties_text.'</pre>';

		$obj_html .= '</div>';

		return $obj_html;
	}//end renderDiv_properties



	/**
	* LISTADOND. Genera el listado de NO Descriptores
	*/
	protected function listadoND(string $terminoID) : string {
		// global $editar_title;

		$html = '' ;

		$RecordObj_dd			= new RecordObj_dd_edit($terminoID);
		$ar_childrens_of_this	= $RecordObj_dd->get_ar_childrens_of_this($esdecriptor='no');

		if(is_array($ar_childrens_of_this) && count($ar_childrens_of_this)>0) foreach($ar_childrens_of_this as $current_terminoID) {

			$terminoND = RecordObj_dd_edit::get_termino_by_tipo($current_terminoID,false);

			if($this->modo==='tesauro_edit') {

				$RecordObj_dd2	= new RecordObj_dd_edit($current_terminoID);
				$parent			= $RecordObj_dd2->get_parent();
				$html .= $this->renderBtnBorrar($current_terminoID, $children=0, $nIndexaciones=0, $parent, $terminoND);
				$html .= $this->renderBtnEditTermino($current_terminoID,$parent);
			}

			$html .= ' [ND] ';
			#$html .= "<a href=\"javascript:dd.openTSedit('$tsNDID','$parent')\"  title=\"$editar_title\" >";
			$html .= '<em class="terminoIDinList">'.$terminoND.'</em>';
			#$html .= "</a>";
			$html .= "<span class=\"terminoIDinList\"> [$current_terminoID] </span><br>";
			$html .= "<div id=\"divCont$current_terminoID\" class=\"inline\"></div>";
		}


		return $html ;
	}//end listadoND



	/**
	* RENDERDIVND. crea el div de NO descriptores
	*/
	protected function renderDivND(string$terminoID, $hijosND) : string {

		$obj  = '';
		$obj .= '<div id="nd'.$terminoID.'" class="divLineasInfo none">';
		$obj .= $this->listadoND($terminoID);
		$obj .= '</div>';

		return $obj ;
	}//end renderDivND



	/**
	* RENDERDIVCINTAS. crea el div de las cintas donde se usa este término
	*/
	protected static function renderDivCintas(string $terminoID) : string {

		$obj  = '';
		$obj .= '<div id=\"u'.$terminoID.'" class="divCintas"><!-- ajax content load by function cargarCintas2 --></div>';

		return $obj ;
	}//end renderDivCintas



}//end dd_elements class
