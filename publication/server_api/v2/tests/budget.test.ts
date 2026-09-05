/**
 * P2-12 / PUB-05, PUB-06, PUB-09 — the public API's DoS bounds must live where no caller
 * can skip them.
 *
 * This gate is BEHAVIOURAL and it drives the publication API's own doors:
 *
 *   - every MCP tool, through `handleToolCall` — the invocation path the transport and the
 *     tests share — because PUB-06 was precisely a cap that held at the HTTP boundary and
 *     nowhere else. Asserting the REST schema would have passed on the broken code;
 *   - every REST query schema, so the census covers BOTH entry layers;
 *   - the SQL boundary, where the clamp backstop must hold for a caller that reached it
 *     without a schema at all;
 *   - db/pool.ts's per-request query budget, counted through the `__setTestDbExecute` seam;
 *   - `clientIp`, whose answer must not move when a caller rotates X-Forwarded-For unless
 *     the deployment declares a proxy.
 *
 * The census over (entry layer × bounded parameter) is DERIVED: the tool list comes from
 * the `tools` array and the REST list from the exported schemas' own shapes, both
 * intersected with `BOUNDED_PARAMETERS`. Nothing here is a hand-written list of tool names,
 * so a tenth tool with an unbounded `limit` fails this file the day it is added.
 *
 * Hermetic: no database. Every query goes through the test seam, which is restored after
 * each test.
 *
 * WHY IT LIVES IN THE PACKAGE and not in the engine's test/unit/: publication/server_api/v2
 * is an isolated app with its own tsconfig, and importing its modules into the engine's
 * TypeScript program adds ~60 errors that its own (looser) config does not raise — an
 * engine gate that imports it would break the zero-new-errors rule to assert something the
 * package can assert about itself. The engine's half of this row is the source census in
 * test/unit/publication_bounds_tripwire.test.ts, which only READS these files.
 */

import { describe, test, expect, afterEach, beforeEach } from 'bun:test';

import { tools, handleToolCall } from '../src/mcp/tools';
import * as validators from '../src/validators';
import {
  BOUNDED_PARAMETERS,
  mcpBounded,
  clampLimit,
  clampOffset,
  listRecordsQuerySchema,
  fulltextQuerySchema,
  fragmentsQuerySchema,
  avFragmentsQuerySchema,
  avIndexationParamsSchema,
  recordIdSchema,
} from '../src/validators';
import {
  MAX_LIMIT,
  MAX_RESOLVE_KEYS,
  MAX_QUERIES_PER_REQUEST,
} from '../src/constants';
import { __setTestDbExecute } from '../src/db/pool';
import { executeQuery } from '../src/db/query-builder';
import { fulltextSearch } from '../src/services/search.service';
import { parseRelationMap, parseInverseRelationMap, resolveRelations } from '../src/services/resolve.service';
import { withRequestBudget, chargeQuery, currentBudgetSpent } from '../src/security/request-budget';
import { clientIp, setSocketIp } from '../src/security/client-ip';
import { environmentSchema, envBoolean, resolveTrustProxy, dbNames } from '../src/config';
import { MAX_RESOLVE_ROWS } from '../src/constants';
import { BudgetExceededError, ValidationError } from '../src/errors';

/**
 * A table name OF THIS GATE'S OWN. bun runs every test file in one process and the schema
 * service caches introspection for 30 s keyed by `<db>:<table>`, so a gate that stubs the
 * columns of a table another file uses would hand that file a two-column `interview` and
 * redden it. The situation this gate needs is a table nobody else names.
 */
const PROBE_TABLE = 'zz_bounds_probe';

// A value that is over the cap for each bounded parameter, and one that is inside it. The
// map is keyed by the SAME names BOUNDED_PARAMETERS uses, so a new bounded parameter added
// there without an entry here fails the completeness check below rather than being skipped.
const OVER_CAP: Record<string, unknown> = {
  limit: MAX_LIMIT + 1,
  offset: -1,
  section_id: 0,
  max_characters: 5001,
  max_occurrences: 11,
  q: 'x'.repeat(513),
  terms: 'x'.repeat(513),
};

