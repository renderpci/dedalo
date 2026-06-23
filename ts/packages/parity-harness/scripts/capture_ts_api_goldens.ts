#!/usr/bin/env bun
/**
 * Capture dd_ts_api thesaurus-tree READ goldens (get_node_data / get_children_data)
 * from the live PHP engine and save them as fixtures (verify_fixtures_live-compatible
 * shape) under packages/components/test/fixtures_ts_api.
 *
 * These gate the native dd_ts_api READ handlers. The node payload is
 * ts_object::get_data() (via parse_child_data): term + icon + link_children + the
 * component_relation_index count_result + is_indexable + permissions.
 *
 * NON-DETERMINISM: the index icon's `count_result` embeds a generated SQL string and
 * a timing under `count_result.debug` (search::count() writes them only when
 * SHOW_DEBUG, under a `debug` key). The differ drops `debug` at ANY depth, so the
 * surviving contract is `count_result = { total, totals_group:[{key,value,label}] }`
 * — all deterministic counts/labels. The top-level envelope `debug` /
 * `dedalo_last_error` / `csrf_token` / `action` are likewise dropped/volatile.
 *
 * The cases (all on the live test DB dedalo7_mib) cover:
 *   - a leaf node (term + link_children, no count, no children)
 *   - a node WITH count_result + no descriptor children (tchi1_994, total 404)
 *   - a node WITH count_result + descriptor children (tchi1_342, total 1)
 *   - a node with descriptor children, no count (tchi1_3 Sagunto)
 *   - a multi-field term node (rsc197 person, rsc85+rsc86)
 *   - get_children_data of a node with children (tchi1_3 → 2 children)
 *   - get_children_data of a leaf (empty children list)
 *
 * Usage: PHP_URL=http://localhost:8080/v7_dev/core/api/v1/json/ bun run capture_ts_api_goldens.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { login } from '../src/login.ts';

const PHP_URL = process.env.PHP_URL ?? 'http://localhost:8080/v7_dev/core/api/v1/json/';
const OUT_DIR = join(import.meta.dir, '../../components/test/fixtures_ts_api');

await mkdir(OUT_DIR, { recursive: true });

const cases: { label: string; rqo: Record<string, unknown> }[] = [
  // ── get_node_data ──────────────────────────────────────────────────────────
  // Leaf: term + link_children (unactive), no count icon, no children.
  {
    label: 'get_node_data__tchi1_1_leaf',
    rqo: { dd_api: 'dd_ts_api', action: 'get_node_data', source: { section_tipo: 'tchi1', section_id: '1' } },
  },
  // count_result + NO descriptor children (Peninsular, total 404 → numisdata5).
  {
    label: 'get_node_data__tchi1_994_count',
    rqo: { dd_api: 'dd_ts_api', action: 'get_node_data', source: { section_tipo: 'tchi1', section_id: '994' } },
  },
  // count_result (total 19) — second count case for totals stability.
  {
    label: 'get_node_data__tchi1_995_count',
    rqo: { dd_api: 'dd_ts_api', action: 'get_node_data', source: { section_tipo: 'tchi1', section_id: '995' } },
  },
  // count_result + DESCRIPTOR children (Tarraco, total 1 → rsc205, has_descriptor_children true).
  {
    label: 'get_node_data__tchi1_342_count_children',
    rqo: { dd_api: 'dd_ts_api', action: 'get_node_data', source: { section_tipo: 'tchi1', section_id: '342' } },
  },
  // Descriptor children, NO count (Sagunto).
  {
    label: 'get_node_data__tchi1_3_children',
    rqo: { dd_api: 'dd_ts_api', action: 'get_node_data', source: { section_tipo: 'tchi1', section_id: '3' } },
  },
  // Multi-field term (rsc85 + rsc86), index icon present but count 0 (skipped), is_indexable false.
  {
    label: 'get_node_data__rsc197_2480_person',
    rqo: { dd_api: 'dd_ts_api', action: 'get_node_data', source: { section_tipo: 'rsc197', section_id: '2480' } },
  },

  // ── get_children_data ──────────────────────────────────────────────────────
  // Children of a node with 2 descriptor children (Sagunto → Castillo, Teatro).
  {
    label: 'get_children_data__tchi1_3',
    rqo: {
      dd_api: 'dd_ts_api',
      action: 'get_children_data',
      source: { section_tipo: 'tchi1', section_id: '3', children_tipo: 'tchi40' },
    },
  },
  // Children of a leaf node (empty children list, total 0).
  {
    label: 'get_children_data__tchi1_1_empty',
    rqo: {
      dd_api: 'dd_ts_api',
      action: 'get_children_data',
      source: { section_tipo: 'tchi1', section_id: '1', children_tipo: 'tchi40' },
    },
  },
];

// Single shared session; CSRF rotates per request, so capture sequentially and
// thread the latest token forward.
const session = await login(PHP_URL, 'root', '123123aS');
let csrf = session.csrfToken;

for (const c of cases) {
  const res = await fetch(PHP_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: session.cookie,
      'x-dedalo-csrf-token': csrf,
    },
    body: JSON.stringify(c.rqo),
  });
  const responseBytes = await res.text();
  try {
    const parsed = JSON.parse(responseBytes) as { csrf_token?: string };
    if (typeof parsed.csrf_token === 'string') csrf = parsed.csrf_token;
  } catch {
    /* leave csrf unchanged */
  }
  const fixture = {
    label: c.label,
    rqo: c.rqo,
    capturedAt: new Date().toISOString(),
    status: res.status,
    contentType: res.headers.get('content-type'),
    responseBytes,
  };
  await writeFile(join(OUT_DIR, `${c.label}.json`), JSON.stringify(fixture, null, 2) + '\n');
  console.log(`saved ${c.label} (status ${res.status})`);
}
