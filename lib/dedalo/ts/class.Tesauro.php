<?php
if(!defined('DEDALO_LIB_BASE_PATH'))
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');

/*
* CLASE TESAURO V3
*/
require_once(DEDALO_LIB_BASE_PATH.'/ts/class.TesauroElements.php');
require_once(DEDALO_ROOT.'/jer/class.RecordObj_jer_tipos.php');


class Tesauro extends TesauroElements {
	
	protected $modo ;								# modo
	protected $valid_modes ;						# valid modes
		
	protected $tabla ;								# Tabla actual	
	protected $prefijo ;							# Se fija a la vez que $tabla	
		
	protected $arrayTablas ;						# tablas de jerarquias activas
	protected $jer_nombre  ;						# Se fija a la vez que $tabla	
	protected $jer_tipo  ;							# jer_tipo	
	protected $jer_tipoText ; 						# jer_tipo text	
	protected static $tabla_jerarquia ;				# nombre tabla jerarquia	
	protected static $tabla_jerarquia_tipos ;		# nombre tabla jerarquia tipo	
	
	protected $esmodelo ;							# modelo	
	protected $noDescripor ;						# noDescripor (termino no descritor hayado al verificar si el termonoId es descriptor o no en terminoID2descriptorID($terminoID))	
	protected $terminoIDactual ;					# terminoID actual. Lo fijaremos pra luego comparar en casos como terminoID2descriptorID($terminoID))	
	protected static $generateSelectDataTopoPath ;	# path to save or read calculated files of generateSelectDataTopo method	
	protected $ts_lang ;							# current lang for resolve termino and def	
	protected $type ;								# type
	protected static $valid_types ;					# valid types

	
	
	# Constructor
	function __construct($modo='tesauro_list', $type='all', $ts_lang=false ) {
		
		self::$tabla_jerarquia 				= 'jerarquia';
		self::$tabla_jerarquia_tipos 		= 'jerarquia_tipos';
		self::$generateSelectDataTopoPath	= '../ts/write/';
		
		$this->tabla			= false;
		$this->prefijo			= false;
		$this->jer_nombre		= false;
		$this->jer_tipo			= false;
		$this->jer_tipoText		= false;
		$this->esmodelo			= 'no';
		$this->noDescripor		= false;
		$this->terminoIDactual	= false;
		
		$this->set_mode($modo);
		$this->set_type($type);		
		$this->set_ts_lang($ts_lang);		
		#$this->set_arrayTablas();
		
		/*
		# Si hay modelo definido en sesión, filtramos por el valor "esmodelo"
		#if($_SESSION['esmodelo']=='si' || $_SESSION['esmodelo']=='no') $this->set_esmodelo($_SESSION['esmodelo']);#print "esmodelo: ".$this->esmodelo ;
		if($this->modo=='modelo') $this->esmodelo = 'si';
		*/	
	}
	
