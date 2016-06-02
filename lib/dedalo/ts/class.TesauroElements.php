<?php

class TesauroElements {

	/**********************************************************************
	*	CREACION DE BOTONES
	***********************************************************************/

	/*
	* CREA LINEA DE TESAURO CON ICONOS Y TÉRMINO
	*/
	protected function makeTSline($terminoID,$termino,$parent,$children,$def,$obs,$hijosD,$hijosND,$nIndexaciones,$ncaptaciones,$nordenV,$resalte,$modelo,$usableIndex,$traducible,$visible) {

		# Linea de iconos y término
		#print("terminoID $terminoID,termino $termino,parent $parent,children $children,def $def,obs $obs,hijosD $hijosD,hijosND $hijosND,ncaptaciones $ncaptaciones,nordenV $nordenV,resalte $resalte,modo $modo ,usableIndex $usableIndex <hr>");

		$html = "\n\n<div id=\"divTsIcons$terminoID\" $resalte class=\"divTS\">";

			# Render Buttons

			#print("modo:".$this->modo);

			if($this->modo=='tesauro_edit' || $this->modo=='modelo_edit') {

				if( substr($terminoID, 0,2)=='dd' && DEDALO_DATABASE_CONN!='dedalo4_development' ) {
					# No buttons are showed
				}else{

					# Añadir hijo BtnMas
					$html .= $this->renderBtnMas($terminoID);
					# Borrar termino BtnBorrar
					$html .= $this->renderBtnBorrar($terminoID, $children, $ncaptaciones, $parent, urlencode($termino) );
					# Editar N de Orden BtnNorden
					$html .= $this->renderBtnNorden($terminoID, $parent, $nordenV, $termino);
					# Editar termino
					$html .= $this->renderBtnEditTermino($terminoID);
				}

			}

			if($this->modo=='tesauro_rel') {
				# Relacionar e Indexar
				if($usableIndex=='si') {

					if($this->type=='lenguaje') {
						# new languaje in ts_edit and capt edit and jer edit
						$html .= $this->renderBtn_newLang($terminoID);
					}else{
						# terminos relacionados (ts_edit) y indexacion
						$html .= $this->renderBtnAddIndexacion($terminoID, $termino);
					}
				}
			}

			if($this->type=='toponimia') {
				# Añadir hijo BtnMas
				$html .= $this->renderBtnMas($terminoID);
				# Borrar termino BtnBorrar
				if($parent!=$this->prefijo.'0') {
				$html .= $this->renderBtnBorrar($terminoID, $children, $ncaptaciones, $parent, urlencode($termino) );
				}
				# Editar N de Orden BtnNorden
				$html .= $this->renderBtnNorden($terminoID, $parent, $nordenV, $termino);
				# Editar termino
				$html .= $this->renderBtnEditTermino($terminoID,$parent);

				# Indexar topo
				#$html .= $this->renderBtnAddTopo($terminoID);
			}

			if($this->modo=='public') {
				# nada
			}

			# Mostrar texto del término
			$html .= $this->renderTextTermino($terminoID,$termino,$parent,$resalte,$visible);

			if($traducible=='no')
			$html .= " <em>(no traducible)</em>";


			# BUTTON DESPLEGAR TERMINOS RELACIONADOS BtnTR
			$ar_terminos_relacionados = RecordObj_ts::get_ar_terminos_relacionados($terminoID);
			if( count($ar_terminos_relacionados)>0 ) $html .= $this->renderBtnTR($terminoID);

			# DESPLEGAR DEFINICIÓN BtnInfo
			if($def && strlen(trim($def))>1) $html .= $this->renderBtnInfo($terminoID);
			# DESPLEGAR OBSERVACIONES DE USO BtnObs
			if($obs) $html .= $this->renderBtnObs($terminoID);
			# DESPLEGAR NO DESCRIPTORES BtnND
			if($hijosND >0) $html .= $this->renderBtnND($terminoID);

			# INDEXATIONS : DESPLEGAR INDEXACIONES QUE USAN ESTE termino BtnU
			if($nIndexaciones >0) $html .= $this->renderBtnU($terminoID,$termino,$nIndexaciones);

			# MODELO
			if(!empty($modelo) && trim($modelo)!='' && $this->esmodelo!='si') {
				#dump($modelo,"modelo");
				$modelo_name = RecordObj_ts::get_termino_by_tipo($modelo);
				$html .= $this->renderBtnM($terminoID,$modelo,$modelo_name);
			}
			# DESPLEGAR HIJOS BtnFlecha
			#if($hijosD >0) $html .= $this->renderBtnFlecha($terminoID, $children, $desplegado);
			if($hijosD >0) $html .= $this->renderBtnFlecha($terminoID, $children);

		$html .= "</div><!-- //divTsIcons$terminoID -->\n";// divTsIcons


			# Render Divs desplegables
			$html .= $this->renderDivTR($terminoID); #die('6');
			$html .= $this->renderDivDescripcion($terminoID,$def);
			$html .= $this->renderDivObservaciones($terminoID,$obs);
			$html .= $this->renderDivND($terminoID,$hijosND);
			$html .= $this->renderDivCintas($terminoID);

		return $html ;
	}


