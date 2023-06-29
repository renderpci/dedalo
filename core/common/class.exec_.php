<?php
/*
* CLASS EXEC COMMAND
*
*
*/
class exec_ {



	/**
	* EXEC COMMAND
	* @return bool
	*/
	public static function exec_command(string $command, string $to='2>&1') : bool {

		$output = NULL;

		try {

			// escape command for security
			$command = escapeshellcmd($command) . ' '.$to;

			// Exec command and get output
			$output = shell_exec( $command );

			// debug
				debug_log(__METHOD__
					. " Notice: exec command: " . PHP_EOL
					. ' command: ' . $command . PHP_EOL
					. ' output: ' . $output
					, logger::WARNING
				);

			if( !$output ) {
				debug_log(__METHOD__
					. " Error processing media command: " . PHP_EOL
					. ' command: ' . $command
					, logger::ERROR
				);
				throw new Exception("Error processing media command", 1);
			}

		}catch(Exception $e){

			debug_log(__METHOD__
				. " Exception: " . PHP_EOL
				. $e->getMessage()
				, logger::ERROR
			);

			// return ('Exception: '. $e->getMessage(). "\n");
			return false;
		}

		return true;
	}//end exec_command



	/**
	* EXEC SH FILE
	* @param string $file
	* @return int|null $PID
	*/
	public static function exec_sh_file(string $file) : ?int {

		$PID = null;

		try {
			// exec("sh $file > /dev/null &", $output); # funciona!!! <<<<
			// exec("sh $file > /dev/null 2>&1 & echo $!", $output); # return pid
			// $response = exec("sh $file > /dev/null 2>&1 & echo $!", $output);

			// exec command from sh file
				$response = exec("sh $file > /dev/null & echo $!", $output);

			// response check. Could be empty
				if ( empty($response) ) {
					debug_log(__METHOD__
						. " Warning processing media file. response is empty: " . PHP_EOL
						. ' file: ' . $file
						, logger::WARNING
					);
					// throw new Exception("Error Processing media file", 1);
				}

			// PID. Output returns the PID as ["3647"]
				$PID = isset($output[0])
					? (int)$output[0]
					: null;

			return $PID;

		}catch(Exception $e){

			debug_log(__METHOD__
				. " Exception: " . PHP_EOL
				. ' Exception message: ' . $e->getMessage()
				, logger::ERROR
			);

			// return ('Exception: '. $e->getMessage(). "\n");
		}

		return $PID;
	}//end exec_sh_file



	/**
	* GETCOMMANDPATH
	*/
	private static function getCommandPath(string $command='') {
		// note: security vulnerability...
		// should validate that $command doesn't
		// contain anything bad
		$path = `which $command`;
		if ($path != null) {
			$path = trim($path); // get rid of trailing line break
			return $path;
		} else {
			return false;
		}
	}//end getCommandPath



	/**
	 * LIVE_EXECUTE_COMMAND
	 * Execute the given command by displaying console output live to the user.
	 *  @param  string  cmd          :  command to be executed
	 *  @return array   exit_status  :  exit status of the executed command
	 *                  output       :  console output of the executed command
	 */
	public static function live_execute_command(string $cmd, bool $live=false) : array {

		if($live) while (@ ob_end_flush()); // end all output buffers if any

	    $proc = popen("$cmd 2>&1 ; echo Exit status : $?", 'r');

		$live_output 	 = "";
	    $complete_output = "";

	    while (!feof($proc))
	    {
	        $live_output     = fread($proc, 4096);
	        $complete_output = $complete_output . $live_output;
	        if ($live) {
	        	echo nl2br( $live_output );
	        	@ flush();
	        }
	    }
	    pclose($proc);

	    // get exit status
	    preg_match('/[0-9]+$/', $complete_output, $matches);

	    // return exit status and intended output
	    return array (
			'exit_status'	=> $matches[0],
			'output'		=> str_replace("Exit status : " . $matches[0], '', nl2br( trim($complete_output) ))
         );
	}//end live_execute_command



}//end class exec_



/* An easy way to keep in track of external processes.
 * Ever wanted to execute a process in php, but you still wanted to have somewhat control of the process ? Well.. This is a way of doing it.
 * @compatibility: Linux only. (Windows does not work).
 * @author: Peec
 */
class Process {
    private $pid;
    private $command;

    public function __construct($cl=false){
        if ($cl != false){
            $this->command = $cl;
            $this->runCom();
        }
    }
    private function runCom(){
		$command = 'nohup '.$this->command.' > /dev/null 2>&1 & echo $!';
        exec($command, $op);
        $this->pid = (int)$op[0];
    }

    public function setPid($pid){
        $this->pid = $pid;
    }

    public function getPid(){
        return $this->pid;
    }

    public function status(){
        $command = 'ps -p '.$this->pid;
        exec($command,$op);
        if (!isset($op[1]))return false;
        else return true;
    }

    public function start(){
        if ($this->command != '')$this->runCom();
        else return true;
    }

    public function stop(){
        $command = 'kill '.$this->pid;
        exec($command);
        if ($this->status() === false)return true;
        else return false;
    }
}//end class Process
