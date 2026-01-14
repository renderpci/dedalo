---
description: Provides samples of component parsed results.
---

# Component String Common

This file provides samples of parsed results for component string common components extending the component_string_common class.

### 1. Operator !* (lang = 'all')
Param $query_object:
```json
{
    "q": [
        {
            "value": "!*"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "jsonb",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "lang": "all"
}
```
Parsed result:
- Properties added:
    - params
    - sentence
```json
{
    "q": [
        {
            "value": "!*"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "string",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "lang": "all",
    "params": {
        "_Q1_": "$.test52[*].value ? (@ != \"\" && @ != null)"
    },
    "sentence": "(te3.string IS NULL OR NOT (te3.string @? (_Q1_)::jsonpath))"
}
```
SQL resolved:
```sql
SELECT * FROM matrix_test AS te3 WHERE 
(te3.section_tipo = 'test3') 
AND (te3.string IS NULL OR NOT (te3.string @? ('$.test52[*].value ? (@ != "" && @ != null)')::jsonpath))
```

### 1b. Operator !* (lang = 'lg-eng')
Param $query_object:
```json
{
    "q": [
        {
            "value": "!*"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "jsonb",
    "lang": "lg-eng",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ]
}
```
Parsed result:
- Properties added:
    - params
    - sentence
```json
{
    "q": [
        {
            "value": "!*"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "string",
    "lang": "lg-eng",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "params": {
        "_Q1_": "$.test52[*] ? (@.lang == \"lg-eng\" && @.value != \"\" && @.value != null)"
    },
    "sentence": "(te3.string IS NULL OR NOT (te3.string @? (_Q1_)::jsonpath))"
}
```
SQL resolved:
```sql
SELECT * FROM matrix_test AS te3 WHERE 
(te3.section_tipo = 'test3') 
AND (te3.string IS NULL OR NOT (te3.string @? ('$.test52[*] ? (@.lang == "lg-eng" && @.value != "" && @.value != null)')::jsonpath))
```

### 2. Operator * (lang = 'all')
Param $query_object:
```json
{
    "q": [
        {
            "value": "*"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "jsonb",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "lang": "all"
}
```
Parsed result:
- Properties added:
    - params
    - sentence
```json
{
    "q": [
        {
            "value": "*"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "string",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "lang": "all",
    "params": {
        "_Q1_": "$.test52[*].value ? (@ != \"\" && @ != null)"
    },
    "sentence": "te3.string @? (_Q1_)::jsonpath"
}
```
SQL resolved:
```sql
SELECT * FROM matrix_test AS te3 WHERE 
(te3.section_tipo = 'test3') 
AND te3.string @? ('$.test52[*].value ? (@ != "" && @ != null)')::jsonpath
```

### 2b. Operator * (lang = 'lg-eng')
Param $query_object:
```json
{
    "q": [
        {
            "value": "*"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "jsonb",
    "lang": "lg-eng",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ]
}
```
Parsed result:
- Properties added:
    - params
    - sentence
```json
{
    "q": [
        {
            "value": "*"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "string",
    "lang": "lg-eng",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "params": {
        "_Q1_": "$.test52[*] ? (@.lang == \"lg-eng\" && @.value != \"\" && @.value != null)"
    },
    "sentence": "te3.string @? (_Q1_)::jsonpath"
}
```
SQL resolved:
```sql
SELECT * FROM matrix_test AS te3 WHERE 
(te3.section_tipo = 'test3') 
AND te3.string @? ('$.test52[*] ? (@.lang == "lg-eng" && @.value != "" && @.value != null)')::jsonpath
```

### 3. Operator != (lang = 'all')
Param $query_object:
```json
{
    "q": [
        {
            "value": "!=cat"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "jsonb",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "lang": "all"
}
```
Parsed result:
- Properties added:
    - params
    - sentence
