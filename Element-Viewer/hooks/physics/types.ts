import { MatterState, Particle } from '../../types';
import type { SpatialGrid } from '../../utils/spatialGrid';

export interface ParticleFrameScratch {
    particleById: Map<number, Particle>;
    particleIdBySlot: Map<number, number>;
    liquidParticles: Particle[];
    gasParticles: Particle[];
    trappedParticles: Particle[];
    condensingParticles: Particle[];
    liquidParticlesWithoutSlot: Particle[];
    availableRetainedSlotIds: number[];
    retainedSlotSet: Set<number>;
    claimedSlotSet: Set<number>;
    occupiedSlotSet: Set<number>;
}

export interface SimulationMutableState {
    enthalpy: number;
    lastFrameTime: number;
    particles: Particle[];
    simTime: number;
    previousBoilLikeProgress: number;
    slotByParticleId: Map<number, number>;
    previousRetainedSlotIds: number[];
    frameVersion: number;
    activeGasCount: number;
    layoutCacheKey: string;
    frameScratch: ParticleFrameScratch;
    collisionGrid: SpatialGrid;

    // SCF Logic Tracks
    lastStableState: MatterState;
    transitionStartTime: number;
    transitionDuration: number;
    isTransitioning: boolean;
    scfTargetOpacity: number;
    areAllParticlesSettled: boolean;
}
