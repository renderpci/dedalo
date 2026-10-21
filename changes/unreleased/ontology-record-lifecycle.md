---
title: Deleting or restoring an ontology record now removes or restores its runtime node.
type: fixed
audience: admin
date: 2026-10-21
wc: WC-2026-10-21-ontology-record-lifecycle
---
Deleting an ontology record (or emptying its data) left its node in the runtime ontology, still
served everywhere; restoring a deleted record from the Time Machine brought the record back
without its node. Both now move the node with the record, in the same transaction. A local
override follows the same rule: deleting or restoring it re-applies the node it overrides. See
[Ontology write pipeline](./core/ontology/ontology_write.md).
