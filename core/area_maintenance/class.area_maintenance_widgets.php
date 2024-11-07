<?php
declare(strict_types=1);
/**
* AREA_MAINTENANCE_WIDGETS
* Handle area maintenance widgets values
*/
class area_maintenance_widgets extends area_common {



	/**
	* UPDATE_DATA_VERSION
	* Returns updated widget value
	* It is used to update widget data dynamically
	* @return object $response
	*/
	public static function update_data_version() : object {

		$updates				= update::get_updates();
		$update_version			= update::get_update_version();
		$update_version_plain	= empty($update_version)
			? ''
			: implode('', $update_version);

		$result = (object)[
			'update_version'		=> $update_version,
			'current_version_in_db'	=> get_current_version_in_db(),
			'dedalo_version'		=> get_dedalo_version(),
			'updates'				=> $updates->{$update_version_plain} ?? null
		];

		$response = new stdClass();
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];


		return $response;
	}//end update_data_version



	/**
	* REGISTER_TOOLS
	* Returns updated widget value
	* It is used to update widget data dynamically
	* @return object $response
	*/
	public static function register_tools() : object {

		$tools_files_list = tools_register::get_tools_files_list();

		$result = (object)[
			'datalist'	=> $tools_files_list,
			'errors'	=> null
		];

		// matrix_tools field 'Developer' check
		if (empty(RecordObj_dd::get_modelo_name_by_tipo('dd1644',true))) {
			$result->errors = ['Your Ontology is outdated. Term \'dd1644\' (Developer) do not exists'];
		}

		$response = new stdClass();
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];


		return $response;
	}//end register_tools



	/**
	* SYSTEM_INFO
	* Returns updated widget value
	* It is used to update widget data dynamically
	* @return object $response
	*/
	public static function system_info() : object {

		$datalist = [];

		// @use linfo
		// linfo lib installed via composer
		// @see https://github.com/jrgp/linfo
		include_once DEDALO_LIB_PATH . '/vendor/autoload.php';

		$linfo = new \Linfo\Linfo;

		$datalist[] = (object)[
			'name'	=> 'cpu',
			'value'	=> $linfo->getOS()
		];

		$datalist[] = (object)[
			'name'	=> 'hostname',
			'value'	=> $linfo->getHostname()
		];

		$datalist[] = (object)[
			'name'	=> 'virtualization',
			'value'	=> $linfo->getVirtualization()
		];

		$datalist[] = (object)[
			'name'	=> 'load',
			'value'	=> $linfo->getLoad()
		];

		$datalist[] = (object)[
			'name'	=> 'cpu',
			'value'	=> $linfo->getCPU()
		];

		$datalist[] = (object)[
			'name'	=> 'ram',
			'value'	=> $linfo->getRam()
		];

		$datalist[] = (object)[
			'name'	=> 'model',
			'value'	=> $linfo->getModel()
		];

		$datalist[] = (object)[
			'name'	=> 'hd',
			'value'	=> $linfo->getHD()
		];

		$datalist[] = (object)[
			'name'	=> 'mounts',
			'value'	=> $linfo->getMounts()
		];

		$datalist[] = (object)[
			'name'	=> 'net',
			'value'	=> $linfo->getNet()
		];

		$datalist[] = (object)[
			'name'	=> 'uptime',
			'value'	=> $linfo->getUpTime()
		];

		$datalist[] = (object)[
			'name'	=> 'process_status',
			'value'	=> $linfo->getProcessStats()
		];

		$result = (object)[
			'datalist'	=> $datalist,
			'errors'	=> null
		];

		// matrix_tools field 'Developer' check
		if (empty(RecordObj_dd::get_modelo_name_by_tipo('dd1644',true))) {
			$result->errors = ['Your Ontology is outdated. Term \'dd1644\' (Developer) do not exists'];
		}

		$response = new stdClass();
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];


		return $response;
	}//end system_info



}//end area_maintenance_widgets
