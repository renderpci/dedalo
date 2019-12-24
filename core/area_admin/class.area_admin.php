<?php

class area_admin extends area {
	
	# HTML
	public function get_html() {
		
		# Save current object in session var for calculate css later (Save obj in current state at this point)
		#css::save_obj_in_session($this);
		
		#$modo = self::get_modo();

		/*				
		# CARGA TODOS SUS COMPONENTES
		switch($modo) {
			
			case 'list' :	$this->ar_section_list = $this->generate_layout_list();				#dump($this->ar_section_list);	
							break;

			case 'relation':$this->ar_id_section_custom = self::get_ar_id_section_custom();		#dump($ar_id_section_custom);
							$this->ar_section_list = $this->generate_layout_list();				#dump($this->ar_section_list);	
							break;
							
			case 'edit' :	$ar_id_section=array('58','61');
							$this->ar_section_groups = $this->generate_layout_edit($ar_id_section);	
							break;
							
			case 'search' :	$this->ar_section_groups = $this->generate_layout_search();
							break;

			default :		$this->ar_section_groups = $this->generate_layout_edit(); 			#EDIT DEFAULT			
		}
		*/	
	
		ob_start();
		include ( DEDALO_CORE_PATH .'/'. __CLASS__ .'/'. __CLASS__ .'.php' );
		$html =  ob_get_clean();
		


		if(SHOW_DEBUG) {
			global$TIMER;$TIMER[__METHOD__.'_'.$this->tipo.'_'.microtime(1)]=microtime(1);
		}	
		
		return $html;
	}





}
?>