
import { ChemicalElement, ElementProperties } from "../types";
import { SOURCE_DATA } from "./periodic_table_source";
import { SCIENTIFIC_DATA } from "./scientific_data";
import { SCIENTIFIC_DATA as SCIENTIFIC_THERMO_DATA } from "../scientific_data";
import { CUSTOM_DATA, SODIUM_FALLBACK, ElementCustomData } from "./elements-visuals";
import { toPascal } from "../utils/units";

// The 11 Frames extracted from the provided SVG liquid path (Preserved from original)
export const MATTER_PATH_FRAMES = [
  "M -60,-120 C -20,-120 20,-120 60,-120 C 60,-80 60,-40 60,0 C 20,0 -20,0 -60,0 C -60,-40 -60,-80 -60,-120 Z",
  "M -55,-100 C -20,-105 20,-105 55,-100 C 75,-60 75,-30 70,0 C 20,5 -20,5 -70,0 C -75,-30 -75,-60 -55,-100 Z",
  "M -80,-60 C -40,-70 40,-60 80,-55 C 100,-30 110,-10 100,0 C 40,5 -40,5 -100,0 C -110,-10 -100,-30 -80,-60 Z",
  "M -100,-35 C -50,-45 50,-40 100,-30 C 115,-15 110,5 90,5 C 40,8 -40,8 -90,5 C -110,5 -115,-15 -100,-35 Z",
  "M -130,-15 C -80,-25 -30,-30 20,-20 C 70,-10 120,-25 140,-10 C 150,5 130,15 0,15 C -130,15 -150,5 -130,-15 Z",
  "M -130,-15 C -90,-35 -40,-10 10,-25 C 60,-40 110,-15 140,-10 C 150,5 130,15 0,15 C -130,15 -150,5 -130,-15 Z",
  "M -91,-10 C -63,-24 -28,-7 7,-17 C 42,-28 77,-10 98,-7 C 105,3 91,10 0,10 C -91,10 -105,3 -91,-10 Z",
  "M -52,-6 C -36,-14 -16,-4 4,-10 C 24,-16 44,-6 56,-4 C 60,2 52,6 0,6 C -52,6 -60,2 -52,-6 Z",
  "M -19,-2 C -13,-5 -6,-1 1,-3 C 9,-6 16,-2 21,-1 C 22,0 19,2 0,2 C -19,2 -22,0 -19,-2 Z",
  "M 0,0 C 0,0 0,0 0,0 C 0,0 0,0 0,0 C 0,0 0,0 0,0 C 0,0 0,0 0,0 C 0,0 0,0 0,0 C 0,0 0,0 0,0 C 0,0 0,0 0,0 Z",
  "M 0,0 C 0,0 0,0 0,0 C 0,0 0,0 0,0 C 0,0 0,0 0,0 C 0,0 0,0 0,0 C 0,0 0,0 0,0 C 0,0 0,0 0,0 C 0,0 0,0 0,0 Z"
];

const SODIUM_MOLAR_MASS_KG = 22.98976928 / 1000;
type ThermoEntry = Record<string, any>;
type ElementPosition = { xpos: number; ypos: number };

const THERMO_DATA_BY_SYMBOL = SCIENTIFIC_THERMO_DATA as Record<string, ThermoEntry>;
const ELEMENT_POSITIONS_BY_SYMBOL = new Map<string, ElementPosition>();
const SYMBOLS_BY_COLUMN_ASC = new Map<number, Array<{ symbol: string; ypos: number }>>();

for (const entry of SOURCE_DATA.elements as any[]) {
  if (!entry || typeof entry.symbol !== "string") continue;
  if (typeof entry.xpos !== "number" || typeof entry.ypos !== "number") continue;

  const position = { xpos: entry.xpos, ypos: entry.ypos };
  ELEMENT_POSITIONS_BY_SYMBOL.set(entry.symbol, position);

  if (!SYMBOLS_BY_COLUMN_ASC.has(position.xpos)) {
    SYMBOLS_BY_COLUMN_ASC.set(position.xpos, []);
  }
  SYMBOLS_BY_COLUMN_ASC.get(position.xpos)!.push({ symbol: entry.symbol, ypos: position.ypos });
}

for (const columnEntries of SYMBOLS_BY_COLUMN_ASC.values()) {
  columnEntries.sort((a, b) => a.ypos - b.ypos);
}

