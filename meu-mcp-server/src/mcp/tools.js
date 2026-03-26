import { z } from 'zod';

export function registerElementViewerTools(server) {
  server.registerTool(
    'element_viewer.open_or_update',
    {
      title: 'Open or Update Element Viewer',
      description:
        "Use this tool to open the app OR to UPDATE the current view if the app is already in full-screen. The app reacts in real-time. Important: If the user asks to 'add' an element, you MUST check the current widgetState, get the elements that are already on the screen, and send the COMPLETE list (old + new) in the 'elements' parameter.",
      inputSchema: z.object({
        elements: z
          .array(z.string())
          .max(6)
          .optional()
          .describe(
            'COMPLETE list of chemical symbols to display. If empty, keeps what is currently on the screen.'
          ),
        interpretation_message: z
          .string()
          .describe(
            "Short first-person sentence about the action. Ex: 'I added Oxygen and increased the temperature to 5000K on your screen.'"
          ),
        pressure_Pa: z
          .number()
          .max(100000000000)
          .optional()
          .describe('New pressure in Pascal. If not specified, leave empty.'),
        temperature_K: z
          .number()
          .max(6000)
          .optional()
          .describe('New temperature in Kelvin. If not specified, leave empty.'),
      }),
      _meta: {
        'openai/outputTemplate': 'ui://widget/element-viewer.html',
        'openai/widgetAccessible': true,
        readOnlyHint: true,
        openWorldHint: false,
        destructiveHint: false
      },
    },
    async (args) => ({
      content: [
        {
          text: args.interpretation_message,
          type: 'text',
        },
      ],
      structuredContent: {
        app: 'Element Viewer',
        configuracao_ia: {
          elementos: args.elements || null,
          interpretacao_do_modelo: args.interpretation_message,
          pressao_Pa: args.pressure_Pa || null,
          temperatura_K: args.temperature_K || null,
        },
        status: 'open',
        timestamp_atualizacao: Date.now(),
      },
    })
  );

  server.registerTool(
    'element_viewer.inject_reaction_substance',
    {
      title: 'Inject Reaction Substance',
      description:
        'Use this tool when the user asks to react the current elements. Return a single substance with complete thermodynamic properties for the simulator engine.',
      inputSchema: z.object({
        boilingPointK: z.number().describe('Boiling point in Kelvin.'),
        criticalPoint: z
          .object({
            pressurePa: z.number().describe('Critical pressure in Pascal.'),
            tempK: z.number().describe('Critical temperature in Kelvin.'),
          })
          .describe('Critical point of the substance.'),
        enthalpyFusionJmol: z.number().describe('Molar enthalpy of fusion in J/mol.'),
        enthalpyVapJmol: z.number().describe('Molar enthalpy of vaporization in J/mol.'),
        formula: z.string().describe('Formula/symbol displayed in the UI (e.g., H2O).'),
        interpretation_message: z
          .string()
          .describe(
            'Short sentence explaining the result, informations of the substance and the limitations of the reaction.'
          ),
        latentHeatFusion: z.number().describe('Latent heat of fusion in J/kg.'),
        latentHeatVaporization: z
          .number()
          .describe('Latent heat of vaporization in J/kg.'),
        mass: z.number().describe('Molar mass in u.'),
        meltingPointK: z.number().describe('Melting point in Kelvin.'),
        specificHeatGas: z
          .number()
          .describe('Specific heat in the gaseous state in J/kg.K.'),
        specificHeatLiquid: z
          .number()
          .describe('Specific heat in the liquid state in J/kg.K.'),
        specificHeatSolid: z
          .number()
          .describe('Specific heat in the solid state in J/kg.K.'),
        substanceName: z
          .string()
          .describe('Name of the generated substance (e.g., Water).'),
        suggestedColorHex: z
          .string()
          .describe('Suggested HEX color for visual rendering (e.g., #4FC3F7).'),
        triplePoint: z
          .object({
            pressurePa: z.number().describe('Triple point pressure in Pascal.'),
            tempK: z.number().describe('Triple point temperature in Kelvin.'),
          })
          .describe('Triple point of the substance.'),
      }),
      _meta: {
        'openai/outputTemplate': 'ui://widget/element-viewer.html',
        'openai/widgetAccessible': true,
        readOnlyHint: true,
        openWorldHint: false,
        destructiveHint: false
      },
    },
    async (args) => ({
      content: [
        {
          text: args.interpretation_message,
          type: 'text',
        },
      ],
      structuredContent: {
        app: 'Element Viewer',
        configuracao_ia: {
          interpretacao_do_modelo: args.interpretation_message,
        },
        status: 'reaction_substance_injected',
        substancia_reacao: {
          boilingPointK: args.boilingPointK,
          criticalPoint: args.criticalPoint,
          enthalpyFusionJmol: args.enthalpyFusionJmol,
          enthalpyVapJmol: args.enthalpyVapJmol,
          formula: args.formula,
          latentHeatFusion: args.latentHeatFusion,
          latentHeatVaporization: args.latentHeatVaporization,
          mass: args.mass,
          meltingPointK: args.meltingPointK,
          specificHeatGas: args.specificHeatGas,
          specificHeatLiquid: args.specificHeatLiquid,
          specificHeatSolid: args.specificHeatSolid,
          substanceName: args.substanceName,
          suggestedColorHex: args.suggestedColorHex,
          triplePoint: args.triplePoint,
        },
        timestamp_atualizacao: Date.now(),
      },
    })
  );
}
