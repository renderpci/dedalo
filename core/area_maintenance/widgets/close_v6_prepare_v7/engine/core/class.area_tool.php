<?php declare(strict_types=1);

/**
* AREA_TOOL
* Top-level area node that surfaces the Tools section in the Dédalo v7 navigation.
*
* This class is intentionally a leaf in the area hierarchy — it adds no new methods
* or properties. All dashboard behaviour (record counts, the 30-day activity chart,
* section-color palette, JSON controller fallback) is inherited from area_common.
*
* area_tool exists as a distinct class so that the ontology can assign it the model
* name 'area_tool', which allows:
* - area::get_areas() to resolve its tipo via
*   ontology_utils::get_ar_tipo_by_model('area_tool') and place it at the correct
*   position in the main menu (between area_resource and area_thesaurus in the
*   default root-area ordering).
* - ontology_utils::get_ar_tipo_by_model('area_tool') to return the dd* identifier
*   registered in the ontology for this area.
* - The front-end (js/area_tool.js) to re-export the generic `area` view class;
*   no custom client logic is required for the tools area.
*
* Child tool sections (e.g. tool_export, tool_print, tool_diffusion) are registered
* as ontology children of this area node and are surfaced via the standard
* area_common::get_dashboard_child_sections() walk. Individual tools are stored
* in the tools/ directory and may register their own section tipos.
*
* Relationships:
* - Extends area_common (core/area_common/class.area_common.php), which extends common.
* - Registered as a root area alongside area_root, area_activity, area_resource,
*   area_thesaurus, area_graph, area_admin, area_maintenance, area_development, and
*   area_ontology in area::get_areas().
* - No subclasses.
*
* @package Dédalo
* @subpackage Core
*/
class area_tool extends area_common {


}