```json
{
    "q": [
        {
            "value": "!=cat"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "string",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "lang": "all",
    "params": {
        "_Q1_": "cat"
    },
    "sentence": "(te3.string @? '$.test52[*]') AND NOT EXISTS (\n  SELECT 1\n  FROM jsonb_path_query(te3.string, '$.test52[*]') AS elem\n  WHERE f_unaccent(elem->>'value') = f_unaccent(_Q1_)\n )"
}
```
SQL resolved:
```sql
SELECT * FROM matrix_test AS te3 WHERE 
(te3.section_tipo = 'test3') 
AND (te3.string @? '$.test52[*]') AND NOT EXISTS (
  SELECT 1
  FROM jsonb_path_query(te3.string, '$.test52[*]') AS elem
  WHERE f_unaccent(elem->>'value') = f_unaccent('cat')
 )
```

### 3b. Operator != (lang = 'lg-eng')
Param $query_object:
```json
{
    "q": [
        {
            "value": "!=cat"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "jsonb",
    "lang": "lg-eng",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ]
}
```
Parsed result:
- Properties added:
    - params
    - sentence
```json
{
    "q": [
        {
            "value": "!=cat"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "string",
    "lang": "lg-eng",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "params": {
        "_Q1_": "cat"
    },
    "sentence": "(te3.string @? '$.test52[*] ? (@.lang == \"lg-eng\")') AND NOT EXISTS (\n  SELECT 1\n  FROM jsonb_path_query(te3.string, '$.test52[*] ? (@.lang == \"lg-eng\")') AS elem\n  WHERE f_unaccent(elem->>'value') = f_unaccent(_Q1_)\n )"
}
```
SQL resolved:
```sql
SELECT * FROM matrix_test AS te3 WHERE 
(te3.section_tipo = 'test3') 
AND (te3.string @? '$.test52[*] ? (@.lang == "lg-eng")') AND NOT EXISTS (
  SELECT 1
  FROM jsonb_path_query(te3.string, '$.test52[*] ? (@.lang == "lg-eng")') AS elem
  WHERE f_unaccent(elem->>'value') = f_unaccent('cat')
 )
```

### 4. Operator == (lang = 'all')
Param $query_object:
```json
{
    "q": [
        {
            "value": "==cat"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "jsonb",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "lang": "all"
}
```
Parsed result:
- Properties added:
    - params
    - sentence
```json
{
    "q": [
        {
            "value": "==cat"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "string",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "lang": "all",
    "params": {
        "_Q1_": "cat"
    },
    "sentence": "(te3.string @? '$.test52[*]') AND EXISTS (\n  SELECT 1\n  FROM jsonb_path_query(te3.string, '$.test52[*]') AS elem\n  WHERE f_unaccent(elem->>'value') = f_unaccent(_Q1_)\n )"
}
```
SQL resolved:
```sql
SELECT * FROM matrix_test AS te3 WHERE 
(te3.section_tipo = 'test3') 
AND (te3.string @? '$.test52[*]') AND EXISTS (
  SELECT 1
  FROM jsonb_path_query(te3.string, '$.test52[*]') AS elem
  WHERE f_unaccent(elem->>'value') = f_unaccent('cat')
 )
```

### 4b. Operator == (lang = 'lg-eng')
Param $query_object:
```json
{
    "q": [
        {
            "value": "==cat"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "jsonb",
    "lang": "lg-eng",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ]
}
```
Parsed result:
- Properties added:
    - params
    - sentence
```json
{
    "q": [
        {
            "value": "==cat"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "string",
    "lang": "lg-eng",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "params": {
        "_Q1_": "cat"
    },
    "sentence": "(te3.string @? '$.test52[*] ? (@.lang == \"lg-eng\")') AND EXISTS (\n  SELECT 1\n  FROM jsonb_path_query(te3.string, '$.test52[*] ? (@.lang == \"lg-eng\")') AS elem\n  WHERE f_unaccent(elem->>'value') = f_unaccent(_Q1_)\n )"
}
```
SQL resolved:
```sql
SELECT * FROM matrix_test AS te3 WHERE 
(te3.section_tipo = 'test3') 
AND (te3.string @? '$.test52[*] ? (@.lang == "lg-eng")') AND EXISTS (
  SELECT 1
  FROM jsonb_path_query(te3.string, '$.test52[*] ? (@.lang == "lg-eng")') AS elem
  WHERE f_unaccent(elem->>'value') = f_unaccent('cat')
 )
```

