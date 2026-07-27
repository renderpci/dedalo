<?php declare(strict_types=1);
/**
* CLASS LOCK_COMPONENTS
* Manages component-level locking for real-time collaborative editing.
*
* Prevents concurrent-edit conflicts by tracking which user currently has focus
* on a specific component within a section record. Every focus/blur event sent
* from the browser is written into the shared lock registry; on focus, the class
* checks whether another user already holds the same component and refuses
* (returns in_use=true) if a conflict is detected.
*
* Concurrency:
*   Every registry mutation (update_lock_components_state, force_unlock_all_components,
*   clean_locks_garbage) runs inside a DBi transaction that holds a row lock on the
*   single registry row (SELECT ... FOR UPDATE). This serialises concurrent focus/blur
*   events so the read-modify-write can never lose an update or miss a conflict.
*
* Responsibilities:
* - update_lock_components_state() — process focus/blur/delete_user_section_locks events
*   and update the lock registry in the database accordingly (transaction + row lock).
* - get_lock_status()              — read-only check of whether another user holds a
*   component; used by the client notify-on-release poll.
* - force_unlock_all_components()  — remove every lock held by a given user (or all
*   users), called on logout and session expiry.
* - get_active_users()             — return the raw list of active focus locks (used
*   by the API layer and by get_active_users_full()).
* - get_active_users_full()        — enrich each lock entry with ontology labels for
*   display in the maintenance area.
* - drop_expired()                 — prune locks older than LOCK_TTL_SECONDS; run inline
*   on every mutation (lazy GC) so abandoned locks self-heal without a scheduled job.
* - clean_locks_garbage()          — explicit admin/maintenance sweep using drop_expired().
* - equal_elements()               — helper for comparing two event objects by
*   section_id, section_tipo, component_tipo, and action.
*
* Storage layout:
*   Table : LOCK_COMPONENTS_TABLE ('matrix_notifications')
*   Row   : id = RECORD_ID (1)  — shared with no other class (processes uses id=2)
*   Column: data (jsonb)        — JSON array of event-element objects:
*     [{ "section_id": string, "section_tipo": string, "component_tipo": string,
*        "action": "focus"|"blur", "user_id": int, "full_username": string,
*        "date": "YYYY-MM-DD HH:MM:SS" }, …]
*
* The array stores only active-focus locks; blur events remove entries rather than
* appending them. Array keys are normalised with array_values() before every DB
* write to avoid PostgreSQL treating a sparse PHP array as a JSON object.
*
* Activation:
*   The feature is opt-in and guarded by the global constant DEDALO_LOCK_COMPONENTS.
*   Callers (class.dd_core_api, class.login, dd_init_test) check that constant before
*   invoking any method here. The class itself does not check the constant; enforcement
*   is the caller's responsibility.
*
* Known callers:
* - dd_utils_api::update_lock_components_state() / ::get_lock_status() — API entry points
*   for browser focus/blur events and the notify-on-release poll.
* - dd_area_maintenance_api::lock_components_actions() — admin get/force-unlock API.
* - class.login::logout_user() / ::expire_session() — force-unlock on session end.
*
* @package Dédalo
* @subpackage Core
*/
class lock_components {



	/**
	* Name of the PostgreSQL table used as the lock registry.
	* 'matrix_notifications' is an UNLOGGED table shared by both lock_components (row id=1)
	* and the processes class (row id=2). UNLOGGED for write performance — do not add
	* critical transactional data here.
	* @var string LOCK_COMPONENTS_TABLE
	*/
	const LOCK_COMPONENTS_TABLE		= 'matrix_notifications';

	/**
	* Maximum age (in seconds) a focus lock may exist before being considered stale.
	* The browser refreshes its lock with a heartbeat (a focus re-send) roughly every
	* 45s, so a lock older than this almost certainly belongs to a crashed, closed, or
	* disconnected session. Used by drop_expired() (lazy GC run on every registry
	* mutation) and clean_locks_garbage() (the admin/maintenance sweep).
	* @var int LOCK_TTL_SECONDS
	*/
	const LOCK_TTL_SECONDS	= 150; // seconds (2.5 min ≈ 3 heartbeats of headroom)

