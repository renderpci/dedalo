# Request config presets (Section layout maps)

## Introduction

The Request Config Presets allow administrators and privileged users to overwrite the default ontology definitions for the section layout. This means that they can redefine which elements (components, section groups, etc.) are displayed when the browser loads the selected section.

### Main concepts
The primary mechanism for rendering a section in Dédalo consists of retrieving the ontology section definition for the current section in the current mode ('edit' or 'list' primarily) and preparing all components for rendering on the client side, creating the context with all the necessary information (tipo, name, parent, tools, labels, etc.).
Users can create a custom set of components by overwriting this default context and creating Request Config Presets, which will be loaded and parsed to generate the new set.

#### Request config
A request config is a basic definition for creating a [RQO](../rqo.md) (Request Query Object) used in the Dédalo working API calls.
It is defined in the Ontology node properties for standard use, but can be overwritten using the local (per installation) request configuration presets.

## Creating new Request config presets
To create a new preset, create a new record in section [`dd1244`](https://dedalo.dev/ontology/dd1244) - Request config presets (Layout map).

!!! note "Menu path: Administration > List of values > Settings and tools > Request config presets (Layout map)"

### Inputs

---

- #### Name [dd624](https://dedalo.dev/ontology/dd624) String  
  Descriptive name of the preset.  
  It is used only to human location and description of the preset.  
    
    Sample: 'Numismatic Object list'  

---

- #### Tipo [dd1242](https://dedalo.dev/ontology/dd1242) String
  Tipo (ontology identifier [see more info](./index.md#what-dédalo-ontology-is)) of the element. Support is currently limited to sections.  
  It is used to locate the preset by tipo.  

    Sample: '[numisdata4](https://dedalo.dev/ontology/numisdata4)'

---

- #### Section tipo [dd642](https://dedalo.dev/ontology/dd642) String  
  Tipo (ontology identifier [see more info](./index.md#what-dédalo-ontology-is)) of the section.  
  It is used to locate the preset by section_tipo.  
  Note that 'could' seems redundant, but the combination of 'tipo' and 'section_tipo' will be used to extend the presets to components such as portals in the future.  

    Sample: '[numisdata4](https://dedalo.dev/ontology/numisdata4)'

---

- #### Mode [dd1246](https://dedalo.dev/ontology/dd1246) String
  Mode of the section visualization (edit | list).   
  It is used to locate the preset by mode.  
    
    Sample: 'list'

---

- #### User [dd654](https://dedalo.dev/ontology/dd654) Locator
  This is the user ID of the owner of the current preset.  
  This is used to locate the preset by user ID.  
    
    Sample (resolved value): 'Xavier'  
    Sample data: [{"type":"dd151","section_id":"5","section_tipo":"dd128","from_component_tipo":"dd654"}]

---

- #### Public [dd640](https://dedalo.dev/ontology/dd640) Locator
  Public status of the current preset (Yes | No).  
  It is used to filter presets by public status.  
  If value is 'Yes', other users will use this preset as a fallback when no self-presets are available.  
  If value is 'No', only the preset's owner can load it; all other users will load their own preset for the current section or the default ontology configuration instead.

    Sample (resolved value): 'Yes'  
    Sample data: [{"type":"dd151","section_id":"1","section_tipo":"dd64","from_component_tipo":"dd640"}]

---

- #### Active [dd1566](https://dedalo.dev/ontology/dd1566) Locator
  Active status of the current preset (Yes | No).  
  It is used to filter presets by active status.  
  If this is 'Yes', this preset will be available, else will be ignored when presets are loaded.  

    Sample (resolved value): 'Yes'  
    Sample data: [{"type":"dd151","section_id":"1","section_tipo":"dd64","from_component_tipo":"dd1566"}]

---

- #### JSON data [dd625](https://dedalo.dev/ontology/dd625) JSON
  Definition of the current preset. It contains an array with one or more [Request Config](../rqo.md) objects.  
  This JSON value will replace the current Ontology Request Config definition for the tipo + section_tipo + user id matches.  
  Users can define full [Request Config](../rqo.md) items, but for simplicity, only main properties used for the layout will be enumerated here.  

--- 

## Creating a [ddo_map](../rqo.md#parameters)

The **ddo_map** contains the list of all [ddo](../dd_object.md) items to display.  
There exists various **ddo_map** wrappers for different uses, but for display, we will use [show](../rqo.md#parameters) as follow:  
*{show > ddo_map > [ddo 1, ddo 2, ..]}*.

All [ddo](../dd_object.md) items to render must be inside **show > ddo_map** array property and follow this pattern:



* **info** : String with descriptive info about the **ddo**. Sample: *Type (component_portal)*
* **mode** : String with the preset target **[mode](../dd_object.md#properties)**. Sample: *list*
* **tipo** : String with the preset target **[tipo](../dd_object.md#properties)**. Sample: *numisdata158*
* **view** : String optional overwrites the default **[view](../dd_object.md#properties)** of the component. Sample: *line*
* **parent** : String with the **[tipo](../dd_object.md#properties)** of the section (the parent of current component). The value 'self' could be used to automatically resolve the current section type. Sample: *self*
* **section_tipo**: String with the **[tipo](../dd_object.md#properties)** of the section. The value 'self' could be used to automatically resolve the current section type. Sample: *self*

Mode **list** specifics

* **width** : String optional, only for list mode. Overwrites the default column **[width](../dd_object.md#properties)** in the list. Sample: *5rem*

#### Sample of JSON data [dd625](https://dedalo.dev/ontology/dd625) value for **LIST** mode:

```json
[
  {
    "show": {
      "ddo_map": [
        {
          "info": "Publishable (component_publication)",
          "mode": "list",
          "tipo": "numisdata158",
          "view": "line",
          "width": "5rem",
          "parent": "self",
          "section_tipo": "self"
        },
        {
          "info": "State (component_radio_button)",
          "tipo": "numisdata160",
          "width": "15.5rem",
          "parent": "self",
          "section_tipo": "self"
        },
        {
          "info": "Type (component_portal)",
          "tipo": "numisdata161",
          "view": "line",
          "width": "auto",
          "parent": "self",
          "section_tipo": "self"
        },
        {
          "info": "Obverse (component_portal)",
          "tipo": "numisdata164",
          "width": "106px",
          "parent": "self",
          "section_tipo": "self"
        },
        {
          "info": "Image (component_image)",
          "tipo": "rsc29",
          "view": "default",
          "parent": "numisdata164",
          "section_tipo": "rsc170"
        }
      ]
    }
  }
]
```

Mode **edit** specifics

* **properties** : Object optional, only for edit mode. Overwrites the default properties of the Ontology node **[properties](../dd_object.md#properties)**.
This is usually used to change the CSS of a component or to add a custom label to it.  
Sample:

```
    {
        "css": {
          ".wrapper_component": {
            "grid-column": "span 3",
            "background-color": "yellow"
          }
        },
        "label": {
          "lg-eng": "My Type",
          "lg-spa": "Mi tipo"
        }
    }
```

* **parent_grouper** : String optional, only for edit mode. Overwrites the default **[parent_grouper](../dd_object.md#properties)** property of the ddo 
(sets the parent node in the DOM to the current component node, usually a ***section_group*** defined previously).  
Sample: *numisdata129*


#### Sample of JSON data [dd625](https://dedalo.dev/ontology/dd625) value for **EDIT** mode:

```json
[
  {
    "show": {
      "ddo_map": [
        {
          "info": "Section group General",
          "tipo": "numisdata129",
          "parent": "self",
          "properties": {
            "css": {
              ".content_data": {
                "grid-template-columns": "repeat(10, 1fr)"
              }
            }
          },
          "section_tipo": "self"
        },
        {
          "info": "ID (component_section_id)",
          "tipo": "numisdata130",
          "parent": "self",
          "properties": {
            "css": {
              ".wrapper_component": {
                "grid-column": "span 1"
              }
            }
          },
          "section_tipo": "self",
          "parent_grouper": "numisdata129"
        },
        {
          "info": "Type (component_portal)",
          "tipo": "numisdata161",
          "view": "line",
          "parent": "self",
          "properties": {
            "css": {
              ".wrapper_component": {
                "grid-column": "span 3",
                "background-color": "yellow"
              }
            },
            "label": {
              "lg-eng": "My Type",
              "lg-spa": "Mi tipo"
            }
          },
          "section_tipo": "self",
          "parent_grouper": "numisdata129"
        },
        {
          "info": "Obverse (component_portal)",
          "tipo": "numisdata164",
          "view": "mosaic",
          "parent": "self",
          "properties": {
            "css": {
              ".wrapper_component": {
                "grid-row": "2 / span 4",
                "grid-column": "span 3"
              },
              ".wrapper_component.edit >.list_body": {
                "height": "20rem"
              },
              ".wrapper_component .wrapper_service_autocomplete .section_record": {
                "display": "flex",
                "justify-content": "space-between"
              }
            },
            "label": {
              "lg-eng": "My Obverse",
              "lg-spa": "Mi Obverse"
            }
          },
          "section_tipo": "self",
          "parent_grouper": "numisdata129"
        }
      ]
    }
  }
]
```