### 5. Operator - (lang = 'all')
Param $query_object:
```json
{
    "q": [
        {
            "value": "-cat"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "jsonb",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "lang": "all"
}
```
Parsed result:
- Properties added:
    - params
    - sentence
```json
{
    "q": [
        {
            "value": "-cat"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "string",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "lang": "all",
    "params": {
        "_Q1_": "cat"
    },
    "sentence": "NOT EXISTS (\n  SELECT 1\n  FROM jsonb_path_query(te3.string, '$.test52[*]') AS elem\n  WHERE elem->>'value' IS NOT NULL AND f_unaccent(elem->>'value') ~* f_unaccent(_Q1_)\n )"
}
```
SQL resolved:
```sql
SELECT * FROM matrix_test AS te3 WHERE 
(te3.section_tipo = 'test3') 
 AND NOT EXISTS (
  SELECT 1
  FROM jsonb_path_query(te3.string, '$.test52[*]') AS elem
  WHERE elem->>'value' IS NOT NULL AND f_unaccent(elem->>'value') ~* f_unaccent('cat')
 )
```

### 5b. Operator - (lang = 'lg-eng')
Param $query_object:
```json
{
    "q": [
        {
            "value": "-cat"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "jsonb",
    "lang": "lg-eng",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ]
}
```
Parsed result:
- Properties added:
    - params
    - sentence
```json
{
    "q": [
        {
            "value": "-cat"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "string",
    "lang": "lg-eng",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "params": {
        "_Q1_": "cat"
    },
    "sentence": "NOT EXISTS (\n  SELECT 1\n  FROM jsonb_path_query(te3.string, '$.test52[*]') AS elem\n  WHERE elem->>'value' IS NOT NULL AND f_unaccent(elem->>'value') ~* f_unaccent(_Q1_) AND elem->>'lang' = 'lg-eng'\n )"
}
```
SQL resolved:
```sql
SELECT * FROM matrix_test AS te3 WHERE 
(te3.section_tipo = 'test3') 
AND NOT EXISTS (
  SELECT 1
  FROM jsonb_path_query(te3.string, '$.test52[*]') AS elem
  WHERE elem->>'value' IS NOT NULL AND f_unaccent(elem->>'value') ~* f_unaccent('cat') AND elem->>'lang' = 'lg-eng'
 )
```

### 6. Ends With (*cat) (lang = 'all')
Param $query_object:
```json
{
    "q": [
        {
            "value": "*cat"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "jsonb",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "lang": "all"
}
```
Parsed result:
- Properties added:
    - params
    - sentence
```json
{
    "q": [
        {
            "value": "*cat"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "string",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "lang": "all",
    "params": {
        "_Q1_": "cat"
    },
    "sentence": "(te3.string @? '$.test52[*]') AND EXISTS (\n  SELECT 1\n  FROM jsonb_path_query(te3.string, '$.test52[*]') AS elem\n  WHERE f_unaccent(elem->>'value') ~* (f_unaccent(_Q1_) || '$')\n )"
}
```
SQL resolved:
```sql
SELECT * FROM matrix_test AS te3 WHERE 
(te3.section_tipo = 'test3') 
AND (te3.string @? '$.test52[*]') AND EXISTS (
  SELECT 1
  FROM jsonb_path_query(te3.string, '$.test52[*]') AS elem
  WHERE f_unaccent(elem->>'value') ~* (f_unaccent('cat') || '$')
 )
```

### 6b. Ends With (*cat) (lang = 'lg-eng')
Param $query_object:
```json
{
    "q": [
        {
            "value": "*cat"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "jsonb",
    "lang": "lg-eng",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ]
}
```
Parsed result:
- Properties added:
    - params
    - sentence
