import { describe, test, expect, mock } from 'bun:test';
import { z } from 'zod';
import { DedaloError, TokenBucketRateLimiter } from '@dedalo/mcp-common';
import { registerTool, type ToolContext } from '../src/tools/_shared/register.js';

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
	return {
		logger: { info: mock(), error: mock(), warn: mock(), debug: mock() } as any,
		limiter: null,
		...overrides,
	};
}

function mockServer() {
	let registeredCb: ((args: unknown, extra: unknown) => Promise<unknown>) | undefined;
	let registeredName: string | undefined;
	const server = {
		registerTool: mock((name: string, _config: unknown, cb: unknown) => {
			registeredName = name;
			registeredCb = cb as typeof registeredCb;
		}),
	};
	return { server, getRegistered: () => ({ name: registeredName, cb: registeredCb }) };
}

describe('registerTool', () => {
	test('registers tool on the server with correct name and config', () => {
		const { server } = mockServer();
		const ctx = makeCtx();
		const schema = z.object({ x: z.string() });

		registerTool(server as any, {
			name: 'test_tool',
			description: 'A test tool',
			annotations: { readOnlyHint: true },
			inputSchema: schema,
			handler: async () => 'ok',
		}, ctx);

		expect(server.registerTool).toHaveBeenCalledTimes(1);
		expect(server.registerTool.mock.calls[0][0]).toBe('test_tool');
		expect(server.registerTool.mock.calls[0][1].description).toBe('A test tool');
		expect(server.registerTool.mock.calls[0][1].annotations).toEqual({ readOnlyHint: true });
	});

	test('successful handler returns { ok: true, data } in structuredContent', async () => {
		const { server, getRegistered } = mockServer();
		const ctx = makeCtx();

		registerTool(server as any, {
			name: 'test_tool',
			description: 'desc',
			annotations: {},
			inputSchema: z.object({}),
			handler: async () => ({ foo: 'bar' }),
		}, ctx);

		const result = await getRegistered().cb!({}, {});
		expect(result).toHaveProperty('structuredContent');
		const sc = (result as any).structuredContent;
		expect(sc.ok).toBe(true);
		expect(sc.data).toEqual({ foo: 'bar' });
	});

	test('handler returning Structured envelope passes through', async () => {
		const { server, getRegistered } = mockServer();
		const ctx = makeCtx();

		registerTool(server as any, {
			name: 'test_tool',
			description: 'desc',
			annotations: {},
			inputSchema: z.object({}),
			handler: async () => ({
				ok: true as const,
				data: [1, 2, 3],
				pagination: { total: 3, offset: 0, count: 3, has_more: false, next_offset: null },
			}),
		}, ctx);

		const result = await getRegistered().cb!({}, {});
		const sc = (result as any).structuredContent;
		expect(sc.ok).toBe(true);
		expect(sc.data).toEqual([1, 2, 3]);
		expect(sc.pagination.total).toBe(3);
	});

	test('DedaloError returns structured error with hint', async () => {
		const { server, getRegistered } = mockServer();
		const ctx = makeCtx();

		registerTool(server as any, {
			name: 'test_tool',
			description: 'desc',
			annotations: {},
			inputSchema: z.object({}),
			handler: async () => {
				throw new DedaloError('No permission', 'permissions_denied', ['permissions_denied']);
			},
		}, ctx);

		const result = await getRegistered().cb!({}, {});
		expect((result as any).isError).toBe(true);
		const sc = (result as any).structuredContent;
		expect(sc.ok).toBe(false);
		expect(sc.error.code).toBe('permissions_denied');
		expect(sc.error.hint).toMatch(/profile/i);
	});

	test('plain Error returns unknown code without hint', async () => {
		const { server, getRegistered } = mockServer();
		const ctx = makeCtx();

		registerTool(server as any, {
			name: 'test_tool',
			description: 'desc',
			annotations: {},
			inputSchema: z.object({}),
			handler: async () => {
				throw new Error('boom');
			},
		}, ctx);

		const result = await getRegistered().cb!({}, {});
		expect((result as any).isError).toBe(true);
		const sc = (result as any).structuredContent;
		expect(sc.ok).toBe(false);
		expect(sc.error.code).toBe('unknown');
		expect(sc.error.message).toBe('boom');
		expect(sc.error.hint).toBeUndefined();
	});

	test('invalid input returns invalid_request error', async () => {
		const { server, getRegistered } = mockServer();
		const ctx = makeCtx();

		registerTool(server as any, {
			name: 'test_tool',
			description: 'desc',
			annotations: {},
			inputSchema: z.object({ required_field: z.string() }),
			handler: async () => 'ok',
		}, ctx);

		const result = await getRegistered().cb!({}, {});
		expect((result as any).isError).toBe(true);
		const sc = (result as any).structuredContent;
		expect(sc.ok).toBe(false);
		expect(sc.error.code).toBe('invalid_request');
		expect(sc.error.message).toMatch(/required_field/);
	});

	test('rate limit exceeded returns rate_limited error', async () => {
		const limiter = new TokenBucketRateLimiter({ capacity: 1, refillRateMs: 60_000 });
		const { server, getRegistered } = mockServer();
		const ctx = makeCtx({ limiter });

		registerTool(server as any, {
			name: 'test_tool',
			description: 'desc',
			annotations: {},
			inputSchema: z.object({}),
			handler: async () => 'ok',
		}, ctx);

		// First call uses the single token
		await getRegistered().cb!({}, { sessionId: 's1' });

		// Second call is rate limited
		const result = await getRegistered().cb!({}, { sessionId: 's1' });
		expect((result as any).isError).toBe(true);
		const sc = (result as any).structuredContent;
		expect(sc.ok).toBe(false);
		expect(sc.error.code).toBe('rate_limited');
		expect(sc.error.message).toMatch(/retry/i);
	});

	test('text content matches structuredContent', async () => {
		const { server, getRegistered } = mockServer();
		const ctx = makeCtx();

		registerTool(server as any, {
			name: 'test_tool',
			description: 'desc',
			annotations: {},
			inputSchema: z.object({}),
			handler: async () => ({ key: 'value' }),
		}, ctx);

		const result = await getRegistered().cb!({}, {});
		const text = (result as any).content[0].text;
		const sc = (result as any).structuredContent;
		expect(JSON.parse(text)).toEqual(sc);
	});
});
