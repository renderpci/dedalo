<?php
// tests/BaseTestCase.php
use PHPUnit\Framework\TestCase;

class BaseTestCase extends TestCase
{



    public $last_section_id = 1;



    /**
	 * EXECUTION_TIMING
	 * @return void
	 */
	protected function execution_timing(string $action, callable $callback, int|float $estimated_time, int $from = 1, int $n = 10000): void
	{

		$start_time = start_time();

		$to = $from + $n;
		for ($i = $from; $i < $to; $i++) {
			$callback($i);
			$this->last_section_id = $i;
		}
		// Check the time consuming.
		$total_time = exec_time_unit($start_time);
		$max_time = $estimated_time * 1.6;
		debug_log(
			__METHOD__
				. " (" . strtoupper($action) . ") total_time ms: " . $total_time . " - average ms: $total_time/$n = " . $total_time / $n,
			logger::WARNING
		);
		$eq = $total_time < $max_time;

		$icon = $eq ? '✅' : '❌';

        echo PHP_EOL . ". $icon Execution time ($action) total_time ms: " . $total_time . " - average ms: $total_time/$n = " . $total_time / $n . " - estimated_time ms: $estimated_time" . PHP_EOL . PHP_EOL;

		$this->assertTrue(
			$eq,
			"massive ($action) expected execution time rows bellow $max_time ms" . PHP_EOL
				. 'total_time ms: ' . $total_time . PHP_EOL
				. 'estimated_time ms: ' . $estimated_time
		);        
	}//end execution_timing



}//end BaseTestCase