const getNestedThermoField = (entry: ThermoEntry | undefined, path: string[]): unknown => {
  let cursor: any = entry;
  for (const key of path) {
    if (!cursor || typeof cursor !== "object" || !(key in cursor)) {
      return undefined;
    }
    cursor = cursor[key];
  }
  return cursor;
};

const isScientificMissing = (value: unknown): boolean => {
  if (value === undefined || value === null) return true;

  if (typeof value === "object") {
    const withValue = value as { value?: unknown };
    if (Object.prototype.hasOwnProperty.call(withValue, "value")) {
      return isScientificMissing(withValue.value);
    }
    return false;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();
    if (!normalized) return true;
    return normalized.startsWith("N/A");
  }

  return false;
};

const resolveColumnFallback = (symbol: string, path: string[]) => {
  const currentEntry = THERMO_DATA_BY_SYMBOL[symbol];
  const displayRaw = getNestedThermoField(currentEntry, path);

  if (!isScientificMissing(displayRaw)) {
    return {
      displayRaw,
      calcRaw: displayRaw
    };
  }

  const position = ELEMENT_POSITIONS_BY_SYMBOL.get(symbol);
  if (!position) {
    return {
      displayRaw,
      calcRaw: displayRaw
    };
  }

  const columnEntries = SYMBOLS_BY_COLUMN_ASC.get(position.xpos) || [];
  for (let idx = columnEntries.length - 1; idx >= 0; idx -= 1) {
    const candidate = columnEntries[idx];
    if (candidate.ypos >= position.ypos) continue;

    const candidateEntry = THERMO_DATA_BY_SYMBOL[candidate.symbol];
    const candidateValue = getNestedThermoField(candidateEntry, path);
    if (!isScientificMissing(candidateValue)) {
      return {
        displayRaw,
        calcRaw: candidateValue
      };
    }
  }

  return {
    displayRaw,
    calcRaw: displayRaw
  };
};

const pressureToPascal = (value: number, unitRaw: unknown): number => {
  const unit = typeof unitRaw === "string" ? unitRaw.trim() : "MPa";

  if (unit === "GPa") {
    return toPascal(value * 1000, "MPa");
  }

  if (
    unit === "Pa" ||
    unit === "kPa" ||
    unit === "MPa" ||
    unit === "bar" ||
    unit === "atm" ||
    unit === "psi" ||
    unit === "kgf_cm2" ||
    unit === "mmHg" ||
    unit === "inHg" ||
    unit === "mmH2O"
  ) {
    return toPascal(value, unit);
  }

  return toPascal(value, "MPa");
};

const convertPressureDisplayToKpa = (rawValue: string | undefined, unitRaw: unknown): string | undefined => {
  if (!rawValue) return undefined;
  if (rawValue === "N/A") return "N/A";

  const isEstimated = rawValue.includes("*");
  const numeric = parseFloat(rawValue.replace("*", ""));
  if (isNaN(numeric)) return rawValue;

  const kPaValue = pressureToPascal(numeric, unitRaw) / 1000;
  const normalized = parseFloat(kPaValue.toFixed(6)).toString();
  return `${normalized}${isEstimated ? "*" : ""}`;
};

const ESTIMATED_TRIPLE_PRESSURE_KPA = 1e-6;

const formatEstimatedValue = (value: number): string => {
  if (!Number.isFinite(value)) return "N/A";
  return `${parseFloat(value.toPrecision(10)).toString()}*`;
};