	protected function set_mode($modo) {
				
		$this->valid_modes = array('tesauro_list','tesauro_edit','tesauro_rel','modelo_edit');		
		if( !in_array($modo, $this->valid_modes) ) die(__METHOD__." Tesauro Error: mode not valid! [<b>$mode</b>] <br> Use a valid mode to access.");
		
		# set value "esmodelo" for filter when build tree
		if($modo=='modelo_edit') {
			$this->esmodelo = 'si';
		}else{
			$this->esmodelo = 'no';	
		}
		$this->modo = $modo ;
	}
	protected function set_type($type) {
		# allow not define $type..
		/*
		$this->valid_types = array('tesauro','toponimia','lenguaje','all');		
		if( !in_array($type, $this->valid_types) && $type<1 ) die(__METHOD__." Tesauro Error: type not valid! [<b>$type</b>] <br> Use a valid type to access.");
		*/
		$this->type = $type;		
	}
	protected function set_ts_lang($ts_lang) {		
		$this->ts_lang = $ts_lang;		
	}		
	public function get_TablaActual() {
		return $this->tabla ;
	}	
	public function get_Prefijo() {
		return $this->prefijo ;
	}	
	protected function set_esmodelo($esmodelo) {
		$this->esmodelo = $esmodelo;	 
	}	
		
	
	# TABLAS jerarquia ACTIVAS. Creamos el array de las jerarquias activas
	# Devuelve prefijo:$arrayTablas['prefix'] y nombre tabla:$arrayTablas['tabla'];
	#
	public function get_arrayTablas() {

		if(isset($this->arrayTablas)) return $this->arrayTablas;
		
		$filtro 		= false ;
		$arrayTablas 	= array();
		
		switch($this->type) {			
			case 'tesauro'		: 	$filtro = " AND tipo = 1 ";		break;
			case 'toponimia'	: 	$filtro = " AND tipo = 2 ";		break;
			case 'lenguaje'		: 	$filtro = " AND tipo = 3 ";		break;
			case 'all'			: 	$filtro = " ";					break;
			default				:	if( $this->type > 0 ) {
										$filtro = " AND tipo = {$this->type} ";
									}else{
										$filtro = " "; 
									}		
		} #echo "arrayTablas: tipo:$this->type , filtro:$filtro <br>";
		
		$idString		= RecordObj_jer_tipos::order_by_tipo_sql_string(); # sql string for sort later
			#dump($idString,"idString ");


		# Loop ordenación postgresql		
		$ar_id = explode(',', $idString);
		$order_sql='';
		foreach ($ar_id as $current_id) {			
			$order_sql .= "tipo=$current_id DESC, ";
		}
		$order_sql = substr($order_sql, 0,-2);

		# buscamos los datos de cada una
		$arguments['activa']	= 'si';
		$arguments['sql_code']	= '';
		$arguments['sql_code']	.= $filtro;
		$arguments['sql_code']	.= "ORDER BY $order_sql ";		
		 
		$RecordObj_jer			= new RecordObj_jer(NULL);
		$ar_id					= $RecordObj_jer->search($arguments);
			#dump($ar_id,'$ar_id');
		
		if(count($ar_id)>0) foreach($ar_id as $id) {
			
			$RecordObj_jer				= new RecordObj_jer($id);
				#dump($RecordObj_jer,'$RecordObj_jer');		
			
			$alpha2						= strtolower($RecordObj_jer->get_alpha2());
			$nombre						= $RecordObj_jer->get_nombre();
			$tabla						= "jer_{$alpha2}";
			$tipo						= $RecordObj_jer->get_tipo();

			# tipo text . nombre del jer tipo
			$RecordObj_jer_tipos 		= new RecordObj_jer_tipos($tipo);
			$tipoText 					= $RecordObj_jer_tipos->get_nombre();
				#dump($tipoText,"tipo: $tipo");	
			
			$arrayTablas['prefijo'][]	= $alpha2 ;
			$arrayTablas['tabla'][]		= $tabla ;
			$arrayTablas['nombre'][]	= $nombre ;
			$arrayTablas['tipo'][]		= $tipo ;			
			$arrayTablas['tipoText'][]	= $tipoText ; 		
		}
		
		#$this->arrayTablas = $arrayTablas ;
			#dump($arrayTablas,'arrayTablas'); #die();
		
		return $arrayTablas ;
	}
	
	
	



	
	
	/**********************************************************************
	*	UTILIDADES. MÉTODOS VARIOS 
	***********************************************************************/
	
	/*
	* Número de indexaciones .
	* Se usa para verificar que no se usa en indexaciones antes de permitir borrar el descriptor
	*/
	public static function get_ar_indexations($terminoID) {

		$ar_indexations = array();

		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'dato';
		$arguments['parent']			= $terminoID;
		$arguments['tipo']				= 'index';
		$matrix_table					= RecordObj_descriptors::get_matrix_table_from_tipo($terminoID);
		$RecordObj_descriptors			= new RecordObj_descriptors($matrix_table, NULL);
		$ar_records						= $RecordObj_descriptors->search($arguments);
			#dump($ar_records,'terminoID '.$terminoID);

		if(count($ar_records)==1) {

			$dato = $ar_records[0];
			
			# Dato es un array en formato JSON. No obstante de momento RecordObj_descriptors no convierte automáticamente 
			# desde JSON. Lo haremos aquí de forma específica
			$dato = json_handler::decode($dato);
				#dump($dato,'dato');

			$ar_indexations = $dato;
		}
		return $ar_indexations;
	}
	
	/*
	* Despeja parent a partir del terminoID actual
	*/
	public static function terminoID2parent($terminoID) {
		
		if(strlen($terminoID)>2) {				
			#$fix = $this->terminoID2tablaFix($terminoID); if(!$fix) return false;					
			$RecordObj_ts	= new RecordObj_ts($terminoID);
			
			return $RecordObj_ts->get_parent();	
		}				
		return false ;		
	}
	
	
	
	
	
