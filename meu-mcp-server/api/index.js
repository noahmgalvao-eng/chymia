import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { htmlContent } from "./html-content.js";

// --- Helpers ---
console.log(`[INIT] HTML content carregado: ${htmlContent.length} caracteres`);

function getFirstHeaderValue(value) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return typeof value === "string" ? value : null;
}

function getRequestOrigin(req) {
  const forwardedProto = getFirstHeaderValue(req.headers["x-forwarded-proto"]);
  const forwardedHost = getFirstHeaderValue(req.headers["x-forwarded-host"]);
  const host = forwardedHost ?? getFirstHeaderValue(req.headers.host);

  if (!host) {
    return null;
  }

  const protocol = (forwardedProto ?? "https").split(",")[0].trim() || "https";
  const normalizedHost = host.split(",")[0].trim();
  return normalizedHost ? `${protocol}://${normalizedHost}` : null;
}

function getProductionOrigin() {
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (!productionHost) {
    return null;
  }

  const normalizedHost = productionHost.replace(/^https?:\/\//u, "");
  return normalizedHost ? `https://${normalizedHost}` : null;
}

function normalizeOrigin(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  try {
    return new URL(trimmedValue).origin;
  } catch {
    try {
      return new URL(`https://${trimmedValue}`).origin;
    } catch {
      return null;
    }
  }
}

function getPostHogOrigin() {
  return normalizeOrigin(
    process.env.VITE_POSTHOG_HOST ?? process.env.POSTHOG_HOST ?? null
  );
}

function getPostHogUiOrigin() {
  return normalizeOrigin(
    process.env.VITE_POSTHOG_UI_HOST ?? process.env.POSTHOG_UI_HOST ?? null
  );
}

function buildConnectDomains(req) {
  const domains = [
    "https://chatgpt.com",
    getRequestOrigin(req),
    getProductionOrigin(),
    getPostHogOrigin(),
    getPostHogUiOrigin(),
  ].filter((value) => typeof value === "string" && value.length > 0);

  return [...new Set(domains)];
}

function createElementViewerServer(connectDomains) {
  const server = new McpServer({
    name: "element-viewer",
    version: "1.0.0",
  });

  // --- 1. REGISTER RESOURCE (the widget HTML) ---
  server.registerResource(
    "element-viewer-widget",
    "ui://widget/element-viewer.html",
    {},
    async () => ({
      contents: [
        {
          uri: "ui://widget/element-viewer.html",
          mimeType: "text/html+skybridge",
          text: htmlContent,
          _meta: {
            "openai/widgetPrefersBorder": true,
            "openai/widgetDomain": "https://chatgpt.com",
            "openai/widgetDescription": "Element Viewer interativo para explorar estados da materia e transicoes de fase.",
            "openai/widgetCSP": {
              connect_domains: connectDomains,
              resource_domains: [
                "https://*.oaistatic.com",
              ],
            },
          },
        },
      ],
    })
  );

  // --- 2. REGISTER TOOL: ABRIR E ATUALIZAR SIMULADOR ---
  server.registerTool(
    "abrir_simulador_interativo",
    {
      title: "Abrir ou Atualizar Element Viewer",
      description:
        "Use esta ferramenta para abrir o app OU para ATUALIZAR a visualizacao atual se o app ja estiver em tela cheia. O app reage em tempo real. Importante: Se o usuario pedir para 'adicionar' um elemento, voce DEVE consultar o widgetState atual, pegar os elementos que ja estao na tela e enviar a lista COMPLETA (antigos + novos) no parametro 'elementos'.",
      inputSchema: z.object({
        elementos: z
          .array(z.string())
          .max(6)
          .optional()
          .describe(
            "Lista COMPLETA de simbolos quimicos para mostrar. Se vazio, mantem o que esta na tela."
          ),
        temperatura_K: z
          .number()
          .max(6000)
          .optional()
          .describe("Nova temperatura em Kelvin. Se nao especificada, deixe vazio."),
        pressao_Pa: z
          .number()
          .max(100000000000)
          .optional()
          .describe("Nova pressao em Pascal. Se nao especificada, deixe vazio."),
        mensagem_interpretacao: z
          .string()
          .describe(
            "Frase curta em primeira pessoa sobre a acao. Ex: 'Adicionei o Oxigenio e aumentei a temperatura para 5000K na sua tela.'"
          ),
      }),
      _meta: {
        "readOnlyHint": true,
        "openai/outputTemplate": "ui://widget/element-viewer.html",
        "openai/widgetAccessible": true,
      },
    },
    async (args) => ({
      structuredContent: {
        app: "Element Viewer",
        status: "open",
        timestamp_atualizacao: Date.now(),
        configuracao_ia: {
          elementos: args.elementos || null,
          temperatura_K: args.temperatura_K || null,
          pressao_Pa: args.pressao_Pa || null,
          interpretacao_do_modelo: args.mensagem_interpretacao,
        },
      },
      content: [
        {
          type: "text",
          text: args.mensagem_interpretacao,
        },
      ],
    })
  );

  server.registerTool(
    "inject_reaction_substance",
    {
      title: "Injetar Substância de Reação",
      description:
        "Use esta ferramenta quando o usuario pedir para reagir os elementos atuais. Retorne uma unica substancia com propriedades termodinamicas completas para o motor do simulador.",
      inputSchema: z.object({
        substanceName: z.string().describe("Nome da substancia gerada (ex.: Agua)."),
        formula: z.string().describe("Formula/simbolo exibido na UI (ex.: H2O)."),
        suggestedColorHex: z
          .string()
          .describe("Cor HEX sugerida para renderizacao visual (ex.: #4FC3F7)."),
        mass: z.number().describe("Massa molar em u."),
        meltingPointK: z.number().describe("Ponto de fusao em Kelvin."),
        boilingPointK: z.number().describe("Ponto de ebulicao em Kelvin."),
        specificHeatSolid: z.number().describe("Calor especifico no estado solido em J/kg.K."),
        specificHeatLiquid: z.number().describe("Calor especifico no estado liquido em J/kg.K."),
        specificHeatGas: z.number().describe("Calor especifico no estado gasoso em J/kg.K."),
        latentHeatFusion: z.number().describe("Calor latente de fusao em J/kg."),
        latentHeatVaporization: z.number().describe("Calor latente de vaporizacao em J/kg."),
        enthalpyVapJmol: z.number().describe("Entalpia molar de vaporizacao em J/mol."),
        enthalpyFusionJmol: z.number().describe("Entalpia molar de fusao em J/mol."),
        triplePoint: z
          .object({
            tempK: z.number().describe("Temperatura do ponto triplo em Kelvin."),
            pressurePa: z.number().describe("Pressao do ponto triplo em Pascal."),
          })
          .describe("Ponto triplo da substancia."),
        criticalPoint: z
          .object({
            tempK: z.number().describe("Temperatura critica em Kelvin."),
            pressurePa: z.number().describe("Pressao critica em Pascal."),
          })
          .describe("Ponto critico da substancia."),
        mensagem_interpretacao: z
          .string()
          .describe("Frase curta explicando o resultado e as limitacoes da reacao."),
      }),
      _meta: {
        "readOnlyHint": true,
        "openai/outputTemplate": "ui://widget/element-viewer.html",
        "openai/widgetAccessible": true,
      },
    },
    async (args) => ({
      structuredContent: {
        app: "Element Viewer",
        status: "reaction_substance_injected",
        timestamp_atualizacao: Date.now(),
        substancia_reacao: {
          substanceName: args.substanceName,
          formula: args.formula,
          suggestedColorHex: args.suggestedColorHex,
          mass: args.mass,
          meltingPointK: args.meltingPointK,
          boilingPointK: args.boilingPointK,
          specificHeatSolid: args.specificHeatSolid,
          specificHeatLiquid: args.specificHeatLiquid,
          specificHeatGas: args.specificHeatGas,
          latentHeatFusion: args.latentHeatFusion,
          latentHeatVaporization: args.latentHeatVaporization,
          enthalpyVapJmol: args.enthalpyVapJmol,
          enthalpyFusionJmol: args.enthalpyFusionJmol,
          triplePoint: args.triplePoint,
          criticalPoint: args.criticalPoint,
        },
        configuracao_ia: {
          interpretacao_do_modelo: args.mensagem_interpretacao,
        },
      },
      content: [
        {
          type: "text",
          text: args.mensagem_interpretacao,
        },
      ],
    })
  );

  return server;
}

// --- EXPRESS APP (for Vercel serverless) ---
const app = express();

app.options("/mcp", (req, res) => {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, mcp-session-id",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
  });
  res.end();
});

app.get("/", (req, res) => {
  res.status(200).send("Element Viewer MCP Server Running");
});

app.all("/mcp", async (req, res) => {
  console.log(`[MCP] ${req.method} /mcp`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  const connectDomains = buildConnectDomains(req);
  const server = createElementViewerServer(connectDomains);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
    console.log("[MCP] Request handled successfully");
  } catch (error) {
    console.error("[MCP] Error:", error);
    if (!res.headersSent) {
      res.writeHead(500).end("Internal server error");
    }
  }
});

export default app;
