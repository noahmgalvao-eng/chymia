
import { ChemicalElement, MatterState, Particle, ParticleState, MatterRect, Bounds } from '../../types';
import { SimulationMutableState } from './types';
import { interpolateValue } from '../../utils/interpolator';
import {
    buildEvaporationLayout,
    EvaporationLayout,
    getEvaporationPathProgress,
    getParticleVibration,
    getParticleVibrationAmplitude,
    getParticleVibrationVelocity,
} from '../../utils/evaporationLayout';

// Lattice Config
const COLS = 10;
const ROWS = 5;
const PARTICLE_RADIUS = 6;
const INIT_W = 134;
const INIT_H = 134;
const INIT_RECT: MatterRect = {
    w: INIT_W,
    h: INIT_H,
    x: 200 - (INIT_W / 2),
    y: 300 - INIT_H
};

export const initParticles = (count: number): Particle[] => {
    return Array.from({ length: count }).map((_, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      
      const cellW = INIT_RECT.w / COLS;
      const cellH = INIT_RECT.h / ROWS;
      
      const hx = INIT_RECT.x + (col * cellW) + (cellW / 2);
      const hy = INIT_RECT.y + (row * cellH) + (cellH / 2);
      
      return {
        id: i,
        state: ParticleState.TRAPPED,
        x: hx, y: hy, homeX: hx, homeY: hy,
        vx: 0, vy: 0, r: PARTICLE_RADIUS
      };
    });
};

interface ParticleUpdateInput {
    simState: SimulationMutableState;
    phase: MatterState;
    detectedPhase: MatterState;
    element: ChemicalElement;
    matterRect: MatterRect;
    gasBounds: Bounds;
    currentTemp: number; // calculated kinematic temp target
    dt: number;
    timeScale: number;
    effectiveParticleCount: number;
    scfTransitionProgress: number;
    boilProgress: number;
    meltProgress: number;
    compressionFactor: number;
    sublimationProgress: number; // New Input
}

interface ParticleUpdateOutput {
    meanParticleSpeed: number;
    pathProgress: number;
}

const isEvaporationConstrainedRising = (
    particle: Particle,
    simState: SimulationMutableState,
) =>
    particle.state === ParticleState.RISING &&
    simState.evaporationSlotByParticleId.has(particle.id) &&
    simState.evaporationLiftByParticleId.has(particle.id);

const isEvaporationSlotOccupant = (
    particle: Particle,
    simState: SimulationMutableState,
) =>
    particle.state === ParticleState.TRAPPED ||
    particle.state === ParticleState.CONDENSING ||
    isEvaporationConstrainedRising(particle, simState);

const isFreeGasLikeParticle = (
    particle: Particle,
    simState: SimulationMutableState,
) =>
    particle.state === ParticleState.GAS ||
    (particle.state === ParticleState.RISING && !isEvaporationConstrainedRising(particle, simState));

const getEvaporationOccupantRank = (
    particle: Particle,
    simState: SimulationMutableState,
) => {
    if (particle.state === ParticleState.TRAPPED) return 0;
    if (particle.state === ParticleState.CONDENSING) return 1;
    if (isEvaporationConstrainedRising(particle, simState)) return 2;
    return 3;
};

const clearEvaporationSlotState = (simState: SimulationMutableState) => {
    simState.evaporationSlotByParticleId.clear();
    simState.evaporationLiftByParticleId.clear();
    simState.evaporationLayoutKey = '';
};

