export const MCP_ALLOWED_HEADERS = 'content-type, mcp-session-id';
export const MCP_ALLOWED_METHODS = 'POST, GET, DELETE, OPTIONS';
export const MCP_EXPOSE_HEADERS = 'Mcp-Session-Id';
export const MCP_ALLOWED_METHOD_SET = new Set(['POST', 'GET', 'DELETE']);

function applySharedSecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

export function applyHealthResponseHeaders(res) {
  applySharedSecurityHeaders(res);
}

export function applyMcpResponseHeaders(res) {
  applySharedSecurityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Expose-Headers', MCP_EXPOSE_HEADERS);
}

export function writeMcpMethodNotAllowed(res) {
  applyMcpResponseHeaders(res);
  res.setHeader('Allow', MCP_ALLOWED_METHODS);
  res.status(405).type('text/plain').send('Method not allowed');
}

export function writeMcpPreflight(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Headers': MCP_ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': MCP_ALLOWED_METHODS,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': MCP_EXPOSE_HEADERS,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end();
}