	/**
	* Fixed row ID within LOCK_COMPONENTS_TABLE where the lock registry JSON is stored.
	* Row 1 belongs exclusively to lock_components; row 2 is owned by the processes class.
	* @var int RECORD_ID
	*/
	const RECORD_ID					= 1;



	/**
	* UPDATE_LOCK_COMPONENTS_STATE
	* Process a single browser lock event and synchronise the registry row in the database.
	*
	* Three actions are recognised:
	*   'focus'                    — the user is entering a component.
	*     - All previous locks from the same user on the same section/section_tipo are
	*       removed (prevents ghost locks when the user switches fields without triggering
	*       blur on the previous one).
	*     - If a *different* user already holds an active focus lock on the exact same
	*       component, the write is rejected and $response->in_use is set to true. The
	*       caller should surface the returned full_username to the end user.
	*     - On success the new event_element is appended to the registry.
	*   'blur'                     — the user left the component.
	*     - Removes the matching entry for this user+section+component combination.
	*   'delete_user_section_locks' — clear all locks this user holds within a section_tipo
	*     (used when a user navigates away from a section entirely).
	*
	* The database update uses pg_send_query_params / pg_get_result (async send with
	* synchronous wait) rather than pg_query_params to allow session_write_close()
	* to run in the API layer before this call without losing the response.
	*
	* @param object $event_element - lock event descriptor:
	*   {
	*     "section_id"    : string,   // record identifier within the section
	*     "section_tipo"  : string,   // ontology tipo of the section, e.g. "rsc167"
	*     "component_tipo": string,   // ontology tipo of the component, e.g. "rsc27"
	*     "action"        : string,   // "focus" | "blur" | "delete_user_section_locks"
	*     "user_id"       : int,      // numeric user ID from the session
	*     "full_username" : string,   // display name shown in conflict warnings
	*     "date"          : string    // "YYYY-MM-DD HH:MM:SS" timestamp of the event
	*   }
	* @return object $response
	*   {
	*     "result"  : bool,    // true on successful write; false on conflict or error
	*     "msg"     : string,  // human-readable status or conflict message
	*     "dato"    : array|null, // current lock array at the time of evaluation
	*     "in_use"  : bool     // true only when a different user holds the same component
	*   }
	*/
	public static function update_lock_components_state( object $event_element ) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';
				$response->dato		= null;
				$response->in_use	= false;

		$update_lock_elements = true;	// Default is true

		// short vars
			$id		= self::RECORD_ID;
			$table	= self::LOCK_COMPONENTS_TABLE;
			$conn	= DBi::_getConnection();