	/*
	* Despeja tabla en función del prefijo del terminoID
	* Despejamos la tabla actual y fijamos en la variable privada $tabla y el prefijo validado en la variable privada $prefijo
	* Devuelve la tabla validada
	*/
	public function terminoID2tablaFix($terminoID=false) {
		
		if(!$terminoID) return false; #die( " terminoID - $terminoID ");
		
		$result = false ;
		
		$prefijo = Tesauro::terminoID2prefix($terminoID);  #echo "terminoID : $terminoID <br>";
		
		$arrayTablas = $this->get_arrayTablas();
		# bucamos en el array de tablas la corresppondencia con este prefijo
		$key = false ;	
		if($terminoID && is_array($arrayTablas['prefijo'])) {
			
			$key = array_search($prefijo, $arrayTablas['prefijo']); #print("<hr>prefijo:$prefijo key:$key"); die();
		}
		
		if($key===false && $key!='') {
			
			#die("<br>key===false terminoID2tablaFix Error: Prefix <b>$prefijo</b> not found in arrayTablas !");
			die(__METHOD__."<div class=\"error\">ID \"<b>$terminoID</b>\" not exist in Hierarchy ! </div> <div class=\"notas\"> Please fix this problem ASAP</div>");
		
		}else{
			
			$tablaActual 		= $arrayTablas['tabla'][$key]; #die("tablaActual: $tablaActual");
			$prefijoValidado	= $arrayTablas['prefijo'][$key];
			$nombre				= $arrayTablas['nombre'][$key];
			$tipo				= $arrayTablas['tipo'][$key];
			$tipoText			= $arrayTablas['tipoText'][$key];
		}
		
		if($tablaActual && $prefijoValidado) {
			
			$this->tabla		= $tablaActual ;			#print("prefijo de [$parentInicial] :  $prefijo , tabla: $this->tabla ");
			$this->prefijo 		= $prefijoValidado ;
			$this->jer_nombre	= $nombre ;
			$this->jer_tipo		= $tipo ;
			$this->jer_tipoText	= $tipoText ;
			
			if($this->tabla) 	$result = $this->tabla ;
		}
		
		return $result ;
	}
	
	
	/*
	* Verifica que el prefijo está bién formado y es correcto (Evita errores de ts25 por tp25...)
	* Si no se pasa prefijo o no corresponde con el actual fijado, lo cambia por el actual fijado en $this-prefijo
	*/
	public function prefijoFix($terminoID) {
		
		$result = false ;		
		#if(strlen($terminoID)<3) die("prefijoFix: terminoID or parent ($terminoID) malformed (<3char) !");
		
		$prefijo = Tesauro::terminoID2prefix($terminoID); #die("prefijo: $prefijo");
		
		if($prefijo==$this->prefijo) {
			# ok
			$result = $terminoID ;
			
		}else{
			
			# repair			
			$pattern	= "/[a-z][a-z]/i";
			$subject	= $terminoID ;
			$havePrefix = preg_match($pattern, $subject);
			
			if(!$havePrefix)	
			{
				# si NO tiene prefijo, le añadimos el de la tabla actual
				$terminoIDfix = $this->prefijo . $terminoID ;
			
			}else{
				
				# si SI tiene prefijo distinto al actual, está mal y lo cambiamos 
				$terminoIDfix = $this->prefijo . substr($terminoID,2);
			}
			
			#print_r($matches) ;die("terminoID: $terminoIDfix - havePrefix: $havePrefix") ;
			
			$result = $terminoIDfix ;
		}		
		
		return $result ;		
	}
	
	# TERMINOID 2 PREFIX
	public static function terminoID2prefix($terminoID) {
		#print_r($terminoID);
		if( is_array($terminoID) || !is_string($terminoID) ) throw new Exception("Error Processing Request.  Error: terminoID is not string: terminoID:$terminoID ", 1);		 
		return substr($terminoID,0,2);		# like 'ts' from 'ts234'
	}
	# PREFIJO COMPARE
	public static function prefijo_compare($terminoID, $terminoID2) {
		
		$prefijo	= Tesauro::terminoID2prefix($terminoID);
		$prefijo2	= Tesauro::terminoID2prefix($terminoID2);
		
		$pattern	= "/[a-z][a-z]/i";
		$subject	= $terminoID ;
		$havePrefix = preg_match($pattern, $subject);
		
		if($havePrefix && $prefijo == $prefijo2) return true;
		
		return false;
	}
	# PREFIJO FIX 2 STATIC VERSION
	public static function prefijoFix2($terminoID, $terminoID2) {
		
		# prefijo válido
		$prefijo	= Tesauro::terminoID2prefix($terminoID);
		$prefijo2	= Tesauro::terminoID2prefix($terminoID2);
		
		# verificamos si terminoID2 tiene prefijo
		$pattern	= "/[a-z][a-z]/i";
		$subject	= $terminoID2 ;
		$havePrefix = preg_match($pattern, $subject);
		
		if(!$havePrefix) {
			
			# si NO tiene prefijo, le añadimos el válido actual
			$terminoID2 = $prefijo . $terminoID2 ;	
						
		}else if($prefijo2 && ($prefijo2 !=  $prefijo)) {
			
			# si SI tiene prefijo y es distinto al actual, está mal y lo cambiamos 			
			$terminoID2 = $prefijo . substr($terminoID2,2);
		}		
		return $terminoID2 ;
	}
	
	
	
	
	/*
	* esmodeloHeredado . Verificamos si este término es modelo
	*/
	protected static function esmodeloCurrent($terminoID) {		
		
		$RecordObj_ts	= new RecordObj_ts($terminoID);
		$esmodelo		= $RecordObj_ts->get_esmodelo();
		
		return $esmodelo ;	
	}
	
	/*
	* esdescriptorCurrent . Verificamos si este término es descriptor
	*/
	protected static function esdescriptorCurrent($terminoID) {
		
		$RecordObj_ts	= new RecordObj_ts($terminoID);
		$esdescriptor	= $RecordObj_ts->get_esdescriptor();
		
		return $esdescriptor ;	
	}
	
	
	
	
	
	
	
	
	
