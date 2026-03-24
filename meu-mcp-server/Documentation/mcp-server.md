# meu-mcp-server â€” Servidor MCP

> **URL de Deploy:** [https://element-viewer-mcp-server.vercel.app/](https://element-viewer-mcp-server.vercel.app/)  
> **DiretÃ³rio:** `meu-mcp-server/`  
> **Connector URL (ChatGPT):** `https://element-viewer-mcp-server.vercel.app/mcp`

---

## Objetivo

O meu-mcp-server Ã© um **servidor MCP (Model Context Protocol)** que funciona como conector entre o ChatGPT e o Element-Viewer. Ele segue a especificaÃ§Ã£o do **OpenAI Apps SDK** para expor tools e resources que o ChatGPT pode invocar, permitindo que o webapp seja renderizado como um **widget iframe** dentro da interface do chat.

---

## Estrutura de Arquivos

```
meu-mcp-server/
â”œâ”€â”€ api/
â”‚   â”œâ”€â”€ index.js              # Servidor Express + MCP (entry point)
â”‚   â””â”€â”€ html-content.js       # HTML do webapp embedado (gerado pelo script)
â”œâ”€â”€ scripts/
â”‚   â””â”€â”€ embed-html.js         # Script para gerar html-content.js a partir do build
â”œâ”€â”€ Documentation/            # Esta documentaÃ§Ã£o
â”œâ”€â”€ package.json              # DependÃªncias e scripts
â””â”€â”€ vercel.json               # Rewrites para Vercel serverless
```

---

## Como Funciona

### Fluxo de RequisiÃ§Ã£o

```
ChatGPT â†’ POST /mcp â†’ Express â†’ McpServer (fresh instance) â†’ Response
```

1. O ChatGPT envia uma requisiÃ§Ã£o JSON-RPC para `POST /mcp`
2. O Express recebe e cria uma **instÃ¢ncia fresca** do McpServer (stateless)
3. O servidor processa a requisiÃ§Ã£o (list tools, call tool, read resource)
4. A resposta Ã© enviada de volta ao ChatGPT com JSON habilitado
5. Servidor e transport sÃ£o destruÃ­dos apÃ³s a resposta (sem estado persistente)

> **Importante:** O modo stateless (sem `sessionIdGenerator`) Ã© obrigatÃ³rio para deploy na Vercel, pois funÃ§Ãµes serverless nÃ£o mantÃªm estado entre invocaÃ§Ãµes.

---

## Componentes do Servidor (`api/index.js`)

### 1. Resource â€” Widget HTML

```javascript
server.registerResource(
  "element-viewer-widget",
  "ui://widget/element-viewer.html",
  {},
  async () => ({
    contents: [{
      uri: "ui://widget/element-viewer.html",
      mimeType: "text/html+skybridge",
      text: htmlContent,        // HTML completo do webapp
      _meta: {
        "openai/widgetPrefersBorder": true,
        "openai/widgetDomain": "https://chatgpt.com",
        "openai/widgetCSP": {
          connect_domains: ["https://chatgpt.com"],
          resource_domains: ["https://*.oaistatic.com"],
        },
      },
    }],
  })
);
```

| Campo | Valor | DescriÃ§Ã£o |
|---|---|---|
| `uri` | `ui://widget/element-viewer.html` | Identificador Ãºnico do recurso |
| `mimeType` | `text/html+skybridge` | Tipo de conteÃºdo â€” HTML renderizÃ¡vel como widget |
| `widgetPrefersBorder` | `true` | Widget exibe com borda |
| `widgetDomain` | `https://chatgpt.com` | DomÃ­nio de contexto do widget |
| `widgetCSP` | `connect_domains`, `resource_domains` | PolÃ­tica de seguranÃ§a de conteÃºdo |

A propriedade `text` contÃ©m o **HTML completo** do webapp (gerado pelo build single-file do Vite), embedado diretamente no servidor atravÃ©s do arquivo `html-content.js`.

---

### 2. Tool â€” `abrir_app`

```javascript
server.registerTool(
  "abrir_app",
  {
    title: "Abrir Element Viewer",
    description: "Abre a interface interativa do Element Viewer...",
    inputSchema: z.object({}),       // Sem parÃ¢metros de entrada
    _meta: {
      "openai/outputTemplate": "ui://widget/element-viewer.html",
      "openai/toolInvocation/invoking": "Abrindo Element Viewerâ€¦",
      "openai/toolInvocation/invoked": "Element Viewer pronto.",
    },
  },
  async () => ({
    structuredContent: { app: "Element Viewer", status: "open" },
    content: [{ type: "text", text: "Element Viewer aberto com sucesso." }],
  })
);
```

| Campo | DescriÃ§Ã£o |
|---|---|
| `title` | Nome da tool exibido na UI do ChatGPT |
| `description` | Descritivo que o modelo usa para decidir quando invocar |
| `inputSchema` | Schema Zod â€” objeto vazio (sem parÃ¢metros) |
| `outputTemplate` | Aponta para o URI do resource (widget HTML) |
| `toolInvocation/invoking` | Mensagem exibida durante a execuÃ§Ã£o |
| `toolInvocation/invoked` | Mensagem exibida apÃ³s conclusÃ£o |
| `structuredContent` | Dados estruturados para o ChatGPT consumir |

> **O `outputTemplate` Ã© a peÃ§a-chave** â€” ele conecta a tool ao resource, fazendo com que o ChatGPT renderize o widget HTML quando a tool Ã© invocada.

---

### 3. Express App â€” Endpoints

| MÃ©todo | Rota | DescriÃ§Ã£o |
|---|---|---|
| `OPTIONS` | `/mcp` | CORS preflight (retorna 204 com headers) |
| `GET` | `/` | Health check ("Element Viewer MCP Server Running") |
| `POST/GET/DELETE` | `/mcp` | Handler MCP principal (via `app.all`) |

**Headers CORS configurados:**
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: POST, GET, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: content-type, mcp-session-id`
- `Access-Control-Expose-Headers: Mcp-Session-Id`

> **Nota:** O middleware `express.json()` **NÃƒO** Ã© utilizado. O SDK do MCP lÃª o body stream diretamente â€” se o Express parsear primeiro, o stream Ã© consumido e o SDK recebe um body vazio (erro 400).

---

## Configuracao de Deploy (`vercel.json`)

```json
{
  "version": 2,
  "buildCommand": "npm run vercel-build",
  "rewrites": [
    { "source": "/(.*)", "destination": "/api/index" }
  ]
}
```

Todas as requisiÃ§Ãµes sÃ£o redirecionadas para a funÃ§Ã£o serverless `api/index.js`.

---

## Scripts

```bash
# Sincroniza webapp -> html-content.js (build + embed)
npm run sync:webapp

# Desenvolvimento local (agora sincroniza automaticamente via predev)
npm run dev

# Start local (agora sincroniza automaticamente via prestart)
npm start

# Build usado no deploy da Vercel (agora sincroniza automaticamente)
npm run vercel-build

# Opcional: embed direto para diagnostico
npm run embed
```

A sincronizacao agora e automatica no fluxo normal:

1. `npm run dev` no MCP dispara `predev` e sincroniza o webapp antes de subir o servidor.
2. `npm start` dispara `prestart` e sincroniza o webapp antes de iniciar.
3. No deploy da Vercel, o `buildCommand` executa `npm run vercel-build`, que recompila o Element-Viewer e re-gera `api/html-content.js`.

Nao e mais necessario executar `npm run embed` manualmente em fluxo comum.

### Troubleshooting (root/path)

- Se aparecer erro de path para `../Element-Viewer`, confirme que:
  - o projeto da Vercel do MCP usa **Root Directory = `meu-mcp-server`**;
  - o repositorio mantem `Element-Viewer/` e `meu-mcp-server/` como pastas irmas.
- Se o sync falhar por dependencias, rode localmente:
  - `cd Element-Viewer && npm install && npm run build`
  - depois `cd ../meu-mcp-server && npm run sync:webapp`

---
## DependÃªncias

| Pacote | VersÃ£o | Uso |
|---|---|---|
| `@modelcontextprotocol/sdk` | ^1.25.3 | SDK oficial MCP para registrar tools e resources |
| `express` | ^5.2.1 | Framework HTTP para servir endpoints |
| `zod` | ^3.25.76 | ValidaÃ§Ã£o de schemas (inputSchema das tools) |

---

## IntegraÃ§Ã£o com ChatGPT

Para conectar o servidor como app no ChatGPT:

1. Acesse as configuraÃ§Ãµes de apps/connectors do ChatGPT
2. Configure o **Connector URL** como: `https://element-viewer-mcp-server.vercel.app/mcp`
3. O ChatGPT irÃ¡ automaticamente:
   - Enumerar tools disponÃ­veis (`abrir_app`)
   - Enumerar resources disponÃ­veis (`element-viewer-widget`)
   - Invocar a tool quando o usuÃ¡rio pedir para abrir o simulador
   - Renderizar o widget HTML como iframe na interface

---

## DocumentaÃ§Ã£o de ReferÃªncia (SDK)

A pasta `Documentation/` contÃ©m documentaÃ§Ã£o oficial do OpenAI Apps SDK:

| Arquivo | ConteÃºdo |
|---|---|
| `quickstart.txt` | Guia de inÃ­cio rÃ¡pido do Apps SDK |
| `chatgptdocs.md` | DocumentaÃ§Ã£o geral do ChatGPT para desenvolvedores |
| `further documentation.txt` | DocumentaÃ§Ã£o avanÃ§ada adicional |
| `UI Guidelines.txt` | Diretrizes de interface para apps |
| `ux principles.txt` | PrincÃ­pios de UX para apps do ChatGPT |
| `What makes a great chatgpt app.txt` | Boas prÃ¡ticas para apps |
| `app submission.txt` | Processo de submissÃ£o para a loja |
| `security & privacy.txt` | Requisitos de seguranÃ§a e privacidade |
| `openai usage policies.txt` | PolÃ­ticas de uso da OpenAI |
| `optimize metadata.txt` | OtimizaÃ§Ã£o de metadados do app |
| `troubleshooting.txt` | ResoluÃ§Ã£o de problemas comuns |

