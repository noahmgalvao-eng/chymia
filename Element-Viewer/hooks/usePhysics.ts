
import { useEffect, useRef, useState } from 'react';
import { ChemicalElement, MatterState, PhysicsState, MatterRect, Bounds, ViewBoxDimensions } from '../types';
import { SimulationMutableState } from './physics/types';
import { calculateThermodynamics } from './physics/thermodynamics';
import { calculateGeometry } from './physics/geometry';
import { initParticles, updateParticleSystem } from './physics/particleSystem';

interface UsePhysicsProps {
  element: ChemicalElement;
  temperature: number; // Target Environment Temperature
  pressure: number;    // Environment Pressure
  qualityScale?: number; // 0.1 to 1.0 (Controls particle count for performance)
  viewBounds: ViewBoxDimensions; // The dynamic limits of the visible world
  timeScale: number;
  isPaused: boolean;
}

const SAMPLE_MASS = 0.001; 
const BASE_PARTICLE_COUNT = 50;
const INIT_W = 134;
const INIT_H = 134;

export const usePhysics = ({ element, temperature: targetEnvTemp, pressure, qualityScale = 1.0, viewBounds, timeScale, isPaused }: UsePhysicsProps): PhysicsState => {
  
  const effectiveParticleCount = Math.max(10, Math.floor(BASE_PARTICLE_COUNT * qualityScale));

  const propsRef = useRef({ element, targetEnvTemp, pressure, effectiveParticleCount, viewBounds, timeScale, isPaused });
  
  useEffect(() => {
    propsRef.current = { element, targetEnvTemp, pressure, effectiveParticleCount, viewBounds, timeScale, isPaused };
  }, [element, targetEnvTemp, pressure, effectiveParticleCount, viewBounds, timeScale, isPaused]);

  // Initial State Setup
  const INIT_RECT: MatterRect = {
      w: INIT_W, h: INIT_H, x: 200 - (INIT_W / 2), y: 300 - INIT_H
  };
  const INIT_BOUNDS: Bounds = {
      minX: INIT_RECT.x, maxX: INIT_RECT.x + INIT_RECT.w, minY: INIT_RECT.y, maxY: INIT_RECT.y + INIT_RECT.h
  };

  const simState = useRef<SimulationMutableState>({
    enthalpy: 0, 
    lastFrameTime: performance.now(),
    particles: initParticles(effectiveParticleCount),
    simTime: 0,
    lastStableState: MatterState.SOLID,
    transitionStartTime: 0,
    transitionDuration: 1,
    isTransitioning: false,
    scfTargetOpacity: 0,
    areAllParticlesSettled: true
  });

  useEffect(() => {
    if (simState.current.particles.length !== effectiveParticleCount) {
        simState.current.particles = initParticles(effectiveParticleCount);
    }
  }, [effectiveParticleCount]);

  // Initialize Enthalpy on element change
  useEffect(() => {
    const { element, targetEnvTemp } = propsRef.current;
    const { meltingPointK, specificHeatSolid, specificHeatLiquid, latentHeatFusion } = element.properties;

    if (targetEnvTemp < meltingPointK) {
        simState.current.enthalpy = SAMPLE_MASS * specificHeatSolid * targetEnvTemp;
    } else {
        const H_solid = SAMPLE_MASS * specificHeatSolid * meltingPointK;
        const H_liquid = SAMPLE_MASS * specificHeatLiquid * (targetEnvTemp - meltingPointK);
        simState.current.enthalpy = H_solid + (SAMPLE_MASS * latentHeatFusion) + H_liquid;
    }
  }, [element.symbol]);

  const [outputState, setOutputState] = useState<PhysicsState>({
     simTime: 0,
     state: MatterState.SOLID,
     temperature: 0,
     pressure: 101325,
     enthalpy: 0,
     boilingPointCurrent: 0,
     meltingPointCurrent: 0,
     sublimationPointCurrent: 0,
     meltProgress: 0,
     boilProgress: 0,
     sublimationProgress: 0,
     powerInput: 0,
     particles: [],
     pathProgress: 0,
     compressionFactor: 1,
     gasBounds: INIT_BOUNDS,
     meanParticleSpeed: 0,
     matterRect: INIT_RECT,
     scfOpacity: 0,
     scfTransitionProgress: 0
  });

  useEffect(() => {
    let frameId: number;

    const loop = (now: number) => {
       const { element, targetEnvTemp, pressure, effectiveParticleCount, viewBounds, timeScale, isPaused } = propsRef.current;
       
       if (isPaused) {
           simState.current.lastFrameTime = now;
           frameId = requestAnimationFrame(loop);
           return;
       }

       const rawDt = (now - simState.current.lastFrameTime) / 1000;
       const dt = Math.min(rawDt, 0.1) * timeScale; 
       
       simState.current.lastFrameTime = now;
       simState.current.simTime += dt;

       // 1. THERMODYNAMICS & STATE MACHINE
       const thermo = calculateThermodynamics({
           simState: simState.current,
           element,
           targetEnvTemp,
           pressure,
           dt,
           timeScale
       });

       // 2. GEOMETRY
       const geometry = calculateGeometry({
           element,
           pressure,
           currentTemp: thermo.currentTemp,
           meltProgress: thermo.meltProgress,
           phase: thermo.phase,
           viewBounds,
           scfTransitionProgress: thermo.scfTransitionProgress,
           sublimationProgress: thermo.sublimationProgress
       });

       // 3. PARTICLE SYSTEM DYNAMICS
       const particleSystem = updateParticleSystem({
           simState: simState.current,
           phase: thermo.phase,
           detectedPhase: thermo.detectedPhase,
           element,
           matterRect: geometry.matterRect,
           gasBounds: geometry.gasBounds,
           currentTemp: thermo.currentTemp,
           dt,
           timeScale,
           effectiveParticleCount,
           scfTransitionProgress: thermo.scfTransitionProgress,
           boilProgress: thermo.boilProgress,
           meltProgress: thermo.meltProgress,
           compressionFactor: geometry.compressionFactor,
           sublimationProgress: thermo.sublimationProgress
       });

       // 4. OUTPUT MAPPING
       setOutputState({
           state: thermo.phase,
           temperature: thermo.currentTemp,
           pressure,
           enthalpy: simState.current.enthalpy,
           boilingPointCurrent: thermo.boilingPointCurrent,
           meltingPointCurrent: thermo.meltingPointCurrent,
           sublimationPointCurrent: thermo.sublimationPointCurrent,
           meltProgress: thermo.meltProgress,
           boilProgress: thermo.boilProgress,
           sublimationProgress: thermo.sublimationProgress,
           powerInput: thermo.powerInput,
           particles: [...simState.current.particles],
           pathProgress: particleSystem.pathProgress,
           compressionFactor: geometry.compressionFactor, 
           gasBounds: geometry.gasBounds, 
           meanParticleSpeed: particleSystem.meanParticleSpeed,
           matterRect: geometry.matterRect,
           simTime: simState.current.simTime,
           scfOpacity: geometry.scfOpacity,
           scfTransitionProgress: thermo.scfTransitionProgress
       });

       frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return outputState;
};