	/**************************************************************************************************************************************
	*
	* ++++++ BUILDTREE ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
	*
	* BuildTree : Construye el arbol completo del tesauro a partir del padre (puede ser 0)
	* parentInicial es el terminoID a partir del cual construimos. si estamos en el primer nivel, será 0.
	* nivel de momento no se usa (se ha hecho prescindible pero se mantiene por compatibilidad)
	* terminoIDActual es el terminoID en el que estamos. Se usa para resaltar el término en búsqueda o para hacer recursiones
	* terminoIDresalte se usa para resaltar el término en las búsuqedas (es un listado -pueden ser varios- y se cotejan todos sus ids con el terminoDiactual)
	* header (activa o no la inclusión de la barra superior)
	***************************************************************************************************************************************/
	public function buildTree($parentInicial, $terminoIDActual, $terminoIDresalte, $header='no') {
	
		$html = '' ;			#print("parentInicial:$parentInicial, terminoIDActual:$terminoIDActual, terminoIDresalte:$terminoIDresalte, header:$header, esmodelo:$esmodelo ");die();				
		
		$RecordObj_ts			= new RecordObj_ts($parentInicial);
		$ar_childrens_of_this	= $RecordObj_ts->get_ar_childrens_of_this($esdecriptor='si',$this->esmodelo);
			#dump($ar_childrens_of_this,'ar_childrens_of_this');	#die();
		
		# Despejamos la tabla actual y fijamos en la variable privada $tabla
		$this->terminoID2tablaFix($parentInicial);
			
		# header listado
		if($header=='si') {
			$html .= $this->headerListJer();
			#dump($this->headerListJer(),'$this->headerListJer()');
		}

		#dump($this);
		
		# orden virtual: se reinicia para cada parent
		$nordenV = 0 ;

		if(count($ar_childrens_of_this)>0) foreach($ar_childrens_of_this as $terminoID) {				
				
				$RecordObj_ts	= new RecordObj_ts($terminoID); 	
				
				$termino 		= RecordObj_ts::get_termino_by_tipo($terminoID,$this->ts_lang);		#echo $termino ;#if($this->ts_lang) $termino	= "[$this->ts_lang] ".$termino;				
				$def 			= RecordObj_ts::get_def_by_tipo($terminoID,$this->ts_lang);			#if($this->ts_lang) $def 	= "[$this->ts_lang] ".$def;
				$obs			= RecordObj_ts::get_obs_by_tipo($terminoID,$this->ts_lang);
				
				$parent 		= $RecordObj_ts->get_parent();
				$modelo 		= $RecordObj_ts->get_modelo();
				$usableIndex 	= $RecordObj_ts->get_usableIndex();
				$norden			= $RecordObj_ts->get_norden();
				$traducible		= $RecordObj_ts->get_traducible();
				$visible 		= $RecordObj_ts->get_visible();
				$ID 			= $RecordObj_ts->get_ID();

				$RecordObj_ts2	= new RecordObj_ts($terminoID);
				$hijosND		= count($RecordObj_ts2->get_ar_childrens_of_this('no'));
				#$hijosND 		= $this->HNoDescriptores($terminoID);				
				
				$hijosD			= $RecordObj_ts->get_n_hijos_descriptores();
				$children 		= $RecordObj_ts->get_n_hijos();
				$ncaptaciones	= $RecordObj_ts->get_n_captaciones();
				$nIndexaciones	= count(self::get_ar_indexations($terminoID));

				
				# orden virtual
				$nordenV ++ ;
				
				# Resalte 
				$resalte = false ;				
				$terminoIDresalteArray = explode(',',$terminoIDresalte) ;
				if(is_array($terminoIDresalteArray)) foreach($terminoIDresalteArray as $terminoIDlistActual ) {
					if($terminoIDlistActual==$terminoID) $resalte = 1 ;
				}				
				
				# margen izquierdo
				if($parent == $this->prefijo.'0'){
					$marginLeft = 0 ;
					$display = "display:block" ;
				}else{
					$marginLeft = 50 ;
					$display = "display:block" ;
				}
				
				$html .= "\n\n\n<!-- DIV LINEA TESAURO ICONOS Y TÉRMINO $terminoID ---------------------------------------------------------------- -->";
				$html .= "\n<div id=\"divCont$terminoID\" class=\"divCont\" style=\"padding-left:$marginLeft" . "px;$display\" >";
									
					# generamos la linea con los iconos, etc..
					$html .= $this->makeTSline($terminoID,$termino,$parent,$children,$def,$obs,$hijosD,$hijosND,$nIndexaciones,$ncaptaciones,$nordenV,$resalte,$modelo,$usableIndex,$traducible,$visible,$ID);
					
					# recursive 										
					if( $children >0 ) {
						
						$terminoIDActual = $terminoID ;
						# contenedor ajax para carga los hijos
						$html .= "\n<!-- CONTENEDOR AJAX TESAURO -->";
						$html .= "\n<div id=\"div_$terminoID\" style=\"display:none;clear:left;\">";	
						
						$modo = false ;
						if($modo=="buildTreeFull") {
							#$this->buildTree($terminoID, $nivel+1, $terminoIDActual, $terminoIDresalte);
							$this->buildTree($terminoID, $terminoIDActual, $terminoIDresalte, $modo);
						}
						
						$html .= "</div><!-- // div_$terminoID --> ";
					}				
					
				$html .= "\n\n</div><!-- //divCont$terminoID  -->\n";				
								
								
		} #while ($row_RS = mysql_fetch_assoc($RS)); mysql_free_result($RS);
		
		
		return $html ;	
					
	}#fin function buildTree
	
	
	
	
	
	
	/* 
	* Crea la cabecera del listado.
	* En modo normal (visualización y edición del tesauro) muestra el botón de añadir tesauro.
	* En modo indexación, muestra un rótulo de selección de término
	*/
	public function headerListJer()	{
		
		global $terminos_title ;
		global $seleccione_el_descriptor ;
		global $toponimos_title ;
		global $anyadir_title ;
		global $termino_title ;
		global $jerarquia_title ;
		
		$html = false ;
			
		if($this->modo== 'modelo_edit') {			
			$add_class	= 'tsHeader_modelo' ;
		}else{
			$add_class 	= '';	
		}
		
		$html .= "\n<div class=\"tsHeader  $add_class\">";

	        $html .= "\n<div class=\"tsHeaderLeft\">";
	        $html .= ucfirst($this->jer_tipoText) ; 	#return("jer_tipoText: ". $this->jer_tipoText );
			#RecordObj_jer::get_nombre_by_id() 
			#$html .= ' ['.ucfirst($this->nombre).']' ;
			
			$parent0 = $this->prefijo.'0';
			
			if($this->modo=='tesauro_rel')
			{
				# caso indexación
				$html .= " [ $seleccione_el_descriptor ] ";			
			} else {						
				# caso general
				$html .= TesauroElements::renderBtnMas($parent0);
				$html .= "<div id=\"divCont{$parent0}\"></div>";							
			}		
			$html .= "\n</div>";
		
			#$html .= "\n<div class=\"divContToponimos\"> </div>";
		
			#$nToponimos = $this->nTerminosTotalTabla();
        	#$html .= "<span id=\"tsHeaderRight\"> $terminos_title: $nToponimos </span>";
        $html .= "\n</div><!-- /tsHeader -->";
		
		return $html ;	
	}
	
	
	
	
	
	
	
	
	
	
	
