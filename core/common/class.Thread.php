<?php declare(strict_types=1);
declare(ticks=1);



class Thread {

	protected static $names = [];
	protected static $fibers = [];
	protected static $params = [];

	public static function register(string|int $name, callable $callback, array $params) {
		self::$names[]  = $name;
		self::$fibers[] = new Fiber($callback);
		self::$params[] = $params;
	}

	public static function run() {
		$output = [];

		while (self::$fibers) {
			foreach (self::$fibers as $i => $fiber) {
					try {
							if (!$fiber->isStarted()) {
									// Register a new tick function for scheduling this fiber
									register_tick_function('Thread::scheduler');
									$fiber->start(...self::$params[$i]);
							} elseif ($fiber->isTerminated()) {
									$output[self::$names[$i]] = $fiber->getReturn();
									unset(self::$fibers[$i]);
							} elseif ($fiber->isSuspended()) {
								$fiber->resume();
							}
					} catch (Throwable $e) {
							$output[self::$names[$i]] = $e;
					}
			}
		}

		return $output;
	}

	public static function scheduler () {
		if(Fiber::getCurrent() === null) {
			return;
		}

		// running Fiber::suspend() will prevent an infinite loop!
		if(count(self::$fibers) > 1)
		{
			Fiber::suspend();
		}
	}
}