		// Serialise every registry mutation on the single registry row. The whole
		// read-modify-write runs inside one transaction holding a row lock
		// (SELECT ... FOR UPDATE), so two concurrent focus/blur events can never
		// interleave to lose an update or miss a conflict (two users acquiring the
		// same component). DBi self-heals a leaked block on the next pooled request.
		DBi::begin_transaction();
		try {

			// load + lock current db elements
			$res = pg_query_params($conn, 'SELECT data FROM "'.$table.'" WHERE id = $1 FOR UPDATE', [$id]);

			// create first row on empty table, then lock the freshly-created row
			if ($res===false || pg_num_rows($res)<1) {
				pg_query_params($conn, 'INSERT INTO "'.$table.'" (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [$id, '[]']);
				$res  = pg_query_params($conn, 'SELECT data FROM "'.$table.'" WHERE id = $1 FOR UPDATE', [$id]);
				$data = ($res!==false && pg_num_rows($res)>0)
					? (json_decode(pg_fetch_result($res, 0, 0)) ?? [])
					: [];
			}else{
				$data = json_decode(pg_fetch_result($res, 0, 0)) ?? [];
			}

			// lazy GC: prune stale locks while we already hold the row lock (near-zero cost)
			$data = self::drop_expired($data);

		// switch action
			$new_data = [];
			switch ($event_element->action) {

				case 'focus':
					foreach ($data as $key => $current_event_element) {

						if ($current_event_element->user_id==$event_element->user_id) {

							// same user (reset) delete all from this section
							// A user switching between components on the same record should never
							// accumulate stale focus locks for fields they are no longer editing.
							if (   $current_event_element->section_id==$event_element->section_id
								&& $current_event_element->section_tipo===$event_element->section_tipo
								) {

								unset($data[$key]);
							}

						}else{

							// different user . advice if component is already selected
							// Conflict detection: the exact triple (section_id, section_tipo,
							// component_tipo) must match for a conflict to be reported. Two users
							// may edit different fields of the same record concurrently.
							if (   $current_event_element->section_id==$event_element->section_id
								&& $current_event_element->section_tipo===$event_element->section_tipo
								&& $current_event_element->component_tipo===$event_element->component_tipo
								) {

								// update_lock_elements
									$update_lock_elements = false;

								// response
									$response->result = false;
									$response->msg 	  = sprintf(label::get_label('component_in_use'),''.$current_event_element->full_username.'');
									$response->dato   = $data;
									$response->in_use = true;
								break; // stop loop here
							}
						}
					}
					// fix data - reindex array after unset operations, then add new event
					$data = array_values($data); // Reindex array after unset operations
					$new_data = [...$data, $event_element];
					break;

				case 'blur':
					foreach ($data as $key => $current_event_element) {

						if (   $current_event_element->section_id==$event_element->section_id
							&& $current_event_element->section_tipo===$event_element->section_tipo
							&& $current_event_element->component_tipo===$event_element->component_tipo
							&& $current_event_element->user_id==$event_element->user_id
							) {

							unset($data[$key]);
						}
					}
					// fix data
					$new_data = $data;
					break;

				case 'delete_user_section_locks':
					// Remove all locks this user holds within the given section_tipo across
					// all section_id values. Used when the user closes or navigates away from
					// a section entirely. Note: the section_id condition is intentionally
					// commented out to cover navigation between records of the same section.
					foreach ($data as $key => $current_event_element) {

						if (
							// $current_event_element->section_id==$event_element->section_id &&
							$current_event_element->section_tipo===$event_element->section_tipo &&
							$current_event_element->user_id==$event_element->user_id
							) {
							// debug_log(__METHOD__." Deleting (unset) data key $key ".to_string($data[$key]), logger::DEBUG);

							unset($data[$key]);
						}
					}
					// fix data
					$new_data = $data;
					break;

				default:
					// update_lock_elements
						$update_lock_elements = false;

					// response
						$response->result = false;
						$response->msg 	  = "Error event_element->action not valid ($event_element->action)";

					debug_log(__METHOD__." $response->msg ", logger::ERROR);
					break;
			}

		// update_lock_elements
			if ($update_lock_elements===true) {

				// recreate data array keys
				// (!) PHP unset() on a foreach-iterated array leaves gaps in the numeric keys.
				// array_values() resets them to 0-based integers so json_encode() produces
				// a JSON array ([…]) instead of a JSON object ({"1":…,"3":…}).
					$new_data	= array_values($new_data);	// Recreate array keys to avoid produce json objects instead array
					$payload	= json_encode($new_data);	// Convert again to text before save to database
					$w			= pg_query_params($conn, 'UPDATE "'.$table.'" SET data = $1 WHERE id = $2', [$payload, $id]);
					if ($w===false) {
						throw new RuntimeException(__METHOD__.' UPDATE failed: '.pg_last_error($conn));
					}

				// response
					$response->result = true;
					$response->msg 	  = 'Updated db lock elements';
					$response->dato   = $data;
			}//end if ($update_lock_elements===true)

			DBi::commit_transaction();

		}catch (\Throwable $e) {
			DBi::rollback_transaction();
			debug_log(__METHOD__.' Transaction failed: '.$e->getMessage(), logger::ERROR);
			// $response retains result=false; any in_use set inside the switch is preserved
		}


		return $response;
	}//end update_lock_components_state



