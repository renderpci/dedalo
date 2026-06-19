<?php declare(strict_types=1);

/**
* AREA_RESOURCE
* The Resources area — named PHP model anchor for the primary data-collection
* workspace in Dédalo v7.
*
* This class is an intentional stub. Its sole responsibility is to exist as a
* distinct named PHP class so that the ontology model-registry can resolve the
* resource area tipo via:
*
*   ontology_utils::get_ar_tipo_by_model('area_resource')
*
* and so that area::get_areas() can place it at the correct position in the
* global sidebar navigation (after area_activity, before area_tool).
*
* All behaviour — dashboard data aggregation, descendant section enumeration,
* 30-day activity metrics, the JSON API controller fallback, permission checks,
* and deterministic section colour generation — is fully inherited from
* area_common. No resource-specific overrides are needed because the generic
* infrastructure covers the full dashboard and navigation lifecycle.
*
* Typical descendant sections:
* - Audiovisual documents (rsc* tipos registered under this area's ontology node)
* - Still images, text documents, oral testimonies, and other media resource types.
* The exact set of child section tipos is determined at runtime by the ontology
* tree via area_common::get_dashboard_child_sections().
*
* JavaScript counterpart:
* - core/area_resource/js/area_resource.js re-exports the generic `area`
*   constructor unchanged; no resource-specific client logic is required.
* - core/area_resource/css/area_resource.less provides resource-area-specific
*   style overrides (if any) on top of the shared area LESS base.
*
* Relationships:
* - Extends area_common, which extends common.
* - Instantiated by area_common::get_instance() when the caller passes
*   model = 'area_resource'.
* - Referenced by area::get_areas() to build the root-area navigation list;
*   area_resource is always the third root area (after area_root and
*   area_activity).
* - No subclasses.
*
* @package Dédalo
* @subpackage Core
*/
class area_resource extends area_common {


}
