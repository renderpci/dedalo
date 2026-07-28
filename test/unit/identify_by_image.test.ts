/**
 * dd_identify_api:identify_by_image — "what is this?" for material with NO record
 * yet (src/core/api/handlers/dd_identify_api.ts).
 *
 * Three things are gated here, and only one of them is "does it work".
 *
 * 1. IT DECLINES, IT DOES NOT EXPLODE. Media indexing off, the master RAG switch
 *    off, an unusable or oversized image, an egress policy that forbids the
 *    configured provider, an encoder that failed — every one is an ordinary
 *    answer and must come back as `{result:false, errors:[code]}` at HTTP 200.
 *
 * 2. AN EMPTY INDEX IS NOT "NO MATCHES". `empty_index` (a decline) and an `ok`
 *    answer with zero results are DIFFERENT answers to a curator: "nothing has
 *    ever been indexed" versus "the corpus was searched and nothing came close".
 *    Collapsing them would let someone read a conclusion off an unindexed
 *    install. Both directions are asserted.
 *
 * 3. A VECTOR HIT IS NOT PERMISSION. Every hit passes the RAG ACL chokepoint
 *    before it is read; the label and the Type link are SECOND reads of SECOND
 *    components and are re-gated per (section, component); a Type record passes
 *    the record-scope gate before its label is quoted. A denied caller gets
 *    nothing — and no count of what was hidden.
 *
 * The live half (below) drives the REAL stack: the real vector store, the real
 * ACL, the real section_map label lookup, over two scratch `test3` records whose
 * image vectors are produced by the network-free DeterministicMultimodalProvider
 * (the one stand-in, exactly as rag_multimodal.test.ts uses it). The vectors live
 * in their own model partition, which afterAll drops; the matrix rows use
 * section_ids far outside the canonical range and are deleted. NOTHING is written
 * to dd_ontology.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
	type MultimodalRuntimeConfig,
	multimodalConfigFromEnv,
} from '../../src/ai/rag/multimodal_config.ts';
import {
	DeterministicMultimodalProvider,
	type MultimodalEmbeddingProvider,
} from '../../src/ai/rag/multimodal_embedding_provider.ts';
import type { Candidate, EmbeddingRow } from '../../src/ai/rag/types.ts';
import { deleteRecordChunks, ragSql, upsertEmbeddingRows } from '../../src/ai/rag/vector_store.ts';
import { config } from '../../src/config/config.ts';
import { envSnapshot } from '../../src/config/env.ts';
import type { ApiRequestContext } from '../../src/core/api/dispatch.ts';
import {
	type IdentifyByImageDeps,
	MAX_IMAGE_BYTES,
	buildIdentifyByImage,
	defaultIdentifyByImageDeps,
	readImageInput,
} from '../../src/core/api/handlers/dd_identify_api.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { ProfileError, parseProfile } from '../../src/core/identify/profile.ts';
import { getSectionMapValue } from '../../src/core/ontology/section_map.ts';
import type { Principal } from '../../src/core/security/permissions.ts';

// The action is behind both switches; the live half needs them ON. (A test file
// may touch process.env — the config tripwire scans src/, and this is how
// rag_multimodal.test.ts drives the same pair.)
process.env.DEDALO_RAG_ENABLED = 'true';
process.env.DEDALO_RAG_MEDIA_ENABLED = 'true';

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
const NO_ACCESS: Principal = { userId: 999999, isGlobalAdmin: false, isDeveloper: false };

const rqo = (options: Record<string, unknown>): Rqo => ({ options }) as unknown as Rqo;
const ctx = (principal: Principal): ApiRequestContext =>
	({
		requestId: 'test',
		clientIp: '127.0.0.1',
		session: null,
		csrfCandidate: null,
		principal,
	}) as ApiRequestContext;

/* ───────────────────────────── image fixtures ───────────────────────────── */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Real PNG magic bytes followed by ASCII tokens. The signature is what the
 * sniffer accepts; the tokens are what the deterministic encoder hashes, so two
 * different "photographs" land at different points of the joint space.
 */
function pngBytes(tokens: string): Uint8Array {
	return new Uint8Array([...PNG_SIGNATURE, ...Buffer.from(tokens, 'utf8')]);
}

const asBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