	/**
	* EQUAL_ELEMENTS
	* Compare two event-element objects for logical equality.
	*
	* Two events are considered equal when they refer to the same physical component
	* in the same record and carry the same action type. Used internally to deduplicate
	* lock entries before writing.
	*
	* Note: section_id is compared with loose equality (==) because it arrives as a
	* string from the client but may be stored as an integer in certain code paths.
	* section_tipo, component_tipo, and action use strict equality (===) because they
	* are always ontology tipo strings that must match exactly.
	*
	* @param object $event_element  - first event descriptor
	* @param object $event_element2 - second event descriptor
	* @return bool - true when the two events address the same component+action
	*/
	protected static function equal_elements( object $event_element, object $event_element2 ) : bool {

		if ($event_element->section_id == $event_element2->section_id &&
			$event_element->section_tipo === $event_element2->section_tipo &&
			$event_element->component_tipo === $event_element2->component_tipo &&
			$event_element->action === $event_element2->action
			) {
			return true;
		}

		return false;
	}//end equal_elements



	/**
	* DROP_EXPIRED
	* Remove lock entries older than LOCK_TTL_SECONDS (lazy garbage collection).
	*
	* Called inside the FOR UPDATE transaction of update_lock_components_state() — since
	* the row lock is already held and the array already decoded, pruning here is
	* near-zero cost and self-heals locks abandoned by crashed/closed sessions on every
	* registry mutation. Also reused by clean_locks_garbage() and get_lock_status().
	*
	* Entries without a parseable 'date' are dropped (malformed/legacy shapes are stale
	* by definition). The returned array is re-indexed so json_encode() yields a JSON
	* array, not an object.
	*
	* @param array $data - decoded list of event-element objects
	* @return array - the surviving (fresh) entries, 0-indexed
	*/
	protected static function drop_expired( array $data ) : array {

		$now	= time();
		$ttl	= self::LOCK_TTL_SECONDS;

		$result = [];
		foreach ($data as $event_element) {
			if (!isset($event_element->date)) {
				continue;
			}
			$ts = strtotime($event_element->date);
			if ($ts===false) {
				continue;
			}
			if ( ($ts + $ttl) >= $now ) {
				$result[] = $event_element;
			}
		}

		return array_values($result);
	}//end drop_expired