```json
{
    "q": [
        {
            "value": "*cat"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "string",
    "lang": "lg-eng",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "params": {
        "_Q1_": "cat"
    },
    "sentence": "(te3.string @? '$.test52[*] ? (@.lang == \"lg-eng\")') AND EXISTS (\n  SELECT 1\n  FROM jsonb_path_query(te3.string, '$.test52[*] ? (@.lang == \"lg-eng\")') AS elem\n  WHERE f_unaccent(elem->>'value') ~* (f_unaccent(_Q1_) || '$')\n )"
}
```
SQL resolved:
```sql
SELECT * FROM matrix_test AS te3 WHERE 
(te3.section_tipo = 'test3') 
AND (te3.string @? '$.test52[*] ? (@.lang == "lg-eng")') AND EXISTS (
  SELECT 1
  FROM jsonb_path_query(te3.string, '$.test52[*] ? (@.lang == "lg-eng")') AS elem
  WHERE f_unaccent(elem->>'value') ~* (f_unaccent('cat') || '$')
 )
```

### 7. Begins With (cat*) (lang = 'all')
Param $query_object:
```json
{
    "q": [
        {
            "value": "cat*"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "jsonb",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "lang": "all"
}
```
Parsed result:
- Properties added:
    - params
    - sentence
```json
{
    "q": [
        {
            "value": "cat*"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "string",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "lang": "all",
    "params": {
        "_Q1_": "cat"
    },
    "sentence": "(te3.string @? '$.test52[*]') AND EXISTS (\n  SELECT 1\n  FROM jsonb_path_query(te3.string, '$.test52[*]') AS elem\n  WHERE f_unaccent(elem->>'value') ~* ('^' || f_unaccent(_Q1_))\n )"
}
```
SQL resolved:
```sql
SELECT * FROM matrix_test AS te3 WHERE 
(te3.section_tipo = 'test3') 
AND (te3.string @? '$.test52[*]') AND EXISTS (
  SELECT 1
  FROM jsonb_path_query(te3.string, '$.test52[*]') AS elem
  WHERE f_unaccent(elem->>'value') ~* ('^' || f_unaccent('cat'))
 )
```

### 7b. Begins With (cat*) (lang = 'lg-eng')
Param $query_object:
```json
{
    "q": [
        {
            "value": "cat*"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "jsonb",
    "lang": "lg-eng",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ]
}
```
Parsed result:
- Properties added:
    - params
    - sentence
```json
{
    "q": [
        {
            "value": "cat*"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "string",
    "lang": "lg-eng",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "params": {
        "_Q1_": "cat"
    },
    "sentence": "(te3.string @? '$.test52[*] ? (@.lang == \"lg-eng\")') AND EXISTS (\n  SELECT 1\n  FROM jsonb_path_query(te3.string, '$.test52[*] ? (@.lang == \"lg-eng\")') AS elem\n  WHERE f_unaccent(elem->>'value') ~* ('^' || f_unaccent(_Q1_))\n )"
}
```
SQL resolved:
```sql
SELECT * FROM matrix_test AS te3 WHERE 
(te3.section_tipo = 'test3') 
AND (te3.string @? '$.test52[*] ? (@.lang == "lg-eng")') AND EXISTS (
  SELECT 1
  FROM jsonb_path_query(te3.string, '$.test52[*] ? (@.lang == "lg-eng")') AS elem
  WHERE f_unaccent(elem->>'value') ~* ('^' || f_unaccent('cat'))
 )
```

### 8. Literal ('cat') (lang = 'all')
Param $query_object:
```json
{
    "q": [
        {
            "value": "'cat'"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "jsonb",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "lang": "all"
}
```
Parsed result:
- Properties added:
    - params
    - sentence
```json
{
    "q": [
        {
            "value": "'cat'"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "string",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "lang": "all",
    "params": {
        "_Q1_": "cat"
    },
    "sentence": "(te3.string @? '$.test52[*]') AND EXISTS (\n  SELECT 1\n  FROM jsonb_path_query(te3.string, '$.test52[*]') AS elem\n  WHERE f_unaccent(elem->>'value') = f_unaccent(_Q1_)\n )"
}
```
SQL resolved:
```sql
SELECT * FROM matrix_test AS te3 WHERE 
(te3.section_tipo = 'test3') 
AND (te3.string @? '$.test52[*]') AND EXISTS (
  SELECT 1
  FROM jsonb_path_query(te3.string, '$.test52[*]') AS elem
  WHERE f_unaccent(elem->>'value') = f_unaccent('cat')
 )
```

