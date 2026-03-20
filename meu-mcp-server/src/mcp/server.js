import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { htmlContent } from '../../api/html-content.js';
import { createWidgetMeta } from '../config/widget.js';
import { registerElementViewerTools } from './tools.js';

export function createElementViewerServer() {
  const server = new McpServer({
    name: 'element-viewer',
    version: '1.0.0',
  });

  server.registerResource(
    'element-viewer-widget',
    'ui://widget/element-viewer.html',
    {},
    async () => ({
      contents: [
        {
          _meta: createWidgetMeta(),
          mimeType: 'text/html+skybridge',
          text: htmlContent,
          uri: 'ui://widget/element-viewer.html',
        },
      ],
    })
  );

  registerElementViewerTools(server);
  return server;
}
