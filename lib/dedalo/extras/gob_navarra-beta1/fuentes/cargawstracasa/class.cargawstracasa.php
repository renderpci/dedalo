<?php

require_once(dirname(dirname(__FILE__)) .'/config/config4_db.php');

/*
* CLASS Carga datos Municipios y Entidades Singulares desde el WebService de Tracasa
*/

class cargawstracasa extends common {

	public $xmlmunicipios;
	public $xmlentidades;

	public $codeerror; 
	public $deserror; 

	private $wsdl="https://intranet02.tracasa.es/gdp/desarrollo/alfaws.asmx?wsdl";
	private $clientOptions = array('login' => 'D692903', 'password' => 'Vill@nu3vaE');

	private $WS;				
		
	# Constructor
	function __construct() {
	
	}

	# 
	# Recoge los municipios de WS de Tracasa
	#
	private function open_ws_tracasa() {
		try
		{				
			if ($this->WS == NULL) {											
				$this->WS = new SoapClient($this->wsdl, $this->clientOptions);		
			}	
			return true;
		}
		catch (SoapFault $fault)
		{
		    $codeerror = $fault->faultcode;
		    $deserror = $fault->faultstring;		    
                    return false;		    
		}						
	}	
	
	# 
	# Recoge los municipios de WS de Tracasa
	#
	public function get_municipios($patron='', $idioma='Castellano') {

		try
		{			

                    if ($this->open_ws_tracasa() == false){
                    	throw new Exception('Error al abrir WS Tracasa');
                    }

                    $parameters=array('pPatron' => $patron,'pIdioma' => $idioma);

					$this->xmlmunicipios = $this->WS->Municipios($parameters);					

                    return true;
		
		} catch (Exception $e) {
                    $this->codeerror = $e->getCode();
		    $this->deserror = $e->getMessage();		    
                    return false;		    
		}		
	}

	# 
	# Recoge las entidades singulares de WS de Tracasa
	#
	public function get_entidadessingulares($patron='', $idioma='Castellano') {

		try
		{			

			if ($this->open_ws_tracasa() == false){
				throw new Exception('Error al abrir WS Tracasa');
			}

			$parameters=array('pPatron' => $patron,'pIdioma' => $idioma);

		   	$this->xmlentidades = $this->WS->EntidadesSingulares($parameters);					

			return true;
		
		} catch (Exception $e) {
                    $this->codeerror = $e->getCode();
		    $this->deserror = $e->getMessage();		    
                    return false;		    
		}		
	}

