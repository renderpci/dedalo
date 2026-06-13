<?php declare(strict_types=1);
/**
 * CACHE_MANAGER
 * Configurable per-request cache clearing for RoadRunner worker.
 *
 * SEC-023: Long-running RoadRunner workers leak per-user data across requests.
 * Static class caches hold materialised objects whose permission state was decided
 * for the previous user. This manager clears them between requests.
 *
 * Each cache clearer is registered with a name and can be enabled/disabled
 * individually. By default all are enabled for security.
 *
 * @package Dedalo
 * @subpackage RoadRunner
 */
namespace Dedalo\RoadRunner;

final class cache_manager {

	/**
	 * Registry of cache clearers: [name => callable].
	 * Each callable is a no-op when the class wasn't loaded yet for this request.
	 *
	 * @var array<string, callable>
	 */
	private array $clearers = [];

	/**
	 * Set of enabled clearer names. null means "all enabled".
	 *
	 * @var array<string,bool>|null
	 */
	private ?array $enabled = null;

	/**
	 * Constructor — registers all default cache clearers.
	 */
	public function __construct() {

		// Metrics reset
		$this->register('metrics', function(): void {
			if (class_exists('\metrics')) {
				\metrics::reset();
			}
		});

		// Raw body global
		$this->register('raw_body', function(): void {
			$GLOBALS['DEDALO_RAW_BODY'] = null;
		});

		// Error sentinel (SEC-023)
		$this->register('error_sentinel', function(): void {
			unset($_ENV['DEDALO_LAST_ERROR']);
		});

		// common::clear() — clears cache_structure_context and other static caches
		$this->register('common', function(): void {
			if (class_exists('\common')) {
				\common::clear();
			}
		});

		// section instances
		$this->register('section', function(): void {
			// if (class_exists('\section') && method_exists('\section', 'clear')) {
			// 	\section::clear();
			// }
		});

		// hierarchy — main lang map, section map elements, section instances
		$this->register('hierarchy', function(): void {
			if (class_exists('\hierarchy', false)) {
				\hierarchy::clear();
			}
		});

		// ts_object — term resolution cache + resolved children cache.
		// Stale across requests in worker mode otherwise (a term edited in one
		// request would keep serving its old cached string in the next).
		$this->register('ts_object', function(): void {
			if (class_exists('\ts_object', false)) {
				\ts_object::clear();
			}
		});

		// component_common — list_of_values (datalist) caches. COMP-03: these are
		// process-wide statics holding per-user, project-filtered option lists; left
		// uncleared they leak one user's options to the next request in the worker
		// (the class contract documents clear() as the reset hook). Pairs with the
		// user-scoped cache key in component_common::get_list_of_values (COMP-01).
		$this->register('component_common', function(): void {
			if (class_exists('\component_common', false) && method_exists('\component_common', 'clear')) {
				\component_common::clear();
			}
		});

		// ontology
		$this->register('ontology', function(): void {
			// if (class_exists('\ontology') && method_exists('\ontology', 'clear')) {
			// 	\ontology::clear();
			// }
		});

		// section_record_instances_cache
		$this->register('section_record_instances_cache', function(): void {
			// if (class_exists('\section_record_instances_cache') && method_exists('\section_record_instances_cache', 'clear')) {
			// 	\section_record_instances_cache::clear();
			// }
		});

		// component_instances_cache
		$this->register('component_instances_cache', function(): void {
			// if (class_exists('\component_instances_cache') && method_exists('\component_instances_cache', 'clear')) {
			// 	\component_instances_cache::clear();
			// }
		});
	}

	/**
	 * REGISTER
	 * Adds a cache clearer to the registry.
	 *
	 * @param string $name Unique identifier
	 * @param callable $clearer Function that clears the cache
	 * @return void
	 */
	public function register(string $name, callable $clearer) : void {

		$this->clearers[$name] = $clearer;
	}

	/**
	 * CONFIGURE
	 * Sets which cache clearers are enabled.
	 *
	 * @param array<string> $enabled List of clearer names to enable.
	 *                               Empty array disables all. Null enables all.
	 * @return void
	 */
	public function configure(?array $enabled) : void {

		$this->enabled = $enabled === null
			? null
			: array_flip($enabled);
	}

	/**
	 * RESET
	 * Executes all enabled cache clearers for the current request.
	 *
	 * @return void
	 */
	public function reset() : void {

		foreach ($this->clearers as $name => $clearer) {
			// If enabled is null, all are enabled; otherwise check the set
			if ($this->enabled === null || isset($this->enabled[$name])) {
				$clearer();
			}
		}
	}
}