const WITHIN_CAP: Record<string, unknown> = {
  limit: 5,
  offset: 0,
  section_id: 1,
  max_characters: 100,
  max_occurrences: 1,
  q: 'guerra',
  terms: 'guerra',
};

// Arguments a tool needs beyond the bounded one under test, so that a call which is NOT
// refused reaches a handler instead of failing for an unrelated missing argument.
const BASE_ARGS: Record<string, unknown> = {
  db: dbNames[0],
  table: PROBE_TABLE,
  column: 'transcription',
};

let queries: string[] = [];

/**
 * The seam's default answer: enough of a published schema for the existence guard
 * (services/schema.service) to let a call through, and no rows for anything else. Every
 * statement is recorded, which is how the budget legs count what production would spend.
 */
const stubRows = (sql: string) => {
  if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
    return [
      { TABLE_NAME: PROBE_TABLE, COLUMN_NAME: 'section_id', DATA_TYPE: 'int' },
      { TABLE_NAME: PROBE_TABLE, COLUMN_NAME: 'transcription', DATA_TYPE: 'text' },
    ];
  }
  if (sql.includes('INFORMATION_SCHEMA.TABLES')) {
    return [{ TABLE_NAME: PROBE_TABLE, TABLE_ROWS: 1 }];
  }
  return [];
};

beforeEach(() => {
  queries = [];
  __setTestDbExecute(async (_db, sql) => {
    queries.push(sql);
    return stubRows(sql);
  });
});

afterEach(() => {
  __setTestDbExecute(null);
});

describe('the bounded-parameter census is complete', () => {
  test('every bounded parameter has an over-cap and a within-cap probe', () => {
    const names = Object.keys(BOUNDED_PARAMETERS);
    expect(names.length).toBeGreaterThan(5);
    for (const name of names) {
      expect(OVER_CAP).toHaveProperty(name);
      expect(WITHIN_CAP).toHaveProperty(name);
      // The probes must actually straddle the bound, or the assertions below prove nothing.
      const schema = BOUNDED_PARAMETERS[name as keyof typeof BOUNDED_PARAMETERS];
      expect(schema.safeParse(OVER_CAP[name]).success).toBe(false);
      expect(schema.safeParse(WITHIN_CAP[name]).success).toBe(true);
    }
  });
});

