<?php declare(strict_types=1);
/**
* DIFFUSION_SERVER_CONTROL
* Area maintenance widget: centralized control panel for the Bun (TypeScript)
* diffusion server that performs SQL/RDF/XML publication in Dédalo v7.
*
* Responsibilities:
*  - Report overall server status + per-check health breakdown
*    (Bun reachable / PHP API reachable / SQL reachable), via the engine's
*    get_diffusion_status action (diffusion_api_client::call).
*  - Start / stop / restart the server process. The Bun server is a long-lived
*    OS process managed by an external supervisor (systemd on Linux, launchd/pm2
*    on macOS, or a custom script); lifecycle is delegated to a single
*    deployment-configured command template, DEDALO_DIFFUSION_SERVICE_CMD, where
*    the literal `%action%` is replaced by a validated start|stop|restart
*    keyword. No request data ever reaches the shell (no injection surface).
*  - List in-flight diffusion processes and cancel one (engine list_processes /
*    cancel_process).
*  - Surface pending unpublish deletions and retry them
*    (dd_diffusion_api::retry_pending_deletions).
*
* All mutating actions are restricted to global admins. Read-only get_value is
* available to any maintenance admin (the area itself is admin-gated).
*/
class diffusion_server_control {



	/**
	* SEC-044: explicit allowlist of methods callable through
	* dd_area_maintenance_api::widget_request
	*/
	public const API_ACTIONS = [
		'get_value',
		'start_server',
		'stop_server',
		'restart_server',
		'cancel_process',
		'retry_pending_deletions'
	];

	/**
	* Validated lifecycle keywords accepted by run_service_command. The keyword
	* is substituted into DEDALO_DIFFUSION_SERVICE_CMD in place of `%action%`.
	* @var array
	*/
	private const SERVICE_ACTIONS = ['start', 'stop', 'restart'];

	/**
	* Test hook: when set (non-null), overrides DEDALO_DIFFUSION_SERVICE_CMD.
	* '' forces the not-configured path (no exec); a non-empty string is used as
	* the command template. Never set in production.
	* @var string|null $service_cmd_override
	*/
	public static ?string $service_cmd_override = null;



	/**
	* GET_VALUE
	* Aggregated, read-only snapshot powering the whole widget: server health,
	* in-flight processes, effective configuration and pending-deletion count.
	* Degrades gracefully when the engine is down (never throws).
	* @return object $response
	*/
	public static function get_value() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// server health (get_diffusion_status → {result,msg,data:{checks:{server,php_api,sql}}})
			$status_response = diffusion_api_client::call((object)[
				'action' => 'get_diffusion_status'
			], 5);
			$reachable	= ($status_response->result ?? false)===true;
			$server		= (object)[
				'reachable'	=> $reachable,
				'checks'	=> $status_response->data->checks ?? null,
				'msg'		=> $reachable
					? ($status_response->msg ?? 'Bun engine is ready')
					: ($status_response->msg ?? 'Diffusion server is unreachable (stopped or down)')
			];

		// in-flight processes (only worth asking when the server is up)
			$processes = [];
			if ($reachable===true) {
				$processes_response = diffusion_api_client::call((object)[
					'action' => 'list_processes'
				], 5);
				if (($processes_response->result ?? false)===true && isset($processes_response->processes)) {
					$processes = (array)$processes_response->processes;
				}
			}

		// effective configuration / diagnostics (read-only)
			$config = self::get_config_info();

		// pending unpublish deletions (count only; defensive — needs the diffusion ontology)
			$pending = null;
			try {
				$pending_response = dd_diffusion_api::retry_pending_deletions((object)[
					'options' => (object)['count_only' => true]
				]);
				if (($pending_response->result ?? false)!==false) {
					$pending = (int)($pending_response->count ?? 0);
				}
			} catch (Throwable $e) {
				$pending = null; // ontology not available / not applicable
			}

		// result
			$result = (object)[
				'server'		=> $server,
				'processes'		=> array_values($processes),
				'config'		=> $config,
				'pending'		=> $pending,
				'is_admin'		=> security::is_global_admin(logged_user_id())
			];

		// response
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';