const COIN_IMAGE = pngBytes('roman bronze coin obverse laureate head emperor');
const OTHER_IMAGE = pngBytes('greek marble statue torso fragment drapery');

/* ───────────────────────────── injected fakes ───────────────────────────── */

function fakeConfig(overrides: Partial<MultimodalRuntimeConfig> = {}): MultimodalRuntimeConfig {
	return {
		mediaEnabled: true,
		provider: 'local',
		model: 'fake-multimodal',
		endpoint: '',
		apiKey: undefined,
		imageMaxPx: 512,
		imageHybrid: true,
		nearDuplicateSimilarity: 0.93,
		characterizeTopK: 20,
		imageEgressPolicy: 'local_only',
		...overrides,
	};
}

function fakeProvider(vector: number[] | null = [1, 0, 0]): MultimodalEmbeddingProvider {
	return {
		embedImage: async () => (vector === null ? [] : [vector]),
		embedTextForImageSearch: async () => [],
		dimension: () => (vector === null ? null : vector.length),
		model: () => 'fake-multimodal',
		provider: () => 'local',
		isExternal: () => false,
	};
}

function fakeCandidate(sectionId: number, distance: number): Candidate {
	return {
		sectionTipo: 'test3',
		sectionId,
		componentTipo: 'rsc29',
		lang: 'lg-nolan',
		chunkIndex: 0,
		sourceText: 'caption: a coin',
		sourceKind: 'image_visual',
		modality: 'image',
		egressClass: 'public',
		parentKey: 'test3_1',
		chunkMeta: {
			view: 'obverse',
			thumb_url: '/media/thumb/rsc29_test3_1.jpg',
			media_tipo: 'rsc29',
		},
		distance,
	};
}

/** Everything permitted, one hit, no profile — the baseline every case varies. */
function fakeDeps(overrides: Partial<IdentifyByImageDeps> = {}): IdentifyByImageDeps {
	return {
		ragEnabled: () => true,
		mediaEnabled: () => true,
		config: () => fakeConfig(),
		buildProvider: () => fakeProvider(),
		queryImagePartition: async () => [fakeCandidate(1, 0.1)],
		filterAccessible: async (_principal, candidates) => candidates,
		componentGrant: async () => 1,
		scopeRecords: async (records) => records,
		labelComponent: async () => 'test52',
		readValues: async () => ({ kind: 'text', values: ['A bronze coin'] }),
		loadProfile: async () => null,
		...overrides,
	};
}

type ImageAnswer = {
	model: string;
	scope: string[];
	warnings: string[];
	results: {
		section_tipo: string;
		section_id: number;
		label: string | null;
		similarity: number | null;
		view: string | null;
		thumb_url: string | null;
		context: string | null;
		types: { section_tipo: string; section_id: number; label: string | null }[];
	}[];
};

/* ═══════════════════════════════ input bounds ═══════════════════════════════ */

describe('readImageInput — the input is bounded before it is trusted', () => {
	test('accepts real image bytes, bare base64 or a data: URL', () => {
		const bare = readImageInput(asBase64(COIN_IMAGE));
		expect(bare.ok).toBe(true);
		expect((bare as { kind: string }).kind).toBe('png');
		// The DECLARED type of a data: URL is discarded — the magic bytes decide.
		const dataUrl = readImageInput(`data:application/octet-stream;base64,${asBase64(COIN_IMAGE)}`);
		expect(dataUrl.ok).toBe(true);
	});

	test('refuses anything that is not an embeddable image', () => {
		for (const payload of [
			Buffer.from('%PDF-1.7 not a picture').toString('base64'), // sniffs as pdf
			Buffer.from('plain text, definitely not an image').toString('base64'), // sniffs as text
			Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]).toString('base64'), // unrecognised
		]) {
			const result = readImageInput(payload);
			expect(result.ok).toBe(false);
			expect((result as { code: string }).code).toBe('invalid_image');
		}
	});

	test('an oversized body is refused by its LENGTH, before it is decoded', () => {
		// 'A' repeated: valid base64 alphabet, so the only thing stopping it is the
		// length cap. Decoding first would already have paid the memory.
		const oversized = 'A'.repeat(Math.ceil((MAX_IMAGE_BYTES / 3) * 4) + 4096);
		const result = readImageInput(oversized);
		expect(result.ok).toBe(false);
		expect((result as { code: string }).code).toBe('image_too_large');
	});

	test('missing / empty / non-string is missing_image, not a throw', () => {
		for (const raw of [undefined, null, '', '   ', 42, { image: 'x' }]) {
			const result = readImageInput(raw);
			expect(result.ok).toBe(false);
			expect((result as { code: string }).code).toBe('missing_image');
		}
	});
});

