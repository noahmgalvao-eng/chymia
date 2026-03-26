import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  applyHealthResponseHeaders,
  applyMcpResponseHeaders,
  MCP_ALLOWED_METHOD_SET,
  writeMcpPreflight,
  writeMcpMethodNotAllowed,
} from './policy.js';
import { getRequestOrigin } from '../config/widget.js';
import { createElementViewerServer } from '../mcp/server.js';

const app = express();

app.options('/mcp', (_req, res) => {
  writeMcpPreflight(res);
});

app.get('/', (_req, res) => {
  applyHealthResponseHeaders(res);
  res.status(200).type('text/plain').send('Element Viewer MCP Server Running');
});

app.all('/mcp', async (req, res) => {
  applyMcpResponseHeaders(res);

  if (!req.method || !MCP_ALLOWED_METHOD_SET.has(req.method)) {
    writeMcpMethodNotAllowed(res);
    return;
  }

  const server = createElementViewerServer({
    requestOrigin: getRequestOrigin(req),
  });
  const transport = new StreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  });

  res.on('close', () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('[MCP] Error:', error);

    if (!res.headersSent) {
      res.status(500).type('text/plain').send('Internal server error');
    }
  }
});

export default app;
