
export interface ElementProperties {
  meltingPointK: number;
  boilingPointK: number;
  enthalpyVapJmol?: number; // For Clausius-Clapeyron
  bulkModulusGPa?: number;   // For solid/liquid compression
  // --- DYNAMIC PHYSICS FIELDS (SI Units: J/kg and J/kg.K) ---
  latentHeatFusion: number;       // J/kg (Solid -> Liquid)
  latentHeatVaporization: number; // J/kg (Liquid -> Gas)
  specificHeatSolid: number;      // J/kg.K
  specificHeatLiquid: number;     // J/kg.K
  specificHeatGas: number;        // J/kg.K

  // --- DISPLAY STRINGS (For UI: Estimated Values *, N/A, or raw Source Data without Sodium Fallback) ---
  meltingPointDisplay?: string;
  boilingPointDisplay?: string;
  densityDisplay?: string;
  atomicRadiusDisplay?: string;
  electronegativityDisplay?: string;
  electronAffinityDisplay?: string;
  ionizationEnergyDisplay?: string;
  oxidationStatesDisplay?: string;
  thermalConductivityDisplay?: string;
  bulkModulusDisplay?: string;
  enthalpyFusionKjMolDisplay?: string;
  enthalpyVaporizationKjMolDisplay?: string;

  specificHeatSolidDisplay?: string;
  specificHeatLiquidDisplay?: string;
  specificHeatGasDisplay?: string;
  latentHeatFusionDisplay?: string;
  latentHeatVaporizationDisplay?: string;

  // New Display Strings for Triple Point
  triplePointTempDisplay?: string;
  triplePointPressDisplay?: string;
  criticalPointTempDisplay?: string;
  criticalPointPressDisplay?: string;

  // --- SOURCE CITATION IDS (1=Wiki, 2=Mendeleev, 3=PubChem, 4=Angstrom, 5=Wolfram) ---
  meltingPointSource?: number;
  boilingPointSource?: number;
  densitySource?: number;
  atomicRadiusSource?: number;
  thermalConductivitySource?: number;
  specificHeatSolidSource?: number;
  specificHeatLiquidSource?: number;
  specificHeatGasSource?: number;
  latentHeatFusionSource?: number;
  latentHeatVaporizationSource?: number;
  electronegativitySource?: number;
  electronAffinitySource?: number;
  ionizationEnergySource?: number;
  triplePointSource?: number; // NEW
  criticalPointSource?: number;
  enthalpyFusionSource?: number;
  enthalpyVaporizationSource?: number;
  bulkModulusSource?: number;

  // --- CRITICAL POINT DATA ---
  criticalPoint?: {
    tempK: number;
    pressurePa: number;
  };
  // --- TRIPLE POINT DATA ---
  triplePoint?: {
    tempK: number;
    pressurePa: number;
  };
  // --- NEW EXTENDED PROPERTIES ---
  electronegativity?: number; // Pauling Scale
  atomicRadiusPm?: number;    // Picometers
  density?: number;           // g/cm³
  thermalConductivity?: number; // W/(m·K)
  electronConfiguration?: string;

  // NEW SCIENTIFIC DATA
  electronAffinity?: number;      // kJ/mol
  ionizationEnergy?: number;      // 1st Ionization Energy (kJ/mol)
  oxidationStates?: number[];     // Common oxidation states (e.g., [1, -1])

  // Simon-Glatzel Parameters (Optional)
  simonA_Pa?: number; // Internal pressure parameter 'a' (Pascals)
  simonC?: number;    // Exponent parameter 'c' (dimensionless)

  // SUBLIMATION DATA
  enthalpyFusionJmol?: number; // Required for Sublimation Calc
}

export interface VisualDNAState {
  color: string;
  opacidade: number;
}

export interface VisualDNA {
  solid: VisualDNAState;
  liquid: VisualDNAState;
  gas: VisualDNAState;
}

export interface SpecialBehavior {
  isWaterLike?: boolean;
  highPressureTurnover?: boolean;
  cantFreezeBelowPa?: number;
}


export interface ChemicalElement {
  atomicNumber: number;
  symbol: string;
  name: string;
  summary: string; // NEW: Description from source
  displayCategory?: string;
  // NEW: Classification Data
  classification: {
    group: string;       // IUPAC (e.g., "1", "11")
    groupBlock: string;  // CAS (e.g., "IA", "IB")
    groupName?: string;  // e.g., "Metais Alcalinos"
    period: number;
    electronShells: number;
  };
  mass: number; // Atomic Mass in u
  properties: ElementProperties;
  visualDNA: VisualDNA;
  specialBehavior?: SpecialBehavior;
  category: string;
}

export enum MatterState {
  SOLID = 'SOLID',
  MELTING = 'MELTING',
  EQUILIBRIUM_MELT = 'EQUILIBRIUM_MELT',
  LIQUID = 'LIQUID',
  BOILING = 'BOILING',
  EQUILIBRIUM_BOIL = 'EQUILIBRIUM_BOIL',
  EQUILIBRIUM_TRIPLE = 'EQUILIBRIUM_TRIPLE',
  SUBLIMATION = 'SUBLIMATION', // Solid -> Gas directly
  EQUILIBRIUM_SUB = 'EQUILIBRIUM_SUB', // Solid + Gas coexistence
  GAS = 'GAS',
  TRANSITION_SCF = 'TRANSITION_SCF',
  SUPERCRITICAL = 'SUPERCRITICAL'
}

