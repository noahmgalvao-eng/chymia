export type SupportedLocale =
  | 'ar'
  | 'en-US'
  | 'es-ES'
  | 'fr-FR'
  | 'hi-IN'
  | 'pt-BR';

export interface Messages {
  common: {
    close: string;
    notAvailable: string;
    openLink: string;
    estimated: string;
    helpAria: (label: string) => string;
  };
  app: {
    controls: {
      hidePeriodicTable: string;
      openPeriodicTable: string;
      openPeriodicTableButton: string;
      toggleSimulationSpeed: string;
      resumeSimulation: string;
      pauseSimulation: string;
      stopRecording: string;
      startRecording: string;
      exitFullscreen: string;
      enterFullscreen: string;
      askChatGPTAboutSimulation: string;
      assistantIdeasAriaLabel: string;
    };
    assistantPopover: {
      title: string;
      itemOne: string;
      itemOneExample: string;
      itemTwo: string;
      itemTwoExample: string;
      itemThree: string;
      itemFour: string;
      footer: string;
    };
    chatPrompts: {
      single: (temperature: string, pressure: string) => string;
      multi: (temperature: string, pressure: string) => string;
    };
    widgetState: {
      thermalTrendStable: string;
      thermalTrendHeatingTowardTarget: string;
      thermalTrendCoolingTowardTarget: string;
      thermalTrendHeatingLightly: string;
      thermalTrendCoolingLightly: string;
    };
  };
  periodicTable: {
    hide: string;
    xRayVision: string;
    temperature: string;
    pressure: string;
    resetTemperatureTo: (value: string) => string;
    resetPressureTo: (value: string) => string;
    legend: string;
    selectionMode: string;
    single: string;
    compare: string;
    substances: string;
    legendItems: {
      ametais: string;
      metaisAlcalinos: string;
      metaisAlcalinoTerrosos: string;
      gasesNobres: string;
      halogenios: string;
      semimetais: string;
      outrosMetais: string;
      lantanideos: string;
      actinidios: string;
      metaisTransicao: string;
    };
  };
  matter: {
    phaseNames: {
      solid: string;
      liquid: string;
      gas: string;
      supercriticalFluid: string;
    };
    readableStates: {
      solid: string;
      melting: string;
      equilibriumMelt: string;
      liquid: string;
      boiling: string;
      equilibriumBoil: string;
      equilibriumTriple: string;
      sublimation: string;
      equilibriumSub: string;
      gas: string;
      transitionScf: string;
      supercritical: string;
      unknown: string;
    };
    visualizerStatus: {
      solidPhase: string;
      liquidPhase: string;
      gasPhase: string;
      solidifying: string;
      melting: string;
      condensing: string;
      boiling: string;
      equilibriumSolidLiquid: string;
      equilibriumLiquidGas: string;
      threePhaseSystem: string;
      supercriticalFluid: string;
      supercriticalFluidTransition: string;
      depositing: string;
      sublimation: string;
      sublimationEquilibrium: string;
      fallback: (state: string) => string;
    };
    equilibria: {
      melt: string;
      boil: string;
      sublimation: string;
      triple: string;
    };
  };
  propertiesMenu: {
    closeDetails: string;
    seeMore: string;
    seeLess: string;
    actions: {
      solidify: string;
      liquefy: string;
      boil: string;
      condense: string;
      sublimation: string;
      triplePoint: string;
      supercriticalFluid: string;
      solidifyHelp: (meltingPoint: string, triplePressure: string) => string;
      liquefyHelp: (meltingPoint: string, boilingPoint: string, triplePressure: string) => string;
      boilHelp: (boilingPoint: string, triplePressure: string) => string;
      condenseHelp: (meltingPoint: string, boilingPoint: string, triplePressure: string) => string;
      sublimationHelp: (
        phaseTo: string,
        phaseFrom: string,
        condition: string,
        sublimationTemp: string,
        triplePressure: string,
      ) => string;
      triplePointHelp: (tripleTemperature: string, triplePressure: string) => string;
      supercriticalFluidHelp: (criticalTemperature: string, criticalPressure: string) => string;
      terms: {
        solidAdjective: string;
        gaseousAdjective: string;
        above: string;
        below: string;
      };
    };
    sectionTitles: {
      atomicChemical: string;
      physics: string;
    };
    propertyLabels: {
      atomicMass: string;
      density: string;
      atomicRadius: string;
      electronAffinity: string;
      firstIonizationEnergy: string;
      oxidationStates: string;
      electronConfiguration: string;
      meltingPoint: string;
      boilingPoint: string;
      triplePointTemperature: string;
      triplePointPressure: string;
      criticalPointTemperature: string;
      criticalPointPressure: string;
      thermalConductivity: string;
      specificHeatSolid: string;
      specificHeatLiquid: string;
      specificHeatGas: string;
      latentHeatFusion: string;
      latentHeatVaporization: string;
      enthalpyFusion: string;
      enthalpyVaporization: string;
      bulkModulus: string;
    };
    viewReferences: string;
    referencesTitle: string;
  };
  website: {
    brandTagline: string;
    aboutButton: string;
    logoAlt: string;
    qrAlt: string;
    metaTitles: {
      home: string;
      support: string;
      terms: string;
      privacy: string;
      contact: string;
    };
    about: {
      kicker: string;
      legalKicker: string;
      supportNav: string;
      termsNav: string;
      privacyNav: string;
      contactNav: string;
      supportHeading: string;
      supportPageDescription: string;
      termsHeading: string;
      termsPageDescription: string;
      privacyHeading: string;
      privacyPageDescription: string;
      contactHeading: string;
      contactPageDescription: string;
      supportTitle: string;
      supportDescription: string;
      paypalButton: string;
      githubButton: string;
      supportDirectTitle: string;
      supportDirectDescription: string;
      supportOpenTitle: string;
      supportOpenDescription: string;
      supportQrLabel: string;
      supportQrDescription: string;
      contactTitle: string;
      contactDescription: string;
      contactEmailLabel: string;
    };
    footer: {
      rightsReserved: (year: number) => string;
      terms: string;
      privacy: string;
      contact: string;
      language: string;
    };
    languageNames: Record<SupportedLocale, string>;
  };
  recordingStats: {
    emptyTitle: string;
    emptyDescription: string;
    title: string;
    subtitle: (duration: string, current: number, total: number) => string;
    closeAria: string;
    recordedElementSelection: string;
    systemEnthalpy: string;
    gasExpansion: string;
    thermodynamicVariables: string;
    temperature: string;
    pressure: string;
    phaseTransition: string;
    pressureDependentBoundaries: string;
    tMelt: string;
    tBoil: string;
    gasArea: string;
  };
}