	/*
	crea el botón Mas (añádir termino hijo)
	*/
	public static function renderBtnMas($terminoID)
	{
		global $anyadir_hijo_al_descriptor_title ;

		$obj = "\n <!-- Btn Añadir hijo -->";
		$obj .= "\n <div class=\"bullet_mas \" title=\"$anyadir_hijo_al_descriptor_title\" ";
		$obj .= "onClick=\"ts.insertTS('$terminoID')\" ";
		$obj .= "></div>";

		return $obj ;
	}


	/*
	* crea el botón de borrado. Necesita el número de hijos y de indexaciones
	*/
	protected static function renderBtnBorrar($terminoID, $children, $nIndexaciones, $parent, $termino)
	{
		global $eliminar_este_descriptor_title ;

		$obj  = "\n <!-- Btn Borrar termino -->";
		$obj .= "\n <div class=\"icon_delete \" title=\"$eliminar_este_descriptor_title\" ";
		$obj .= "onClick=\"ts.delete_term('divCont$terminoID','$terminoID','$children','$nIndexaciones','$parent','$termino')\" ";
		$obj .= "></div>";

		return $obj ;
	}

	/*
	* crea icono y enlace de Número de Orden
	*/
	protected static function renderBtnNorden($terminoID, $parent, $nordenV, $termino )
	{
		global $orden_title ;
		global $mostrarNorden ;

		$termino = addslashes($termino);

		$obj = "\n <!-- Btn Mostrar N Orden -->";

		$mostrarNorden = 1;

		if($mostrarNorden==1)
		{
			$obj .= "\n <span class=\"nOrden\" title=\"N. $orden_title : $nordenV\">";
			$obj .= "<a href=\"javascript:;\" onclick=\"cambiarNorden('$nordenV','$terminoID','$parent','$termino');\">";
			$obj .= "$nordenV";
			$obj .= "</a>";
			$obj .= "</span>";
		}

        return $obj ;
	}

	/*
	crea el botón de editar
	*/
	protected static function renderBtnEditTermino($terminoID)
	{
		global $editar_title ;

		$obj = "\n <!-- Btn Editar termino -->";

		$obj .= "\n <div class=\"icon_edit \" title=\"$editar_title\" ";
		$obj .= "onclick=\"ts.openTSedit('$terminoID');\" ";
		$obj .= "></div>";

		return $obj ;
	}


	/*
	crea el botón de añadir indexación en modo index o el de relacionar los términos en modo ts edit
	*/
	protected static function renderBtnAddIndexacion($terminoID, $termino) {

		global $anyadir_title, $asociar_descriptor_title ;

		$obj = "\n<!-- Btn Añadir indexación con este termino -->";

		$obj .= "\n <div class=\"add_index_btn \" data-termino_id=\"$terminoID\" data-termino=\"$termino\" title=\"$asociar_descriptor_title $terminoID\" ";
		$obj .= "onclick=\"ts.add_index_common(this)\" ";
		$obj .= "></div>";

		return $obj ;
	}



	/*
	crea el botón de añadir lenguaje en ts edit
	*/
	protected static function renderBtn_newLang($terminoID)
	{
		global $anyadir_title, $idioma_title ;

		$button_html = "\n<!-- Btn Añadir lenguaje o idioma para este descriptor -->";

		$button_html .= "\n <div class=\"add_index_btn \" title=\"$anyadir_title $idioma_title [$terminoID]\" ";
		$button_html .= "onclick=\"window.opener.newLang('$terminoID');\" ";
		$button_html .= "></div>";

		return $button_html ;
	}