/* ═══════════════════════════════ the declines ═══════════════════════════════ */

describe('identify_by_image — the declines (HTTP 200, never a 500)', () => {
	const image = asBase64(COIN_IMAGE);

	test('the master RAG switch and the media switch each decline, before decoding', async () => {
		let decoded = false;
		const watch = {
			buildProvider: () => {
				decoded = true;
				return fakeProvider();
			},
		};
		const ragOff = await buildIdentifyByImage(fakeDeps({ ragEnabled: () => false, ...watch }))(
			rqo({ image }),
			ctx(SUPERUSER),
		);
		expect(ragOff.status).toBe(200);
		expect(ragOff.body.result).toBe(false);
		expect(ragOff.body.errors).toEqual(['rag_disabled']);

		const mediaOff = await buildIdentifyByImage(fakeDeps({ mediaEnabled: () => false, ...watch }))(
			rqo({ image }),
			ctx(SUPERUSER),
		);
		expect(mediaOff.body.errors).toEqual(['media_disabled']);
		expect(decoded).toBe(false);
	});

	test('a bad image is declined with the reason', async () => {
		const handler = buildIdentifyByImage(fakeDeps());
		expect((await handler(rqo({}), ctx(SUPERUSER))).body.errors).toEqual(['missing_image']);
		expect(
			(await handler(rqo({ image: Buffer.from('%PDF-1.7').toString('base64') }), ctx(SUPERUSER)))
				.body.errors,
		).toEqual(['invalid_image']);
	});

	test('an egress policy that forbids the provider declines with the operator message', async () => {
		// buildMultimodalProvider throws exactly this shape when it would ship the
		// photograph off the host under 'local_only'. It must reach the curator.
		const res = await buildIdentifyByImage(
			fakeDeps({
				buildProvider: () => {
					throw new Error(
						"Multimodal image embedding would send object images off this host (endpoint 'https://api.vendor.com' is not on this host or its private network), but DEDALO_RAG_IMAGE_EGRESS_POLICY is 'local_only'.",
					);
				},
			}),
		)(rqo({ image }), ctx(SUPERUSER));
		expect(res.status).toBe(200);
		expect(res.body.errors).toEqual(['egress_forbidden']);
		expect(res.body.msg).toContain('DEDALO_RAG_IMAGE_EGRESS_POLICY');
	});

	test('a provider failure under an OPEN egress policy is provider_unavailable', async () => {
		const res = await buildIdentifyByImage(
			fakeDeps({
				config: () => fakeConfig({ imageEgressPolicy: 'allow_external' }),
				buildProvider: () => {
					throw new Error('sidecar configuration is incomplete');
				},
			}),
		)(rqo({ image }), ctx(SUPERUSER));
		expect(res.body.errors).toEqual(['provider_unavailable']);
	});

	test('an encoder that returns nothing is embed_failed (never a partial batch)', async () => {
		const res = await buildIdentifyByImage(fakeDeps({ buildProvider: () => fakeProvider(null) }))(
			rqo({ image }),
			ctx(SUPERUSER),
		);
		expect(res.body.errors).toEqual(['embed_failed']);
	});

	test('a scope the caller may not open is refused, not silently widened', async () => {
		let queried = false;
		const res = await buildIdentifyByImage(
			fakeDeps({
				componentGrant: async () => 0,
				queryImagePartition: async () => {
					queried = true;
					return [];
				},
			}),
		)(rqo({ image, section_tipo: ['test3'] }), ctx(NO_ACCESS));
		expect(res.body.errors).toEqual(['forbidden']);
		// Running unscoped instead would answer a different question than the asked one.
		expect(queried).toBe(false);
	});
});

/* ═════════════ empty index ≠ no matches (the distinction of record) ═════════ */

