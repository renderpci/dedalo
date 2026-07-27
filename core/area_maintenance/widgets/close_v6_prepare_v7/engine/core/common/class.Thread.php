<?php declare(strict_types=1);
declare(ticks=1);



/**
* CLASS THREAD
* Cooperative multitasking scheduler built on PHP 8.1 Fibers.
*
* Provides a lightweight, single-process concurrency model that allows multiple
* callables to interleave their execution without threads or child processes.
* Each registered callable is wrapped in a PHP Fiber; the scheduler round-robins
* through them, suspending the active fiber at every tick when more than one fiber
* is pending. This lets I/O-bound tasks (e.g. parallel server calls, deferred
* batch processing) share CPU time inside a single PHP request.
*
* Responsibilities:
* - Register named callables together with their argument lists.
* - Start, resume, and retire Fibers in a cooperative loop until all complete.
* - Collect each fiber's return value (or a caught Throwable) keyed by its
*   registered name, and return the map to the caller.
*
* Usage pattern:
*   Thread::register('task_a', $callbackA, [$arg1, $arg2]);
*   Thread::register('task_b', $callbackB, [$arg1]);
*   $results = Thread::run();
*   // $results['task_a'] holds $callbackA's return value (or Throwable on error)
*   // $results['task_b'] holds $callbackB's return value (or Throwable on error)
*
* Limitations:
* - All state is held in static class arrays; Thread is not re-entrant. Running
*   nested Thread::run() calls from within a fiber is not safe.
* - The 'declare(ticks=1)' at file scope is required so register_tick_function()
*   fires after every low-level statement, enabling the scheduler to yield control.
* - The scheduler only suspends when two or more fibers are active. A single
*   registered fiber runs to completion without any suspension overhead.
*
* @package Dédalo
* @subpackage Core
*/
class Thread {

	/**
	* Registry of names for each in-flight fiber, keyed by sequential index.
	* Names are supplied by the caller via register() and used to key $output
	* in run(). Accepts string or integer names.
	* @var array $names
	*/
	protected static array $names = [];

	/**
	* Active Fiber instances, indexed in parallel with $names and $params.
	* Entries are unset (via unset()) once the corresponding fiber terminates,
	* which is the termination condition for the run() loop.
	* @var Fiber[] $fibers
	*/
	protected static array $fibers = [];

	/**
	* Argument lists for each fiber, indexed in parallel with $names and $fibers.
	* Each entry is the array of positional parameters that will be spread into
	* Fiber::start() via the splat operator.
	* @var array $params
	*/
	protected static array $params = [];

	/**
	* REGISTER
	* Enqueue a callable as a new cooperative fiber.
	*
	* Appends the name, a freshly constructed Fiber wrapping $callback, and the
	* argument list to the three parallel static arrays. Fibers are not started
	* here; they are started lazily by run() on the first iteration that visits them.
	* @param string|int $name     - caller-supplied key used to index $output in run()
	* @param callable   $callback - the body to run inside the fiber
	* @param array      $params   - positional arguments spread into Fiber::start()
	* @return void
	*/
	public static function register(string|int $name, callable $callback, array $params) : void {
		self::$names[]  = $name;
		self::$fibers[] = new Fiber($callback);
		self::$params[] = $params;
	}

	/**
	* RUN
	* Execute all registered fibers cooperatively and collect their results.
	*
	* Loops over the $fibers array until it is empty. On each pass:
	*   1. Un-started fibers are started (their callback begins executing).
	*      A tick function is registered first so the scheduler can preempt them.
	*   2. Suspended fibers are resumed, continuing from their last Fiber::suspend() point.
	*   3. Terminated fibers have their return value collected and are removed from
	*      the active set, shrinking the loop on the next iteration.
	*
	* Any Throwable thrown inside a fiber is caught here and stored as the result
	* for that fiber's name rather than bubbling up, so a failure in one fiber does
	* not abort the others.
	*
	* (!) The caller must check each value in the returned array: a Throwable instance
	* means that fiber failed. Normal values are whatever the registered callback returned.
	*
	* @return array - map of registered name → fiber return value, or Throwable on error
	*/
	public static function run() : array {
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

	/**
	* SCHEDULER
	* Tick callback that yields the currently executing fiber when peers exist.
	*
	* Called automatically after every PHP statement because of 'declare(ticks=1)'
	* at file scope. Its job is to prevent any single fiber from monopolising the
	* CPU while others are waiting:
	*   - When no fiber is currently running (Fiber::getCurrent() === null), the tick
	*     fired outside a fiber context (e.g. in the run() loop itself) — return early.
	*   - When only one fiber is registered, there is nothing else to schedule; skipping
	*     the suspend avoids an infinite suspend/resume cycle with a single task.
	*   - When two or more fibers are active, calling Fiber::suspend() hands control
	*     back to run(), which will then advance the next pending fiber.
	* @return void
	*/
	public static function scheduler() : void {
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
