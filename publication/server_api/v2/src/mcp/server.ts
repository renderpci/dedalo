import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { API_VERSION } from '../constants';
import { handleToolCall, tools } from './tools';

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'dedalo-publication-api',
    version: API_VERSION,
  });

  for (const tool of tools) {
    // Dispatch through handleToolCall — the same entry point the tests drive — so a
    // tool failure comes back as a readable error result, and there is exactly one
    // invocation path to reason about (it used to call tool.handler directly, leaving
    // production and tests on different paths, with prod missing the error wrapping).
    server.registerTool(tool.name, {
      description: tool.description,
      inputSchema: tool.inputSchema,
    }, async (args) => handleToolCall(tool.name, args as Record<string, unknown>));
  }

  return server;
}

/**
 * MCP is served STATELESSLY: a fresh server + transport per request. Every tool here
 * is an independent read against the published database — there is no session state
 * worth keeping, so there is no reason to pay for one. (The previous code cached ONE
 * transport for the whole process while also generating session ids, which is a
 * contradiction: concurrent clients shared a single transport and its session, and
 * nothing ever closed it.)
 *
 * The server is closed when the RESPONSE STREAM ENDS, not when handleRequest returns:
 * the reply is served as `text/event-stream`, so handleRequest resolves once the
 * headers are out, while the JSON-RPC result is still being written. Closing at that
 * point truncates the body — the client gets a 200 with nothing in it.
 */
export async function handleMcpRequest(req: Request): Promise<Response> {
  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  let response: Response;
  try {
    response = await transport.handleRequest(req);
  } catch (error) {
    await closeQuietly(server);
    throw error;
  }

  if (!response.body) {
    await closeQuietly(server);
    return response;
  }

  const closeWhenStreamEnds = new TransformStream({
    flush() {
      void closeQuietly(server);
    },
  });

  return new Response(response.body.pipeThrough(closeWhenStreamEnds), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/**
 * Tear down a per-request server. Teardown is best-effort by contract: the client
 * already has its answer, and a failure to close must not turn a served response
 * into an error. Reported, never swallowed silently.
 */
async function closeQuietly(server: McpServer): Promise<void> {
  try {
    await server.close();
  } catch (error) {
    console.warn('[mcp] failed to close the per-request server:', error);
  }
}