describe('identify_by_image — an empty index is a different answer from no matches', () => {
	const image = asBase64(COIN_IMAGE);

	test('an empty partition DECLINES with empty_index and says so in prose', async () => {
		const res = await buildIdentifyByImage(fakeDeps({ queryImagePartition: async () => [] }))(
			rqo({ image }),
			ctx(SUPERUSER),
		);
		expect(res.status).toBe(200);
		expect(res.body.result).toBe(false);
		expect(res.body.errors).toEqual(['empty_index']);
		expect(res.body.msg).toContain('Nothing has been indexed');
	});

	test('an empty SCOPED partition names the scope it searched', async () => {
		const res = await buildIdentifyByImage(fakeDeps({ queryImagePartition: async () => [] }))(
			rqo({ image, section_tipo: 'test3' }),
			ctx(SUPERUSER),
		);
		expect(res.body.errors).toEqual(['empty_index']);
		expect(res.body.msg).toContain('test3');
	});

	test('hits that ALL fail the ACL are "no matches" — an ok answer with no results', async () => {
		// The opposite pole of the same distinction: the index is populated, this
		// caller simply may not see any of it. Never empty_index, and never a count
		// of what was hidden.
		const res = await buildIdentifyByImage(
			fakeDeps({
				queryImagePartition: async () => [fakeCandidate(1, 0.1), fakeCandidate(2, 0.2)],
				filterAccessible: async () => [],
			}),
		)(rqo({ image }), ctx(NO_ACCESS));
		expect(res.status).toBe(200);
		expect(res.body.msg).toBe('ok');
		const answer = res.body.result as ImageAnswer;
		expect(answer.results).toEqual([]);
		expect(JSON.stringify(answer)).not.toContain('hidden');
	});
});

/* ═══════════════════════════ the answer's shape ═══════════════════════════ */

describe('identify_by_image — the answer', () => {
	const image = asBase64(COIN_IMAGE);

	test('each result carries label, thumb, similarity and its Type', async () => {
		const profile = parseProfile({
			id: 'coin_types',
			label: 'Coin identification',
			sectionTipos: ['test3'],
			typeSectionTipo: 'test4',
			criteria: [
				{
					id: 'obverse_legend',
					label: 'Type › Obverse legend',
					path: [
						{ section_tipo: 'test3', component_tipo: 'test71' },
						{ section_tipo: 'test4', component_tipo: 'test52' },
					],
					role: 'identifying',
					mode: 'same_locator',
					weight: 3,
				},
			],
		});
		const res = await buildIdentifyByImage(
			fakeDeps({
				loadProfile: async (sectionTipo) => (sectionTipo === 'test3' ? profile : null),
				labelComponent: async () => 'test52',
				readValues: async (record, path) => {
					// The Type link component, read on the CANDIDATE.
					if (path[0]?.component_tipo === 'test71') {
						return { kind: 'locators', locators: [{ section_tipo: 'test4', section_id: 77 }] };
					}
					return {
						kind: 'text',
						values: [`label of ${record.sectionTipo}/${record.sectionId}`],
					};
				},
			}),
		)(rqo({ image }), ctx(SUPERUSER));

		expect(res.body.msg).toBe('ok');
		const answer = res.body.result as ImageAnswer;
		expect(answer.model).toBe('fake-multimodal');
		expect(answer.scope).toEqual([]);
		expect(answer.warnings).toEqual([]);
		expect(answer.results).toHaveLength(1);
		const hit = answer.results[0]!;
		expect(hit.section_tipo).toBe('test3');
		expect(hit.section_id).toBe(1);
		expect(hit.label).toBe('label of test3/1');
		// 1 - distance, rounded like every other image answer in the engine.
		expect(hit.similarity).toBe(0.9);
		expect(hit.view).toBe('obverse');
		expect(hit.thumb_url).toBe('/media/thumb/rsc29_test3_1.jpg');
		// "…which are all Type X": the Type, with its own label.
		expect(hit.types).toEqual([
			{ section_tipo: 'test4', section_id: 77, label: 'label of test4/77' },
		]);
	});

	test('a section with no profile (or no typeSectionTipo) simply reports no Types', async () => {
		const noTypes = parseProfile({
			id: 'photos',
			label: 'Photo archive',
			sectionTipos: ['test3'],
			criteria: [
				{
					id: 'legend',
					label: 'Legend',
					path: [{ section_tipo: 'test3', component_tipo: 'test52' }],
					role: 'identifying',
					mode: 'normalized_text',
					weight: 1,
				},
			],
		});
		for (const loadProfile of [
			async () => null,
			async () => noTypes,
		] as IdentifyByImageDeps['loadProfile'][]) {
			const res = await buildIdentifyByImage(fakeDeps({ loadProfile }))(
				rqo({ image }),
				ctx(SUPERUSER),
			);
			expect((res.body.result as ImageAnswer).results[0]!.types).toEqual([]);
		}
	});

	test('a malformed profile is a WARNING on a valid answer, never a silent "no Types"', async () => {
		const res = await buildIdentifyByImage(
			fakeDeps({
				loadProfile: async () => {
					throw new ProfileError("criterion 'legend' hop 1 names component 'x'");
				},
			}),
		)(rqo({ image }), ctx(SUPERUSER));
		expect(res.body.msg).toBe('ok');
		const answer = res.body.result as ImageAnswer;
		expect(answer.results).toHaveLength(1);
		expect(answer.results[0]!.types).toEqual([]);
		expect(answer.warnings).toHaveLength(1);
		// The parser's own message travels — the whole point of refusing loudly.
		expect(answer.warnings[0]).toContain("criterion 'legend' hop 1");
	});

	test('limit is clamped and the query over-fetches to survive the ACL filter', async () => {
		const asked: number[] = [];
		const handler = buildIdentifyByImage(
			fakeDeps({
				queryImagePartition: async ({ limit }) => {
					asked.push(limit);
					return Array.from({ length: 60 }, (_, i) => fakeCandidate(i + 1, i / 100));
				},
			}),
		);
		const res = await handler(rqo({ image, limit: 5 }), ctx(SUPERUSER));
		expect((res.body.result as ImageAnswer).results).toHaveLength(5);
		await handler(rqo({ image, limit: 9999 }), ctx(SUPERUSER));
		// max(40, limit*4): a hit dropped for permissions must not cost a slot.
		expect(asked).toEqual([40, 200]);
	});
});