export enum ParticleState {
  TRAPPED = 'TRAPPED',       // Inside the puddle (part of bulk liquid)
  RISING = 'RISING',         // Evaporating
  GAS = 'GAS',               // Free floating (Brownian)
  CONDENSING = 'CONDENSING'  // Returning to liquid
}

export interface Particle {
  id: number;
  state: ParticleState;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number; // Radius
  homeX: number; // The fixed lattice X position
  homeY: number; // The fixed lattice Y position
  liquidTargetX?: number; // Optional liquid slot target used to smooth solid -> liquid X-Ray transitions
  liquidTargetY?: number;
}

export interface MatterRect {
  w: number;
  h: number;
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface ViewBoxDimensions {
  minX: number;
  minY: number;
  width: number;
  height: number;
  maxX: number; // helper derived from minX + width
  maxY: number; // helper derived from minY + height
}

export interface PhysicsState {
  state: MatterState;
  temperature: number;      // Current System Temperature (K)
  pressure: number;         // Current Pressure (Pa)
  enthalpy: number;         // Total System Energy (Joules)
  simTime: number;
  boilingPointCurrent: number;
  meltingPointCurrent: number;
  sublimationPointCurrent: number; // New: T_sub

  // Progress indicators (0 to 1)
  meltProgress: number;
  boilProgress: number;     // 0 = Full Liquid, 1 = All Gas
  sublimationProgress: number; // 0 = Full Solid, 1 = All Gas (Sublimated)

  // The Particle System
  particles: Particle[];
  pathProgress: number;     // Controls the SVG Puddle shape

  powerInput: number;       // Watts (J/s) flowing in/out

  // High Pressure Physics
  compressionFactor: number; // 1.0 = Normal, <1.0 = Compressed
  gasBounds: Bounds;         // The rectangular limits for gas particles
  meanParticleSpeed: number; // Average velocity scalar of gas particles

  // Authoritative Geometry
  matterRect: MatterRect;

  // Supercritical Fluid Specifics
  scfOpacity: number;        // Calculated opacity for the Nebula layer (0.0 to 1.0)
  scfTransitionProgress: number; // 0 to 1 tracking the transition to/from SCF
}

// --- CHATGPT APPS SDK TYPES ---

export type OpenAiGlobals<
  ToolInput = UnknownObject,
  ToolOutput = UnknownObject,
  ToolResponseMetadata = UnknownObject,
  WidgetState = UnknownObject
> = {
  // visuals
  theme: Theme;

  userAgent: UserAgent;
  locale: string;

  // layout
  maxHeight: number;
  displayMode: DisplayMode;
  safeArea: SafeArea;

  // state
  toolInput: ToolInput;
  toolOutput: ToolOutput | null;
  structuredContent?: unknown;
  toolResponseMetadata: ToolResponseMetadata | null;
  widgetState: WidgetState | null;
  setWidgetState: (state: WidgetState) => Promise<void>;
};

// currently copied from types.ts in chatgpt/web-sandbox.
// Will eventually use a public package.
export type API = {
  callTool: CallTool;
  sendFollowUpMessage: (args: { prompt: string }) => Promise<void>;
  openExternal(payload: { href: string }): void;

  // Layout controls
  requestDisplayMode: RequestDisplayMode;
  requestModal: (args: { title?: string; params?: UnknownObject }) => Promise<unknown>;
  requestClose: () => Promise<void>;
};

export type UnknownObject = Record<string, unknown>;

export type Theme = "light" | "dark";

export type SafeAreaInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type SafeArea = {
  insets: SafeAreaInsets;
};

export type DeviceType = "mobile" | "tablet" | "desktop" | "unknown";

export type UserAgent = {
  device: { type: DeviceType };
  capabilities: {
    hover: boolean;
    touch: boolean;
  };
};

/** Display mode */
export type DisplayMode = "pip" | "inline" | "fullscreen";
export type RequestDisplayMode = (args: { mode: DisplayMode }) => Promise<{
  /**
   * The granted display mode. The host may reject the request.
   * For mobile, PiP is always coerced to fullscreen.
   */
  mode: DisplayMode;
}>;

export type CallToolResponse = {
  result: string;
};

/** Calling APIs */
export type CallTool = (
  name: string,
  args: Record<string, unknown>
) => Promise<CallToolResponse>;

/** Extra events */
export const SET_GLOBALS_EVENT_TYPE = "openai:set_globals";
export class SetGlobalsEvent extends CustomEvent<{
  globals: Partial<OpenAiGlobals>;
}> {
  readonly type = SET_GLOBALS_EVENT_TYPE;
}

/**
 * Global oai object injected by the web sandbox for communicating with chatgpt host page.
 */
declare global {
  interface Window {
    openai: API & OpenAiGlobals;
  }

  interface WindowEventMap {
    [SET_GLOBALS_EVENT_TYPE]: SetGlobalsEvent;
  }
}
