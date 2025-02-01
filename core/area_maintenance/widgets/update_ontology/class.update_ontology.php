<?php declare(strict_types=1);
/**
* update_ontology
* Widget to manage Dédalo Ontology updates
*/
class update_ontology {



	/**
	* GET_VALUE
	* Returns updated widget value
	* It is used to update widget data dynamically
	* @return object $response
	*/
	public static function get_value() : object {

		// servers
			if (defined('ONTOLOGY_SERVERS')) {
				$servers = ONTOLOGY_SERVERS;
			}else if (defined('STRUCTURE_SERVER_URL')) {
				$servers = [(object)[
					'name'	=> 'Old Ontology server config. Define ONTOLOGY_SERVERS ASAP',
					'url'	=> STRUCTURE_SERVER_URL,
					'code'	=> STRUCTURE_SERVER_CODE
				]];
			}else{
				$servers = [];
			}

		// local files
			if (IS_AN_ONTOLOGY_SERVER===true) {
				$servers[] = (object)[
					'name'	=> 'Local files',
					'url'	=> DEDALO_PROTOCOL.DEDALO_HOST.DEDALO_API_URL,
					'code'	=> 'localhost'
				];
			}

		// check ontology servers
			$ontology_servers = [];
			foreach ($servers as $current_server) {
				$server = (object)$current_server;
				$server_ready			= ontology_data_io::check_remote_server( $server );
				$server->msg			= $server_ready->msg;
				$server->errors			= $server_ready->errors;
				$server->response_code	= $server_ready->code;
				$server->result			= $server_ready->result;
				$server->code			= $server->code;
				if($server->code === 'localhost' && $server->result!==false){
					$server->result->result = true;
				}
				$ontology_servers[]		= $server;
			}

		// tld list
			$DEDALO_PREFIX_TIPOS = get_legacy_constant_value('DEDALO_PREFIX_TIPOS');
			// force to add 'ontology' to the list
			$DEDALO_PREFIX_TIPOS = array_values(array_unique(
				array_merge($DEDALO_PREFIX_TIPOS, ['ontology'])
			));

		$result = (object)[
			'servers'				=> $ontology_servers,
			'current_ontology'		=> RecordObj_dd::get_termino_by_tipo(DEDALO_ROOT_TIPO,'lg-spa'),
			'prefix_tipos'			=> $DEDALO_PREFIX_TIPOS,
			'structure_from_server'	=> (defined('STRUCTURE_FROM_SERVER') ? STRUCTURE_FROM_SERVER : null),
			'body'					=>  label::get_label('update_ontology')." is disabled for ".DEDALO_ENTITY,
			'confirm_text'			=> '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! WARNING !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!' . PHP_EOL
				.'!!!!!!!!!!!!!! DELETING ACTUAL ONTOLOGY !!!!!!!!!!!!!!!!!!!!!!!!!!!' . PHP_EOL
				.'Are you sure you want to overwrite the current Ontology data?' .PHP_EOL
				.'You will lose all changes made to the local Ontology.'
		];

		$response = new stdClass();
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];


		return $response;
	}//end get_value



}//end update_ontology