	/*
	crea el texto del termino
	*/
	protected function renderTextTermino($terminoID,$termino,$parent,$resalte=0,$visible='si') {

		global $editar_title ;

		$html = "\n <!-- Text Término -->";

		# RESALTE
		if($resalte==1)	{
			$html .= "\n <div id=\"textoTermino_{$terminoID}\" class=\"textoTermino resalte\">";
		}else{
			$html .= "\n <div id=\"textoTermino_{$terminoID}\" class=\"textoTermino\">";
		}

		if($this->ts_lang) {
			$html .= "\n <span class=\"notas\">";
			$html .= "[$this->ts_lang] ";
			$html .= "</span>";
		}
		$style_visible = $visible=='no' ? 'visible_no' : '';

		if( substr($terminoID, 0,2)=='dd' && DEDALO_DATABASE_CONN!='dedalo4_development' ) {
			$html .= "\n <span class=\"termino_text $style_visible\" alt=\"$terminoID\" >";
		}else{
			$html .= "\n <span class=\"termino_text $style_visible\" alt=\"$terminoID\" ondblclick=\"ts.edit_inline(this)\">";
		}
		$html .= $termino;
		$html .= "</span>";

		# Si se llega a través de un NO descriptor, notificaremos el hecho, notando el termino por el cúál hemos llegado aquí
		/*
		* Pendiente: Búsqueda de NO descriptores y remarcado de los mismos en el resultado (como en la párte pública)
		*/
		#if($this->noDescripor && $terminoID==$this->terminoIDactual) $obj .= " <span id=\"notaND\">(per $this->noDescripor)</span> ";
		$html .= "\n <span class=\"terminoIDinList\" alt=\"$terminoID\"> [$terminoID]</span>";

		$html .= "\n </div>";

		return $html ;
	}


	/*
	crea el botón Mostrar TR términos relacionados
	*/
	protected static function renderBtnTR($terminoID)
	{
		global $mostrar_temas_relacionados_title ;

		$obj 		= "\n<!-- Mostrar TR Términos relacionados -->\n";
		$divDestino = "tr$terminoID";
		$obj 		.= "<div class=\"tesauro_button_show_tr\" data-tipo=\"$divDestino\" title=\"$mostrar_temas_relacionados_title\" ";
		$obj 		.= "onclick=\"multiToogle('$divDestino','block','none');\" ";
		$obj 		.= "></div>";

		return $obj ;
	}

	/*
	crea el botón info si hay definición o Info
	*/
	protected function renderBtnInfo($terminoID)
	{
		global $mostrar_definicion_title ;

		$obj 		= "\n <!-- Btn Mostrar definicion  -->";
		$divDestino = "def$terminoID";
		if($terminoID)
		{
			$obj .= "\n <div class=\"icon-mostrar-def\" title=\"$mostrar_definicion_title\" ";
			$obj .= "onclick=\"multiToogle('$divDestino','block','none');\"";
			$obj .= "></div>";
		}

		return $obj ;
	}

	/*
	crea el botón O si hay observaciones
	*/
	protected static function renderBtnObs($terminoID)
	{
		global $mostrar_title ;
		global $observaciones_title;

		$obj 		= "\n <!-- Btn Mostrar observaciones -->";
		$divDestino = "obs$terminoID";
		if($terminoID)
		{
			$obj .= "\n <div class=\"mostrar-obs\" title=\"$mostrar_title $observaciones_title\" ";
			$obj .= "onclick=\"multiToogle('$divDestino','block','none');\" ";
			$obj .= "></div>";
		}

		return $obj ;
	}

	/*
	crea el botón Mostrar ND no descriptores
	*/
	protected static function renderBtnND($terminoID) {

		global $mostrar_NO_descriptors_title ;

		$obj = "\n <!-- Btn Mostrar No escriptores -->";
		$obj .= "\n <div class=\"mostrar-nd\" title=\"$mostrar_NO_descriptors_title\" ";
		$obj .= "onclick=\"multiToogle('nd$terminoID','block','none');\" ";
		$obj .= "></div>";

		return $obj ;
	}

	/**
	* RENDERBTNU : crea el botón Mostrar U usado por (Si este termino tiene indexaciones, se mostrará este botón)
	*/
	protected static function renderBtnU($terminoID,$termino,$nIndexaciones)
	{
		$html 	 = "\n <!-- Btn Mostrar usados -->";
		$title 	 = '';#label::get_label('');
		$termino = urlencode($termino);
		$html 	 .= "\n <div class=\"cuadroU\" title=\"$title\" onclick=\"ts.show_indexations(this, '$terminoID','$termino','$nIndexaciones');\">U:$nIndexaciones</div>";

		return $html ;
	}

