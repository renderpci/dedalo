import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { tools } from './tools';

let server: McpServer | null = null;
let transport: WebStandardStreamableHTTPServerTransport | null = null;

export function createMcpServer(): McpServer {
  if (server) return server;

  server = new McpServer({
    name: 'dedalo-publication-api',
    version: '2.1.0',
  });

  for (const tool of tools) {
    server.registerTool(tool.name, {
      description: tool.description,
      inputSchema: tool.inputSchema,
    }, async (args) => tool.handler(args as Record<string, unknown>));
  }

  return server;
}

export async function handleMcpRequest(req: Request): Promise<Response> {
  const mcpServer = createMcpServer();

  if (!transport) {
    transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });
    await mcpServer.connect(transport);
  }

  return transport.handleRequest(req);
}
