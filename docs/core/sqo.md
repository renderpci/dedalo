# Search Query Object

## Introduction

Search Query Object or SQO, is a JSON object to use as an abstraction of classical SQL. To create a flexible system with NoSQL and dependent on an ontology, it becomes necessary to use a flexible definition of the database query. Dédalo doesn't have columns and we need to search data in the same way as classical SQL. We changed SQL model to NoSQL in v4 in 2012, at this time PostgreSQL(v9.2) introduced JSON format but with a very simple JSON query.

So we came to define a search query object, because we knew that early PostgreSQL JSON search definitions will be replaced with a more robust system. And we want to make searches compatible with ontology changes, we don't want to use predefined searches.

## Search Query Object - SQO definition

./core/common/class.search_query_object.php

**search_query_object** `object`

Search Query Object defines an object with normalized properties to create a database query. Dédalo SQO definition is inspired by Mango query language interface of Apache [CouchDB](https://docs.couchdb.org/en/stable/api/database/find.html).

## Parameters

- **id** : `string` section_tipo and other params to define the unique id **optional** | ex : oh1
- **section_tipo** : `string` array of section_tipo for search **mandatory** | ex : ['oh1']
- **mode** : `string` ('edit' || 'list' || 'tm' || 'related') configure the sqo for search witch different models of matrix tables into the DDBB **optional** | ex : 'list'
- **filter** : `object` definition of the filter to be apply at search **optional**
  - **operator** : `array of objects` operator key define the operator ('\$and' || '\$or') they are identified by the use of a dollar sign (\$) prefix in the name property, array value has the arguments `objects` to be affected by operator. **mandatory**, `{"$operator": [arguments]}`
    - **q** : `string` string to search **mandatory**, ex: 'John'
    - **q_operator** : `string` operator to be applied to q ,  **optional**, ex: '<'
    - **path** : `array of objects` array of components creating a sequential path of the component to be searched,  **mandatory**, ex: `[{"section_tipo":"oh1", "component_tipo":"oh24"},{"section_tipo":"rsc197", "component_tipo":"rsc85"}]}`
    - **format** : `string` ('direct' || 'array_elements' || 'typeof' || 'column' || 'in_column' || 'function') used to change the WHERE format **optional**, ex: 'direct'
    - **use_function** : `string` if format is function use_function define the PostgreSQL function to be used. **optional**, ex: 'relations_flat_fct_st_si'
    - **q_split** : `bool` (true || false) defines if the q need to be split into multiple WHERE queries **optional**, ex: 'false'
    - **unaccent** : `bool` (true || false) defines if the q will us the unaccent function to remove accent characters in WHERE **optional**, ex: 'false'
    - **type** : `string` ('jsonb' || 'string)  defines the type of data to be searched **optional**, ex: 'jsonb'
  - **limit** : `int` records limit **optional**, ex: 10
  - **offset** : `int` records offset **optional**, ex: 10
  - **full_count** : `bool || int` (true || false || 1) get the total records find . When int is passed disable the function for full count and get the number as total **optional**, ex: true
  - **order** : `array of objects` set the order of the records, every object in the array will be a column with his paths and direction **optional** `[{"direction": "ASC", "path":[{ddo},{ddo}]}]]`
    - **direction** : `string` (ASC || DESC) sort direction of the column **optional**, ex: 'DESC'
    - **path** : `array of objects` the [ddo](dd_object.md) object that defines the path of the column beginning from the main section of the filter and path of ddo to the component in related section/s. **optional** `[{"section_tipo":"oh1","component_tipo":"oh24"},{"section_tipo":"rsc197", "component_tipo":"rsc85"}]`
  - **order_custom** : `object` order by specific values **optional**, ex: `{"column_name": [values]}`
    - **column_name** : `string` name of the column to be ordered **optional**
    - **values** : `array` the array defines the order of the values **optional**
  - **filter_by_locators** : `array of objects` set a order by locators, every object is a [locator](locator.md) and the order of the array will be respected **optional** ex : `[{"section_tipo":"oh1", "section_id":"8"},{"section_tipo":"oh1", "section_id":"3"}]`
  - **allow_sub_select_by_id** : `bool` (true || false) create a window in the SQL query to select pass the filter and get the id to select the main section **optional**
  - **children_recursive** : `bool` (true || false) filter the term of hierarchy and get the all children nodes dependents of the searched term  **optional**
  - **remove_distinct** : `bool` (true || false) remove duplicates records when the SQL query has a window with multiple criteria that can get duplicate records. by default is true **optional**
  - **skip_projects_filter** : `bool` (true || false) remove the mandatory filter of the component_filter applied at all users except root and global admin users. by default is false **optional**
  - **parsed** : `bool` (true || false) state of the sqo, it indicates if the filter was parsed by the components to add operators to the q  **optional**
  - **select** : `array of objects` array of ddo with defines the SELECT parameter **DEPRECATED DO NOT USED IN V6**

### Summary

```json
id                      : 'oh1' // optional. section_tipo and other params to define the unique id
section_tipo            : ['oh1'] // array of section_tipo for search
mode                    : ('edit' || 'list' || 'tm' || 'related') // configure the sqo for search witch different models of matrix tables into the DDBB
filter                  : {
                                operator : // string ('$and' || '$or')
                                    [{
                                        q           : '2'   // string to search
                                        q_opeator   : '<'   // string || null
                                        path        : [{    // array of components creating a sequential path
                                                            section_tipo
                                                            component_tipo
                                                        }]
                                        format      : 'direct' || 'array_elements' || 'typeof' || 'column' || 'in_column' || 'function' // string, use to change the WHERE format
                                        use_function : 'relations_flat_fct_st_si' // if format is function use_function define the PostgreSQL function to be used.
                                        q_split     : true || false // bool, define if the q need to be split into multiple WHERE queries
                                        unaccent    : true || false // bool, define if the q will us the unaccent function in WHERE
                                        type        : 'jsonb' || 'string' // define the type of data to be searched
                                    }]
                            } || null
limit                   : 1 // int
offset                  : 2 // int
full_count              : (true || false || 4) // boolean or int (int disable the function for full count and get the number as total)
order                   : [{
                                direction   : (ASC || DESC) // string
                                path        : [{
                                    section_tipo
                                    component_tipo
                                }]
                            }]
order_custom            : {
                            column_name : [values]
                            }
filter_by_locators      : [{
                                section_tipo
                                component_tipo
                            }]
allow_sub_select_by_id  : (true || false)
children_recursive      : (true || false)
remove_distinct         : (true || false)
skip_projects_filter    : (true || false)
parsed                  : (true || false) // boolean, state of the sqo
select                  : [{    // array of objects optional
                            section_tipo
                            component_tipo
                        }]
```

## Using SQO

Search Query Object is used to get data from DataBase. It use section_tipo to point specific section/s to get data and it use ddo to define the properties to be searched in q.

If you want to get any person with name "Ana" the sqo will be:

```` json
{
    "section_tipo": "rsc197",
    "filter" : {
        "$and" :[{
            "q" : "Ana"
        }],
        "path":[{
           "section_tipo": "rsc197",
           "component_tipo": "rsc85"
        }]
    }
}
````

The SQO say: search in people under study (section_tipo [rsc197](https://dedalo.dev/ontology/rsc197)) with the path to name field (component_tipo [rsc85](https://dedalo.dev/ontology/rsc85)) with the text 'Ana'.