const syncEvaporationSlotAssignments = (
    simState: SimulationMutableState,
    layout: EvaporationLayout,
) => {
    const reservedParticles = simState.particles
        .filter((particle) => isEvaporationSlotOccupant(particle, simState))
        .sort((a, b) => {
            const rankA = getEvaporationOccupantRank(a, simState);
            const rankB = getEvaporationOccupantRank(b, simState);
            if (rankA !== rankB) {
                return rankA - rankB;
            }
            return a.id - b.id;
        });

    const reservedIds = new Set(reservedParticles.map((particle) => particle.id));
    for (const [particleId, slotIndex] of simState.evaporationSlotByParticleId.entries()) {
        if (!reservedIds.has(particleId) || slotIndex < 0 || slotIndex >= layout.capacity) {
            simState.evaporationSlotByParticleId.delete(particleId);
            simState.evaporationLiftByParticleId.delete(particleId);
        }
    }

    for (const particleId of simState.evaporationLiftByParticleId.keys()) {
        if (!reservedIds.has(particleId) || !simState.evaporationSlotByParticleId.has(particleId)) {
            simState.evaporationLiftByParticleId.delete(particleId);
        }
    }

    const usedSlotIndices = new Set<number>();
    for (const slotIndex of simState.evaporationSlotByParticleId.values()) {
        usedSlotIndices.add(slotIndex);
    }

    const availableSlotIndices = layout.slots
        .map((slot) => slot.index)
        .filter((slotIndex) => !usedSlotIndices.has(slotIndex));

    for (const particle of reservedParticles) {
        if (simState.evaporationSlotByParticleId.has(particle.id)) continue;
        if (availableSlotIndices.length === 0) break;

        let nearestIndex = 0;
        let nearestDistanceSq = Number.POSITIVE_INFINITY;
        const anchorX = particle.state === ParticleState.TRAPPED ? particle.homeX : particle.x;
        const anchorY = particle.state === ParticleState.TRAPPED ? particle.homeY : particle.y;

        for (let index = 0; index < availableSlotIndices.length; index += 1) {
            const slotIndex = availableSlotIndices[index];
            const slot = layout.slots[slotIndex];
            const dx = slot.x - anchorX;
            const dy = slot.y - anchorY;
            const distanceSq = (dx * dx) + (dy * dy);

            if (distanceSq < nearestDistanceSq) {
                nearestDistanceSq = distanceSq;
                nearestIndex = index;
            }
        }

        const [slotIndex] = availableSlotIndices.splice(nearestIndex, 1);
        simState.evaporationSlotByParticleId.set(particle.id, slotIndex);
    }

    for (const particle of reservedParticles) {
        const slotIndex = simState.evaporationSlotByParticleId.get(particle.id);
        if (slotIndex === undefined) {
            if (particle.state === ParticleState.RISING) {
                particle.state = ParticleState.GAS;
            }
            simState.evaporationLiftByParticleId.delete(particle.id);
            continue;
        }
        const slot = layout.slots[slotIndex];
        if (!slot) continue;
        particle.homeX = slot.x;
        particle.homeY = slot.y;
    }

    simState.evaporationLayoutKey = layout.key;
};

const getWorstPinnedCoreParticle = (
    simState: SimulationMutableState,
    preferCondensing: boolean,
) => {
    const pinnedParticles = simState.particles.filter((particle) => {
        if (particle.state !== ParticleState.TRAPPED && particle.state !== ParticleState.CONDENSING) {
            return false;
        }
        if (preferCondensing) return particle.state === ParticleState.CONDENSING;
        return particle.state === ParticleState.TRAPPED;
    });

    pinnedParticles.sort((a, b) => {
        const slotA = simState.evaporationSlotByParticleId.get(a.id) ?? Number.POSITIVE_INFINITY;
        const slotB = simState.evaporationSlotByParticleId.get(b.id) ?? Number.POSITIVE_INFINITY;
        if (slotA !== slotB) return slotB - slotA;
        return b.id - a.id;
    });

    return pinnedParticles[0];
};

const getWorstConstrainedRisingParticle = (
    simState: SimulationMutableState,
) => {
    const risingParticles = simState.particles
        .filter((particle) => isEvaporationConstrainedRising(particle, simState))
        .sort((a, b) => {
            const slotA = simState.evaporationSlotByParticleId.get(a.id) ?? Number.POSITIVE_INFINITY;
            const slotB = simState.evaporationSlotByParticleId.get(b.id) ?? Number.POSITIVE_INFINITY;
            if (slotA !== slotB) return slotB - slotA;
            return b.id - a.id;
        });

    return risingParticles[0];
};

const startConstrainedEvaporation = (
    particle: Particle,
    simState: SimulationMutableState,
    currentTemp: number,
) => {
    const vibration = getParticleVibration(particle.id, simState.simTime, currentTemp);
    const vibrationVelocity = getParticleVibrationVelocity(particle.id, simState.simTime, currentTemp);

    particle.state = ParticleState.RISING;
    particle.x = particle.homeX + vibration.x;
    particle.y = particle.homeY + vibration.y;
    particle.vx = (vibrationVelocity.vx * 0.45) + ((Math.random() - 0.5) * 6);
    particle.vy = (vibrationVelocity.vy * 0.45) - 14 - (Math.random() * 4);
    simState.evaporationLiftByParticleId.set(particle.id, 0);
};

const releaseConstrainedParticleToGas = (
    particle: Particle,
    simState: SimulationMutableState,
    currentTemp: number,
) => {
    const vibrationVelocity = getParticleVibrationVelocity(particle.id, simState.simTime, currentTemp);

    particle.state = ParticleState.GAS;
    particle.vx = (particle.vx * 0.7) + (vibrationVelocity.vx * 0.2) + ((Math.random() - 0.5) * 12);
    particle.vy = Math.min(particle.vy, -20) + (vibrationVelocity.vy * 0.1) + ((Math.random() - 0.5) * 8);
    simState.evaporationSlotByParticleId.delete(particle.id);
    simState.evaporationLiftByParticleId.delete(particle.id);
};

