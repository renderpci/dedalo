<?php

class Exec {
	
	
	public static function exec_command($command) {
		
		//$command = 'ls /Users/paco/Sites/dedalo/media/av/tmp';
		
		try {
			
			#echo "<b>Command: ( exec(command ,output) )</b><br>" .$command ;
			
				#shell_exec($command);
				exec( $command , $output);				
				
				#print(shell_exec($command));
			 
			
			#echo "<hr><b>Command Output:</b><br>" ; 
			#var_dump($output);
			#echo "<hr>" ;
			
			return $output ;
			
		}catch(Exception $e){
			
			return ('Error: '. $e->getMessage(). "\n");		
		}
	}
	
	
	public static function exec_sh_file($file) {
				
		try {
			
			#exec("sh $file > /dev/null &", $output); # funciona!!! <<<<
			exec("sh $file > /dev/null 2>&1 & echo $!", $output); # return pid
			return intval($output[0]) ;
			
		}catch(Exception $e){
			
			return ('Error: '. $e->getMessage(). "\n");		
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