describe('MCP door — every tool, every bounded parameter (census: TOTAL)', () => {
  test('the tool list is derived from the module and is not empty', () => {
    expect(tools.length).toBeGreaterThanOrEqual(9);
  });

  test('a tool that accepts a bounded parameter declares THE shared schema object', () => {
    let checked = 0;
    for (const tool of tools) {
      for (const [name, shared] of Object.entries(mcpBounded)) {
        const declared = tool.inputSchema[name];
        if (declared === undefined) continue;
        checked++;
        // Identity, not a matching number: a local copy of the same bound would satisfy a
        // reader and re-open PUB-06 the next time one of the two doors is edited.
        // `count_records` re-describes `q` as optional, so accept a schema derived FROM the
        // shared object as well as the object itself.
        const isShared = declared === shared || describesFrom(declared, shared);
        expect({ tool: tool.name, param: name, isShared }).toEqual({ tool: tool.name, param: name, isShared: true });
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  test('an over-cap argument is refused by the handler, before any query runs', async () => {
    let checked = 0;
    for (const tool of tools) {
      for (const name of Object.keys(BOUNDED_PARAMETERS)) {
        if (tool.inputSchema[name] === undefined) continue;
        checked++;
        queries = [];
        const args = { ...BASE_ARGS, ...requiredArgsFor(tool.name), [name]: OVER_CAP[name] };
        const result = await handleToolCall(tool.name, args);
        const text = result.content[0].text;
        expect({ tool: tool.name, param: name, text: text.slice(0, 6) })
          .toEqual({ tool: tool.name, param: name, text: 'Error:' });
        expect(text).toContain(name);
        // Refused BEFORE the database is touched: a bound that only truncates the answer
        // has already paid the cost it exists to prevent.
        expect({ tool: tool.name, param: name, queries: queries.length })
          .toEqual({ tool: tool.name, param: name, queries: 0 });
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  test('a within-cap argument is NOT refused (the bound is a bound, not a wall)', async () => {
    const result = await handleToolCall('search_records', { ...BASE_ARGS, limit: WITHIN_CAP.limit });
    expect(result.content[0].text.startsWith('Error:')).toBe(false);
  });

  test('search_records passes the caller limit to SQL — clamped, never raw', async () => {
    queries = [];
    const params: unknown[][] = [];
    __setTestDbExecute(async (_db, sql, p) => {
      queries.push(sql);
      params.push(p);
      return stubRows(sql);
    });
    await handleToolCall('search_records', { ...BASE_ARGS, limit: 7 });
    expect(queries.length).toBeGreaterThan(0);
    expect(params.some(p => p.includes(7))).toBe(true);
  });
});

describe('REST door — every query schema, every bounded parameter (census: TOTAL)', () => {
  /**
   * DERIVED, like the MCP side: every exported zod OBJECT schema in validators.ts (one with
   * its own `.shape`), not a hand-written map. A REST schema added there with a bounded
   * parameter and forgotten here would otherwise be unmeasured by this behavioural half.
   */
  const restSchemas: Record<string, { shape: Record<string, unknown> }> = Object.fromEntries(
    Object.entries(validators as Record<string, unknown>).filter(([, value]) => {
      const candidate = value as { shape?: unknown; safeParse?: unknown };
      return (
        !!candidate &&
        typeof candidate === 'object' &&
        typeof candidate.safeParse === 'function' &&
        !!candidate.shape &&
        typeof candidate.shape === 'object'
      );
    }),
  ) as Record<string, { shape: Record<string, unknown> }>;

  test('the derived census actually found the query schemas', () => {
    // Floor: the five bounded query schemas plus the unbounded ones that ride along.
    expect(Object.keys(restSchemas).length).toBeGreaterThan(4);
    for (const named of [
      listRecordsQuerySchema,
      fulltextQuerySchema,
      fragmentsQuerySchema,
      avFragmentsQuerySchema,
      avIndexationParamsSchema,
    ]) {
      expect(Object.values(restSchemas).includes(named as never)).toBe(true);
    }
  });

  test('an over-cap value is refused at every REST schema that accepts it', () => {
    let checked = 0;
    for (const [schemaName, schema] of Object.entries(restSchemas)) {
      const shape = schema.shape;
      for (const name of Object.keys(BOUNDED_PARAMETERS)) {
        if (!(name in shape)) continue;
        checked++;
        const parsed = (schema as never as { safeParse: (v: unknown) => { success: boolean } })
          .safeParse({ ...minimalRestInput(shape), [name]: OVER_CAP[name] });
        expect({ schema: schemaName, param: name, refused: !parsed.success })
          .toEqual({ schema: schemaName, param: name, refused: true });
      }
    }
    expect(checked).toBeGreaterThan(8);
  });

  test('the path record id is the shared bounded section_id', () => {
    expect(recordIdSchema).toBe(BOUNDED_PARAMETERS.section_id);
    expect(recordIdSchema.safeParse(0).success).toBe(false);
  });
});

describe('the clamp backstop under the schemas (a caller with no schema at all)', () => {
  test('clampLimit/clampOffset never return a value outside the bound', () => {
    expect(clampLimit(10_000_000)).toBe(MAX_LIMIT);
    expect(clampLimit(-5)).toBe(0);
    expect(clampLimit(Number.NaN)).toBeLessThanOrEqual(MAX_LIMIT);
    expect(clampOffset(-5)).toBe(0);
  });

  test('executeQuery binds a clamped LIMIT even when handed an absurd one', async () => {
    const seen: unknown[][] = [];
    __setTestDbExecute(async (_db, sql, params) => {
      seen.push(params);
      return stubRows(sql);
    });
    await executeQuery({ db: dbNames[0], table: PROBE_TABLE, limit: 10_000_000, offset: -3 });
    expect(seen.length).toBe(1);
    expect(seen[0]).toEqual([MAX_LIMIT, 0]);
  });

  test('fulltextSearch — which writes its own LIMIT — clamps too', async () => {
    const seen: unknown[][] = [];
    __setTestDbExecute(async (_db, sql, params) => {
      if (sql.includes('INFORMATION_SCHEMA')) return stubRows(sql);
      seen.push(params);
      return [];
    });
    await fulltextSearch(dbNames[0], PROBE_TABLE, {
      q: 'guerra',
      column: 'transcription',
      limit: 10_000_000,
      offset: 0,
    }).catch(() => undefined);
    const bound = seen.find(p => p.includes(MAX_LIMIT));
    expect(bound).toBeDefined();
    expect(seen.some(p => p.includes(10_000_000))).toBe(false);
  });
});

describe('resolve-map cardinality (PUB-05: the dimension no cap covered)', () => {
  const wide = (n: number) => JSON.stringify(Object.fromEntries(
    Array.from({ length: n }, (_, i) => [`col${i}`, PROBE_TABLE]),
  ));

  test('a map at the cap parses; one key more is refused', () => {
    expect(Object.keys(parseRelationMap(wide(MAX_RESOLVE_KEYS))).length).toBe(MAX_RESOLVE_KEYS);
    expect(() => parseRelationMap(wide(MAX_RESOLVE_KEYS + 1))).toThrow(ValidationError);
    expect(() => parseInverseRelationMap(wide(MAX_RESOLVE_KEYS + 1))).toThrow(ValidationError);
  });
});

describe('the per-request query budget (PUB-05: the product of the caps)', () => {
  test('charges are counted per request and refused past the envelope', () => {
    withRequestBudget(() => {
      for (let i = 0; i < MAX_QUERIES_PER_REQUEST; i++) chargeQuery();
      expect(currentBudgetSpent()).toBe(MAX_QUERIES_PER_REQUEST);
      expect(() => chargeQuery()).toThrow(BudgetExceededError);
    });
  });

  test('a re-entrant scope (the /batch shape) SHARES the budget, never resets it', () => {
    withRequestBudget(() => {
      chargeQuery();
      withRequestBudget(() => {
        chargeQuery();
        expect(currentBudgetSpent()).toBe(2);
      });
      expect(currentBudgetSpent()).toBe(2);
    });
  });

  test('every query charges through dbExecute — the one chokepoint', async () => {
    await withRequestBudget(async () => {
      await executeQuery({ db: dbNames[0], table: PROBE_TABLE, limit: 10 });
      expect(currentBudgetSpent()).toBe(1);
    });
  });

  test('a fan-out that outruns the budget is stopped, and stopped as a 429', async () => {
    const thrown = await withRequestBudget(async () => {
      try {
        for (let i = 0; i <= MAX_QUERIES_PER_REQUEST; i++) {
          await executeQuery({ db: dbNames[0], table: PROBE_TABLE, limit: 1 });
        }
        return null;
      } catch (error) {
        return error;
      }
    });
    expect(thrown).toBeInstanceOf(BudgetExceededError);
    expect((thrown as BudgetExceededError).status).toBe(429);
    // And the queries actually stopped: nothing beyond the envelope reached the seam.
    expect(queries.length).toBeLessThanOrEqual(MAX_QUERIES_PER_REQUEST);
  });

  test('the 429 SURVIVES the resolve path (the only path that can spend the budget)', async () => {
    __setTestDbExecute(async (_db, sql) => stubRows(sql));
    // Fresh ids every page: the resolver caches fetched rows, so repeating the same page
    // would spend the budget once and prove nothing about a runaway fan-out.
    const page = (n: number) =>
      Array.from({ length: MAX_RESOLVE_ROWS }, (_, i) => ({
        section_id: n * 1000 + i,
        image: JSON.stringify([n * 1000 + i]),
      }));
    const thrown = await withRequestBudget(async () => {
      try {
        // resolveRelations wraps every column in a catch; a swallowed BudgetExceededError
        // returned 200 with silently truncated columns while the docs advertise a 429.
        for (let n = 0; n <= MAX_QUERIES_PER_REQUEST; n++) {
          await resolveRelations(dbNames[0], page(n), JSON.stringify({ image: PROBE_TABLE }));
        }
        return null;
      } catch (error) {
        return error;
      }
    });
    expect(thrown).toBeInstanceOf(BudgetExceededError);
    expect((thrown as BudgetExceededError).status).toBe(429);
  });

  test('outside a request scope nothing is charged (a script is not a request)', () => {
    expect(currentBudgetSpent()).toBeNull();
    expect(() => chargeQuery()).not.toThrow();
  });
});

describe('client identity under a spoofed forwarding header (PUB-09)', () => {
  /**
   * The header AS A PROXY DELIVERS IT. Both shipped configs APPEND (nginx
   * `$proxy_add_x_forwarded_for`, Apache mod_proxy_http), so whatever the client typed
   * arrives on the LEFT and the address our own proxy saw arrives on the RIGHT. The first
   * fix read `split(',')[0]` — the attacker's text — under the DEFAULT deployment mode.
   */
  const asDeliveredByProxy = (clientTyped: string | null, seenByProxy = '203.0.113.9') => {
    const chain = clientTyped ? `${clientTyped}, ${seenByProxy}` : seenByProxy;
    const req = new Request('http://localhost/x', { headers: { 'x-forwarded-for': chain } });
    setSocketIp(req, '127.0.0.1'); // the proxy is the socket peer
    return req;
  };

  test('with no declared proxy, a rotating X-Forwarded-For does not move the identity', () => {
    const identities = new Set<string>();
    for (let i = 0; i < 25; i++) {
      identities.add(clientIp(asDeliveredByProxy(`10.0.0.${i}`), false));
    }
    expect([...identities]).toEqual(['127.0.0.1']);
  });

  test('WITH a declared proxy, a rotating LEFTMOST hop still does not move the identity', () => {
    const identities = new Set<string>();
    for (let i = 0; i < 25; i++) {
      // The shape of the audit's exact repro: a different spoofed value every request.
      identities.add(clientIp(asDeliveredByProxy(`10.0.0.${i}`), true));
    }
    expect([...identities]).toEqual(['203.0.113.9']);
  });

  test('the honest client and the spoofing client land in the SAME bucket', () => {
    // The measured bypass was asymmetric: the attacker was unmetered while the honest
    // caller was throttled. Same address, same identity, whatever either of them typed.
    expect(clientIp(asDeliveredByProxy(null, '198.51.100.4'), true)).toBe('198.51.100.4');
    expect(clientIp(asDeliveredByProxy('1.2.3.4, 5.6.7.8', '198.51.100.4'), true)).toBe('198.51.100.4');
  });

  test('a second declared hop moves the index one to the left, and no further', () => {
    // A CDN we also operate in front of nginx: chain = <typed>, <what the CDN saw>, <CDN>.
    const req = asDeliveredByProxy('9.9.9.9, 198.51.100.4');
    expect(clientIp(req, true, 2)).toBe('198.51.100.4');
    // Declaring more hops than the chain can prove: not believed at all.
    expect(clientIp(req, true, 9)).toBe('127.0.0.1');
  });

  test('X-Real-IP is not an identity in either mode (Apache never sets it)', () => {
    const req = new Request('http://localhost/x', { headers: { 'x-real-ip': '10.0.0.9' } });
    setSocketIp(req, '203.0.113.7');
    expect(clientIp(req, false)).toBe('203.0.113.7');
    expect(clientIp(req, true)).toBe('203.0.113.7');
  });
});

describe('the configuration that decides it (PUB-09)', () => {
  test('TRUST_PROXY unset derives from the deployment mode', () => {
    expect(resolveTrustProxy('standalone', undefined)).toBe(false);
    expect(resolveTrustProxy('apache', undefined)).toBe(true);
    expect(resolveTrustProxy('nginx', undefined)).toBe(true);
    // An explicit value is still honoured in both directions.
    expect(resolveTrustProxy('apache', false)).toBe(false);
    expect(resolveTrustProxy('standalone', true)).toBe(true);
  });

  test('standalone + TRUST_PROXY=true does not boot without the explicit acknowledgement', () => {
    const base = { DB_NAMES: 'dedalo_web' };
    const refused = environmentSchema.safeParse({ ...base, DEPLOYMENT_MODE: 'standalone', TRUST_PROXY: 'true' });
    expect(refused.success).toBe(false);
    const acknowledged = environmentSchema.safeParse({
      ...base,
      DEPLOYMENT_MODE: 'standalone',
      TRUST_PROXY: 'true',
      TRUST_PROXY_IN_STANDALONE: 'true',
    });
    expect(acknowledged.success).toBe(true);
    // The same pair is unremarkable behind a proxy.
    expect(environmentSchema.safeParse({ ...base, DEPLOYMENT_MODE: 'apache', TRUST_PROXY: 'true' }).success).toBe(true);
  });

  test('an env boolean means what it says — "false" is FALSE', () => {
    for (const falsey of ['false', 'FALSE', '0', 'no', 'off', ' false ']) {
      expect(envBoolean.parse(falsey)).toBe(false);
    }
    for (const truthy of ['true', '1', 'YES', 'on']) {
      expect(envBoolean.parse(truthy)).toBe(true);
    }
    // Unreadable is a boot failure, not a coin flip.
    expect(envBoolean.safeParse('maybe').success).toBe(false);
  });

  test('a standalone deployment that switches TRUST_PROXY off boots, and derives false', () => {
    const parsed = environmentSchema.safeParse({ DB_NAMES: 'dedalo_web', DEPLOYMENT_MODE: 'standalone', TRUST_PROXY: 'false' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && resolveTrustProxy('standalone', parsed.data.TRUST_PROXY)).toBe(false);
  });
});

/**
 * `count_records` needs `q` optional while the shared object is required, so the tool wraps
 * the shared schema rather than being it. This recognises a wrapper built FROM the shared
 * object (zod keeps the inner schema on `.def.innerType`) and nothing else — a freshly
 * declared `z.string().max(512)` does not pass.
 */
function describesFrom(declared: unknown, shared: unknown): boolean {
  let cursor: unknown = declared;
  for (let i = 0; i < 5 && cursor; i++) {
    const def = (cursor as { def?: { innerType?: unknown } }).def;
    if (!def?.innerType) return false;
    if (def.innerType === shared) return true;
    // The shared MCP wrappers are themselves `bounded.optional().describe()`, so unwrap
    // toward the bounded object the census names.
    const inner = def.innerType;
    if (inner === (shared as { def?: { innerType?: unknown } })?.def?.innerType) return true;
    cursor = inner;
  }
  return false;
}

/** Arguments a given tool requires beyond the shared base, so a call can reach its handler. */
function requiredArgsFor(toolName: string): Record<string, unknown> {
  switch (toolName) {
    case 'get_record':
    case 'get_text_fragment':
    case 'get_av_fragment':
    case 'get_av_indexation_fragment':
      return { section_id: 1, terms: 'guerra' };
    case 'fulltext_search':
      return { q: 'guerra' };
    default:
      return {};
  }
}

/** The other required fields of a REST schema, so only the parameter under test can fail it. */
function minimalRestInput(shape: Record<string, unknown>): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  if ('q' in shape) input.q = 'guerra';
  if ('terms' in shape) input.terms = 'guerra';
  if ('section_id' in shape) input.section_id = 1;
  return input;
}