	/**
	* EXISTEESTETERMINO : verifica si existe el término dado
	*/
	function existeEsteTermino($termino,$terminoID)	{
		
		$exists		= RecordObj_decriptors::termino_exists($termino,$terminoID);
		if($exists) {
			global 	$el_termino_ya_existe_title ;
			$html	= "\n<div class=\"error\"> $el_termino_ya_existe_title: <b>$termino</b> </div> ";
		}else{
			$html 	= false;	
		}
		return $html;
	}
	
	
	
	
	
	/*****************************************************************************
	* SEARCH FORM . Busca en los descriptores
	* Busca en todas las tablas (UNION) con los criterios pasados
	* Devuelve un string secuencia de números tipo ts536,ts635,ts895,es965
	*
	* Pendiente: Búsqueda de NO descriptores y remarcado de los mismos en el resultado (como en la párte pública)
	*****************************************************************************/
	function searchTSform($terminoID, $termino, $def, $type, $modelo_name=NULL) {

		if(SHOW_DEBUG) $start_time = start_time();

		$arguments = array();


		$arguments['strPrimaryKeyName'] = 'parent';

		if(!empty($terminoID))
			$arguments['parent'] 		= $terminoID;

		if(!empty($termino)) {
			$arguments['tipo'] 			= 'termino';
			$arguments['dato:begins'] 	= $termino;
		}		

		if(!empty($def)) {
			$arguments['tipo'] 			= 'def';
			$arguments['dato:begins'] 	= $def;
		}

		if(!empty($this->ts_lang))	
		$arguments['lang']				= $this->ts_lang;

		#$arguments['group_by']			= 'parent';
		$arguments['sql_limit']			= 100;
		$arguments['order_by_asc']		= 'id';

			#dump($arguments, $type);

		# Structure
		if( $type==5 || (!empty($terminoID) && substr($terminoID, 0,2)=='dd')  ) {
			$matrix_table = 'matrix_descriptors_dd';
		}else{
			$matrix_table = 'matrix_descriptors';
		}
		#dump($matrix_table,'$matrix_table');
		
		$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, NULL);		
		$ar_result				= $RecordObj_descriptors->search($arguments);		
			#dump($ar_result	,'$ar_result - ' .$terminoID);		dump($arguments,'$arguments table:'.$matrix_table);
			#error_log( "searchTSform: ". to_string($arguments) );
		