	# 
	# Grabar Municipios en Dedalo
	#
	public function grabarmunicipios() {
		
		$host=DEDALO_HOSTNAME_CONN;
		$user=DEDALO_USERNAME_CONN;
		$password=DEDALO_PASSWORD_CONN;
		$database=DEDALO_DATABASE_CONN;
		
		try
		{			
                        
			$mysqli = new mysqli($host, $user, $password, $database);                        
			if ($mysqli->connect_errno) {
			    throw new Exception("Falló la conexión a MySQL: (" . $mysqli->connect_errno . ") " . $mysqli->connect_error);
			}
                        
            $mysqli->query("SET NAMES 'utf8'");

			#***************************************************************
			#Solo para las pruebas vamos a recuperar los datos de un fichero 
			#$this->xmlmunicipios = file_get_contents('XmlResultadoMunicipios.xml');
			#***************************************************************

			$result = $this->xmlmunicipios->MunicipiosResult->any;	
						
			$start=strpos($result,'<DSGDP');			
			$end=strrpos($result,'DSGDP>');			
			$result=substr($result,$start,$end-$start+6);
		
			$result = str_replace("diffgr:", "", $result);
			$result = str_replace("msdata:", "", $result);							
						
			$DOM = new DOMDocument('1.0', 'utf-8'); 
			$error = $DOM->loadXML($result); 
			if ($error == FALSE){
				throw new Exception('No se ha cargado correctamente el XML de municipios');
			};
									
			$Municipios = $DOM->getElementsByTagName('Municipio');							
											
			foreach ($Municipios as $municipio) {			
				
				#Mostrar solo en pruebas
				#echo $municipio->getElementsByTagName("CodMun")->item(0)->nodeValue, "<br />\n";
				#echo $municipio->getElementsByTagName("DenomMun")->item(0)->nodeValue, "<br />\n";
				
				#Grabación de municipios
				$call = $mysqli->prepare('CALL SP_ActualizarMunicipio(?, ?, @coderror)');
				$call->bind_param('is',$municipio->getElementsByTagName("CodMun")->item(0)->nodeValue, $municipio->getElementsByTagName("DenomMun")->item(0)->nodeValue);
				if ($call->execute() == false){
					throw new Exception('Error al ejecutar procedimiento SP_ActualizarMunicipio');
				}
				$select = $mysqli->query('SELECT @coderror');
				$fechresult = $select->fetch_assoc();
				$this->codeerror     = $fechresult[' @coderror'];				

			}		

			return true;
		
		} catch (Exception $e) {
                    $this->codeerror = $e->getCode();
		    $this->deserror = $e->getMessage();		    
                    return false;		    
		} finally {
                    if ($mysqli != NULL) {
			mysqli_close($mysqli);
                    }
		}		
	}
        
        
        # 
	# Grabar Entidades Singulares en Dedalo
	#
	public function grabarentidadessingulares() {
		
		$host=DEDALO_HOSTNAME_CONN;
		$user=DEDALO_USERNAME_CONN;
		$password=DEDALO_PASSWORD_CONN;
		$database=DEDALO_DATABASE_CONN;
		
		try
		{			

			$mysqli = new mysqli($host, $user, $password, $database);
			if ($mysqli->connect_errno) {
			    throw new Exception("Falló la conexión a MySQL: (" . $mysqli->connect_errno . ") " . $mysqli->connect_error);
			}
                        
                        $mysqli->query("SET NAMES 'utf8'");

			#***************************************************************
			#Solo para las pruebas vamos a recuperar los datos de un fichero 
			#$this->xmlentidades = file_get_contents('XmlResultadoMunicipiosyEntidadesSingulares.xml');
			#***************************************************************

			$result = $this->xmlentidades->EntidadesSingularesResult->any;

			$start=strpos($result,'<DSGDP');			
			$end=strrpos($result,'DSGDP>');			
			$result=substr($result,$start,$end-$start+6);
		
			$result = str_replace("diffgr:", "", $result);
			$result = str_replace("msdata:", "", $result);
						
			$DOM = new DOMDocument('1.0', 'utf-8'); 
			$error = $DOM->loadXML($result); 
			if ($error == FALSE){
				throw new Exception('No se ha cargado correctamente el XML de entidades singulares');
			};
			
			$Entidades = $DOM->getElementsByTagName('EntidadSingular');	
														
			foreach ($Entidades as $entidad) {			
				
				#Mostrar solo en pruebas
				#echo $entidad->getElementsByTagName("CodEntSing")->item(0)->nodeValue, "<br />\n";
				#echo $entidad->getElementsByTagName("DenomEntSing")->item(0)->nodeValue, "<br />\n";
				
				#Grabación de entidades singulares
				$call = $mysqli->prepare('CALL SP_ActualizarEntidadSingular(?, ?, ?, ?, @coderror)');
				$call->bind_param('iiis',$entidad->getElementsByTagName("CodEntSing")->item(0)->nodeValue, $entidad->getElementsByTagName("CodMun")->item(0)->nodeValue, $entidad->getElementsByTagName("CodEntINE")->item(0)->nodeValue, $entidad->getElementsByTagName("DenomEntSing")->item(0)->nodeValue);
				if ($call->execute() == false){
					throw new Exception('Error al ejecutar procedimiento SP_ActualizarEntidadSingular');
				}
				$select = $mysqli->query('SELECT @coderror');
				$fechresult = $select->fetch_assoc();
				$this->codeerror     = $fechresult[' @coderror'];				

			}		

			return true;
		
		} catch (Exception $e) {
                    $this->codeerror = $e->getCode();
		    $this->deserror = $e->getMessage();		    
                    return false;		    
		} finally {
                    if ($mysqli != NULL) {
			mysqli_close($mysqli);
                    }
		}		
	}


};// class


?>
