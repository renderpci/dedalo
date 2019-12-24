<?php
/**
* AREA_DEVELOPMENT
*
*
*/
class area_development extends area {


	/**
	* GET_AR_WIDGETS
	* @return array $data_items
	*	Array of objects
	*/
	public function get_ar_widgets() {

		$ar_widgets = [];

		// make_backup
			$item = new stdClass();
				$item->id 		= 'make_backup';
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= label::get_label('hacer_backup');
				$item->info 	= 'Click to force make a full backup now';
				$item->body 	= ' ';
				$item->trigger 	= (object)[
					'dd_api' 		=> 'dd_utils_api',
					'action' 	 	=> 'make_backup',
					'options' 	 	=> null
				];
			$ar_widgets[] = $item;


		// update_structure
			$item = new stdClass();
				$item->id 		= 'update_structure';
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= label::get_label('actualizar_estructura');
				$item->info 	= 'Click to update structure from remote master server';
				$item->confirm 	= '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! WARNING !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!'.PHP_EOL;
				$item->confirm .= '!!!!!!!!!!!!!! DELETING ACTUAL DATABASE !!!!!!!!!!!!!!!!'.PHP_EOL;
				$item->confirm .= 'Are you sure to IMPORT and overwrite current structure data with LOCAL FILE: ';
				$item->confirm .= '"dedalo4_development_str.custom.backup" ?'.PHP_EOL;
				$item->body 	= (defined('STRUCTURE_FROM_SERVER') && STRUCTURE_FROM_SERVER===true && !empty(STRUCTURE_SERVER_URL)) ?
					'Current: ' . RecordObj_dd::get_termino_by_tipo(DEDALO_ROOT_TIPO,'lg-spa') .
					'<hr>TLD: <tt>' . implode(', ', unserialize(DEDALO_PREFIX_TIPOS)).'</tt>' :
					label::get_label('actualizar_estructura')." is a disabled for ".DEDALO_ENTITY;
				$item->body 	.= "<hr>url: ".STRUCTURE_SERVER_URL;
				$item->body 	.= "<hr>code: ".STRUCTURE_SERVER_CODE;
				$item->trigger 	= (object)[
					'dd_api' 	=> 'dd_utils_api',
					'action' 	 => 'update_structure',
					'options' 	 => null
				];
			$ar_widgets[] = $item;


		// register_tools
			$item = new stdClass();
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= label::get_label('registrar_herramientas');
				$item->info 	= 'Click to read tools folder and update the tools register in database';
				$item->body 	= ' ';
				$item->trigger 	= (object)[
					'dd_api' 		=> 'dd_utils_api',
					'action' 	 	=> 'register_tools',
					'options' 	 	=> null
				];
			$ar_widgets[] = $item;


		// build_structure_css
			$item = new stdClass();
				$item->id 		= 'build_structure_css';
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= label::get_label('build_structure_css');
				$item->info 	= 'Click to regenerate css from actual structure';
				$item->body 	= ' ';
				$item->trigger 	= (object)[
					'dd_api' 		=> 'dd_utils_api',
					'action' 	 	=> 'build_structure_css',
					'options' 	 	=> null
				];
			$ar_widgets[] = $item;


		// update data version
			include(DEDALO_CORE_PATH . '/base/update/class.update.php');
			$updates 		= update::get_updates();
			$update_version = update::get_update_version();
			if(empty($update_version)) {

				$item = new stdClass();
					$item->id 		= 'update_data_version';
					$item->typo 	= 'widget';
					$item->tipo 	= $this->tipo;
					$item->parent 	= $this->tipo;
					$item->label 	= label::get_label('actualizar').' '.label::get_label('datos');
					$item->info 	= null;
					$item->body 	= '<span style="color:green">Data format is updated: '.implode(".", get_current_version_in_db()).'</span>';
					$item->trigger 	= (object)[
					];
				$ar_widgets[] = $item;

			}else{

				$current_dedalo_version = implode(".", get_dedalo_version());
				$current_version_in_db  = implode(".", get_current_version_in_db());
				$update_version_plain 	= implode('', $update_version);

				$item = new stdClass();
					$item->id 		= 'update_data_version';
					$item->typo 	= 'widget';
					$item->tipo 	= $this->tipo;
					$item->parent 	= $this->tipo;
					$item->label 	= label::get_label('actualizar').' '.label::get_label('datos');
					$item->info 	= 'Click to update dedalo data version';
					$item->body 	= '<span style="color:red">Current data version: '.$current_version_in_db . '</span> -----> '. implode('.', $update_version);
					// Actions list
						#dump($updates->$update_version_plain, '$updates->$update_version_plain ++ '.to_string());
						if (isset($updates->$update_version_plain)) {
							foreach ($updates->$update_version_plain as $key => $value) {

								if (is_object($value) || is_array($value)) {
									$i=0;
									foreach ($value as $vkey => $vvalue) {
										if($key==='alert_update') continue;
										if($i===0) $item->body .= "<h6>$key</h6>";
										if(is_string($vvalue)) $vvalue = trim($vvalue);
										$item->body .= '<div class="command"><span class="vkey">'.($vkey+1).'</span><span class="vkey_value">'. print_r($vvalue, true) .'</span></div>';
										$i++;
									}
								}
							}
						}
					$item->trigger 	= (object)[
						'dd_api' 		=> 'dd_utils_api',
						'action' 	 	=> 'update_version',
						'options' 	 	=> null
					];
				$ar_widgets[] = $item;
			}


		// search query object test enviroment
			$item = new stdClass();
				$item->id 		= 'search_query_object_test_enviroment';
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= 'SEARCH QUERY OBJECT TEST ENVIROMENT';
				$item->info 	= null;
				$item->body 	= '<textarea id="json_editor" class="hide"></textarea>';
				$item->body    .= '<div id="json_editor_container" class="editor_json"></div>';
				$item->run[]	= (object)[
					'fn' 	  => 'init_json_editor',
					'options' => (object)['editor_id' => "json_editor"]
				];
				$item->trigger 	= (object)[
					'dd_api' 	=> 'dd_utils_api',
					'action' 	=> 'convert_search_object_to_sql_query',
					'options' 	=> null
				];
			$ar_widgets[] = $item;


		// dedalo version
			$item = new stdClass();
				$item->id 		= 'dedalo_version';
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= 'DEDALO VERSION';
				$item->info 	= null;
				$item->body 	= 'Version '.DEDALO_VERSION;
				$item->body    .= '<pre>v '.DEDALO_VERSION .' | Build: '.DEDALO_BUILD.'</pre>';
			$ar_widgets[] = $item;


		// database_info
			$info = pg_version(DBi::_getConnection());
			$info['host'] = to_string(DEDALO_HOSTNAME_CONN);
			$item = new stdClass();
				$item->id 		= 'database_info';
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= 'DATABASE INFO';
				$item->info 	= null;
				$item->body 	= 'Database '.$info['IntervalStyle']. " ". $info['server']. " ".DEDALO_HOSTNAME_CONN;
				$item->body    .= '<pre>'.json_encode($info, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES).'</pre>';
			$ar_widgets[] = $item;


		// php_user
			$info = posix_getpwuid(posix_geteuid());
			$item = new stdClass();
				$item->id 		= 'php_user';
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= 'PHP USER';
				$item->info 	= null;
				$item->body 	= 'PHP user '.$info['name'];
				$item->body    .= '<pre>'.json_encode($info, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES).'</pre>';
			$ar_widgets[] = $item;


		// sequences_state
			require(DEDALO_CORE_PATH.'/db/class.data_check.php');
			$data_check = new data_check();
			$response 	= $data_check->check_sequences();
			$item = new stdClass();
				$item->id 		= 'sequences_state';
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= 'DB SEQUENCES STATE';
				$item->info 	= null;
				$item->body     = $response->msg;
			$ar_widgets[] = $item;

		// counters_state
			$response = counter::check_counters();
			$item = new stdClass();
				$item->id 		= 'counters_state';
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= 'DEDALO COUNTERS STATE';
				$item->info 	= null;
				$item->body     = $response->msg;
			$ar_widgets[] = $item;


		// php info
			$item = new stdClass();
				$item->id 		= 'php_info';
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= 'PHP INFO';
				$item->info 	= null;
				$item->body 	= '<iframe class="php_info_iframe" src="'.DEDALO_CORE_URL.'/area_development/html/info.php" onload="this.height=this.contentWindow.document.body.scrollHeight+50+\'px\';this.parentNode.parentNode.classList.add(\'display_none\')"></iframe>';
			$ar_widgets[] = $item;


		return $ar_widgets;
	}//end get_ar_widgets


}//end area_development