export const updateParticleSystem = ({
    simState,
    phase,
    detectedPhase,
    element,
    matterRect,
    gasBounds,
    currentTemp,
    dt,
    timeScale,
    effectiveParticleCount,
    scfTransitionProgress,
    boilProgress,
    meltProgress,
    compressionFactor,
    sublimationProgress
}: ParticleUpdateInput): ParticleUpdateOutput => {

    const lastState = simState.lastStableState;
    const isSCFMode = phase === MatterState.SUPERCRITICAL || phase === MatterState.TRANSITION_SCF;
    const isStandardGas = phase === MatterState.GAS || phase === MatterState.BOILING;

    // BOILING LOGIC
    const isBoilingLike = isStandardGas || phase === MatterState.EQUILIBRIUM_BOIL || (isSCFMode && (lastState === MatterState.LIQUID || lastState === MatterState.SOLID || lastState === MatterState.MELTING));
    
    let effectiveBoilProgress = boilProgress;
    if (phase === MatterState.TRANSITION_SCF && lastState !== MatterState.GAS) {
         effectiveBoilProgress = scfTransitionProgress;
    }

    const isEvaporationPhase = phase === MatterState.BOILING || phase === MatterState.EQUILIBRIUM_BOIL;
    const evaporationPathProgress = isEvaporationPhase ? getEvaporationPathProgress(effectiveBoilProgress) : 0;
    const vibrationAmplitude = getParticleVibrationAmplitude(currentTemp);
    const evaporationPackingRadius = PARTICLE_RADIUS + Math.min(1.25, vibrationAmplitude * 0.22);
    const evaporationLayout = isEvaporationPhase
        ? buildEvaporationLayout({
            pathProgress: evaporationPathProgress,
            matterRect,
            meltProgress,
            state: phase,
            effectiveRadius: evaporationPackingRadius,
        })
        : null;

    // --- SUBLIMATION LOGIC (Direct Solid -> Gas) ---
    const isSublimation = phase === MatterState.SUBLIMATION || phase === MatterState.EQUILIBRIUM_SUB;
    
    if (isSublimation) {
        // Target Gas Count proportional to sublimation progress
        const targetGasCount = Math.floor(sublimationProgress * effectiveParticleCount);
        
        // Count active gas + condensing (transitioning back) as "Gas Phase" for population control
        const currentGasCount = simState.particles.filter(p => p.state === ParticleState.GAS || p.state === ParticleState.RISING || p.state === ParticleState.CONDENSING).length;
        
        // 1. Detach (Solid -> Gas)
        if (currentGasCount < targetGasCount) {
             // Find Lowest ID Trapped (Topmost surface particle)
             let candidate: Particle | null = null;
             let minID = 999999;
             for (const p of simState.particles) {
                 if (p.state === ParticleState.TRAPPED) {
                     if (p.id < minID) {
                         minID = p.id;
                         candidate = p;
                     }
                 }
             }
             
             if (candidate) {
                candidate.state = ParticleState.RISING;
                // Burst up with noise
                candidate.vx = (Math.random() - 0.5) * 60; 
                candidate.vy = -60 - Math.random() * 40;
             }
        } 
        // 2. Deposition (Gas -> Solid)
        else if (currentGasCount > targetGasCount) {
             // Find Highest ID Gas (Newest gas particle, corresponding to lowest lattice slot)
             // We prioritize settling particles back into the "gap" just above the solid.
             let candidate: Particle | null = null;
             let maxID = -1;
             
             for (const p of simState.particles) {
                 // Pick from GAS or RISING (free particles)
                 if (p.state === ParticleState.GAS || p.state === ParticleState.RISING) {
                     if (p.id > maxID) {
                         maxID = p.id;
                         candidate = p;
                     }
                 }
             }

             if (candidate) {
                 candidate.state = ParticleState.CONDENSING;
                 candidate.vx *= 0.1;
                 candidate.vy = 50; // Downwards velocity
             }
        }

        // Equilibrium Shuffle
        if (phase === MatterState.EQUILIBRIUM_SUB && Math.random() < 0.05 * timeScale) {
             // Shuffle strictly at the boundary layer
             // Lowest Trapped vs Highest Gas
             let lowestTrapped: Particle | null = null;
             let minID = 999999;
             for (const p of simState.particles) {
                 if (p.state === ParticleState.TRAPPED) {
                     if (p.id < minID) {
                         minID = p.id;
                         lowestTrapped = p;
                     }
                 }
             }

             let highestGas: Particle | null = null;
             let maxID = -1;
             for (const p of simState.particles) {
                 if (p.state === ParticleState.GAS) { // Only swap settled gas
                     if (p.id > maxID) {
                         maxID = p.id;
                         highestGas = p;
                     }
                 }
             }
             
             if (lowestTrapped && highestGas) {
                 // Swap states to simulate dynamic equilibrium
                 lowestTrapped.state = ParticleState.RISING;
                 lowestTrapped.vx = (Math.random() - 0.5) * 30; lowestTrapped.vy = -30;
                 
                 highestGas.state = ParticleState.CONDENSING;
                 highestGas.vx *= 0.1; highestGas.vy = 30;
             }
        }
    } else if (phase === MatterState.EQUILIBRIUM_TRIPLE) {
        // ... (Triple Point Logic) ...
        const targetGasCount = Math.floor(effectiveParticleCount * 0.15);
        const activeGasParticles = simState.particles.filter(p => p.state === ParticleState.GAS || p.state === ParticleState.RISING);
        
        if (activeGasParticles.length < targetGasCount) {
             const trapped = simState.particles.find(p => p.state === ParticleState.TRAPPED);
             if (trapped) {
                trapped.state = ParticleState.RISING;
                trapped.vx = (Math.random() - 0.5) * 50; 
                trapped.vy = -50 - Math.random() * 50;
             }
        } else if (activeGasParticles.length > targetGasCount) {
             const gasCandidate = simState.particles.find(p => p.state === ParticleState.GAS);
             if (gasCandidate) {
                 gasCandidate.state = ParticleState.CONDENSING;
                 gasCandidate.vx *= 0.1;
                 gasCandidate.vy = 50;
             }
        }
        
        if (Math.random() < 0.05 * timeScale) {
             const trapped = simState.particles.find(p => p.state === ParticleState.TRAPPED);
             const gasP = simState.particles.find(p => p.state === ParticleState.GAS);
             if (trapped && gasP) {
                 trapped.state = ParticleState.RISING;
                 trapped.vx = (Math.random() - 0.5) * 40; 
                 trapped.vy = -40;
                 gasP.state = ParticleState.CONDENSING;
                 gasP.vx *= 0.1;
                 gasP.vy = 40;
             }
        }
    } else if (isBoilingLike) {
        if (isEvaporationPhase && evaporationLayout) {
            syncEvaporationSlotAssignments(simState, evaporationLayout);

            const thermoTargetTrapped = effectiveParticleCount - Math.floor(effectiveBoilProgress * effectiveParticleCount);
            const allowedTrapped = Math.min(thermoTargetTrapped, evaporationLayout.capacity);
            let pinnedCoreCount = simState.particles.filter((particle) =>
                particle.state === ParticleState.TRAPPED || particle.state === ParticleState.CONDENSING,
            ).length;

            if (pinnedCoreCount > allowedTrapped) {
                const overTarget = pinnedCoreCount - allowedTrapped;
                const releaseSteps = Math.max(1, Math.min(6, Math.ceil(overTarget * 0.5)));

                for (let step = 0; step < releaseSteps && pinnedCoreCount > allowedTrapped; step += 1) {
                    const condensingCandidate = getWorstPinnedCoreParticle(simState, true);
                    if (condensingCandidate) {
                        startConstrainedEvaporation(condensingCandidate, simState, currentTemp);
                        pinnedCoreCount -= 1;
                        continue;
                    }

                    const trappedCandidate = getWorstPinnedCoreParticle(simState, false);
                    if (!trappedCandidate) break;
                    startConstrainedEvaporation(trappedCandidate, simState, currentTemp);
                    pinnedCoreCount -= 1;
                }
            } else if (pinnedCoreCount < allowedTrapped) {
                const underTarget = allowedTrapped - pinnedCoreCount;
                const condenseSteps = Math.max(1, Math.min(6, Math.ceil(underTarget * 0.5)));

                for (let step = 0; step < condenseSteps && pinnedCoreCount < allowedTrapped; step += 1) {
                    const gasCandidate = simState.particles.find((particle) =>
                        isFreeGasLikeParticle(particle, simState),
                    );
                    if (!gasCandidate) break;

                    gasCandidate.state = ParticleState.CONDENSING;
                    gasCandidate.vx *= 0.3;
                    gasCandidate.vy = Math.max(20, (Math.abs(gasCandidate.vy) * 0.35) + 25);
                    simState.evaporationLiftByParticleId.delete(gasCandidate.id);
                    pinnedCoreCount += 1;
                }
            }

            syncEvaporationSlotAssignments(simState, evaporationLayout);

            const constrainedCount = simState.particles.filter((particle) =>
                isEvaporationSlotOccupant(particle, simState),
            ).length;
            if (constrainedCount > evaporationLayout.capacity) {
                const constrainedRising = getWorstConstrainedRisingParticle(simState);
                if (constrainedRising) {
                    releaseConstrainedParticleToGas(constrainedRising, simState, currentTemp);
                    syncEvaporationSlotAssignments(simState, evaporationLayout);
                }
            }
        } else {
            // Standard Boiling Logic
            const targetGasCount = Math.floor(effectiveBoilProgress * effectiveParticleCount);
            const activeGasParticles = simState.particles.filter(p => p.state === ParticleState.GAS || p.state === ParticleState.RISING);
            
            if (activeGasParticles.length < targetGasCount) {
                const trapped = simState.particles.find(p => p.state === ParticleState.TRAPPED);
                if (trapped) {
                    trapped.state = ParticleState.RISING;
                    trapped.vx = (Math.random() - 0.5) * 50; 
                    trapped.vy = -50 - Math.random() * 50;  
                }
            } else if (activeGasParticles.length > targetGasCount && !isSCFMode) {
                const gasCandidate = simState.particles.find(p => p.state === ParticleState.GAS);
                if (gasCandidate) {
                    gasCandidate.state = ParticleState.CONDENSING;
                    gasCandidate.vx *= 0.1; 
                    gasCandidate.vy = 50; 
                }
            }
        }
    }
    
    // CONDENSING LOGIC FOR SCF->LIQUID
    if (phase === MatterState.TRANSITION_SCF && lastState === MatterState.SUPERCRITICAL && detectedPhase !== MatterState.GAS) {
        const targetTrappedCount = Math.floor((1 - scfTransitionProgress) * effectiveParticleCount);
        const currentTrapped = simState.particles.filter(p => p.state === ParticleState.TRAPPED || p.state === ParticleState.CONDENSING).length;
        
        if (currentTrapped < targetTrappedCount) {
            const candidate = simState.particles.find(p => p.state === ParticleState.GAS);
            if (candidate) {
                candidate.state = ParticleState.CONDENSING;
            }
        }
    }

    if (!isEvaporationPhase || !evaporationLayout) {
        clearEvaporationSlotState(simState);
    }

    // Kinetic Stats
    let currentKineticEnergy = 0; let totalSpeed = 0; let activeParticleCount = 0;
    simState.particles.forEach(p => {
        if (p.state !== ParticleState.TRAPPED) {
            const vSq = p.vx*p.vx + p.vy*p.vy;
            currentKineticEnergy += 0.5 * vSq;
            totalSpeed += Math.sqrt(vSq);
            activeParticleCount++;
        }
    });
    const count = activeParticleCount || 1;
    const currentSimTemp = currentKineticEnergy / count;
    const currentMeanSpeed = totalSpeed / count;
    const massFactor = Math.sqrt(1 / (element.mass || 1)); 
    const targetSimTemp = currentTemp * massFactor * 50; 
    let lambda = 1.0;
    if (currentSimTemp > 0) lambda = Math.sqrt(1 + (targetSimTemp / currentSimTemp - 1) * 0.1);

    // Wall Config
    const wallLeft = gasBounds.minX; const wallRight = gasBounds.maxX;
    const wallTop = gasBounds.minY; const wallBottom = gasBounds.maxY;

    // Reset Settled Flag
    let currentFrameSettled = true;

    // --- MAIN LOOP ---
    simState.particles.forEach((p, i) => {
        const constrainedRising = isEvaporationConstrainedRising(p, simState);
        const freeGasLike = isFreeGasLikeParticle(p, simState);

        // Lattice Home
        const hasEvaporationSlot =
            isEvaporationPhase &&
            !!evaporationLayout &&
            simState.evaporationSlotByParticleId.has(p.id) &&
            isEvaporationSlotOccupant(p, simState);
        
        // FIX: For Sublimation, use static lattice anchored to bottom to prevent squashing
        if (isSublimation) {
             const cellW = INIT_RECT.w / COLS;
             const cellH = INIT_RECT.h / ROWS;
             const col = i % COLS;
             const row = Math.floor(i / COLS);
             
             p.homeX = INIT_RECT.x + (col * cellW) + (cellW / 2);
             // Standard grid is Top-Down. We want Row 0 to be Top.
             // INIT_RECT.y + (row * cellH) places Row 0 at top.
             // Since INIT_RECT height is fixed, and matterRect shrinks "from top", 
              // removing top rows (Low IDs) correctly exposes lower rows which stay in place.
              p.homeY = INIT_RECT.y + (row * cellH) + (cellH / 2);
        } else if (!hasEvaporationSlot) {
            // Standard Squeezing logic for Liquid/Melt
            const squeezeProgress = Math.pow(Math.max(0, Math.min(1, meltProgress)), 0.4); 
            const liquidOffsetY = (20 * squeezeProgress) * compressionFactor; 
            const col = i % COLS;
            const row = Math.floor(i / COLS);
            const standardHomeX = matterRect.x + (col * (matterRect.w / COLS)) + ((matterRect.w / COLS) / 2);
            const standardHomeY = matterRect.y + (row * (matterRect.h / ROWS)) + ((matterRect.h / ROWS) / 2) + liquidOffsetY;
            
            p.homeX = standardHomeX;
            p.homeY = standardHomeY;
        }

        // --- 1. CALCULATE STANDARD NEWTONIAN PHYSICS ---
        let newtonX = p.x;
        let newtonY = p.y;
        
        if (p.state === ParticleState.GAS) {
            p.vx *= lambda; p.vy *= lambda;
        }
        
        if (p.state !== ParticleState.TRAPPED) {
          newtonX += p.vx * dt;
          newtonY += p.vy * dt;
        }

        // Newtonian Wall Collisions
        if (freeGasLike) {
            if (newtonX - p.r < wallLeft) { newtonX = wallLeft + p.r; p.vx = Math.abs(p.vx); }
            if (newtonX + p.r > wallRight) { newtonX = wallRight - p.r; p.vx = -Math.abs(p.vx); }
            if (newtonY - p.r < wallTop) { newtonY = wallTop + p.r; p.vy = Math.abs(p.vy); }
            if (newtonY + p.r > wallBottom) { newtonY = wallBottom - p.r; p.vy = -Math.abs(p.vy); }
        }

        // --- 2. SCF & HYBRID WAVE LOGIC ---
        // (Existing SCF Code Omitted for Brevity - It remains unchanged logic-wise)
        
        if (isSCFMode) {
             const scfRow = Math.floor(p.id / COLS); 
            const scfCol = p.id % COLS;
            const gasW = gasBounds.maxX - gasBounds.minX;
            const gasH = gasBounds.maxY - gasBounds.minY;
            const cellW = gasW / COLS;
            const totalRows = Math.ceil(effectiveParticleCount / COLS);
            const cellH = gasH / totalRows;
            const targetX = gasBounds.minX + (scfCol * cellW) + (cellW / 2);
            const rowBaseY = gasBounds.minY + (scfRow * cellH) + (cellH / 2);
            const frequency = 0.05;
            const speed = 5.0;
            const amplitude = 10;
            const waveOffsetY = Math.sin((targetX * frequency) + (simState.simTime * speed)) * amplitude;
            const scfTargetY = rowBaseY + waveOffsetY;

            if (phase === MatterState.TRANSITION_SCF && lastState === MatterState.GAS) {
                 p.state = ParticleState.GAS;
                 const randomFactor = (p.id * 37) % effectiveParticleCount; 
                 const staggerOffset = (randomFactor / effectiveParticleCount) * 0.6; 
                 const transitionWindow = 0.4; 
                 let localBlend = 0;
                 if (scfTransitionProgress > staggerOffset) {
                      localBlend = (scfTransitionProgress - staggerOffset) / transitionWindow;
                 }
                 localBlend = Math.max(0, Math.min(1, localBlend));
                 p.x = interpolateValue(newtonX, targetX, localBlend);
                 p.y = interpolateValue(newtonY, scfTargetY, localBlend);
                 return;
            }

            if (phase === MatterState.TRANSITION_SCF && lastState !== MatterState.GAS && lastState !== MatterState.SUPERCRITICAL) {
                 if (p.state !== ParticleState.GAS) currentFrameSettled = false;
                 if (p.state === ParticleState.TRAPPED) {
                      p.x = p.homeX; p.y = p.homeY; p.vx = 0; p.vy = 0;
                      return;
                 }
                 if (p.state === ParticleState.RISING) {
                     p.x = newtonX; p.y = newtonY;
                     const distToTarget = Math.abs(p.y - scfTargetY);
                     if (distToTarget < 20 || p.y < wallTop + 50) p.state = ParticleState.GAS; 
                     return;
                 }
                 if (p.state === ParticleState.GAS) {
                     const dx = p.x - targetX; const dy = p.y - scfTargetY;
                     const distSq = dx*dx + dy*dy;
                     if (distSq < 100) { 
                          p.x = targetX + (Math.random() - 0.5) * 2;
                          p.y = scfTargetY + (Math.random() - 0.5) * 2;
                     } else {
                          currentFrameSettled = false;
                          p.x = interpolateValue(p.x, targetX, 0.1);
                          p.y = interpolateValue(p.y, scfTargetY, 0.1);
                     }
                     return;
                 }
            }

            if (phase === MatterState.TRANSITION_SCF && lastState === MatterState.SUPERCRITICAL && detectedPhase !== MatterState.GAS) {
                 if (p.state === ParticleState.TRAPPED) {
                      p.x = p.homeX; p.y = p.homeY; p.vx = 0; p.vy = 0;
                      return;
                 }
                 if (p.state === ParticleState.CONDENSING) {
                     p.vy += 200 * dt; 
                     p.vx += (p.homeX - p.x) * 4 * dt;
                     p.x += p.vx * dt; 
                     p.y += p.vy * dt;
                     
                     if (p.y >= p.homeY - 2) {
                         p.state = ParticleState.TRAPPED;
                         p.x = p.homeX; p.y = p.homeY; p.vx = 0; p.vy = 0;
                     }
                     return;
                 } 
                 p.x = targetX + (Math.random()-0.5)*2;
                 p.y = scfTargetY + (Math.random()-0.5)*2;
                 return;
            }

            if (phase === MatterState.TRANSITION_SCF && lastState === MatterState.SUPERCRITICAL && detectedPhase === MatterState.GAS) {
                 p.state = ParticleState.GAS;
                 const blend = scfTransitionProgress; 
                 p.x = interpolateValue(newtonX, targetX, blend);
                 p.y = interpolateValue(newtonY, scfTargetY, blend);
                 return;
            }

            if (phase === MatterState.SUPERCRITICAL) {
                p.state = ParticleState.GAS;
                const dx = p.x - targetX; const dy = p.y - scfTargetY;
                const distSq = dx*dx + dy*dy;
                if (distSq > 100) {
                     p.x = interpolateValue(p.x, targetX, 0.1);
                     p.y = interpolateValue(p.y, scfTargetY, 0.1);
                } else {
                    p.x = targetX + (Math.random() - 0.5) * 2; 
                    p.y = scfTargetY + (Math.random() - 0.5) * 2;
                }
                p.vx = (Math.random() - 0.5) * 200;
                p.vy = (Math.random() - 0.5) * 200;
                return;
            }
        }
        
        // --- 3. STANDARD PHYSICS UPDATE ---
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
            p.x = p.homeX; p.y = p.homeY; p.vx = 0; p.vy = 0; p.state = ParticleState.TRAPPED;
        }
        
        const MAX_SPEED = 1000;
        p.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, p.vx));
        p.vy = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, p.vy));

        p.x = newtonX;
        p.y = newtonY;

        if (isEvaporationPhase && evaporationLayout && hasEvaporationSlot) {
            const vibration = getParticleVibration(p.id, simState.simTime, currentTemp);
            const vibrationVelocity = getParticleVibrationVelocity(p.id, simState.simTime, currentTemp);

            if (constrainedRising) {
                const previousLift = simState.evaporationLiftByParticleId.get(p.id) ?? 0;
                const liftSpeed = 10 + (Math.sqrt(Math.max(0, currentTemp)) * 0.12);
                const nextLift = previousLift + (liftSpeed * dt);
                simState.evaporationLiftByParticleId.set(p.id, nextLift);

                p.vx = vibrationVelocity.vx * 0.55;
                p.vy = (vibrationVelocity.vy * 0.55) - liftSpeed;
                p.x = p.homeX + vibration.x;
                p.y = p.homeY + vibration.y - nextLift;

                if (p.y <= evaporationLayout.topExitY) {
                    releaseConstrainedParticleToGas(p, simState, currentTemp);
                }
                return;
            }

            if (p.state === ParticleState.CONDENSING) {
                if (p.y < evaporationLayout.topExitY - (p.r * 0.5)) {
                    p.vy = Math.abs(p.vy) + 35;
                }

                const targetX = p.homeX + vibration.x;
                const targetY = p.homeY + vibration.y;
                p.vx += (targetX - p.x) * 10 * dt;
                p.vy += (targetY - p.y) * 8 * dt;
                p.vx *= 0.9;
                p.vy *= 0.9;
                p.x += p.vx * dt;
                p.y += p.vy * dt;

                const dx = targetX - p.x;
                const dy = targetY - p.y;
                const speedSq = (p.vx * p.vx) + (p.vy * p.vy);
                if ((dx * dx) + (dy * dy) < 9 && speedSq < 900) {
                    p.state = ParticleState.TRAPPED;
                    p.x = targetX;
                    p.y = targetY;
                    p.vx = 0;
                    p.vy = 0;
                    simState.evaporationLiftByParticleId.delete(p.id);
                }
                return;
            }
        }

        // Is this phase fundamentally a "Block" phase (S/L/Melt)?
        const isBlockPhase = phase === MatterState.SOLID || 
                             phase === MatterState.LIQUID || 
                             phase === MatterState.MELTING || 
                             phase === MatterState.EQUILIBRIUM_MELT ||
                             phase === MatterState.EQUILIBRIUM_TRIPLE ||
                             phase === MatterState.EQUILIBRIUM_SUB;
        
        if (isBlockPhase && p.state !== ParticleState.TRAPPED) {
            const distSq = (p.x - p.homeX)**2 + (p.y - p.homeY)**2;
            if (distSq > 90000 || p.state === ParticleState.GAS) {
                 if (phase !== MatterState.EQUILIBRIUM_TRIPLE && phase !== MatterState.EQUILIBRIUM_SUB) {
                    p.state = ParticleState.CONDENSING;
                }
            }
        }

        if (p.state === ParticleState.TRAPPED) {
            simState.evaporationLiftByParticleId.delete(p.id);
            p.x = p.homeX; p.y = p.homeY; p.vx = 0; p.vy = 0; return;
        }

        if (p.state === ParticleState.CONDENSING) {
             simState.evaporationLiftByParticleId.delete(p.id);
             p.vy += 300 * dt; 
             const dx = p.homeX - p.x;
             p.vx += dx * 5 * dt;
             p.vx *= 0.98;

             p.x += p.vx * dt; 
             p.y += p.vy * dt;

             if (p.y >= p.homeY - 2) {
                 p.state = ParticleState.TRAPPED;
                 p.x = p.homeX; p.y = p.homeY; p.vx = 0; p.vy = 0;
             }
             return;
        }

        const WORLD_BOUNDS = 2000;
        if (p.x < -WORLD_BOUNDS || p.x > WORLD_BOUNDS || p.y < -WORLD_BOUNDS || p.y > WORLD_BOUNDS) {
             simState.evaporationLiftByParticleId.delete(p.id);
             p.x = p.homeX; p.y = p.homeY; p.vx = 0; p.vy = 0; p.state = ParticleState.CONDENSING;
        }

        if (p.state === ParticleState.RISING && !isEvaporationConstrainedRising(p, simState)) {
            if (p.y < (wallTop + 50) || Math.random() < 0.05 * timeScale) {
                p.state = ParticleState.GAS;
                const burstAngle = Math.random() * Math.PI * 2;
                const burstMag = Math.sqrt(targetSimTemp) * 3.0; 
                p.vx = Math.cos(burstAngle) * burstMag;
                p.vy = Math.sin(burstAngle) * burstMag;
            }
        } 
    });

    simState.areAllParticlesSettled = currentFrameSettled;

    // Collisions
    if (!isSCFMode) {
         const particles = simState.particles;
         for (let i = 0; i < effectiveParticleCount; i++) {
             for (let j = i + 1; j < effectiveParticleCount; j++) {
                 const p1 = particles[i];
                 const p2 = particles[j];
                 if (!isFreeGasLikeParticle(p1, simState)) continue;
                 if (!isFreeGasLikeParticle(p2, simState)) continue;
                 const dx = p2.x - p1.x; const dy = p2.y - p1.y;
                 const distSq = dx*dx + dy*dy;
                 const minDist = p1.r + p2.r;
                 if (distSq < minDist * minDist) {
                     const dist = Math.sqrt(distSq);
                     const nx = dx / dist; const ny = dy / dist;
                     const dvx = p2.vx - p1.vx; const dvy = p2.vy - p1.vy;
                     const velAlongNormal = dvx * nx + dvy * ny;
                     if (velAlongNormal > 0) continue;
                     const jImpulse = -(2) * velAlongNormal / 2;
                     p1.vx -= jImpulse * nx; p1.vy -= jImpulse * ny;
                     p2.vx += jImpulse * nx; p2.vy += jImpulse * ny;
                     const overlap = minDist - dist;
                     if (overlap > 0) {
                         p1.x -= (overlap/2)*nx; p1.y -= (overlap/2)*ny;
                         p2.x += (overlap/2)*nx; p2.y += (overlap/2)*ny;
                     }
                 }
             }
         }
    }

    // --- PATH PROGRESS (VISUAL) ---
    let finalPathProgress = 0;
    
    if (phase === MatterState.SUBLIMATION || phase === MatterState.EQUILIBRIUM_SUB) {
        // FORCE SOLID SHAPE (PATH 0)
        finalPathProgress = 0;
    } else if (phase === MatterState.EQUILIBRIUM_TRIPLE) {
        finalPathProgress = Math.max(0, Math.min(5, meltProgress * 5));
    } else if (phase === MatterState.SOLID || phase === MatterState.MELTING || phase === MatterState.EQUILIBRIUM_MELT) {
        finalPathProgress = Math.max(0, Math.min(5, meltProgress * 5));
    } else if (phase === MatterState.LIQUID) {
        finalPathProgress = 5;
    } else if (phase === MatterState.BOILING || phase === MatterState.EQUILIBRIUM_BOIL) {
        const trappedCount = simState.particles.filter(p => p.state === ParticleState.TRAPPED).length;
        finalPathProgress = evaporationPathProgress;

        if (phase === MatterState.BOILING && trappedCount === 0 && effectiveBoilProgress >= 0.999) {
            finalPathProgress = 10;
        }
    } else if (phase === MatterState.TRANSITION_SCF) {
         if (lastState !== MatterState.GAS && lastState !== MatterState.SUPERCRITICAL) {
            const trappedCount = simState.particles.filter(p => p.state === ParticleState.TRAPPED).length;
            if (trappedCount > 0) {
                 const puddleRatio = trappedCount / effectiveParticleCount;
                 finalPathProgress = 5 + ((1 - puddleRatio) * 4.5);
            } else finalPathProgress = 10;
        } else if (lastState === MatterState.SUPERCRITICAL && detectedPhase !== MatterState.GAS) {
            const trappedCount = simState.particles.filter(p => p.state === ParticleState.TRAPPED).length;
            if (trappedCount > 0) {
                 const puddleRatio = trappedCount / effectiveParticleCount;
                 finalPathProgress = 5 + ((1 - puddleRatio) * 4.5);
            } else finalPathProgress = 10;
        } else {
            finalPathProgress = 10;
        }
        
        if (lastState === MatterState.SUPERCRITICAL && detectedPhase === MatterState.GAS) {
             finalPathProgress = 10; 
        }
    } else {
        finalPathProgress = 10;
    }

    return {
        meanParticleSpeed: currentMeanSpeed,
        pathProgress: finalPathProgress
    };
};