// Adapter: Transform Raw JSON (Layer 1) + Scientific (Layer 2) + Custom (Layer 3)
export const ELEMENTS: ChemicalElement[] = SOURCE_DATA.elements.map((source: any) => {

  // 1. Setup Data Layers
  const symbol = source.symbol;

  // Layer 2: Scientific Data (Physics + Color)
  const scientific = (SCIENTIFIC_DATA as any)[symbol];
  // Official thermodynamics/compression dataset (user-updated scientific_data.ts at project root)
  const scientificThermo = THERMO_DATA_BY_SYMBOL[symbol];

  // Layer 3: Custom Data (Legacy Props + Simulation Tuning)
  const customData: ElementCustomData = CUSTOM_DATA[symbol] || SODIUM_FALLBACK;

  // Helper for Layer 3 retention & Safety Fallbacks
  const baseLegacyProps = SODIUM_FALLBACK.properties as ElementProperties;
  const specificLegacyProps = customData.properties || {};

  // HELPER: Sanity Check for Physics (Prevents 0/Infinity/NaN bugs)
  // If scientific data is missing or 0, fallback to Sodium defaults (Layer 3 base).
  const ensurePhysical = (val: number | undefined | null, fallback: number): number => {
    // Handles "N/A" which results in NaN after simple casting
    if (typeof val === 'string' && val === 'N/A') return fallback;
    if (typeof val === 'number' && !isNaN(val) && val > 0) return val;
    return fallback;
  };

  // HELPER: Parse Scientific Values (handles '*', 'N/A', and numeric suffixes like '_5')
  const parseSciValue = (input: string | number | undefined, fallback: number) => {
    if (input === undefined || input === null) return { val: fallback, str: undefined, source: undefined };

    // If explicit N/A, return fallback for physics, but 'N/A' string for Display
    if (input === "N/A") return { val: fallback, str: "N/A", source: undefined };

    if (typeof input === 'number') return { val: input, str: input.toString(), source: undefined };

    let str = input.toString();

    // 1. Extract Source Suffix (e.g. "_2" or "_10")
    let sourceId: number | undefined = undefined;
    const suffixMatch = str.match(/_(\d+)$/);
    if (suffixMatch) {
      sourceId = parseInt(suffixMatch[1], 10);
      str = str.replace(/_(\d+)$/, ''); // Remove suffix for value parsing
    }

    // 2. Parse Value (Handle '*' for estimate)
    // parseFloat stops at non-numeric characters generally, but let's be safe
    // If original string had *, keep it in result str for UI
    const cleanStr = str.replace('*', '').replace(/[<>≈~]/g, '').trim();
    const val = parseFloat(cleanStr);

    const isValid = !isNaN(val) && val >= 0; // Allow 0 for specific cases like pressure

    return {
      val: isValid ? val : fallback,
      str: str, // Keep original string (with *) for display, but without suffix
      source: sourceId
    };
  };

  // Parses bulk modulus data that may come as:
  // - "12.3_15"
  // - "N/A"
  // - { value: "12.3_15", variation: "diamond" }
  const parseBulkModulusValue = (
    input: string | number | { value?: string | number; variation?: string } | undefined
  ) => {
    if (input === undefined || input === null) {
      return { val: undefined as number | undefined, str: "N/A", source: undefined as number | undefined, variation: undefined as string | undefined };
    }

    if (typeof input === "object") {
      const valueField = input.value;
      const variation = typeof input.variation === "string" ? input.variation.trim() : "";
      const parsedValue = parseSciValue(valueField, -1);

      if (parsedValue.str === "N/A" || parsedValue.val <= 0) {
        return { val: undefined as number | undefined, str: "N/A", source: undefined as number | undefined, variation: undefined as string | undefined };
      }

      const baseDisplay = parsedValue.str || parsedValue.val.toString();
      return {
        val: parsedValue.val,
        str: baseDisplay,
        source: parsedValue.source,
        variation: variation || undefined
      };
    }

    const parsed = parseSciValue(input, -1);
    if (parsed.str === "N/A" || parsed.val <= 0) {
      return { val: undefined as number | undefined, str: "N/A", source: undefined as number | undefined, variation: undefined as string | undefined };
    }

    return {
      val: parsed.val,
      str: parsed.str || parsed.val.toString(),
      source: parsed.source,
      variation: undefined
    };
  };

  // 2. Resolve Base Properties (Layer 1 Corrections)
  let resolvedDensity = source.density;
  if (source.phase === "Gas" && source.density) {
    resolvedDensity = source.density / 1000;
  }

  // Physics Density (with fallback)
  const hasDensityValue = typeof resolvedDensity === "number" && !isNaN(resolvedDensity);
  const physicsDensity = hasDensityValue ? resolvedDensity : (baseLegacyProps.density || 1.0);
  // Display Density in kg/m³ (converted from g/cm3)
  const displayDensity = hasDensityValue ? `${resolvedDensity * 1000} kg/m³` : "N/A";
  // Parse Specific Heats (Layer 2)
  const shSolid = parseSciValue(scientific?.specificHeat?.solid, baseLegacyProps.specificHeatSolid);
  const shLiquid = parseSciValue(scientific?.specificHeat?.liquid, baseLegacyProps.specificHeatLiquid);
  const shGas = parseSciValue(scientific?.specificHeat?.gas, baseLegacyProps.specificHeatGas);

  const toSciInput = (value: unknown): string | number | undefined =>
    (typeof value === "string" || typeof value === "number") ? value : undefined;

  // Parse Latent Heats (Official thermodynamic source + column fallback for physics)
  const lhFusionField = resolveColumnFallback(symbol, ["latentHeat", "fusion"]);
  const lhVapField = resolveColumnFallback(symbol, ["latentHeat", "vaporization"]);

  const lhFusionCalc = parseSciValue(toSciInput(lhFusionField.calcRaw), baseLegacyProps.latentHeatFusion);
  const lhVapCalc = parseSciValue(toSciInput(lhVapField.calcRaw), baseLegacyProps.latentHeatVaporization);
  const lhFusionDisplay = parseSciValue(toSciInput(lhFusionField.displayRaw), baseLegacyProps.latentHeatFusion);
  const lhVapDisplay = parseSciValue(toSciInput(lhVapField.displayRaw), baseLegacyProps.latentHeatVaporization);
  const lhFusionSource = lhFusionDisplay.str === "N/A" ? undefined : lhFusionDisplay.source;
  const lhVapSource = lhVapDisplay.str === "N/A" ? undefined : lhVapDisplay.source;

  // Parse Others
  const thermCondRaw = scientific?.thermalConductivity;
  const thermCond = parseSciValue(thermCondRaw, baseLegacyProps.thermalConductivity || 10);

  const atRadRaw = scientific?.atomicRadiusPm;
  const atRad = parseSciValue(atRadRaw, baseLegacyProps.atomicRadiusPm!);

  // Phase temperatures (Official thermodynamic source + column fallback for physics)
  const meltField = resolveColumnFallback(symbol, ["phaseTemperatures", "meltingK"]);
  const boilField = resolveColumnFallback(symbol, ["phaseTemperatures", "boilingK"]);
  const tripleTempField = resolveColumnFallback(symbol, ["phaseTemperatures", "triplePointTempK"]);
  const triplePressField = resolveColumnFallback(symbol, ["phaseTemperatures", "triplePointPressKPa"]);
  const criticalTempFromTop = resolveColumnFallback(symbol, ["tCriticalK"]);
  const criticalTempFromPhase = resolveColumnFallback(symbol, ["phaseTemperatures", "criticalTemperatureK"]);
  const criticalPressFromTop = resolveColumnFallback(symbol, ["pCritical"]);
  const criticalPressFromPhase = resolveColumnFallback(symbol, ["phaseTemperatures", "criticalPressureMPa"]);
  const criticalTempField =
    !isScientificMissing(criticalTempFromTop.displayRaw) || !isScientificMissing(criticalTempFromTop.calcRaw)
      ? criticalTempFromTop
      : criticalTempFromPhase;
  const criticalPressField =
    !isScientificMissing(criticalPressFromTop.displayRaw) || !isScientificMissing(criticalPressFromTop.calcRaw)
      ? criticalPressFromTop
      : criticalPressFromPhase;

  const meltTempCalc = parseSciValue(toSciInput(meltField.calcRaw) ?? source.melt, baseLegacyProps.meltingPointK);
  const boilTempCalc = parseSciValue(toSciInput(boilField.calcRaw) ?? source.boil, 9999);
  const meltTempDisplay = parseSciValue(toSciInput(meltField.displayRaw), baseLegacyProps.meltingPointK);
  const boilTempDisplay = parseSciValue(toSciInput(boilField.displayRaw), 9999);
  const meltTempSource = meltTempDisplay.str === "N/A" ? undefined : meltTempDisplay.source;
  const boilTempSource = boilTempDisplay.str === "N/A" ? undefined : boilTempDisplay.source;

  const tpTempDisplayRes = parseSciValue(toSciInput(tripleTempField.displayRaw), -999);
  const tpPressDisplayRes = parseSciValue(toSciInput(triplePressField.displayRaw), -999);
  const hasTripleTempDisplay = Boolean(tpTempDisplayRes.str && tpTempDisplayRes.str !== "N/A");
  const hasTriplePressDisplay = Boolean(tpPressDisplayRes.str && tpPressDisplayRes.str !== "N/A");

  const tpTempDisplayValue = hasTripleTempDisplay
    ? (tpTempDisplayRes.str as string)
    : formatEstimatedValue(meltTempCalc.val);
  const tpPressDisplayValue = hasTriplePressDisplay
    ? (tpPressDisplayRes.str as string)
    : `${ESTIMATED_TRIPLE_PRESSURE_KPA}*`;

  // Triple point runtime values must be derived from the same values shown in the property list.
  const tpTempResolved = parseSciValue(tpTempDisplayValue, meltTempCalc.val);
  const tpPressResolved = parseSciValue(tpPressDisplayValue, ESTIMATED_TRIPLE_PRESSURE_KPA);

  const triplePointObj = {
    tempK: tpTempResolved.val > 0 ? tpTempResolved.val : meltTempCalc.val,
    pressurePa: (tpPressResolved.val > 0 ? tpPressResolved.val : ESTIMATED_TRIPLE_PRESSURE_KPA) * 1000
  };

  const tpSource =
    (hasTripleTempDisplay ? tpTempDisplayRes.source : undefined) ??
    (hasTriplePressDisplay ? tpPressDisplayRes.source : undefined) ??
    meltTempSource;

  const parseCriticalPressureValue = (
    input: unknown,
    fallbackPa: number
  ): { val: number; str: string | undefined; source: number | undefined; unit: unknown } => {
    if (input === undefined || input === null) {
      return { val: fallbackPa, str: undefined, source: undefined, unit: "MPa" };
    }

    if (typeof input === "object") {
      const valueField = (input as { value?: unknown }).value;
      const unitField = (input as { unit?: unknown }).unit ?? "MPa";
      const parsed = parseSciValue(toSciInput(valueField), fallbackPa);
      if (parsed.str === "N/A" || parsed.val === fallbackPa) {
        return { val: fallbackPa, str: "N/A", source: undefined, unit: unitField };
      }
      return {
        val: pressureToPascal(parsed.val, unitField),
        str: parsed.str,
        source: parsed.source,
        unit: unitField
      };
    }

    const parsed = parseSciValue(toSciInput(input), fallbackPa);
    if (parsed.str === "N/A" || parsed.val === fallbackPa) {
      return { val: fallbackPa, str: parsed.str, source: undefined, unit: "MPa" };
    }

    return {
      val: pressureToPascal(parsed.val, "MPa"),
      str: parsed.str,
      source: parsed.source,
      unit: "MPa"
    };
  };

  const cpTempCalcRes = parseSciValue(toSciInput(criticalTempField.calcRaw), -999);
  const cpTempDisplayRes = parseSciValue(toSciInput(criticalTempField.displayRaw), -999);
  const cpPressCalcRes = parseCriticalPressureValue(criticalPressField.calcRaw, -999);
  const cpPressDisplayRes = parseCriticalPressureValue(criticalPressField.displayRaw, -999);

  const hasCriticalPointFromScientific = cpTempCalcRes.val > 0 && cpPressCalcRes.val > 0;
  const criticalPointObj = hasCriticalPointFromScientific
    ? {
      tempK: cpTempCalcRes.val,
      pressurePa: cpPressCalcRes.val
    }
    : undefined;

  const criticalSource =
    (cpTempDisplayRes.str && cpTempDisplayRes.str !== "N/A" ? cpTempDisplayRes.source : undefined) ??
    (cpPressDisplayRes.str && cpPressDisplayRes.str !== "N/A" ? cpPressDisplayRes.source : undefined);
  const cpTempDisplayValue =
    cpTempDisplayRes.str && cpTempDisplayRes.str !== "N/A" ? cpTempDisplayRes.str : "N/A";
  const cpPressDisplayValue = convertPressureDisplayToKpa(
    cpPressDisplayRes.str && cpPressDisplayRes.str !== "N/A" ? cpPressDisplayRes.str : "N/A",
    cpPressDisplayRes.unit
  ) || "N/A";

  // Oxidation States Handling
  // Scientific data might have string "N/A" instead of array
  const rawOx = scientific?.oxidationStates;
  const physicsOx = Array.isArray(rawOx) ? rawOx : []; // Fallback to empty array for physics
  const displayOx = Array.isArray(rawOx) ? rawOx.join(", ") : (rawOx || "N/A");

  // Ionization & Electron Affinity
  const rawIon = source.ionization_energies;
  const displayIon = rawIon && rawIon.length > 0 ? rawIon[0] : "N/A";
  const displayAffinity = source.electron_affinity !== undefined && source.electron_affinity !== null ? source.electron_affinity : "N/A";
  const displayElectronegativity = source.electronegativity_pauling !== undefined && source.electronegativity_pauling !== null ? source.electronegativity_pauling : "N/A";

  // OFFICIAL enthalpy/bulk values from user-updated scientific_data.ts (root)
  const fallbackEnthalpyFusionKjMol = (baseLegacyProps.enthalpyFusionJmol || 2600) / 1000;
  const fallbackEnthalpyVapKjMol =
    (baseLegacyProps.enthalpyVapJmol ||
      ((baseLegacyProps.latentHeatVaporization || 0) * SODIUM_MOLAR_MASS_KG)) / 1000;

  const enthalpyFusionField = resolveColumnFallback(symbol, ["enthalpyFusionKjMol"]);
  const enthalpyVapField = resolveColumnFallback(symbol, ["enthalpyVaporizationKjMol"]);
  const enthalpyFusionCalc = parseSciValue(toSciInput(enthalpyFusionField.calcRaw), fallbackEnthalpyFusionKjMol);
  const enthalpyVapCalc = parseSciValue(toSciInput(enthalpyVapField.calcRaw), fallbackEnthalpyVapKjMol);
  const enthalpyFusionDisplay = parseSciValue(toSciInput(enthalpyFusionField.displayRaw), fallbackEnthalpyFusionKjMol);
  const enthalpyVapDisplay = parseSciValue(toSciInput(enthalpyVapField.displayRaw), fallbackEnthalpyVapKjMol);
  const enthalpyFusionSource = enthalpyFusionDisplay.str === "N/A" ? undefined : enthalpyFusionDisplay.source;
  const enthalpyVapSource = enthalpyVapDisplay.str === "N/A" ? undefined : enthalpyVapDisplay.source;
  const bulkModulusOfficial = parseBulkModulusValue(scientificThermo?.bulkModulusGPA);

  const enthalpyFusionJmolPhysics = ensurePhysical(enthalpyFusionCalc.val * 1000, baseLegacyProps.enthalpyFusionJmol || 2600);
  const enthalpyVapJmolPhysics = ensurePhysical(
    enthalpyVapCalc.val * 1000,
    baseLegacyProps.enthalpyVapJmol || ((baseLegacyProps.latentHeatVaporization || 0) * SODIUM_MOLAR_MASS_KG)
  );

  // 3. Construct Properties Object adhering to Merge Strategy
  const properties: ElementProperties = {
    // --- BASE IDENTITY (Layer 1 + Layer 2 Temperatures) ---
    meltingPointK: ensurePhysical(meltTempCalc.val, baseLegacyProps.meltingPointK),
    boilingPointK: ensurePhysical(boilTempCalc.val, 9999),
    meltingPointSource: meltTempSource,
    boilingPointSource: boilTempSource,

    // DISPLAY FIELDS (Strictly Source/Scientific)
    meltingPointDisplay: meltTempDisplay.str && meltTempDisplay.str !== "N/A" ? `${meltTempDisplay.str} K` : "N/A",
    boilingPointDisplay: boilTempDisplay.str && boilTempDisplay.str !== "N/A" ? `${boilTempDisplay.str} K` : "N/A",
    densityDisplay: displayDensity,
    atomicRadiusDisplay: atRad.str ? `${atRad.str} pm` : 'N/A',
    electronegativityDisplay: String(displayElectronegativity),
    electronAffinityDisplay: displayAffinity !== "N/A" ? `${displayAffinity} kJ/mol` : "N/A",
    ionizationEnergyDisplay: displayIon !== "N/A" ? `${displayIon} kJ/mol` : "N/A",
    oxidationStatesDisplay: displayOx,
    thermalConductivityDisplay: thermCond.str ? `${thermCond.str} W/mK` : 'N/A',
    enthalpyFusionKjMolDisplay: enthalpyFusionDisplay.str && enthalpyFusionDisplay.str !== "N/A" ? enthalpyFusionDisplay.str : "N/A",
    enthalpyVaporizationKjMolDisplay: enthalpyVapDisplay.str && enthalpyVapDisplay.str !== "N/A" ? enthalpyVapDisplay.str : "N/A",
    bulkModulusDisplay: bulkModulusOfficial.str === "N/A"
      ? "N/A"
      : bulkModulusOfficial.variation
        ? `${bulkModulusOfficial.str} GPa (Variação: ${bulkModulusOfficial.variation})`
        : `${bulkModulusOfficial.str} GPa`,
    density: physicsDensity,
    electronegativity: source.electronegativity_pauling || 0,
    electronConfiguration: source.electron_configuration_semantic,
    electronAffinity: source.electron_affinity || 0,
    ionizationEnergy: source.ionization_energies ? source.ionization_energies[0] : 0,

    // --- NEW PHYSICS (Layer 2 - Scientific Data with Safety Fallbacks) ---
    // CRITICAL FIX: Never allow these to be 0 for simulation stability.
    specificHeatSolid: shSolid.val,
    specificHeatLiquid: shLiquid.val,
    specificHeatGas: shGas.val,
    // Store Display Strings (for *, N/A)
    specificHeatSolidDisplay: shSolid.str,
    specificHeatLiquidDisplay: shLiquid.str,
    specificHeatGasDisplay: shGas.str,
    // Sources
    specificHeatSolidSource: shSolid.source,
    specificHeatLiquidSource: shLiquid.source,
    specificHeatGasSource: shGas.source,

    thermalConductivity: thermCond.val,
    thermalConductivitySource: thermCond.source,

    atomicRadiusPm: ensurePhysical(atRad.val, baseLegacyProps.atomicRadiusPm!),
    atomicRadiusSource: atRad.source,

    oxidationStates: physicsOx,

    // LATENT HEAT
    latentHeatFusion: lhFusionCalc.val,
    latentHeatVaporization: lhVapCalc.val,
    // Display strings
    latentHeatFusionDisplay: lhFusionDisplay.str && lhFusionDisplay.str !== "N/A" ? lhFusionDisplay.str : "N/A",
    latentHeatVaporizationDisplay: lhVapDisplay.str && lhVapDisplay.str !== "N/A" ? lhVapDisplay.str : "N/A",
    // Sources
    latentHeatFusionSource: lhFusionSource,
    latentHeatVaporizationSource: lhVapSource,
    enthalpyFusionSource: enthalpyFusionSource,
    enthalpyVaporizationSource: enthalpyVapSource,
    bulkModulusSource: bulkModulusOfficial.source,

    // --- OFFICIAL THERMO/COMPRESSION SOURCE ---
    // enthalpy values always keep sodium fallback for physics when source is N/A/missing,
    // but UI keeps the raw source string (including N/A and *).
    enthalpyFusionJmol: enthalpyFusionJmolPhysics,
    enthalpyVapJmol: enthalpyVapJmolPhysics,
    // bulk modulus has NO sodium fallback for compression:
    // missing/invalid source data => undefined => no compression animation.
    bulkModulusGPa: bulkModulusOfficial.val,

    // --- RETAINED LEGACY (Layer 3 - Custom/Sodium Fallback) ---
    criticalPoint: criticalPointObj,
    criticalPointSource: criticalSource,
    criticalPointTempDisplay: cpTempDisplayValue,
    criticalPointPressDisplay: cpPressDisplayValue,

    // Triple Point: Use Calculated from Scientific Data
    triplePoint: triplePointObj,
    triplePointSource: tpSource,
    triplePointTempDisplay: tpTempDisplayValue,
    triplePointPressDisplay: tpPressDisplayValue,

    // Simulation Tuning Parameters (Always Layer 3)
    simonA_Pa: specificLegacyProps.simonA_Pa ?? baseLegacyProps.simonA_Pa,
    simonC: specificLegacyProps.simonC ?? baseLegacyProps.simonC,
  };

  // 4. Construct Visual DNA (Strictly from Layer 2 Scientific Data)
  const elementColor = scientific?.color || "#94a3b8"; // Default to Slate-400 if missing (e.g. Uue)

  const generatedVisualDNA = {
    solid: { color: elementColor, opacidade: 1.0 },
    liquid: { color: elementColor, opacidade: 1.0 },
    gas: { color: elementColor, opacidade: 1.0 }
  };

  return {
    atomicNumber: source.number,
    symbol: source.symbol,
    name: source.name, // DIRECT FROM SOURCE
    summary: source.summary, // DIRECT FROM SOURCE
    displayCategory: source.category,

    classification: {
      group: String(source.group),
      groupBlock: source.block.toUpperCase(),
      groupName: customData.classification?.groupName || "Elemento Químico",
      period: source.period,
      electronShells: source.shells ? source.shells.length : 0
    },

    mass: source.atomic_mass,
    category: customData.category || SODIUM_FALLBACK.category || 'metal',

    properties,
    visualDNA: generatedVisualDNA,
    specialBehavior: customData.specialBehavior || SODIUM_FALLBACK.specialBehavior
  };
});
