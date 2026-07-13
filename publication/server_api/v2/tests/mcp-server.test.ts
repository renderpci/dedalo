import { describe, test, expect } from 'bun:test';
import { createMcpServer, handleMcpRequest } from '../src/mcp/server';
import { tools, toolsByName } from '../src/mcp/tools';

const JSON_RPC_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
};

function initializeRequest(): Request {
  return new Request('http://localhost/mcp', {
    method: 'POST',
    headers: JSON_RPC_HEADERS,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    }),
  });
}

describe('MCP server', () => {
  // Statelessness is the fix for a real defect: the transport used to be a
  // process-wide singleton that also generated session ids — every concurrent client
  // shared one transport and one session, and nothing ever closed it. Each request
  // now gets its own server instance; these must therefore be independent objects.
  test('builds an independent server per call (no process-wide singleton)', () => {
    const first = createMcpServer();
    const second = createMcpServer();

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first).not.toBe(second);
  });

  test('registers every tool exactly once', () => {
    expect(tools.length).toBeGreaterThan(0);
    expect(toolsByName.size).toBe(tools.length);

    for (const tool of tools) {
      expect(toolsByName.get(tool.name)).toBe(tool);
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  test('answers a JSON-RPC initialize over the stateless transport', async () => {
    const response = await handleMcpRequest(initializeRequest());

    expect(response.status).toBe(200);
    // Stateless: no session to hand back, so no session header is issued.
    expect(response.headers.get('mcp-session-id')).toBeNull();
  });

  test('streams the whole tool result (the body is not truncated)', async () => {
    // The reply is an event-stream: handleRequest resolves once the HEADERS are out,
    // while the JSON-RPC result is still being written. Tearing the server down at
    // that moment yields a 200 with an empty body — so the close is deferred until
    // the stream ends. Asserting the status alone would not have caught that.
    const response = await handleMcpRequest(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers: JSON_RPC_HEADERS,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'list_databases', arguments: {} },
        }),
      }),
    );

    expect(response.status).toBe(200);

    const body = await response.text();
    expect(body.length).toBeGreaterThan(0);
    expect(body).toContain('"jsonrpc":"2.0"');
    expect(body).toContain('databases');
  });

  test('serves concurrent clients independently', async () => {
    // The old singleton transport was shared by every caller. Two clients arriving at
    // once must each get their own answer, not fight over one transport.
    const [first, second] = await Promise.all([
      handleMcpRequest(initializeRequest()),
      handleMcpRequest(initializeRequest()),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  test('exposes the read-only tool surface the docs promise', () => {
    // Read-only by construction: nothing here writes. If a tool that mutates ever
    // appears, this list is where it gets noticed.
    expect([...toolsByName.keys()].sort()).toEqual([
      'count_records',
      'fulltext_search',
      'get_av_fragment',
      'get_av_indexation_fragment',
      'get_record',
      'get_schema',
      'get_text_fragment',
      'list_databases',
      'search_records',
    ]);
  });
});
