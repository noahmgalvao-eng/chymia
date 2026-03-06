import { MatterState, Particle } from '../../types';

export interface SimulationMutableState {
    enthalpy: number;
    lastFrameTime: number;
    particles: Particle[];
    simTime: number;

    // SCF Logic Tracks
    lastStableState: MatterState;
    transitionStartTime: number;
    transitionDuration: number;
    isTransitioning: boolean;
    scfTargetOpacity: number;
    areAllParticlesSettled: boolean;
}
