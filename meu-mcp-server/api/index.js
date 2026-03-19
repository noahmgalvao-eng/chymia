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
            "openai/widgetDescription": "Interactive visualizer for chemical elements, atom structures, and phase transitions.",
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
    "element_viewer.open_or_update",
    {
      title: "Open or Update Element Viewer",
      description:
        "Use this tool to open the app OR to UPDATE the current view if the app is already in full-screen. The app reacts in real-time. Important: If the user asks to 'add' an element, you MUST check the current widgetState, get the elements that are already on the screen, and send the COMPLETE list (old + new) in the 'elements' parameter.",
      inputSchema: z.object({
        elements: z
          .array(z.string())
          .max(6)
          .optional()
          .describe(
            "COMPLETE list of chemical symbols to display. If empty, keeps what is currently on the screen."
          ),
        temperature_K: z
          .number()
          .max(6000)
          .optional()
          .describe("New temperature in Kelvin. If not specified, leave empty."),
        pressure_Pa: z
          .number()
          .max(100000000000)
          .optional()
          .describe("New pressure in Pascal. If not specified, leave empty."),
        interpretation_message: z
          .string()
          .describe(
            "Short first-person sentence about the action. Ex: 'I added Oxygen and increased the temperature to 5000K on your screen.'"
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
    "element_viewer.inject_reaction_substance",
    {
      title: "Inject Reaction Substance",
      description:
        "Use this tool when the user asks to react the current elements. Return a single substance with complete thermodynamic properties for the simulator engine.",
      inputSchema: z.object({
        substanceName: z.string().describe("Name of the generated substance (e.g., Water)."),
        formula: z.string().describe("Formula/symbol displayed in the UI (e.g., H2O)."),
        suggestedColorHex: z
          .string()
          .describe("Suggested HEX color for visual rendering (e.g., #4FC3F7)."),
        mass: z.number().describe("Molar mass in u."),
        meltingPointK: z.number().describe("Melting point in Kelvin."),
        boilingPointK: z.number().describe("Boiling point in Kelvin."),
        specificHeatSolid: z.number().describe("Specific heat in the solid state in J/kg.K."),
        specificHeatLiquid: z.number().describe("Specific heat in the liquid state in J/kg.K."),
        specificHeatGas: z.number().describe("Specific heat in the gaseous state in J/kg.K."),
        latentHeatFusion: z.number().describe("Latent heat of fusion in J/kg."),
        latentHeatVaporization: z.number().describe("Latent heat of vaporization in J/kg."),
        enthalpyVapJmol: z.number().describe("Molar enthalpy of vaporization in J/mol."),
        enthalpyFusionJmol: z.number().describe("Molar enthalpy of fusion in J/mol."),
        triplePoint: z
          .object({
            tempK: z.number().describe("Triple point temperature in Kelvin."),
            pressurePa: z.number().describe("Triple point pressure in Pascal."),
          })
          .describe("Triple point of the substance."),
        criticalPoint: z
          .object({
            tempK: z.number().describe("Critical temperature in Kelvin."),
            pressurePa: z.number().describe("Critical pressure in Pascal."),
          })
          .describe("Critical point of the substance."),
        interpretation_message: z
          .string()
          .describe("Short sentence explaining the result, informations of the substance and the limitations of the reaction."),
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