/* ════════════════════════════ access control ════════════════════════════ */

describe('identify_by_image — a vector hit is not permission', () => {
	const image = asBase64(COIN_IMAGE);

	test('the REQUEST principal is what the ACL chokepoint is called with', async () => {
		let seen: Principal | null = null;
		await buildIdentifyByImage(
			fakeDeps({
				filterAccessible: async (principal, candidates) => {
					seen = principal;
					return candidates;
				},
			}),
		)(rqo({ image }), ctx(NO_ACCESS));
		// (cast: TS narrows `seen` to null — it is assigned inside the callback)
		expect(seen as unknown as Principal).toBe(NO_ACCESS);
	});

	test('a label component the caller may not read yields NO label (not the value)', async () => {
		let read = false;
		const res = await buildIdentifyByImage(
			fakeDeps({
				componentGrant: async () => 0,
				readValues: async () => {
					read = true;
					return { kind: 'text', values: ['secret inventory number'] };
				},
			}),
		)(rqo({ image }), ctx(NO_ACCESS));
		const answer = res.body.result as ImageAnswer;
		expect(answer.results[0]!.label).toBeNull();
		// The gate must stop us BEFORE the read, not filter its output.
		expect(read).toBe(false);
	});

	test('a Type record outside the caller scope is never quoted', async () => {
		const profile = parseProfile({
			id: 'coin_types',
			label: 'Coins',
			sectionTipos: ['test3'],
			typeSectionTipo: 'test4',
			criteria: [
				{
					id: 'type',
					label: 'Type',
					path: [
						{ section_tipo: 'test3', component_tipo: 'test71' },
						{ section_tipo: 'test4', component_tipo: 'test52' },
					],
					role: 'identifying',
					mode: 'same_locator',
					weight: 1,
				},
			],
		});
		const res = await buildIdentifyByImage(
			fakeDeps({
				loadProfile: async () => profile,
				readValues: async (_record, path) =>
					path[0]?.component_tipo === 'test71'
						? { kind: 'locators', locators: [{ section_tipo: 'test4', section_id: 77 }] }
						: { kind: 'text', values: ['a label'] },
				// The record-scope gate drops it — silently, with no count.
				scopeRecords: async () => [],
			}),
		)(rqo({ image }), ctx(NO_ACCESS));
		const answer = res.body.result as ImageAnswer;
		expect(answer.results[0]!.types).toEqual([]);
		expect(JSON.stringify(answer)).not.toContain('77');
	});
});

