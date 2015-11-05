<?php
/*
* CLASS EXEC COMMAND
*/


class exec_ {
	
	/**
	* EXEC COMMAND
	*/
	public static function exec_command($command, $to='2>&1') {
		
		$output = NULL;

		try {

			# Scape command for security			
			$command = escapeshellcmd($command) . ' '.$to;

			

			# Exec command and get output
			$output  = shell_exec( $command );

			if(SHOW_DEBUG) {
				error_log("Notice: exec command: ".$command);
				error_log("Output: ".$output);
			}


			if( !$output )
				throw new Exception("Error processing media command", 1);				
			
		}catch(Exception $e){
			
			return ('Exception: '. $e->getMessage(). "\n");		
		}
		return true ;
	}

	
	/**
	* EXEC SH FILE
	*/
	public static function exec_sh_file($file) {

		try {			
			#exec("sh $file > /dev/null &", $output); # funciona!!! <<<<
			#exec("sh $file > /dev/null 2>&1 & echo $!", $output); # return pid
			#dump($file,"file");

			$response = exec("sh $file > /dev/null 2>&1 & echo $!", $output); 
			
			if ( !$response )
				throw new Exception("Error Processing media file", 1);

			if(!empty($output[0]))
				return intval($output[0]);
			
		}catch(Exception $e){
			
			return ('Exception: '. $e->getMessage(). "\n");		
		}
	}
	
	

	
	##
	private static function getCommandPath($command = '') {
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
	}


	/**
	 * LIVE_EXECUTE_COMMAND
	 * Execute the given command by displaying console output live to the user.
	 *  @param  string  cmd          :  command to be executed
	 *  @return array   exit_status  :  exit status of the executed command
	 *                  output       :  console output of the executed command
	 */
	public static function live_execute_command($cmd, $live=false) {
		
		if($live) while (@ ob_end_flush()); // end all output buffers if any			
	    
	    $proc = popen("$cmd 2>&1 ; echo Exit status : $?", 'r');
		
		$live_output 	 = "";
	    $complete_output = "";
	   
	    while (!feof($proc))
	    {
	        $live_output     = fread($proc, 4096);
	        $complete_output = $complete_output . $live_output;
	        if ($live) {
	        	echo nl2br("$live_output");
	        	@ flush();
	        }	        
	    }
	    pclose($proc);    	    

	    // get exit status
	    preg_match('/[0-9]+$/', $complete_output, $matches);

	    #dump($complete_output, ' $complete_output ++ '.to_string());

	    // return exit status and intended output
	    return array (
	                    'exit_status'  => $matches[0],
	                    'output'       => str_replace("Exit status : " . $matches[0], '', nl2br($complete_output))
	                 );
	}//end 

	
	
					
	
}




/* An easy way to keep in track of external processes.
 * Ever wanted to execute a process in php, but you still wanted to have somewhat controll of the process ? Well.. This is a way of doing it.
 * @compability: Linux only. (Windows does not work).
 * @author: Peec
 */
class Process{
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
        exec($command ,$op);
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
        if ($this->status() == false)return true;
        else return false;
    }
}


?>