		return $response;
	}//end get_value



	/**
	* START_SERVER
	* Start the diffusion server through the configured supervisor command.
	* Global-admin gated. @return object
	*/
	public static function start_server(object $options) : object {
		return self::run_service_command('start');
	}//end start_server



	/**
	* STOP_SERVER
	* Stop the diffusion server through the configured supervisor command.
	* Global-admin gated. @return object
	*/
	public static function stop_server(object $options) : object {
		return self::run_service_command('stop');
	}//end stop_server



	/**
	* RESTART_SERVER
	* Restart the diffusion server through the configured supervisor command.
	* Global-admin gated. @return object
	*/
	public static function restart_server(object $options) : object {
		return self::run_service_command('restart');
	}//end restart_server



	/**
	* CANCEL_PROCESS
	* Cancels one in-flight diffusion process by id (engine cancel_process).
	* Global-admin gated.
	* @param object $options { process_id : string }
	* @return object $response
	*/
	public static function cancel_process(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// permission
			if (security::is_global_admin(logged_user_id())!==true) {
				$response->msg		= 'Error. Only global administrators can cancel diffusion processes';
				$response->errors[]	= 'not_allowed';
				return $response;
			}

		// process_id validation (server-generated UUID-like string)
			$process_id = $options->process_id ?? null;
			if (!is_string($process_id) || $process_id==='') {
				$response->msg		= 'Error. Missing or invalid process_id';
				$response->errors[]	= 'invalid_process_id';
				return $response;
			}

		// delegate to the engine
			return diffusion_api_client::call((object)[
				'action'		=> 'cancel_process',
				'process_id'	=> $process_id
			], 10);
	}//end cancel_process



	/**
	* RETRY_PENDING_DELETIONS
	* Retries propagation of pending unpublish deletions. Delegates to
	* dd_diffusion_api (global-admin gated there too).
	* @param object $options
	* @return object $response
	*/
	public static function retry_pending_deletions(object $options) : object {

		return dd_diffusion_api::retry_pending_deletions((object)[
			'options' => $options
		]);
	}//end retry_pending_deletions



	/**
	* RUN_SERVICE_COMMAND
	* Executes the deployment-configured supervisor command for a validated
	* lifecycle keyword. The command template comes only from
	* DEDALO_DIFFUSION_SERVICE_CMD (admin config, trusted); the single variable
	* part is $action, validated against SERVICE_ACTIONS — so no request-derived
	* data ever reaches the shell.
	*
	* @param string $action - one of 'start'|'stop'|'restart'
	* @return object $response { result, msg, action, exit_code, output, errors }
	*/
	private static function run_service_command(string $action) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->action	= $action;
			$response->errors	= [];

		// permission: shell-level control is global-admin only
			if (security::is_global_admin(logged_user_id())!==true) {
				$response->msg		= 'Error. Only global administrators can control the diffusion server';
				$response->errors[]	= 'not_allowed';
				return $response;
			}

		// keyword validation (defense-in-depth against future callers)
			if (!in_array($action, self::SERVICE_ACTIONS, true)) {
				$response->msg		= 'Error. Invalid service action. Allowed: ' . implode('|', self::SERVICE_ACTIONS);
				$response->errors[]	= 'invalid_action';
				return $response;
			}

		// resolve command template (test override wins; '' = not configured)
			$template = self::$service_cmd_override
				?? (defined('DEDALO_DIFFUSION_SERVICE_CMD') ? DEDALO_DIFFUSION_SERVICE_CMD : '');
			if ($template==='') {
				$response->msg		= 'The diffusion service command is not configured. Set DEDALO_DIFFUSION_SERVICE_CMD in config.php (e.g. "systemctl --user %action% dedalo-diffusion") to enable start/stop/restart.';
				$response->errors[]	= 'service_cmd_not_configured';
				return $response;
			}

		// build command: substitute the validated keyword for %action%
			$command = str_replace('%action%', $action, $template);

		// execute (capture stdout+stderr and the exit code)
			$output		= [];
			$exit_code	= null;
			exec($command . ' 2>&1', $output, $exit_code);

			$output_text	= trim(implode("\n", $output));
			$ok				= ($exit_code===0);

			$response->result		= $ok;
			$response->exit_code	= (int)$exit_code;
			$response->output		= $output_text;
			$response->msg			= $ok
				? "OK. Diffusion server '$action' command executed."
				: "Error. Diffusion server '$action' command failed (exit $exit_code).";

			debug_log(__METHOD__
				. ' ' . $response->msg . PHP_EOL
				. ' output: ' . $output_text
				, $ok ? logger::DEBUG : logger::ERROR
			);


		return $response;
	}//end run_service_command



	/**
	* GET_CONFIG_INFO
	* Read-only diagnostics: which endpoint the PHP side would use to reach the
	* engine, whether the internal token and the service command are configured,
	* and the publication language/levels config. No secrets are exposed.
	* @return object
	*/
	private static function get_config_info() : object {

		// endpoint resolution mirrors diffusion_api_client::call (socket preferred)
			$socket_path = defined('DEDALO_DIFFUSION_SOCKET_PATH') ? DEDALO_DIFFUSION_SOCKET_PATH : null;
			$api_url	 = defined('DEDALO_DIFFUSION_API_URL') ? DEDALO_DIFFUSION_API_URL : '';
			if (!empty($socket_path) && file_exists($socket_path)) {
				$endpoint_in_use = 'unix socket: ' . $socket_path;
			} else if ($api_url!=='') {
				$endpoint_in_use = 'http: ' . diffusion_api_client::to_absolute_url($api_url);
			} else {
				$endpoint_in_use = 'none (no socket, no URL configured)';
			}

		// service command (do not echo the full template — only whether it is set)
			$service_cmd = self::$service_cmd_override
				?? (defined('DEDALO_DIFFUSION_SERVICE_CMD') ? DEDALO_DIFFUSION_SERVICE_CMD : '');

		return (object)[
			'endpoint_in_use'			=> $endpoint_in_use,
			'socket_path'				=> $socket_path,
			'api_url'					=> $api_url,
			'internal_token_configured'	=> defined('DEDALO_DIFFUSION_INTERNAL_TOKEN') && !empty(DEDALO_DIFFUSION_INTERNAL_TOKEN),
			'service_cmd_configured'	=> $service_cmd!=='',
			'langs'						=> defined('DEDALO_DIFFUSION_LANGS') ? DEDALO_DIFFUSION_LANGS : [],
			'resolve_levels'			=> defined('DEDALO_DIFFUSION_RESOLVE_LEVELS') ? DEDALO_DIFFUSION_RESOLVE_LEVELS : null
		];
	}//end get_config_info



}//end diffusion_server_control