### 8b. Literal ('cat') (lang = 'lg-eng')
Param $query_object:
```json
{
    "q": [
        {
            "value": "'cat'"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "jsonb",
    "lang": "lg-eng",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ]
}
```
Parsed result:
- Properties added:
    - params
    - sentence
```json
{
    "q": [
        {
            "value": "'cat'"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "string",
    "lang": "lg-eng",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "params": {
        "_Q1_": "cat"
    },
    "sentence": "(te3.string @? '$.test52[*] ? (@.lang == \"lg-eng\")') AND EXISTS (\n  SELECT 1\n  FROM jsonb_path_query(te3.string, '$.test52[*] ? (@.lang == \"lg-eng\")') AS elem\n  WHERE f_unaccent(elem->>'value') = f_unaccent(_Q1_)\n )"
}
```
SQL resolved:
```sql
SELECT * FROM matrix_test AS te3 WHERE 
(te3.section_tipo = 'test3') 
AND (te3.string @? '$.test52[*] ? (@.lang == "lg-eng")') AND EXISTS (
  SELECT 1
  FROM jsonb_path_query(te3.string, '$.test52[*] ? (@.lang == "lg-eng")') AS elem
  WHERE f_unaccent(elem->>'value') = f_unaccent('cat')
 )
```

### 9. Duplicated (!!) (lang = 'all')
Param $query_object:
```json
{
    "q": [
        {
            "value": "!!"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "jsonb",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "lang": "all"
}
```
Parsed result:
- Properties added:
    - duplicated
    - unaccent
    - sentence
```json
{
    "q": [
        {
            "value": "!!"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "string",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "lang": "all",
    "duplicated": true,
    "unaccent": true,
    "sentence": "(te3.string @? '$.test52[*]') AND EXISTS (\n  SELECT 1\n  FROM matrix_test AS m2,\n       jsonb_path_query(m2.string, '$.test52[*]') AS m2_elem,\n       jsonb_path_query(te3.string, '$.test52[*]') AS m1_elem\n  WHERE m2.string @? '$.test52[*]'\n    AND m2.section_id != te3.section_id\n    AND m2.section_tipo = te3.section_tipo\n    AND f_unaccent(m2_elem->>'value') = f_unaccent(m1_elem->>'value')\n )"
}
```
SQL resolved:
```sql
SELECT * FROM matrix_test AS te3 WHERE 
(te3.section_tipo = 'test3') 
AND (te3.string @? '$.test52[*]') AND EXISTS (
  SELECT 1
  FROM matrix_test AS m2,
       jsonb_path_query(m2.string, '$.test52[*]') AS m2_elem,
       jsonb_path_query(te3.string, '$.test52[*]') AS m1_elem
  WHERE m2.string @? '$.test52[*]'
    AND m2.section_id != te3.section_id
    AND m2.section_tipo = te3.section_tipo
    AND f_unaccent(m2_elem->>'value') = f_unaccent(m1_elem->>'value')
 )
```

### 9b. Duplicated (!!) (lang = 'lg-eng')
Param $query_object:
```json
{
    "q": [
        {
            "value": "!!"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "jsonb",
    "lang": "lg-eng",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ]
}
```
Parsed result:
- Properties added:
    - duplicated
    - unaccent
    - sentence