	/**
	* FORCE_UNLOCK_ALL_COMPONENTS
	* Remove active focus locks from the registry, optionally scoped to one user.
	*
	* Called in three situations:
	*  1. User logout (class.login::logout_user) — removes locks for the logging-out user.
	*  2. Session expiry — same as logout.
	*  3. Admin action via dd_area_maintenance_api::lock_components_actions() — may pass
	*     null to clear locks for all users simultaneously.
	*
	* Only entries whose 'action' property equals 'focus' are candidates for removal.
	* Stale entries from previous implementation iterations that lack an 'action' property
	* are also skipped (isset guard).
	*
	* @param int|string|null $user_id = null - user whose locks to remove;
	*   null or falsy value removes locks for all users
	* @return object $response
	*   {
	*     "result": bool,   // false when the registry row does not exist yet
	*     "msg"   : string  // description of outcome including removed count
	*   }
	*/
	public static function force_unlock_all_components( int|string|null $user_id=null ) : object {

		$response = new stdClass();

		// short vars
			$id		= self::RECORD_ID;
			$table	= self::LOCK_COMPONENTS_TABLE;

			$conn = DBi::_getConnection();

		// load + lock current db elements (serialise against concurrent focus/blur)
		DBi::begin_transaction();
		try {

			$res		= pg_query_params($conn, 'SELECT data FROM "'.$table.'" WHERE id = $1 FOR UPDATE', [$id]);
			$num_rows	= $res===false
				? 0
				: pg_num_rows($res);

			// empty table: nothing to unlock
			if ($num_rows<1) {

				$response->result	= false;
				$response->msg		= sprintf("Sorry. Record 1 on table %s not found. Ignored action.", $table);
				debug_log(__METHOD__." $response->msg ", logger::DEBUG);

			}else{

				$data = (array)json_decode(pg_fetch_result($res, 0, 0));

				$removed_elements=0;
				foreach ($data as $key => $current_event_element) {

					// Only remove focus locks; blur events are transient and should never
					// accumulate, but guard anyway to avoid touching unexpected entry shapes.
					if (isset($current_event_element->action) && $current_event_element->action==='focus') {

						if ( empty($user_id) ) {
							// All elements
							unset($data[$key]);
							$removed_elements++;

						}else{

							if ( $current_event_element->user_id==$user_id ) {
								// Only selected user elements (all sections)
								debug_log(__METHOD__
									." Deleting element from user $user_id ".to_string($current_event_element)
									, logger::DEBUG
								);
								unset($data[$key]);
								$removed_elements++;
							}
						}//end if (empty($user_id)) {
					}
				}//end foreach ($data as $key => $current_event_element)

				// Recreate data array keys, then save
					$new_data	= json_encode(array_values($data)); // re-index so json_encode yields an array, not an object
					$w			= pg_query_params($conn, 'UPDATE "'.$table.'" SET data = $1 WHERE id = $2', [$new_data, $id]);
					if ($w===false) {
						throw new RuntimeException(__METHOD__.' UPDATE failed: '.pg_last_error($conn));
					}

				// response OK
					$response->result	= true;
					$response->msg		= 'Updated db lock elements. Removed '.$removed_elements.' elements';
			}

			DBi::commit_transaction();

		}catch (\Throwable $e) {
			DBi::rollback_transaction();
			$response->result	= false;
			$response->msg		= 'Error. force_unlock_all_components failed';
			debug_log(__METHOD__.' Transaction failed: '.$e->getMessage(), logger::ERROR);
		}


		return $response;
	}//end force_unlock_all_components



	/**
	* GET_ACTIVE_USERS
	* Return the raw list of active focus locks from the lock registry.
	*
	* Reads the JSON array stored in the single registry row and filters it to
	* only those entries with action === 'focus'. Entries without an 'action'
	* property (legacy shape from earlier versions) are silently skipped.
	*
	* The result is consumed by:
	*  - get_active_users_full() — enriches entries with ontology labels.
	*  - dd_area_maintenance_api::lock_components_actions() — surfaces the list
	*    to administrators via the maintenance area UI.
	*
	* @return object $response
	*   {
	*     "result"         : bool,    // false when registry row is absent
	*     "msg"            : string,  // status description including active count
	*     "ar_user_actions": array    // array of focus-event objects (only on result=true)
	*   }
	*/
	public static function get_active_users() : object {

		$response = new stdClass();

		// short vars
			$id		= self::RECORD_ID;
			$table	= self::LOCK_COMPONENTS_TABLE;

		// load current db elements
			$sql = "SELECT data FROM \"$table\" WHERE id = $1 LIMIT 1";
			$res = matrix_db_manager::exec_search($sql, [$id]);
			$num_rows = $res===false
				? 0
				: pg_num_rows($res);

		// create first row on empty table
		if ($num_rows<1) {

			// response false
				$response->result	= false;
				$response->msg		= sprintf("Sorry. Record 1 on table %s not found. Ignored action.", $table);

			debug_log(__METHOD__
				." $response->msg "
				, logger::DEBUG
			);

		}else{

			$data	= pg_fetch_result($res, 0, 0);
			$data	= (array)json_decode($data);

			$ar_user_actions = array();
			foreach ($data as $current_event_element) {

				if (isset($current_event_element->action) && $current_event_element->action==='focus') {

					$ar_user_actions[] = $current_event_element;
				}
			}
			$response->ar_user_actions = $ar_user_actions;

			// response OK
				$response->result	= true;
				$response->msg		= sprintf("Active users focus elements: %s", count($ar_user_actions) );
		}


		return $response;
	}//end get_active_users



