# Request Config - Practical Examples

This document provides real-world examples of `request_config` configurations for common scenarios.

## Table of Contents

1. [Section List Configuration](#1-section-list-configuration)
2. [Section Edit Configuration](#2-section-edit-configuration)
3. [Portal Component](#3-portal-component)
4. [Autocomplete with Search/Choose](#4-autocomplete-with-searchchoose)
5. [Autocomplete Thesaurus](#5-autocomplete-thesaurus)
6. [External API Integration](#6-external-api-integration)
7. [Hierarchical Portal](#7-hierarchical-portal)
8. [Multi-Section Portal](#8-multi-section-portal)
9. [With Pre-filters](#9-with-pre-filters)
10. [With Fixed Filter](#10-with-fixed-filter)
11. [With Interface Controls](#11-with-interface-controls)
12. [Dynamic DDO Map](#12-dynamic-ddo-map)

---

## 1. Section List Configuration

**Scenario**: Configure a section to display a list of numismatic objects with key columns.

```json
{
  "source": {
    "request_config": [
      {
        "api_engine": "dedalo",
        "type": "main",
        "sqo": {
          "section_tipo": [
            {
              "value": ["numisdata3"],
              "source": "section"
            }
          ]
        },
        "show": {
          "ddo_map": [
            {
              "tipo": "numisdata413",
              "section_tipo": "self",
              "parent": "self",
              "mode": "list",
              "view": "line"
            },
            {
              "tipo": "numisdata27",
              "section_tipo": "self",
              "parent": "self"
            },
            {
              "tipo": "numisdata30",
              "section_tipo": "self",
              "parent": "self"
            },
            {
              "tipo": "numisdata35",
              "section_tipo": "self",
              "parent": "self"
            }
          ],
          "sqo_config": {
            "limit": 10,
            "offset": 0,
            "full_count": true,
            "operator": "$or"
          }
        }
      }
    ]
  }
}
```

**Explanation**:
- `api_engine: "dedalo"` - Use internal Dédalo API
- `section_tipo` - Target section to query
- `ddo_map` - Columns to display (Publication, Number, Mint, Date)
- `sqo_config` - Pagination and search behavior

---

## 2. Section Edit Configuration

**Scenario**: Configure section edit mode with grouped components.

```json
{
  "source": {
    "request_config": [
      {
        "api_engine": "dedalo",
        "sqo": {
          "section_tipo": [
            {
              "value": ["numisdata3"],
              "source": "section"
            }
          ],
          "limit": 1
        },
        "show": {
          "ddo_map": [
            {
              "tipo": "numisdata100",
              "section_tipo": "self",
              "parent": "self",
              "mode": "edit",
              "properties": {
                "css": {
                  ".content_data": {
                    "grid-template-columns": "repeat(3, 1fr)"
                  }
                }
              }
            },
            {
              "tipo": "numisdata130",
              "section_tipo": "self",
              "parent": "self",
              "parent_grouper": "numisdata100"
            },
            {
              "tipo": "numisdata27",
              "section_tipo": "self",
              "parent": "self",
              "parent_grouper": "numisdata100"
            },
            {
              "tipo": "numisdata28",
              "section_tipo": "self",
              "parent": "self",
              "parent_grouper": "numisdata100"
            }
          ]
        }
      }
    ]
  }
}
```

**Explanation**:
- `limit: 1` - Only one record in edit mode
- `parent_grouper` - Components placed inside section_group
- `properties.css` - Custom styling for the group

---

## 3. Portal Component

**Scenario**: Portal showing coins within a type record.

```json
{
  "source": {
    "mode": "autocomplete",
    "request_config": [
      {
        "api_engine": "dedalo",
        "sqo": {
          "section_tipo": [
            {
              "value": ["numisdata4"],
              "source": "section"
            }
          ]
        },
        "show": {
          "ddo_map": [
            {
              "tipo": "numisdata164",
              "section_tipo": "self",
              "parent": "self",
              "view": "mosaic"
            },
            {
              "tipo": "rsc29",
              "section_tipo": "rsc170",
              "parent": "numisdata164",
              "view": "thumbnail"
            }
          ],
          "sqo_config": {
            "limit": 50
          }
        }
      }
    ]
  }
}
```

**Explanation**:
- Portal shows coins (`numisdata4`) with mosaic view
- Nested ddo for images (`rsc29`) inside coin portal
- Higher limit for portal display

---

## 4. Autocomplete with Search/Choose

**Scenario**: Autocomplete component with different fields for searching vs selecting.

```json
{
  "source": {
    "mode": "autocomplete",
    "request_config": [
      {
        "api_engine": "dedalo",
        "sqo": {
          "section_tipo": [
            {
              "value": ["numisdata4"],
              "source": "section"
            }
          ]
        },
        "show": {
          "ddo_map": [
            {
              "tipo": "numisdata27",
              "section_tipo": "self",
              "parent": "self"
            }
          ],
          "fields_separator": ", "
        },
        "search": {
          "ddo_map": [
            {
              "tipo": "numisdata27",
              "section_tipo": "self",
              "parent": "self"
            },
            {
              "tipo": "numisdata81",
              "section_tipo": "self",
              "parent": "self"
            }
          ],
          "sqo_config": {
            "limit": 30
          }
        },
        "choose": {
          "ddo_map": [
            {
              "tipo": "numisdata27",
              "section_tipo": "self",
              "parent": "self"
            },
            {
              "tipo": "numisdata30",
              "section_tipo": "self",
              "parent": "self"
            }
          ],
          "fields_separator": " | "
        }
      }
    ]
  }
}
```

**Explanation**:
- `show` - Default display when linked
- `search` - Fields searched when typing (Number, Key)
- `choose` - Fields shown in dropdown (Number, Mint)
- `fields_separator` - Separator between multiple values

---

## 5. Autocomplete Thesaurus

**Scenario**: Autocomplete for thesaurus terms with parent display.

```json
{
  "source": {
    "mode": "autocomplete",
    "request_config": [
      {
        "api_engine": "dedalo",
        "sqo": {
          "section_tipo": [
            {
              "value": [2],
              "source": "hierarchy_types"
            }
          ]
        },
        "show": {
          "ddo_map": [
            {
              "tipo": "hierarchy25",
              "section_tipo": "self",
              "parent": "self",
              "value_with_parents": 1
            }
          ],
          "fields_separator": ", "
        },
        "search": {
          "ddo_map": [
            {
              "tipo": "hierarchy25",
              "section_tipo": "self",
              "parent": "self",
              "value_with_parents": 1
            }
          ],
          "sqo_config": {
            "limit": 30
          }
        },
        "choose": {
          "ddo_map": [
            {
              "tipo": "hierarchy25",
              "section_tipo": "self",
              "parent": "self",
              "value_with_parents": 1
            },
            {
              "tipo": "hierarchy27",
              "section_tipo": "self",
              "parent": "self"
            }
          ],
          "sqo_config": {
            "limit": 30
          },
          "fields_separator": " | "
        }
      }
    ]
  }
}
```

**Explanation**:
- `source: "hierarchy_types"` - Dynamic section resolution
- `value_with_parents: 1` - Show term hierarchy (e.g., "Roman > Aureus")
- Multiple fields in choose for richer selection display

---

## 6. External API Integration

**Scenario**: Zenon API integration for bibliographic search.

```json
{
  "source": {
    "mode": "autocomplete",
    "request_config": [
      {
        "api_engine": "zenon",
        "sqo": {
          "section_tipo": [
            {
              "value": ["zenon1"],
              "source": "section"
            }
          ]
        },
        "show": {
          "ddo_map": [
            {
              "tipo": "zenon5",
              "section_tipo": "self",
              "parent": "self",
              "fields_map": true
            }
          ],
          "fields_separator": ". "
        },
        "search": {
          "ddo_map": [
            {
              "tipo": "zenon5",
              "section_tipo": "self",
              "parent": "self",
              "fields_map": true
            }
          ],
          "sqo_config": {
            "limit": 20
          }
        },
        "choose": {
          "ddo_map": [
            {
              "tipo": "zenon5",
              "section_tipo": "self",
              "parent": "self",
              "fields_map": true
            }
          ],
          "sqo_config": {
            "limit": 30
          }
        }
      }
    ]
  }
}
```

**Zenon Section Properties (for api_config)**:
```json
{
  "api_config": {
    "api_url": "https://zenon.dainst.org/api/v1/record",
    "api_key": "",
    "response_format": "json",
    "field_mapping": {
      "title": "title",
      "author": "author",
      "year": "year"
    }
  }
}
```

**Explanation**:
- `api_engine: "zenon"` - Use external Zenon API
- `fields_map: true` - Use component's field mapping configuration
- `api_config` defined in target section's properties

---

## 7. Hierarchical Portal

**Scenario**: Portal with nested components (coin -> obverse/reverse -> image).

```json
{
  "source": {
    "request_config": [
      {
        "api_engine": "dedalo",
        "sqo": {
          "section_tipo": [
            {
              "value": ["numisdata3"],
              "source": "section"
            }
          ]
        },
        "show": {
          "ddo_map": [
            {
              "tipo": "numisdata27",
              "section_tipo": "self",
              "parent": "self"
            },
            {
              "tipo": "numisdata77",
              "section_tipo": "self",
              "parent": "self"
            },
            {
              "tipo": "numisdata164",
              "section_tipo": "numisdata4",
              "parent": "numisdata77"
            },
            {
              "tipo": "rsc29",
              "section_tipo": "rsc170",
              "parent": "numisdata164",
              "view": "default"
            },
            {
              "tipo": "numisdata165",
              "section_tipo": "numisdata4",
              "parent": "numisdata77"
            },
            {
              "tipo": "rsc29",
              "section_tipo": "rsc170",
              "parent": "numisdata165",
              "view": "default"
            }
          ]
        }
      }
    ]
  }
}
```

**Explanation**:
- Parent-child relationships create visual hierarchy
- Multiple sections (`numisdata3`, `numisdata4`, `rsc170`) in same config
- Same component type (`rsc29`) used with different parents

---

## 8. Multi-Section Portal

**Scenario**: Portal that searches across multiple section types.

```json
{
  "source": {
    "mode": "autocomplete",
    "request_config": [
      {
        "api_engine": "dedalo",
        "sqo": {
          "section_tipo": [
            {
              "value": ["es1", "fr1", "it1"],
              "source": "section"
            }
          ]
        },
        "show": {
          "ddo_map": [
            {
              "tipo": "hierarchy25",
              "section_tipo": "self",
              "parent": "self"
            }
          ],
          "fields_separator": ", "
        },
        "search": {
          "ddo_map": [
            {
              "tipo": "hierarchy25",
              "section_tipo": "self",
              "parent": "self"
            }
          ],
          "sqo_config": {
            "limit": 30
          }
        },
        "choose": {
          "ddo_map": [
            {
              "tipo": "hierarchy25",
              "section_tipo": "self",
              "parent": "self"
            }
          ],
          "fields_separator": " | "
        }
      }
    ]
  }
}
```

**Explanation**:
- Multiple sections in `section_tipo` array
- Searches all three toponymy hierarchies (Spain, France, Italy)
- `self` resolves to all section_tipos in context

---

## 9. With Pre-filters

**Scenario**: Portal pre-filtered by a dropdown selection.

```json
{
  "source": {
    "request_config": [
      {
        "api_engine": "dedalo",
        "sqo": {
          "section_tipo": [
            {
              "value": ["numisdata4"],
              "source": "section"
            }
          ],
          "filter_by_list": [
            {
              "tipo": "numisdata140",
              "value": ["numisdata141"]
            }
          ]
        },
        "show": {
          "ddo_map": [
            {
              "tipo": "numisdata27",
              "section_tipo": "self",
              "parent": "self"
            }
          ]
        }
      }
    ]
  }
}
```

**Explanation**:
- `filter_by_list` - Pre-filter records by list selection
- User can only see records matching the filter
- Useful for categorized portals

---

## 10. With Fixed Filter

**Scenario**: Portal showing only records related to current record.

```json
{
  "source": {
    "request_config": [
      {
        "api_engine": "dedalo",
        "sqo": {
          "section_tipo": [
            {
              "value": ["numisdata4"],
              "source": "section"
            }
          ],
          "fixed_filter": [
            {
              "source": {
                "component_tipo": "numisdata30",
                "section_tipo": "numisdata3",
                "section_id": "self"
              }
            }
          ]
        },
        "show": {
          "ddo_map": [
            {
              "tipo": "numisdata27",
              "section_tipo": "self",
              "parent": "self"
            }
          ]
        }
      }
    ]
  }
}
```

**Explanation**:
- `fixed_filter` - Context-dependent filtering
- `section_id: "self"` - Uses current record's section_id
- Results depend on calling record's data
- **Note**: Disables caching

---

## 11. With Interface Controls

**Scenario**: Portal with custom button configuration.

```json
{
  "source": {
    "request_config": [
      {
        "api_engine": "dedalo",
        "sqo": {
          "section_tipo": [
            {
              "value": ["numisdata4"],
              "source": "section"
            }
          ]
        },
        "show": {
          "ddo_map": [
            {
              "tipo": "numisdata27",
              "section_tipo": "self",
              "parent": "self"
            }
          ],
          "interface": {
            "read_only": false,
            "save_animation": true,
            "value_buttons": true,
            "button_add": true,
            "button_delete": true,
            "button_delete_link": true,
            "button_delete_link_and_record": false,
            "button_link": true,
            "button_edit": true,
            "button_edit_options": {
              "action_mousedown": "navigate",
              "action_contextmenu": "open_window"
            },
            "button_list": true,
            "tools": false,
            "button_external": false,
            "button_fullscreen": true,
            "button_save": true,
            "button_tree": false,
            "show_autocomplete": true,
            "show_section_id": true
          }
        }
      }
    ]
  }
}
```

**Available Interface Controls**:

| Property | Default | Description |
|----------|---------|-------------|
| `read_only` | false | Disable editing |
| `save_animation` | true | Green flash on save |
| `value_buttons` | true | Edit/delete per value |
| `button_add` | true | Add new record |
| `button_delete` | true | Delete record |
| `button_delete_link` | true | Unlink option in delete modal |
| `button_delete_link_and_record` | true | Unlink+delete option |
| `button_link` | true | Link existing record |
| `button_edit` | false | Edit button in rows |
| `button_list` | true | List button |
| `tools` | true | Component tools |
| `button_fullscreen` | true | Fullscreen toggle |
| `show_autocomplete` | true | Autocomplete search |

---

## 12. Dynamic DDO Map

**Scenario**: Using `get_ddo_map` to inherit column definitions from section_map.

```json
{
  "source": {
    "request_config": [
      {
        "api_engine": "dedalo",
        "sqo": {
          "section_tipo": [
            {
              "value": ["numisdata3"],
              "source": "section"
            }
          ]
        },
        "show": {
          "get_ddo_map": {
            "model": "section_map",
            "columns": [
              {
                "path": ["components", "identification"]
              },
              {
                "path": ["components", "mint"]
              },
              {
                "path": ["components", "date"]
              }
            ]
          },
          "sqo_config": {
            "limit": 10
          }
        }
      }
    ]
  }
}
```

**Section Map Definition** (in `section_map` child term properties):
```json
{
  "components": {
    "identification": ["numisdata27", "numisdata28"],
    "mint": ["numisdata30"],
    "date": ["numisdata35"]
  }
}
```

**Explanation**:
- `get_ddo_map` dynamically builds ddo_map from section_map
- Useful for sharing column definitions across sections
- Changes to section_map propagate automatically
- `path` navigates the properties structure

---

## Common Patterns

### Pattern: Minimal Configuration

```json
{
  "source": {
    "request_config": [
      {
        "show": {
          "ddo_map": [
            {"tipo": "component_tipo", "section_tipo": "self", "parent": "self"}
          ]
        }
      }
    ]
  }
}
```

### Pattern: Read-Only Display

```json
{
  "source": {
    "request_config": [
      {
        "show": {
          "ddo_map": [...],
          "interface": {
            "read_only": true,
            "button_add": false,
            "button_delete": false,
            "button_link": false,
            "tools": false
          }
        }
      }
    ]
  }
}
```

### Pattern: High-Volume Portal

```json
{
  "source": {
    "request_config": [
      {
        "sqo": {
          "section_tipo": [...],
          "limit": 100
        },
        "show": {
          "ddo_map": [...],
          "sqo_config": {
            "limit": 100,
            "full_count": false
          }
        }
      }
    ]
  }
}
```

---

## Testing Your Configuration

1. **Check JSON validity** - Use a JSON validator
2. **Verify tipos exist** - Check ontology browser
3. **Test permissions** - Use different user levels
4. **Monitor performance** - Check query execution time
5. **Validate caching** - Ensure repeated calls use cache