		#$result = array_unique($result);
		
		if(count($ar_result)==0) {
			
			$result['list'] = "" ;
				
		}else{
			
			$i		= 0;
			$matriz = false;
					
			foreach($ar_result as $terminoID) {
				
				#$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, $id);
				#$terminoID  			= $RecordObj_descriptors->get_parent();
				
				# exclude terms that not are from current type
				$terminoDeTipoCorrecto	= $this->terminoDeTipoCorrecto($terminoID);
				
				if($terminoDeTipoCorrecto) {
				
					# avoid include modelo and no descriptors in result list
					# filter results ( esmodelo = 'no' AND esdescriptor = 'si' )				
					$esmodelo		= $this->esmodeloCurrent($terminoID);
					$esdescriptor	= $this->esdescriptorCurrent($terminoID);
					
					# dependiendo desde donde busquemos, quermos un tipo u otro
					$emodelo_valido = 'no';	
					if(isset($this->modo) && $this->modo!='' ){								
						if($this->modo=='tesauro_edit')	$emodelo_valido = 'no';
						if($this->modo=='modelo_edit' )	$emodelo_valido = 'si';			
					}
					#print("$terminoID - esmodelo:$esmodelo - modelo_valido:$emodelo_valido <br>" );	
					
					if($esmodelo==$emodelo_valido && $esdescriptor=='si') {					
					
						# Con objeto de posicionar antes los de nivel mas cercano a 0 , creamos un nivel virtual en función de los hijos que tenga cada uno			
						$nivel 					= $this->nivelVirtual($terminoID); 
						
						$matriz['terminoID'][$i]= $terminoID ;		#echo " $terminoID <br>";
						$matriz['nivel'][$i] 	= $nivel ;				
						$i++;				
					}
				}				
			}
			
			/*
			echo "<pre>";
			print_r($matriz); 
			echo "</pre>";
			die();
			*/			
			$counter	= intval(0) ;
			$max 		= 150 ;
			$list		= false;
			
			if(is_array($matriz['nivel'])) {
				
				# ordenamos el array en función del nivel (ascendente)
				sort($matriz['nivel']); #print_r($matriz['terminoID']); print_r($matriz['nivel']); die();
				
				# Desgloasamos el array en una secuencia de números
				$list = false ;
				foreach($matriz['nivel'] as $key => $val) {
					
					$nivel 		= $val ; 
					$terminoID 	= $matriz['terminoID'][$key];//die("nivel: $nivel - key: $key - terminoID: $terminoID "  );
					
					$counter++ ;			
					if($counter<=$max)
					{
						$list .= $terminoID . ',' ; 
					}				
				}
			}
			
			$result['total']	= $counter ;
			$result['list']		= substr($list,0,-1);
			$result['max']		= $max ;	
			
		}
		
		/*
		# Filtros		
		$filtro = " WHERE terminoID IS NOT NULL ";	
		
		if($terminoID!=''){		
			$campo	= 'terminoID';
			$string	= $terminoID ;
			$filtro .= opTextSearch($campo,$string,3) ; 
		}
		if($termino!=''){		
			$campo	= 'termino';
			$string	= $termino ;
			$filtro .= opTextSearch($campo,$string,1) ;
		}		
		if($def!=''){
			$campo	= 'def';
			$string	= $def ;
			$filtro .= opTextSearch($campo,$string,1);
		}		
		if(isset($this->ts_lang) && $this->ts_lang!='' ){
			$filtro .= " AND lang = '$this->ts_lang' ";
		}
		
		
		if($terminoID==false && $termino==false && $def==false) {
						
			die(" 
			Too many records... Use at least one search term, please.
			<script type=\"text/javascript\">
				setTimeout('history.go(-1)',1500);
			</script>
			");
		}
						
		$query_RS 		= "SELECT id, terminoID FROM descriptors $filtro ORDER BY terminoID ASC LIMIT 150"; #die($query_RS) ;				
		$RS 			= mysql_query($query_RS, DB::_getConnection()) or die(__METHOD__."$query_RS <hr>".mysql_error());
		$row_RS 		= mysql_fetch_assoc($RS); 
		$totalRows_RS 	= mysql_num_rows($RS);		#die("$query_RS <br> totalRows_RS: ".$totalRows_RS);
		
		
		# creamos la lista de resultados
		if($totalRows_RS==0) {
			
			$result['list'] = "" ;
			
		}else{
			
			$i		= 0;
			$matriz = false;
					
			do{
				$terminoID  = $row_RS['terminoID'];
				
				$terminoDeTipoCorrecto = $this->terminoDeTipoCorrecto($terminoID); # exclude terms that not are from current type
				
				if($terminoDeTipoCorrecto) {
				
					# avoid include modelo and no descriptors in result list
					# filter results ( esmodelo = 'no' AND esdescriptor = 'si' )				
					$esmodelo		= $this->esmodeloCurrent($terminoID);
					$esdescriptor	= $this->esdescriptorCurrent($terminoID);
					
					# dependiendo desde donde busquemos, quermos un tipo u otro
					$emodelo_valido = 'no';	
					if(isset($this->modo) && $this->modo!='' ){								
						if($this->modo=='tesauro_edit')	$emodelo_valido = 'no';
						if($this->modo=='modelo_edit' )	$emodelo_valido = 'si';			
					}
					#print("$terminoID - esmodelo:$esmodelo - modelo_valido:$emodelo_valido <br>" );	
					
					if($esmodelo==$emodelo_valido && $esdescriptor=='si') {					
					
						# Con objeto de posicionar antes los de nivel mas cercano a 0 , creamos un nivel virtual en función de los hijos que tenga cada uno			
						$nivel 					= $this->nivelVirtual($terminoID); 
						
						$matriz['terminoID'][$i]= $terminoID ;		#echo " $terminoID <br>";
						$matriz['nivel'][$i] 	= $nivel ;				
						$i++;				
					}
				}
				
			} while ($row_RS = mysql_fetch_assoc($RS)); mysql_free_result($RS);	
			#die();
			#echo $totalRows_RS ;exit("$i");
			
			$counter	= intval(0) ;
			$max 		= 150 ;
			$list		= false;
			
			if(is_array($matriz['nivel'])) {
				
				# ordenamos el array en función del nivel (ascendente)
				sort($matriz['nivel']); #print_r($matriz['terminoID']); print_r($matriz['nivel']); die();
				
				# Desgloasamos el array en una secuencia de números
				$list = false ;
				foreach($matriz['nivel'] as $key => $val) {
					
					$nivel 		= $val ; 
					$terminoID 	= $matriz['terminoID'][$key];//die("nivel: $nivel - key: $key - terminoID: $terminoID "  );
					
					$counter++ ;			
					if($counter<=$max)
					{
						$list .= $terminoID . ',' ; 
					}				
				}
			}
			
			$result['total']	= $counter ;
			$result['list']		= substr($list,0,-1);
			$result['max']		= $max ;			
		}
		*/

			

