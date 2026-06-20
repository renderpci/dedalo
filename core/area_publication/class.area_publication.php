<?php declare(strict_types=1);


/**
* AREA_PUBLICATION
* Top-level area node that represents the publication workspace in Dédalo v7.
*
* This class is an intentional stub. Its sole responsibility is to exist as a
* named PHP class so that the ontology model-registry can locate the publication
* area tipo via:
*
*   ontology_utils::get_ar_tipo_by_model('area_publication')
*
* "Publication" in Dédalo refers to the diffusion pipeline that exposes curated
* catalogue data to external consumers (SQL/RDF/XML targets, the Bun-owned
* MariaDB, Socrata, etc.). The publication area groups the sections and tools
* related to that pipeline, making them accessible through the sidebar navigation
* and the standard area dashboard.
*
* All behaviour (dashboard data, descendant-section enumeration, 30-day activity
* metrics, JSON API output via the area_common_json.php fallback, and permission
* checks) is fully inherited from area_common. No publication-specific override is
* needed at this level because the diffusion pipeline itself lives in the
* diffusion/ subsystem, not in the area class.
*
* Relationships:
* - Extends area_common, which extends common.
* - Resolved by ontology_utils::get_ar_tipo_by_model('area_publication') to
*   obtain the concrete dd* tipo registered in the ontology.
* - area::get_areas() collects child area/section tipos under this node via
*   area::get_ar_children_areas_recursive(), surfacing them in the main menu.
* - The JS counterpart (js/area_publication.js) re-exports the generic `area`
*   view class unchanged — no publication-specific client logic exists at this
*   level.
* - CSS placeholder (css/area_publication.less) is intentionally empty; style
*   overrides for publication-related components belong in their own .less files.
* - No subclasses.
*
* @package Dédalo
* @subpackage Core
*/
class area_publication extends area_common {



}//end area_publication