	/*
	crea el botón Mostrar Modelo (tipo Provincia...)
	*/
	protected static function renderBtnM($terminoID,$modelo,$modelo_name) {

		global $mostrar_title ;
		global $modelo_title ;

		$obj = "\n <!-- Btn Mostrar modelo -->";
		$obj .= "\n <div class=\"mostrar-modelo\" title=\"$mostrar_title $modelo_title\" ";
		$obj .= "onclick=\"$('#m_$terminoID').toggle()\"";
		$obj .= "></div>";

		$obj .= "\n <span id=\"m_$terminoID\" class=\"btnModelo\">";	

		$obj .= $modelo_name ;
		#$obj .= Tesauro::modelo2text($modelo) ;
		$obj .= "</span>";

		return $obj ;
	}

	/*
	crea el botón Flecha Mostrar u ocultar hijos
	*/
	protected static function renderBtnFlecha($terminoID, $children=0, $desplegado=0) {

		#print("terminoID $terminoID, children $children, desplegado $desplegado ");

		global $mostrar_hijos_title ;
		global $ocultar_hijos_title ;

		$obj = "\n <!-- Btn Flecha Mostrar / Ocultar hijos -->";
		if($children >0)
		{
			$obj .= "\n <div onclick=\"ts.ToggleTS('$terminoID','abrir');\" class=\"divflechaC\" >\n";
			if($desplegado==1)
			{
				$displayFlechaDer 	= 'none';
				$displayFlechaDown 	= 'block';
			}else{
				$displayFlechaDer	= 'block';
				$displayFlechaDown	= 'none';
			}
			$obj .= "  <img id=\"fopen$terminoID\" src=\"../themes/default/flecha_der.gif\" style=\"display:$displayFlechaDer\" title=\"$mostrar_hijos_title $terminoID\" />";
			$obj .= "\n  <img id=\"fclose$terminoID\" src=\"../themes/default/flecha_down.gif\" style=\"display:$displayFlechaDown\" title=\"$ocultar_hijos_title\" />";
			$obj .= "\n </div>\n";
		}else{
			$obj .= "\n <div class=\"divflechaC\" ></div>";
		}

		return $obj ;
	}








	/**********************************************************************
	***********************************************************************
	*	DIVS DE CONTENIDOS DESPLEGABLES (Descripción, observaciones, etc..)
	***********************************************************************
	***********************************************************************/