		#if(SHOW_DEBUG) error_log( exec_time($start_time, __METHOD__, $result) );	
		
		return $result ; #(este resultado será: terminoIDlist)
		
	}# fin searchTSform
	
	
	
	protected function terminoDeTipoCorrecto($terminoID) {
		
		$arrayTablas	= $this->get_arrayTablas();			#print_r($arrayTablas);
		$prefijo		= Tesauro::terminoID2prefix($terminoID);
		
		if(is_array($arrayTablas)) foreach($arrayTablas['prefijo'] as $current_prefijo) {			
			
			if($prefijo==$current_prefijo) return true;		
			#echo " $prefijo - current_prefijo: $current_prefijo <br>";	
		}		
		return false;
	}
	
	
	#
	# Secuencia de resultados para la cookie
	# Crea un string con el path hasta el hijo que toca, tipo ts8,ts25,ts86..
	# 
	function listaDeResultados2cookie($terminoIDlist) {		
	
		$resultStringList = false ;
		
		# Recogemos el string terminoIDlist devuelto por la búsqueda y lo convertimos en un array
		$listArray = explode(",", $terminoIDlist);
		
		# lo recorremos generando el listado de padres (ordenado adecuadamente) para después abrir los divs correspondientes en el resultado
		if(is_array($listArray)) {
			 
			foreach($listArray as $key => $terminoIDActual) {
				
				#echo "$terminoIDActual <br>";
				
				if($terminoIDActual) {				
					# Para cada término hallado en la búsqueda, crearemos el path completo de padres hasta llegar a el
					# array de padres ordenados hacia arriba
					#$matriz = $this->padresArray($terminoIDActual);
					
					$RecordObj_ts	= new RecordObj_ts($terminoIDActual);					
					$matriz 		= $RecordObj_ts->get_ar_parents_of_this();		#print_r($matriz); die();
									
					if(is_array($matriz) && count($matriz)>0)
					{
						# ordenamos a la inversa los padres
						#krsort($matriz);
						
						# creamos el string							
						foreach( $matriz as $nOrden => $terminoID) {			
							$resultStringList .= "$terminoID,";	
						}									
					}#if(is_array($matriz))				
					
					/*
					# Para cada término hallado en la búsqueda, crearemos el path completo de padres hasta llegar a el
					$list .= $this->searchTSlist($terminoIDActual);
					$list .= ",";
					*/
				}				
			}# enf foreach			
			
			
			# eliminamos la última coma y devolvemos la lista en string tipo: 345,543,34,784,432
			$resultStringList = substr($resultStringList,0,-1); #print("terminoIDlist: $terminoIDlist - resultList: ".$resultList);		
			$resultStringList = self::optimize_listaDeResultados2cookie($resultStringList);		
		}
		
		return $resultStringList ;	
		
	}# fin listaDeResultados2cookie
	
	
	#
	# Optimiza la lista de paths eliminando los redundantes de 2º,3º... aparición
	#
	protected static function optimize_listaDeResultados2cookie($resultStringList) {
		
		$result 	= false ;
		$list		= false ;
		 
		# convertimos en array el string
		$listArray = explode(",", $resultStringList);
		
		if(is_array($listArray)) {
			
			# eliminamos los dupliicados del array
			$listArray = array_unique($listArray);
			
			# lo recorremos regenerando el string
			foreach($listArray as $key => $terminoID) {
				$list .= "$terminoID,";
			}
			
			$result = substr($list,0,-1); #print("OPT: $list <hr>");die();
			
		}else{ die(__METHOD__."Error: optimize_listaDeResultados2cookie "); };		
		
		return $result ;
	}
	
	

	#
	# nivelVirtual. Creamos un nivel virtual en función de cuantos padres tiene este termino
	#
	private function nivelVirtual($terminoID) {
		
		$nivel = 0 ;
		
		$parent 		= Tesauro::terminoID2parent($terminoID);		
		$parent_zero	= Tesauro::terminoID2prefix($terminoID).'0';
		$prefijo		= Tesauro::terminoID2prefix($terminoID);
		
		if( $parent==$parent_zero || $parent==$prefijo || $parent=='') {
			
			$nivel = 1 ;
			
		}else{					
			
			$RecordObj_ts		= new RecordObj_ts($terminoID);
			$ar_parents_of_this	= $RecordObj_ts->get_ar_parents_of_this();
			
			if(is_array($ar_parents_of_this))	$nivel = count($ar_parents_of_this);			
		}		
		return $nivel ;
		
	}# fin nivelVirtual



	/**
	* get_ts_map
	* Load csv file /maps/csv_file_name.csv and get formatted array from file data
	* @param string $csv_file_name name of file (without extension)
	* @return array $ar_ts_map
	*/
	public static function get_ar_ts_map( $csv_file_name, $delimiter=';' ) {
	
		static $ar_ts_map;

		if (isset($ar_ts_map)) {
			if(SHOW_DEBUG) {
				#error_log("Return data from cache");
			}			
			return $ar_ts_map;
		}

		$filename = DEDALO_LIB_BASE_PATH.'/ts/maps/' . $csv_file_name . '.csv';

		if(!file_exists($filename) || !is_readable($filename)) return FALSE;

	    $header = NULL;
	    $ar_ts_map = array();
	    if (($handle = fopen($filename, 'r')) !== FALSE) {

	        while (($row = fgetcsv($handle, 1000, $delimiter)) !== FALSE) {

	            if(!$header) {

	                $header = $row; 			 					#dump($header," header");
	            
	            }else{

	            	$current_row = array_combine($header, $row);	#dump($row[0]," row");	dump($row," row");
	            		#dump($current_row," current_row");
	            	
	            	# Convert string value to array value
	            	foreach ($current_row as $key => $value) {            		
	            		$current_row[$key] = explode(',', $value);
	            		# Trim every element for possibles spaces 
	            		foreach ($current_row[$key] as $sub_key => $current_str_value) {
		           			$current_row[$key][$sub_key] = trim($current_str_value);
		           		}          		           		
	            	}

	            	$current_row 		= array_slice($current_row, 1); 
	            	$ar_ts_map[$row[0]]	= $current_row; 	#dump($current_row," current_row");	            	
	            }	                
	        }#end while
	        fclose($handle);

	    }#end if (($handle = fopen($filename, 'r')) !== FALSE)

	    return $ar_ts_map;
	}

	
	/**
	* GET_DEDALO_COUNTRY
	* Get dedalo country name from tipo / terminoID
	* @param string $terminoID
	* @param array $ts_map calculated from seld::get_ar_ts_map
	*/
	public static function get_dedalo_country( $terminoID, $ts_map ) {

		/* Format:
		[es] => Array (
            [country] => Array (
                    [0] => es8868
                )
            [autonomous_community] => Array (
                    [0] => es8869
                )
            [province] => Array (
                    [0] => es8870
                )
            [comarca] => Array (
                    [0] => es8871
                )
            [municipality] => Array (
                    [0] => es8872
                    [1] => es8873
                )
            [neighborhood] => Array (
                    [0] => es8874
                    [1] => es8875
                    [2] => es8882
                )
        )
        */
		$RecordObj_ts 	= new RecordObj_ts($terminoID);
		$modelo 	  	= $RecordObj_ts->get_modelo();
		$prefix 		= RecordObj_dd::get_prefix_from_tipo($terminoID);

		if (!isset($ts_map[$prefix])) {
			if(SHOW_DEBUG) {
				throw new Exception("Error Processing Request. ts_map not contain prefix: $prefix", 1);
			}
			return null;
		}

		foreach ($ts_map[$prefix] as $dedalo_country => $ar_value) {
			foreach ($ar_value as $current_modelo) {
				if ($modelo==$current_modelo) {
					return (string)$dedalo_country;
				}
			}
		}
		return null;
	}#end get_dedalo_country
	

};// class
?>
