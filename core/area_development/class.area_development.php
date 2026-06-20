<?php declare(strict_types=1);
/**
* AREA_DEVELOPMENT
* Development area — the ontology-model anchor for the Dédalo developer workspace.
*
* This class is an intentional stub. Its sole responsibility is to exist as a
* named PHP class so that the ontology model-registry can locate the development
* area tipo (dd770, labelled "Development") via:
*
*   ontology_utils::get_ar_tipo_by_model('area_development')
*
* All behaviour (dashboard data, child-section enumeration, activity metrics,
* JSON API output, permission checks) is fully inherited from area_common.
*
* Relationships:
* - Extends area_common, which extends common.
* - Registered as a root area in area::get_areas(), positioned after
*   area_maintenance and before area_ontology in the main navigation list.
* - The JS counterpart (area_development/js/area_development.js) re-exports
*   the generic `area` view class unchanged — no development-specific client
*   logic exists at this level.
*
* @package Dédalo
* @subpackage Core
*/
class area_development extends area_common {


}