/* ══════════════════════ the live stack (real store + ACL) ══════════════════ */

/**
 * The REAL path: the real pgvector store, the real ACL chokepoint, the real
 * section_map label lookup and the real profile source. Only the ENCODER is a
 * stand-in (DeterministicMultimodalProvider, network-free), and its vectors are
 * filed under their own model name so they can never mix with a real partition.
 */
const SECTION_TIPO = 'test3';
const MODEL = 'deterministic-identify-image-test';
const COIN_ID = 9990501;
const OTHER_ID = 9990502;
const COIN_LABEL = 'identify-by-image scratch coin';
const OTHER_LABEL = 'identify-by-image scratch statue';
const liveProvider = new DeterministicMultimodalProvider({ model: MODEL, dimension: 64 });

let haveMatrix = false;
let haveRagDb = false;
try {
	await sql`SELECT 1`;
	haveMatrix = true;
} catch {
	console.warn('[identify_by_image] matrix database unavailable — the live gates are SKIPPED');
}
try {
	await ragSql.unsafe('SELECT 1 FROM rag_embeddings LIMIT 1');
	haveRagDb = true;
} catch {
	console.warn(
		'[identify_by_image] pgvector RAG database unavailable — the live gates are SKIPPED',
	);
}
const LIVE = haveMatrix && haveRagDb;

/** One seeded image vector, exactly as the indexer would have written it. */
async function seedVector(sectionId: number, bytes: Uint8Array): Promise<void> {
	const [embedding] = await liveProvider.embedImage([bytes]);
	const row: EmbeddingRow = {
		sectionTipo: SECTION_TIPO,
		sectionId,
		componentTipo: 'rsc29',
		lang: 'lg-nolan',
		chunkIndex: 0,
		provider: 'local',
		model: MODEL,
		dimension: (embedding as number[]).length,
		embedding: embedding as number[],
		sourceHash: `identify-by-image-${sectionId}`,
		sourceText: 'caption: scratch fixture',
		tokenCount: 3,
		modality: 'image',
		sourceKind: 'image_visual',
		egressClass: 'public',
		parentKey: `${SECTION_TIPO}_${sectionId}`,
		chunkMeta: {
			view: 'obverse',
			thumb_url: `/media/thumb/rsc29_${SECTION_TIPO}_${sectionId}.jpg`,
			media_tipo: 'rsc29',
		},
	};
	await upsertEmbeddingRows([row]);
}

beforeAll(async () => {
	if (!LIVE) return;
	for (const [id, label] of [
		[COIN_ID, COIN_LABEL],
		[OTHER_ID, OTHER_LABEL],
	] as [number, string][]) {
		await sql.unsafe(
			`INSERT INTO matrix_test (section_id, section_tipo, string)
			 VALUES ($1, $2, $3::text::jsonb)`,
			[
				id,
				SECTION_TIPO,
				JSON.stringify({ test52: [{ id: 1, lang: config.menu.dataLang, value: label }] }),
			],
		);
	}
	await seedVector(COIN_ID, COIN_IMAGE);
	await seedVector(OTHER_ID, OTHER_IMAGE);
});

afterAll(async () => {
	if (!LIVE) return;
	for (const id of [COIN_ID, OTHER_ID]) {
		await deleteRecordChunks(SECTION_TIPO, id).catch(() => {});
		await sql.unsafe('DELETE FROM matrix_test WHERE section_tipo = $1 AND section_id = $2', [
			SECTION_TIPO,
			id,
		]);
	}
	await ragSql
		.unsafe(`DROP TABLE IF EXISTS "rag_embeddings_${MODEL.replace(/[^a-z0-9]+/g, '_')}"`)
		.catch(() => {});
});

/** The real deps, with ONLY the encoder replaced (and its own partition). */
function liveDeps(): IdentifyByImageDeps {
	return { ...defaultIdentifyByImageDeps(), buildProvider: () => liveProvider };
}

