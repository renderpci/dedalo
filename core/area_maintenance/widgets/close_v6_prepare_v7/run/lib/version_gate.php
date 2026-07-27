<?php declare(strict_types=1);
/**
* VERSION_GATE — verify the connected DB is eligible for the v6→v7 migration.
*
* The migration descriptor (updates.php, v7.0.0 block) declares a MINIMUM source
* version (update_from_* = 6.8.10) and force_update_mode = 'clean'. Running the
* pipeline against an older/other DB would corrupt data. This gate reads the
* current data version from the connected DB (get_current_data_version() reads
* the matrix_updates table) and confirms a matching update descriptor exists —
* exactly the selection update::pre_update_version() performs — BEFORE any write.
*
* @package Dédalo
* @subpackage close_v6_prepare_v7
*/
final class prepare_v7_version_gate {


	/**
	* CHECK
	* @return object - {
	*   result:   bool,          eligible to migrate
	*   current:  array,         [major,medium,minor] currently in the DB
	*   target:   array|null,    version this migration would produce
	*   expected: array,         minimum update_from the descriptor requires
	*   msg:      string
	* }
	*/
	public static function check() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->current	= [];
			$response->target	= null;
			$response->expected	= [];
			$response->msg		= '';

		if (!function_exists('get_current_data_version') || !class_exists('update')) {
			$response->msg = 'Engine not booted: get_current_data_version()/update not available.';
			return $response;
		}

		$current = get_current_data_version();
		$response->current = $current;

		$updates = update::get_updates();

		// minimum expected (first descriptor's update_from)
		$first = array_key_first((array)$updates);
		if ($first !== null) {
			$response->expected = [
				$updates->$first->update_from_major,
				$updates->$first->update_from_medium,
				$updates->$first->update_from_minor,
			];
		}

		// find the descriptor whose update_from matches the current DB version
		// (identical logic to update::pre_update_version()).
		foreach ($updates as $u) {
			if (($current[0] ?? null) == $u->update_from_major
				&& ($current[1] ?? null) == $u->update_from_medium
				&& ($current[2] ?? null) == $u->update_from_minor) {

				$response->result = true;
				$response->target = [$u->version_major, $u->version_medium, $u->version_minor];
				$response->msg = 'Eligible: DB at ' . implode('.', $current)
					. ' → will migrate to ' . implode('.', $response->target) . '.';
				return $response;
			}
		}

		$response->msg = 'NOT eligible. DB data version (matrix_updates): '
			. (empty($current) ? '[none/fresh]' : implode('.', $current)) . '. '
			. 'This migration requires exactly ' . implode('.', $response->expected)
			. ' (see updates.php v7.0.0 update_from). Upgrade the v6 install to that version first.';

		return $response;
	}//end check


}//end prepare_v7_version_gate
