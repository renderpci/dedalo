# Search Query Object

## Introduction

Search Query Object or SQO, is a json object to use as abstraction of classical SQL. To create a flexible system with NoSQL and dependent of an ontology, become necessary use a flexible definition of the database query. Dédalo doesn't have columns and we need to search data in the same way than classical SQL. We change SQL model to NoSQL in v4 in 2012, at this time PostgreSQL(v9.2) introduce json format but with a very simple json query.

So we became to define a Search Query Object, because we known that first json search definitions of PostgreSQL will be replaced with a more robust system. And we want to do searches compatible with changes in ontology, we don't want to use pre-definition searches.

## Search Query Object - SQO definition

./core/common/class.search_query_object.php

**search_query_object** `object`

Search Query Object defines an object with normalized properties to create a database query. Dédalo SQO definition is inspired by Mango query language interface of Apache [CouchDB](https://docs.couchdb.org/en/stable/api/database/find.html) 

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


		select					: [{	// array of objects optional
									section_tipo
									component_tipo
								  }]