	/**
	* GET_ACTIVE_USERS_FULL
	* Return active focus locks enriched with human-readable ontology labels.
	*
	* Delegates to get_active_users() to obtain the raw lock list, then resolves
	* each entry's component_tipo and section_tipo through ontology_node to add:
	*  - component_model : the ontology model string for the component tipo
	*  - component_label : the display term for the component in the data language
	*  - section_label   : the display term for the section in the data language
	*
	* Each entry is cloned with clone before being augmented to avoid mutating
	* the underlying data retrieved from get_active_users().
	*
	* Used by dd_area_maintenance_api::lock_components_actions() to return a
	* display-ready payload to the maintenance area UI.
	*
	* @return array - array of enriched event-element objects; empty array when
	*   there are no active locks or when get_active_users() returns result=false
	*/
	public static function get_active_users_full() : array {

		$active_users_response = lock_components::get_active_users();

		$ar_user_actions = [];
		if ($active_users_response->result===true && !empty($active_users_response->ar_user_actions)) {
			foreach ($active_users_response->ar_user_actions as $current_event_element) {

				$item = clone $current_event_element;

				// add some useful information
				// Resolve ontology labels at this point (not at storage time) so that
				// the labels stay current even after ontology term renames.
					$item->component_model	= ontology_node::get_model_by_tipo($current_event_element->component_tipo, true);
					$item->component_label	= ontology_node::get_term_by_tipo($current_event_element->component_tipo, DEDALO_DATA_LANG, true);
					$item->section_label	= ontology_node::get_term_by_tipo($current_event_element->section_tipo, DEDALO_DATA_LANG, true);

				$ar_user_actions[] = $item;
			}
		}


		return $ar_user_actions;
	}//end get_active_users_full



	/**
	* GET_LOCK_STATUS
	* Read-only check of whether a component is currently held by another user.
	*
	* Used by the client notify-on-release poll: a user blocked on a component polls this
	* until in_use flips to false, then re-activates the field. It is a plain read (no
	* FOR UPDATE / transaction) because it never mutates the registry, and it applies the
	* same TTL filter as the write path so an expired holder reports as free.
	*
	* in_use is true only when a *different* user holds the triple — a user is never
	* blocked by their own lock — mirroring the conflict rule in update_lock_components_state().
	*
	* @param object $event_element - must carry section_id, section_tipo, component_tipo
	*   and the asking user_id (to exclude self-held locks)
	* @return object $response
	*   {
	*     "result"        : bool,        // false only on a read error
	*     "in_use"        : bool,        // true when another user holds this component
	*     "full_username" : string|null  // the holder's display name when in_use
	*   }
	*/
	public static function get_lock_status( object $event_element ) : object {

		$response = new stdClass();
			$response->result			= true;
			$response->in_use			= false;
			$response->full_username	= null;

		// short vars
			$id		= self::RECORD_ID;
			$table	= self::LOCK_COMPONENTS_TABLE;

		// load current db elements (read-only)
			$sql = 'SELECT data FROM "'.$table.'" WHERE id = $1 LIMIT 1';
			$res = matrix_db_manager::exec_search($sql, [$id]);
			if ($res===false || pg_num_rows($res)<1) {
				// no registry yet → nothing is locked
				return $response;
			}

			$data = json_decode(pg_fetch_result($res, 0, 0)) ?? [];
			$data = self::drop_expired($data);

		// look for a live focus lock held by another user on the exact triple
			foreach ($data as $current_event_element) {

				if (!isset($current_event_element->action) || $current_event_element->action!=='focus') {
					continue;
				}
				if (   $current_event_element->section_id == $event_element->section_id
					&& $current_event_element->section_tipo === $event_element->section_tipo
					&& $current_event_element->component_tipo === $event_element->component_tipo
					&& $current_event_element->user_id != $event_element->user_id
					) {
					$response->in_use		= true;
					$response->full_username	= $current_event_element->full_username ?? null;
					break;
				}
			}


		return $response;
	}//end get_lock_status