```json
{
    "q": [
        {
            "value": "!!"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "string",
    "lang": "lg-eng",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "duplicated": true,
    "unaccent": true,
    "sentence": "(te3.string @? '$.test52[*] ? (@.lang == \"lg-eng\")') AND EXISTS (\n  SELECT 1\n  FROM matrix_test AS m2,\n       jsonb_path_query(m2.string, '$.test52[*] ? (@.lang == \"lg-eng\")') AS m2_elem,\n       jsonb_path_query(te3.string, '$.test52[*] ? (@.lang == \"lg-eng\")') AS m1_elem\n  WHERE m2.string @? '$.test52[*] ? (@.lang == \"lg-eng\")'\n    AND m2.section_id != te3.section_id\n    AND m2.section_tipo = te3.section_tipo\n    AND f_unaccent(m2_elem->>'value') = f_unaccent(m1_elem->>'value')\n )"
}
```
SQL resolved:
```sql
SELECT * FROM matrix_test AS te3 WHERE 
(te3.section_tipo = 'test3') 
AND (te3.string @? '$.test52[*] ? (@.lang == "lg-eng")') AND EXISTS (
  SELECT 1
  FROM matrix_test AS m2,
       jsonb_path_query(m2.string, '$.test52[*] ? (@.lang == "lg-eng")') AS m2_elem,
       jsonb_path_query(te3.string, '$.test52[*] ? (@.lang == "lg-eng")') AS m1_elem
  WHERE m2.string @? '$.test52[*] ? (@.lang == "lg-eng")'
    AND m2.section_id != te3.section_id
    AND m2.section_tipo = te3.section_tipo
    AND f_unaccent(m2_elem->>'value') = f_unaccent(m1_elem->>'value')
 )
```

### 10. Default (Contains) (lang = 'all')
Param $query_object:
```json
{
    "q": [
        {
            "value": "cat"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "jsonb",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "lang": "all"
}
```
Parsed result:
- Properties added:
    - params
    - sentence
```json
{
    "q": [
        {
            "value": "cat"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "string",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "lang": "all",
    "params": {
        "_Q1_": "cat"
    },
    "sentence": "(te3.string @? '$.test52[*]') AND EXISTS (\n  SELECT 1\n  FROM jsonb_path_query(te3.string, '$.test52[*]') AS elem\n  WHERE f_unaccent(elem->>'value') ~* f_unaccent(_Q1_)\n )"
}
```
SQL resolved:
```sql
SELECT * FROM matrix_test AS te3 WHERE 
(te3.section_tipo = 'test3') 
AND (te3.string @? '$.test52[*]') AND EXISTS (
  SELECT 1
  FROM jsonb_path_query(te3.string, '$.test52[*]') AS elem
  WHERE f_unaccent(elem->>'value') ~* f_unaccent('cat')
 )
```

### 10b. Default (Contains) (lang = 'lg-eng')
Param $query_object:
```json
{
    "q": [
        {
            "value": "cat"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "jsonb",
    "lang": "lg-eng",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ]
}
```
Parsed result:
- Properties added:
    - params
    - sentence
```json
{
    "q": [
        {
            "value": "cat"
        }
    ],
    "q_operator": null,
    "path": [
        {
            "name": "input_text",
            "model": "component_input_text",
            "section_tipo": "test3",
            "component_tipo": "test52"
        }
    ],
    "q_split": true,
    "type": "string",
    "lang": "lg-eng",
    "table_alias": "te3",
    "table": "matrix_test",
    "component_path": [
        "test52"
    ],
    "params": {
        "_Q1_": "cat"
    },
    "sentence": "(te3.string @? '$.test52[*] ? (@.lang == \"lg-eng\")') AND EXISTS (\n  SELECT 1\n  FROM jsonb_path_query(te3.string, '$.test52[*] ? (@.lang == \"lg-eng\")') AS elem\n  WHERE f_unaccent(elem->>'value') ~* f_unaccent(_Q1_)\n )"
}
```
SQL resolved:
```sql
SELECT * FROM matrix_test AS te3 WHERE 
(te3.section_tipo = 'test3') 
AND (te3.string @? '$.test52[*] ? (@.lang == "lg-eng")') AND EXISTS (
  SELECT 1
  FROM jsonb_path_query(te3.string, '$.test52[*] ? (@.lang == "lg-eng")') AS elem
  WHERE f_unaccent(elem->>'value') ~* f_unaccent('cat')
 )
```