describe.if(LIVE)('identify_by_image — the live stack', () => {
	test('the seeded record comes back, with its similarity and its real label', async () => {
		const res = await buildIdentifyByImage(liveDeps())(
			rqo({ image: asBase64(COIN_IMAGE), section_tipo: SECTION_TIPO, limit: 10 }),
			ctx(SUPERUSER),
		);
		expect(res.body.msg).toBe('ok');
		const answer = res.body.result as ImageAnswer;
		expect(answer.model).toBe(MODEL);
		expect(answer.scope).toEqual([SECTION_TIPO]);

		const coin = answer.results.find((hit) => hit.section_id === COIN_ID);
		expect(coin).toBeDefined();
		// The query image IS the indexed image: cosine distance ~0.
		expect(coin?.similarity).toBeGreaterThan(0.99);
		// Resolved through the section's own section_map main.term, not hardcoded.
		expect(coin?.label).toBe(COIN_LABEL);
		expect(coin?.thumb_url).toBe(`/media/thumb/rsc29_${SECTION_TIPO}_${COIN_ID}.jpg`);
		expect(coin?.view).toBe('obverse');

		// The other object is farther away — the ranking is the encoder's, not ours.
		const other = answer.results.find((hit) => hit.section_id === OTHER_ID);
		if (other !== undefined) {
			expect(coin?.similarity ?? 0).toBeGreaterThan(other.similarity ?? 1);
		}
	});

	test('the label really comes from the section_map (fixture precondition)', async () => {
		// Stated as its own assertion: if test3 ever stops declaring a main term, the
		// label above would go null and the gate would be asserting nothing.
		expect(await getSectionMapValue(SECTION_TIPO, 'main', 'term')).toBe('test52');
	});

	test('a denied principal gets NOTHING from the real stack (DoD)', async () => {
		const res = await buildIdentifyByImage(liveDeps())(
			rqo({ image: asBase64(COIN_IMAGE), limit: 10 }),
			ctx(NO_ACCESS),
		);
		expect(res.status).toBe(200);
		const answer = res.body.result as ImageAnswer;
		expect(answer.results.some((hit) => hit.section_id === COIN_ID)).toBe(false);
		expect(answer.results.some((hit) => hit.section_id === OTHER_ID)).toBe(false);
	});

	test('nothing is written and nothing is left behind by an identify call', async () => {
		const countVectors = async (): Promise<number> => {
			const rows = (await ragSql.unsafe(
				'SELECT count(*)::int AS n FROM rag_embeddings WHERE model = $1',
				[MODEL],
			)) as { n: number }[];
			return rows[0]?.n ?? 0;
		};
		const countRecords = async (): Promise<number> => {
			const rows = (await sql.unsafe(
				'SELECT count(*)::int AS n FROM matrix_test WHERE section_tipo = $1',
				[SECTION_TIPO],
			)) as { n: number }[];
			return rows[0]?.n ?? 0;
		};
		const vectorsBefore = await countVectors();
		const recordsBefore = await countRecords();
		await buildIdentifyByImage(liveDeps())(
			rqo({ image: asBase64(pngBytes('a completely new object nobody catalogued')) }),
			ctx(SUPERUSER),
		);
		// The query image is a QUERY, not a document: indexing it would put an
		// unaccessioned object into the corpus that answers everybody else's searches.
		expect(await countVectors()).toBe(vectorsBefore);
		expect(await countRecords()).toBe(recordsBefore);
	});
});

describe('identify_by_image — registration', () => {
	test('the production deps build without touching the network', () => {
		const deps = defaultIdentifyByImageDeps();
		expect(typeof deps.queryImagePartition).toBe('function');
		expect(typeof deps.filterAccessible).toBe('function');
		// THE EGRESS POLICY DEFAULTS CLOSED. Asserted as the single value it must
		// be with the key UNSET — the regression this catches is object photographs
		// shipping off-host on an install that never configured the key, and an
		// assertion over both members of the type ('local_only' | 'allow_external')
		// is the whole domain, so it could not have caught it.
		expect(multimodalConfigFromEnv({}).imageEgressPolicy).toBe('local_only');
		// A typo is not a licence either: an unrecognised value stays closed.
		expect(
			multimodalConfigFromEnv({ DEDALO_RAG_IMAGE_EGRESS_POLICY: 'external' }).imageEgressPolicy,
		).toBe('local_only');
		// …and the production deps really READ that config rather than deciding for
		// themselves, so the default above is the one this action applies.
		expect(deps.config().imageEgressPolicy).toBe(
			multimodalConfigFromEnv(envSnapshot()).imageEgressPolicy,
		);
	});
});
