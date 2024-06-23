# dd_object

## Introduction

Dédalo Ontology defines sections, areas, components with a default behavior and configuration. To call and modify this ontology nodes Dédalo use dd_objects.

For example; a section has his components, but in the list mode, the section will show only some specific components, not all, so, it is necessary a pointer to define what components will showed and his order, dd_object is the structure to point this ontology nodes to create specific configurations for different situations.

ddd_object is the way to call and modify the ontology nodes.

## dd_object definition

> ./core/common/class.dd_object.php

**dd_object** `object`

dd_object or ddo is a common definition of properties for nodes of the ontology. dd_object is a flexible and extensible object used to group, order, assign and change properties of nodes of the ontology, but dd_objects are not the nodes of the ontology, they are the callers and modifiers of the default definitions. Every ddo is a configuration specific to the ontology node that it represent.

ddo is use in multiple ways, for example ddos are used to define the order of the columns for lists; The section_list use it to define his columns with specific components in specific order and characteristics. The component_portal use it to define the components of the pointed section to show as columns.

Also ddo is used to request information at working API. Changing ddo properties is possible to change areas, components and sections behaviors on the fly.

### Structure

### Properties

| Property | Type | Description | Value Type | Options | Default | Example |
| --- | --- | --- | --- | --- | --- |  --- |
| typo | private  | `type of object`. Fixed property used to identify the dd_object in client | string | ddo |   ddo  |   |
| type | public | Defines the general model. It is used to apply common behaviors to components, buttons, etc.  | string | section \| component \| grouper \| button \| area \| tm \| widget \| install \| login \| menu \| tool \| detail \| dd_grid | component |  |
| tipo | public |  Defines the ontology identification 'tipo' | string |  |  |  oh14 |
| section_tipo | public |  Defines the ontology identification 'tipo' of the section, when the ddo is a section will be the same tipo ans section_tipo, when the ddo is a component it will be the section of it. | string |  |  |  oh1 |
| parent | public | Defines the ontology identification 'tipo' of the parent caller, for components will be the section_tipo, for components called by portals will be the component_portal | string |   |   |  oh2 |
| parent_grouper | public | Defines the ontology identification 'tipo' of the parent grouper or direct parent in hierarchy, for components will be a section_group, for sections will be the area | string |  |  |  oh7 |
| lang | public | Defines the lang of the ddo | string |  |  |  lg-eng |
| mode | public | Defines if the ddo will be config as edit, list, search, etc. | string |  |  |  list |
| model | public | Defines the specific model. This property differs of type property; type define if the ddo is a component or section, but model define if the ddo is a component_input_text or a button_new, etc. | string |  |  |  component_input_text |
| legacy_model | public | Used to know the legacy model defined in ontology. In v6 some models was unified as component_autocomplete, component_autocomplete_hi, component_autocomplete_ts were convert to component_portal, legacy model store his old model for compatibility with v5 in some situation as publishing. | string |  |  |  component_autocomplete_hi |
| properties | public | Defines the ontology properties of the ddo | object |  |  | {"source":"..."} |
| permissions | public | Defines the user permissions. It will be the same or less permissions of the user. This property is set by default by the user permissions, but is possible to reduce the value to avoid the access or create a read only version of the ontology node. It's not possible set bigger value of the current user permissions | int | 0 \| 1 \| 2 |  |  1 |
| label | public | Defines the name of the ontology node with the lang  | string |  |  |  Title |
| labels | public | Defines the names of variables, used by tools  | array \[string]  |  |  |  \['Title'] |
| translatable | public | Defines if the ontology node is translatable | bool  | true \| false | true | true |
| tools | public | Defines if the ontology node has tools associated | array \[string]  |  |  | \['tool_time_machine'] |
| buttons | public | Defines if the ontology node has buttons associated | array \[string]  |  |  | \['button_add'] |
| css | public | Defines css to apply at ontology node when will be rendered. ddo use a JSON to define CSS. The main object key if the CSS selector, his value is an object with key as CSS property and value as CSS value  | object  |  |  | {".wrapper_component": {"grid-column": "span 2"}} |
| target_sections | public | Defines the sections pointed by the ontology node. A component_portal call to at least one section, in some cases it could point to multiple section. If the ontology node use a common section, as toponymy (es1, fr1, etc) this property will set all possible sections for the ontology node | array\[object] |  |  |  \[{'tipo': 'dd125','label': 'Projects'}] |
| request_config | public | Defines the configuration of the ontology node. Used by component_portal to config his show, search and choose options, see request_config | array |  |  |  \[{"show": {"ddo_map": [...]}}] |
| columns_map | public | Defines the columns for list in sections and components. Columns map is used to know the order and the format of every columns in a list, the map will used to arrange the components with the same column_id in ddo_map. By default the columns_map will be the all ddo inside the ddo_map, 1 ddo = 1 column. | array\[object] |  |  |  \[{"id": "a", "label": "rsc368", "width": "65%"}] |
| view | public | Defines the render view that will use. Views are the final html and css of the components, sections, areas, tools, etc. If view is not set, the rendered will use "default" view. | string | string \| null | default |  table |
| children_view | public | Defines the render view that will use at every child of the ontology node. Used by sections and portals to spread specific view to his children. Views are the final html and css of the components, sections, areas, tools, etc. If view is not set, the rendered will use the parent node view. | string | string \| null |  |  text |
| name | public | Defines the tool name. Used only by tools to identify his class name | string |  |  |  tool_lang |
| description | public | Defines the tool description. Used only by tools to add some information about the tool | string |  |  |  Tool lang is used to translate... |
| icon | public | Defines the tool icon. Used only by tools to show his icon. It will be the path to the icon file in the directory tree. | string |  |  |  /tools/tool_lang/img/icon.svg |
| developer | public | Defines the tool developer info. Used by tools. | string |  |  |  Dédalo team |
| show_in_inspector | public | Defines if the tool will be see in inspector. Used only by tools to show his icon inside inspector. | bool |  |  |  true |
| show_in_component | public | Defines if the tool will be see at the top of the component in edit mode. Used only by tools to show his icon inside toolbar of the component. | bool |  |  |  true |
| config | public | Defines the section tool configuration. Used only by tools, it set the target section that will used by the tool. | object |  |  |  {"source_model": "section_tool", "source_section_tipo": "oh81", "target_section_tipo": "rsc167"} |
| tool_config | public | Defines the tool configuration. Used only by tools to retrieve or modify tool settings. | object |  |  |  {"tool_transcription": {"ddo_map": \[{"mode": "edit", "role": "media_component", "tipo": "rsc35", "section_id": "self", "section_tipo": "rsc167"}]}} |
| sortable | public | Used by components to define whether the component could rearrange its data. | bool |  true \| false  | |  false |
| fields_separator | public | Used by component_portal to define the separator character/s between fields when the data of the component will be join as text. Ex: Doe, John (surname - field separator - name) | string |  | ", " |  ", " |
| records_separator | public | Used by component_portal to define the separator character/s between records(rows) when the data of the component will be join as text. Ex: Doe, John \| Onielfa, Paco (surname - field separator - name - records_separator - surname - field separator - name ) | string |  | " \| " |  " \| " |
| autoload | public | Used by tools | boolean |  |  | false |
| role | public | Used by tools | string |  |  | 'main_component' |
| section_map | public | Used to point specific components into common definitions | object |  |  | {"thesaurus": {"term": "hierarchy25", "model": "hierarchy27", "order": "hierarchy48", "parent": "hierarchy36", "is_indexable": "hierarchy24", "is_descriptor": "hierarchy23"}} |
| color | public | Used by sections | string |  |  |  #dddddd |
| matrix_table | public | Used by components to modify show_interface values | string |  |  | matrix_list |
| relation_list | public | Used to know the legacy model defined in ontology. In v6 some models was unified as component_autocomplete, component_autocomplete_hi, component_autocomplete_ts were convert to component_portal, legacy model store his old model for compatibility with v5 in some situation as publishing. | string |  |  |  component_autocomplete_hi |

| // object features. Use this container to add custom properties like 'notes_publication_tipo' in text area
| public $features;
| // array toolbar_buttons
| public $toolbar_buttons;
| // bool value_with_parents
| public $value_with_parents;

| // array search_operators_info
| public $search_operators_info;
| // string search_options_title
| public $search_options_title;
| // string target_section_tipo
| public $target_section_tipo;

| // debug: object
| public $debug;
