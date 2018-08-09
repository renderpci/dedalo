<?php
    require_once( dirname(dirname(__FILE__)) .'/config/config4.php');
    require_once(DEDALO_LIB_BASE_PATH . '/cargawstracasa/class.cargawstracasa.php');
    
    /**
    * LOGIN
    */
    $is_logged	= login::is_logged();

    if($is_logged!==true) {
            $url =  DEDALO_ROOT_WEB ."/main/";
            header("Location: $url");
            exit();
    }

    require_once(DEDALO_LIB_BASE_PATH . '/common/class.navigator.php');
    require_once(DEDALO_LIB_BASE_PATH . '/ts/class.Tesauro.php');

    require_once(DEDALO_ROOT . '/Connections/config.php');
    require_once(DEDALO_ROOT . '/inc/funciones.php');
    require_once(DEDALO_ROOT . '/lang_translate/class.LangTranslate.php');

    $area			= 'tesauro'; #verify_access_area($area);
    $modo = '';  
	
    # MENU
    $html_header ='';
    if($modo=='tesauro_rel') {
            # Nothing to do
    }else{
            $menu_html = NULL;
            if(empty($caller_id)) {
                    $menu 	= new menu($modo);
                    $menu_html 	= $menu->get_html();
            }
            $file		 	= DEDALO_LIB_BASE_PATH . '/html_page/html/html_page_header.phtml';
            ob_start();
            include ( $file );
            $html_header =  ob_get_contents();
            ob_get_clean();
    }
    
    $procesoOK = '';    
    $DesError = '';
	#$Xml1 = '';
	#$Xml2 = '';
    
    if (isset($_POST['button'])) 
    {         
        $wst = new cargawstracasa();                                               		
		
		if ($wst->get_municipios('', 'Castellano') == true) {
			$procesoOK = 'OK';  				
		} else {
			$procesoOK = 'ERROR';  
			$DesError = $wst->deserror;
		}
 		
		if ($procesoOK == 'OK') {
			if ($wst->get_entidadessingulares('', 'Castellano') == true) {
				$procesoOK = 'OK';  							
			} else {
				$procesoOK = 'ERROR';  
				$DesError = $wst->deserror;
			} 	
		}

		if ($procesoOK == 'OK') {
			if ($wst->grabarmunicipios() == true) {
				$procesoOK = 'OK';  				
			} else {
				$procesoOK = 'ERROR';  
				$DesError = $wst->deserror;
			}
		}
		
		if ($procesoOK == 'OK') {
			if ($wst->grabarentidadessingulares() == true) {
				$procesoOK = 'OK';  		
			} else {
				$procesoOK = 'ERROR';  
				$DesError = $wst->deserror;
			}
		}					
		
    };
    
    $page_html = 'html/actualizargdp.phtml';    

    # LOAD VISTA TEMPLATE CODE
    require_once($page_html);
    
    if ($procesoOK == 'OK') 
    {		
		#var_dump($Xml1);			
        echo '<script language="javascript">alert("Proceso completado con exito.");</script>';
    } else if ($procesoOK == 'ERROR') {
        echo '<script language="javascript">alert("' . $DesError . '");</script>';
    }
?>