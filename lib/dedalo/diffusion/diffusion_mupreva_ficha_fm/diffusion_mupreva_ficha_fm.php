<?php
if(SHOW_DEBUG) $start_time = start_time();

# AR_DIFFUSION_MAP
	#$ar_diffusion_map 		= $this->get_ar_diffusion_map()[0];
		#dump($ar_diffusion_map,'$ar_diffusion_map');


# CATALOGO SEARCH : Buscamos el registro correspondiente al fichaID recibido
	$imagen_identificativa_diffusion_obj = $this->get_diffusion_obj_by_tipo( $this->imagen_identificativa_diffusion_element_tipo );


	$file_name = $this->show_mode;

	
	switch ($this->show_mode) {

		case 'edit':
			$this->image_widht	= 160;
			$this->image_height	= 160;
			$ar_otras_imagenes_diffusion_obj 	 = $this->get_diffusion_obj_by_tipo( $this->otras_imagenes_diffusion_element_tipo );
			break;

		case 'list':
			$this->image_widht	= 55;
			$this->image_height	= 32;		
			break;
		
		case 'custom':

			$this->image_widht	= $this->image_widht -2;
			$this->image_height	= $this->image_height -2;	

			if( $this->shoot == 0) {
				$ar_imagen_custom_diffusion_obj 	= $imagen_identificativa_diffusion_obj;
					#dump($ar_imagen_custom_diffusion_obj,'ar_imagen_custom_diffusion_obj');
			}else{
				$ar_imagen_custom_diffusion_obj 	= $this->get_diffusion_obj_by_tipo( $this->otras_imagenes_diffusion_element_tipo );
					#dump($ar_otras_imagenes_diffusion_obj->columns['valor'],'ar_otras_imagenes_diffusion_obj');
			}
			break;
	}
	

	require DEDALO_LIB_BASE_PATH .'/diffusion/'. get_class($this) . '/html/' . get_class($this) . '_' .$file_name. '.phtml';	


if(SHOW_DEBUG) echo exec_time($start_time, __METHOD__, '') ;