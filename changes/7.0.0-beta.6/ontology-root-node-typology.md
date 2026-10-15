---
title: Ontologies re-installed by an ontology update keep their typology and name instead of moving to "Others".
type: fixed
audience: admin
date: 2026-10-07
---
After an ontology update, ontologies such as `dd` or `tch` appeared in the profile permissions tree under the **Others** typology with only their bare tld as name (`dd`), although their registry record says otherwise (for `dd`: **Core**, "Dédalo | dd"). An update now keeps the typology and name from the ontology's registry record. To repair an installation already affected, rebuild the ontology's main node from the Ontology tool (the registry records themselves were always correct).
