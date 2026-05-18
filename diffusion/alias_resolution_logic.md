# Diffusion alias resolution — design notes

## Ontology tree structure

```
diffusion_domain  (e.g. numisdata323)
└── diffusion_group  (e.g. numisdata360, numisdata888)
    └── diffusion_element | diffusion_element_alias  (e.g. numisdata29, numisdata891)
        └── database | database_alias  (e.g. numisdata695, numisdata892)
            └── table | table_alias  (e.g. numisdata766, ...)
                └── field_*  (actual data fields / children)
```

Any node at any level can be an `_alias`.  
An alias **points** to a real node elsewhere in the ontology.  
The alias tree is an independent re-use of an existing structure.

---

## Alias contract

| Property | Rule |
|----------|------|
| `tipo` in result | Always the **alias** tipo (never the real node's tipo) |
| `parents` in result | Always the **alias tree** ancestors (not the real node's) |
| `children` in result | Alias own children **+** real node children whose label is not in alias children |
| Section relation | Alias's own, or, if absent, inherited from the real node |
| Real node entry | Suppressed — the alias entry replaces it |

---

## Current bug (as of this session)

`resolve_ontology_node_alias` expands the real node's **entire subtree** into the flat list:

```php
$resolved[] = $resolved_tipo;                            // real node
$resolved = array_merge($resolved, $resolved_children);  // real node's subtree ← WRONG
```

This causes:
- `numisdata846` (real table) appears **twice** in the flat list (once per alias that resolves to the same real database).
- Both entries walk `get_parent()` up through the **real** node's parent chain → same parents → identical duplicate entries.
- The alias tipo (`numisdata766`) is never used as the result `tipo`.

---

## Required fix

### 1. `resolve_ontology_node_alias` — remove subtree expansion

The function must **not** expand the real node's subtree.  
The alias tree already contains the correct nodes to traverse.  
The only purpose of resolution at this stage is section-relation lookup (step 2).

```php
public static function resolve_ontology_node_alias(array $nodes) : array {
    // Just return $nodes as-is — alias nodes ARE the nodes to process.
    // Section inheritance and children merging happen inside get_section_diffusion_nodes.
    return $nodes;
}
```

Or, if `resolve_alias_recursive` is needed elsewhere, keep it but remove the subtree merge.

### 2. `get_section_diffusion_nodes` — section inheritance for alias nodes

When `$diffusion_tipo` is an alias and has **no direct** section relation:

```php
$real_tipo = self::resolve_alias_recursive($diffusion_tipo);
if (empty($ar_sections) && $real_tipo !== null) {
    $ar_sections = ontology_node::get_ar_tipo_by_model_and_relation(
        $real_tipo, 'section', 'related', true
    );
}
```

Result tipo stays `$diffusion_tipo` (the alias). ✓  
Parents come from `get_parent()` on the alias — which returns alias-tree ancestors. ✓

### 3. `$consumed_by_alias` — suppress real node duplicates

When an alias matches a section, add `$real_tipo` to `$consumed_by_alias`.  
Skip any node in that set at the top of the main loop.  
(This guards against edge cases where the real node also appears in the flat list.)

### 4. Children merging — inline in `get_section_diffusion_nodes`

After building alias's own `$children`:

```
alias_labels = labels of alias children
for each child of real_tipo:
    if child.label not in alias_labels:
        append child to $children
        append child.label to alias_labels
```

---

## Data-flow summary

```
get_ar_recursive_children(diffusion_domain_tipo)
  → flat list of alias-tree nodes only (no expansion of real subtrees)

for each node in flat list:
  skip if in $consumed_by_alias
  if _alias: real_tipo = resolve_alias_recursive(node)
  ar_sections = node's own sections OR (if empty) real_tipo's sections
  if section matches:
    consumed_by_alias[] = real_tipo
    parents  ← get_parent() chain on alias node  (alias tree path)
    children ← alias own + real non-overridden (by label)
    result tipo = alias node tipo
```

---

## Key tipos in the test case

| tipo | model | notes |
|------|-------|-------|
| numisdata323 | diffusion_domain | root |
| numisdata360, numisdata888 | diffusion_group | two groups |
| numisdata29, numisdata891 | diffusion_element_alias | point to real diffusion_elements |
| numisdata695, numisdata892 | database_alias | point to numisdata869 |
| numisdata869 | database | real — `web_numisdata_default` |
| numisdata766 | table_alias | points to numisdata846 |
| numisdata846 | table | real — `mints` |