	/**
	* CLEAN_LOCKS_GARBAGE
	* Remove stale focus locks older than LOCK_TTL_SECONDS.
	*
	* This is the explicit admin/maintenance sweep (dd_area_maintenance_api). It is no
	* longer called on every bootstrap — the hot path self-heals via drop_expired() run
	* inside update_lock_components_state()'s locked transaction. Stale locks accumulate
	* when a browser session is closed abruptly (crash, network loss, force-quit) without
	* sending a blur or logout event.
	*
	* Entries older than LOCK_TTL_SECONDS (compared against the current server time) are
	* dropped via drop_expired(); fresh entries are kept and re-written unchanged.
	*
	* A WARNING-level log entry is emitted for each expired lock to aid debugging of
	* connectivity issues or abnormally long user sessions.
	*
	* Event format stored in the registry:
	* {
	*     "date"          : "2017-02-23 11:43:34",
	*     "action"        : "focus",
	*     "user_id"       : -1,
	*     "section_id"    : "1",
	*     "section_tipo"  : "dd234",
	*     "full_username" : "Debug user",
	*     "component_tipo": "dd249"
	* }
	*
	* @return object $response
	*   {
	*     "result": bool,   // false when the registry row is absent
	*     "msg"   : string  // outcome description ("OK" when nothing expired)
	*   }
	*/
	public static function clean_locks_garbage() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed clean_locks_garbage';

		// short vars
			$id		= self::RECORD_ID;
			$table	= self::LOCK_COMPONENTS_TABLE;
			$conn	= DBi::_getConnection();

		// load + lock current db elements (serialise against concurrent focus/blur)
		DBi::begin_transaction();
		try {

			$res		= pg_query_params($conn, 'SELECT data FROM "'.$table.'" WHERE id = $1 FOR UPDATE', [$id]);
			$num_rows	= $res===false
				? 0
				: pg_num_rows($res);

			// empty table: nothing to clean
			if ($num_rows<1) {

				$response->result	= false;
				$response->msg		= sprintf("Sorry. Record 1 on table %s not found. Ignored action.", $table);
				debug_log(__METHOD__." $response->msg ", logger::DEBUG);

			}else{

				$data		= (array)json_decode(pg_fetch_result($res, 0, 0));
				$new_data	= self::drop_expired($data);

				if (count($new_data) !== count($data)) {
					debug_log(__METHOD__
						.' Removed '.(count($data)-count($new_data)).' expired lock event(s) (> '.self::LOCK_TTL_SECONDS.' s)'
						, logger::WARNING
					);
					$w = pg_query_params($conn, 'UPDATE "'.$table.'" SET data = $1 WHERE id = $2', [json_encode($new_data), $id]);
					if ($w===false) {
						throw new RuntimeException(__METHOD__.' UPDATE failed: '.pg_last_error($conn));
					}
					$response->result	= true;
					$response->msg		= 'Updated db lock elements. Removed expired events';
				}else{
					$response->result	= true;
					$response->msg		= 'OK';
				}
			}

			DBi::commit_transaction();

		}catch (\Throwable $e) {
			DBi::rollback_transaction();
			$response->result	= false;
			$response->msg		= 'Error. Request failed clean_locks_garbage';
			debug_log(__METHOD__.' Transaction failed: '.$e->getMessage(), logger::ERROR);
		}


		return $response;
	}//end clean_locks_garbage



}//end class lock_components
