<?php declare(strict_types=1);


/**
* AREA_ROOT
* Concrete area node representing the application's root navigation area —
* the top-level container that sits above all other areas in the ontology tree.
*
* This class is intentionally a stub: it inherits the full dashboard, JSON
* controller, record counting, and activity-metric infrastructure from
* area_common and requires no behaviour of its own.
*
* Role in the ontology:
* - The ontology defines exactly one node whose model is 'area_root'. That node
*   acts as the absolute root of Dédalo's navigable area hierarchy; area::get_areas()
*   always lists it first when building the main menu.
* - Unlike every other area_* subclass, area_root does NOT group a specific domain
*   of content (resources, thesauri, admin…). It is a structural anchor: child areas
*   beneath it (if any are configured per installation) are surfaced through the
*   generic area_common dashboard.
* - component_security_access uses the 'area_root' model label to identify
*   the root level when building the permission tree (see
*   view_default_edit_security_access.js and the api_data.json sample fixture).
*
* JS counterpart (core/area_root/js/area_root.js):
*   Re-exports `area` as `area_root` — the client-side behaviour is identical to
*   the generic area view and no specialisation is required.
*
* CSS counterpart (core/area_root/css/area_root.less):
*   Provides an empty `.area_root {}` rule as a styling hook for installations
*   that need area_root-specific overrides; no styles are defined by default.
*
* JSON controller:
*   area_root ships no <class>_json.php file. area_common::get_json() therefore
*   falls back to area_common_json.php, which returns the generic dashboard payload
*   (context + section metrics) for this area.
*
* Extends: area_common (core/area_common/class.area_common.php)
*   Inherits: get_instance(), get_json(), get_dashboard_data(),
*              count_section_records(), metric_total(), metric_activity_30d(),
*              get_activity_metric(), get_dashboard_color(),
*              get_section_tipo(), get_section_id()
*
* @package Dédalo
* @subpackage Core
*/
class area_root extends area_common {



}
