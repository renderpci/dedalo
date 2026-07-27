<?php declare(strict_types=1);
/**
* AREA_ADMIN
* Administration area — the ontology-model anchor for the Dédalo admin workspace.
*
* This class is an intentional stub. Its only responsibility is to exist as a
* named PHP class so that the ontology model-registry can locate the admin area
* tipo via:
*
*   ontology_utils::get_ar_tipo_by_model('area_admin')
*
* All behaviour (dashboard data, child-section enumeration, activity metrics,
* JSON API output, permission checks) is fully inherited from area_common.
*
* Relationships:
* - Extends area_common, which extends common.
* - Referenced by component_security_access::get_ar_tipo_admin() to resolve
*   which ontology tipos belong to the administration tree.
* - Referenced by area::get_areas() when building the global navigation list;
*   'area_admin' is always the last major root area before area_maintenance.
* - The JS counterpart (area_admin/js/area_admin.js) re-exports the generic
*   `area` view class unchanged — no admin-specific client logic exists yet.
*
* @package Dédalo
* @subpackage Core
*/
class area_admin extends area_common {



}//end area_admin
