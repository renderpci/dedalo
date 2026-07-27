<?php declare(strict_types=1);



/**
* AREA_ACTIVITY
* Top-level area node that surfaces the user-activity dashboard in Dédalo v7.
*
* This class is a leaf in the area hierarchy: it adds no new methods or
* properties because all activity-dashboard behaviour (record counts, the 30-day
* activity chart, section-color palette, JSON controller fallback) is already
* implemented in area_common. area_activity exists as a distinct class so that
* the ontology can assign it its own model name ('area_activity'), which lets
* area::get_areas() place it at the correct position in the sidebar navigation
* and lets ontology_utils::get_ar_tipo_by_model('area_activity') resolve its
* tipo (the dd* identifier registered in the ontology).
*
* Responsibilities:
* - Serve as the named PHP model for the activity area ontology node.
* - Inherit area_common::get_dashboard_data() (which aggregates
*   metric_total and metric_activity_30d across descendant sections),
*   area_common::get_json() (which falls back to area_common_json.php when no
*   dedicated <class>_json.php exists for this model), and
*   area_common::get_activity_metric() (on-demand range expansion for the
*   activity chart, invoked via the API action `get_activity_metric`).
* - The JS side (js/area_activity.js) simply re-exports the generic `area`
*   view class; no custom client logic is required.
*
* Activity data source:
* - All user actions are written to the PostgreSQL `matrix_activity` table
*   (section tipo dd542, constant DEDALO_ACTIVITY_SECTION_TIPO) by
*   logger_backend_activity. The dashboard queries that table directly via SQL
*   with JSONB operators — it does NOT instantiate section records per row, so
*   it scales to millions of activity entries.
* - The dd542 section holds five audit dimensions per activity row:
*   IP (dd544), WHO (dd543, relation → users), WHAT (dd545, relation → dd42),
*   WHERE (dd546, string component recording the target section tipo), and
*   WHEN (dd547, date).
*
* Relationships:
* - Extends area_common, which extends common.
* - Registered as a root area alongside area_resource, area_admin, area_tool,
*   area_thesaurus, area_graph, area_maintenance, area_development, and
*   area_ontology in area::get_areas().
* - No subclasses.
*
* @package Dédalo
* @subpackage Core
*/
class area_activity extends area_common {


}