	/*
	* GET_HTML_LISTADOTR
	* Genera el listado de términos relacionados con este terminoID
	*/
	protected static function get_html_listadoTR($terminoID) {

		global $ir_al_termino_relacionado_title, $editar_title  ;
		$html  = '' ;

		#$arrayTR = self::terminosRelacionados($terminoID);
		$ar_terminos_relacionados = RecordObj_ts::get_ar_terminos_relacionados($terminoID);
			#dump($ar_terminos_relacionados,'ar_terminos_relacionados '.$terminoID);

		$html .= "<ul class=\"tesauro_tr_sortable\" id=\"tesauro_tr_sortable_{$terminoID}\" data-termino_id=\"$terminoID\">";
		foreach((array)$ar_terminos_relacionados as $related_terminoID) {				

			if (is_array($related_terminoID)) {
				dump($related_terminoID, '$related_terminoID is not string ++ '.to_string($ar_terminos_relacionados));
				//throw new Exception("Error Processing Request", 1);
				continue;				
			}
			$modelo_name = RecordObj_ts::get_modelo_name_by_tipo($related_terminoID, true);
				#dump($modelo_name, ' $modelo_name ++ '.to_string());

			$html .= "<li class=\"\" data-tipo=\"$related_terminoID\">";

				$termino = RecordObj_ts::get_termino_by_tipo($related_terminoID);
				#$html .= "<span class=\"nOrden\" style=\"margin-left:20px\"> ". intval($key+1) ." </span> ";
				$html .= " [TR] $termino ";
				$html .= "<span class=\"terminoIDinList\"> [".$related_terminoID."] ";
				$html .= "<div class=\"add_index_btn\" title=\"$ir_al_termino_relacionado_title\" ";
				#$html .= "<img src=\"../themes/default/icon_go1.png\" title=\"$ir_al_termino_relacionado_title\" class=\"btnGo1\" ";
				$html .= "onclick=\"ts.go2termino('$related_terminoID');\" ";
				$html .= "></div>";
				$html .= " <span class=\"listado_tr_modelo_name\" >$modelo_name</span> ";
				$html .= "</span>";
				$html .= "";

			$html .= "</li>";
				
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
		$html .= "</ul>";

		return $html ;

	}//end get_html_listadoTR



	/*
	crea el div de los términos relacionados.
	Previamente se habrá verificado que los hay.
	*/
	protected static function renderDivTR($terminoID)	{

		$obj  = "\n<!-- DIV LISTADO DE TÉRMINOS RELACIONADOS (TR) -->\n";
		$obj .= "<div id=\"tr$terminoID\" class=\"divLineasInfo none tr_div\" >";

		$obj .= self::get_html_listadoTR($terminoID);

		$obj .= "</div>";

		return $obj ;
	}

	/*
	crea el div de la descripcion
	*/
	protected static function renderDivDescripcion($terminoID,$def)
	{
		$obj  = "\n<!-- DIV DESCRIPCION DEL TÉRMINO (DESPLEGABLE) -->\n";
		$obj .= "<div id=\"def$terminoID\" class=\"divLineasInfo none\" >";
		$obj .= "[ I ] ";
		$obj .= "$def "; if($def=='') $obj .= ' definició n/d ' ;
		$obj .= "</div>";

		return $obj ;
	}

	/*
	crea el div de las observaciones
	*/
	protected static function renderDivObservaciones($terminoID,$obs)
	{
		$obj  = "\n<!-- DIV OBSERVACIONES O INSTRUCCIONES DE USO (DESPLEGABLE) -->\n";
		$obj .= "<div id=\"obs$terminoID\" class=\"divLineasInfo none\" >";
		$obj .= "[ O ] ";
		$obj .= "$obs "; if(!$obs || $obs=='') $obs .= ' obs n/d ' ;
		$obj .= "</div>";

		return $obj ;
	}

	/*
	* Genera el listado de NO Descriptores
	*/
	protected function listadoND($terminoID) {

		global $editar_title;
		$html = '' ;

		$RecordObj_ts			= new RecordObj_ts($terminoID);
		$ar_childrens_of_this	= $RecordObj_ts->get_ar_childrens_of_this($esdecriptor='no');

		if(is_array($ar_childrens_of_this) && count($ar_childrens_of_this)>0) foreach($ar_childrens_of_this as $terminoID) {

			$terminoND		= RecordObj_ts::get_termino_by_tipo($terminoID,false);

			if($this->modo=='tesauro_edit') {

				$RecordObj_ts2	= new RecordObj_ts($terminoID);
				$parent			= $RecordObj_ts2->get_parent();
				$html .= $this->renderBtnBorrar($terminoID, $children=0, $nIndexaciones=0, $parent, $terminoND);
				$html .= $this->renderBtnEditTermino($terminoID,$parent);
			}

			$html .= " [ND] ";
			#$html .= "<a href=\"javascript:ts.openTSedit('$tsNDID','$parent')\"  title=\"$editar_title\" >";
			$html .= " <em class=\"terminoIDinList\">$terminoND</em> ";
			#$html .= "</a>";
			$html .= "<span class=\"terminoIDinList\"> [$terminoID] </span><br>";
			$html .= "<div id=\"divCont$terminoID\" class=\"inline\"></div>";
		}
		return $html ;
	}

	/*
	crea el div de NO descriptores
	*/
	protected function renderDivND($terminoID,$hijosND) {

		$obj  = "\n<!-- DIV NO DESCRIPTORES (DESPLEGABLE) -->\n";
		$obj .= "<div id=\"nd$terminoID\" class=\"divLineasInfo none\"  >";
		$obj .= $this->listadoND($terminoID);
		$obj .= "</div>";

		return $obj ;
	}

	/*
	crea el div de las cintas donde se usa este término
	*/
	protected static function renderDivCintas($terminoID) {

		$obj  = "\n<!-- DIV CINTAS DONDE SE USA: (DESPLEGABLE) -->\n";
		$obj .= "<div id=\"u$terminoID\" class=\"divCintas\" > <!-- ajax content load by function: cargarCintas2('u$terminoID','$terminoID') --> </div>";

		return $obj ;
	}


}
?>
