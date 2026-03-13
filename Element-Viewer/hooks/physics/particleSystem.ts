
import { ChemicalElement, MatterState, Particle, ParticleState, MatterRect, Bounds } from '../../types';
import { SimulationMutableState } from './types';
import { interpolateValue } from '../../utils/interpolator';
import { buildEvaporationLayout, getEvaporationPathProgress } from '../../utils/evaporationLayout';

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
const BOIL_DIRECTION_EPSILON = 1e-4;
const RISING_LATERAL_JITTER = 35;
const RISING_VERTICAL_BASE = 110;
const RISING_VERTICAL_JITTER = 60;
const CONDENSING_ACCELERATION = 420;
const CONDENSING_PULL = 8;
const CONDENSING_DAMPING = 0.96;

const isLiquidSyncTransition = (
    phase: MatterState,
    lastState: MatterState,
    detectedPhase: MatterState,
) => phase === MatterState.TRANSITION_SCF && (
    (lastState !== MatterState.GAS && lastState !== MatterState.SUPERCRITICAL)
    || (lastState === MatterState.SUPERCRITICAL && detectedPhase !== MatterState.GAS)
);

const isLiquidLayoutPreparationPhase = (phase: MatterState) => (
    phase === MatterState.MELTING || phase === MatterState.EQUILIBRIUM_MELT
);

const shouldUseLiquidSlotHomes = (
    phase: MatterState,
    lastState: MatterState,
    detectedPhase: MatterState,
) => (
    phase === MatterState.LIQUID
    || phase === MatterState.BOILING
    || phase === MatterState.EQUILIBRIUM_BOIL
    || isLiquidSyncTransition(phase, lastState, detectedPhase)
);

const getTargetPathProgress = (
    phase: MatterState,
    detectedPhase: MatterState,
    lastState: MatterState,
    meltProgress: number,
    boilProgress: number,
    scfTransitionProgress: number,
) => {
    if (phase === MatterState.SUBLIMATION || phase === MatterState.EQUILIBRIUM_SUB) {
        return 0;
    }

    if (phase === MatterState.EQUILIBRIUM_TRIPLE) {
        return Math.max(0, Math.min(5, meltProgress * 5));
    }

    if (
        phase === MatterState.SOLID
        || phase === MatterState.MELTING
        || phase === MatterState.EQUILIBRIUM_MELT
    ) {
        return Math.max(0, Math.min(5, meltProgress * 5));
    }

    if (phase === MatterState.LIQUID) {
        return 5;
    }

    if (phase === MatterState.BOILING || phase === MatterState.EQUILIBRIUM_BOIL) {
        return getEvaporationPathProgress(boilProgress);
    }

    if (isLiquidSyncTransition(phase, lastState, detectedPhase)) {
        return getEvaporationPathProgress(scfTransitionProgress);
    }

    return 10;
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

    const targetPathProgress = getTargetPathProgress(
        phase,
        detectedPhase,
        lastState,
        meltProgress,
        effectiveBoilProgress,
        scfTransitionProgress,
    );
    const isPreparingLiquidLayout = isLiquidLayoutPreparationPhase(phase);
    const usesEvaporationLayout = (
        isPreparingLiquidLayout
        || phase === MatterState.LIQUID
        || phase === MatterState.BOILING
        || phase === MatterState.EQUILIBRIUM_BOIL
        || isLiquidSyncTransition(phase, lastState, detectedPhase)
    );
    const liquidSlotHomesEnabled = shouldUseLiquidSlotHomes(phase, lastState, detectedPhase);
    const evaporationLayoutPathProgress = isPreparingLiquidLayout ? 5 : targetPathProgress;
    const evaporationLayout = usesEvaporationLayout
        ? buildEvaporationLayout({
            pathProgress: evaporationLayoutPathProgress,
            matterRect,
            meltProgress,
            state: phase,
            effectiveRadius: PARTICLE_RADIUS,
        })
        : null;
    const clearParticleLiquidTarget = (particle: Particle) => {
        particle.liquidTargetX = undefined;
        particle.liquidTargetY = undefined;
    };
    const getGasLaunchY = (preferredY?: number) => {
        const surfaceY = evaporationLayout?.topExitY ?? matterRect.y;
        const candidateY = Math.min(preferredY ?? surfaceY, surfaceY) - (PARTICLE_RADIUS * 0.35);
        return Math.max(
            gasBounds.minY + PARTICLE_RADIUS,
            Math.min(gasBounds.maxY - PARTICLE_RADIUS, candidateY),
        );
    };
    const launchParticleIntoGas = (
        particle: Particle,
        edgeBias = 0,
        preferredX?: number,
        preferredY?: number,
    ) => {
        clearParticleLiquidTarget(particle);
        particle.state = ParticleState.GAS;
        particle.x = Math.max(
            gasBounds.minX + particle.r,
            Math.min(gasBounds.maxX - particle.r, preferredX ?? particle.x),
        );
        particle.y = getGasLaunchY(preferredY);
        particle.vx = edgeBias + ((Math.random() * 2 - 1) * RISING_LATERAL_JITTER);
        particle.vy = -RISING_VERTICAL_BASE - (Math.random() * RISING_VERTICAL_JITTER);
    };
    const setParticleLiquidTargetToSlot = (particle: Particle, slotId: number) => {
        if (!evaporationLayout) return;
        const slot = evaporationLayout.slots[slotId];
        if (!slot) {
            clearParticleLiquidTarget(particle);
            return;
        }

        particle.liquidTargetX = slot.x;
        particle.liquidTargetY = slot.y;

        if (liquidSlotHomesEnabled || particle.state === ParticleState.CONDENSING) {
            particle.homeX = slot.x;
            particle.homeY = slot.y;
        }
    };
    const liquidSlotMap = simState.slotByParticleId;
    let retainedSlotIds = evaporationLayout
        ? simState.previousRetainedSlotIds
            .filter((slotId) => slotId >= 0 && slotId < evaporationLayout.capacity)
            .sort((a, b) => a - b)
        : [];

    const getLiquidParticles = () => simState.particles.filter(
        (particle) => particle.state === ParticleState.TRAPPED || particle.state === ParticleState.CONDENSING,
    );
    const getGasParticles = () => simState.particles.filter(
        (particle) => particle.state === ParticleState.GAS || particle.state === ParticleState.RISING,
    );
    const reconcileLiquidAssignments = () => {
        if (!evaporationLayout) {
            liquidSlotMap.clear();
            retainedSlotIds = [];
            return;
        }

        const liquidParticles = getLiquidParticles();
        const retainedSet = new Set(retainedSlotIds);

        for (const [particleId, slotId] of liquidSlotMap.entries()) {
            const particle = simState.particles.find((candidate) => candidate.id === particleId);
            const isLiquidParticle = particle?.state === ParticleState.TRAPPED || particle?.state === ParticleState.CONDENSING;
            if (!isLiquidParticle || !retainedSet.has(slotId)) {
                if (particle) {
                    clearParticleLiquidTarget(particle);
                }
                liquidSlotMap.delete(particleId);
            }
        }

        const occupiedSlots = new Set<number>();
        for (const particle of liquidParticles) {
            const assignedSlot = liquidSlotMap.get(particle.id);
            if (assignedSlot === undefined || !retainedSet.has(assignedSlot) || occupiedSlots.has(assignedSlot)) {
                clearParticleLiquidTarget(particle);
                liquidSlotMap.delete(particle.id);
                continue;
            }
            occupiedSlots.add(assignedSlot);
            setParticleLiquidTargetToSlot(particle, assignedSlot);
        }

        const availableSlots = retainedSlotIds.filter((slotId) => !occupiedSlots.has(slotId));
        const unassignedParticles = liquidParticles.filter((particle) => !liquidSlotMap.has(particle.id));

        for (const particle of unassignedParticles) {
            if (availableSlots.length === 0) break;

            let nearestIndex = 0;
            let nearestDistanceSq = Number.POSITIVE_INFINITY;
            const anchorX = particle.state === ParticleState.CONDENSING ? particle.x : particle.homeX;
            const anchorY = particle.state === ParticleState.CONDENSING ? particle.y : particle.homeY;

            for (let index = 0; index < availableSlots.length; index += 1) {
                const slotId = availableSlots[index];
                const slot = evaporationLayout.slots[slotId];
                if (!slot) continue;

                const dx = slot.x - anchorX;
                const dy = slot.y - anchorY;
                const distanceSq = (dx * dx) + (dy * dy);
                if (distanceSq < nearestDistanceSq) {
                    nearestDistanceSq = distanceSq;
                    nearestIndex = index;
                }
            }

            const [slotId] = availableSlots.splice(nearestIndex, 1);
            liquidSlotMap.set(particle.id, slotId);
            setParticleLiquidTargetToSlot(particle, slotId);
        }

        for (const particle of liquidParticles) {
            if (!liquidSlotMap.has(particle.id)) {
                clearParticleLiquidTarget(particle);
            }
        }
    };
    const syncRetainedSlotsToLiquidCount = () => {
        if (!evaporationLayout) {
            retainedSlotIds = [];
            liquidSlotMap.clear();
            return;
        }

        const liquidCount = Math.min(evaporationLayout.capacity, getLiquidParticles().length);
        if (retainedSlotIds.length > liquidCount) {
            retainedSlotIds = retainedSlotIds.slice(0, liquidCount);
        }
        while (retainedSlotIds.length < liquidCount) {
            retainedSlotIds.push(retainedSlotIds.length);
        }
        reconcileLiquidAssignments();
    };
    const findLiquidParticleInSlot = (slotId: number) => {
        let fallback: Particle | null = null;

        for (const particle of simState.particles) {
            if (liquidSlotMap.get(particle.id) !== slotId) continue;
            if (particle.state === ParticleState.TRAPPED) return particle;
            if (!fallback && particle.state === ParticleState.CONDENSING) {
                fallback = particle;
            }
        }

        return fallback;
    };
    const findNearestGasParticle = (slotId: number) => {
        if (!evaporationLayout) return null;
        const slot = evaporationLayout.slots[slotId];
        if (!slot) return null;

        let candidate: Particle | null = null;
        let bestDistanceSq = Number.POSITIVE_INFINITY;

        for (const particle of simState.particles) {
            if (particle.state !== ParticleState.GAS && particle.state !== ParticleState.RISING) continue;

            const dx = slot.x - particle.x;
            const dy = slot.y - particle.y;
            const distanceSq = (dx * dx) + (dy * dy);
            if (
                distanceSq < bestDistanceSq
                || (distanceSq === bestDistanceSq && candidate && particle.id < candidate.id)
            ) {
                bestDistanceSq = distanceSq;
                candidate = particle;
            }
        }

        return candidate;
    };

    if (evaporationLayout) {
        syncRetainedSlotsToLiquidCount();
    } else {
        liquidSlotMap.clear();
        retainedSlotIds = [];
        simState.particles.forEach(clearParticleLiquidTarget);
    }

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
    } else if (evaporationLayout) {
        const currentGasCount = getGasParticles().length;
        let targetGasCount = 0;

        if (phase !== MatterState.LIQUID) {
            const previousProgress = simState.previousBoilLikeProgress;
            const rawTargetGasCount = effectiveBoilProgress * effectiveParticleCount;
            const isRisingProgress = effectiveBoilProgress > previousProgress + BOIL_DIRECTION_EPSILON;
            const isFallingProgress = effectiveBoilProgress < previousProgress - BOIL_DIRECTION_EPSILON;

            if (isRisingProgress) {
                targetGasCount = Math.ceil(rawTargetGasCount);
            } else if (isFallingProgress) {
                targetGasCount = Math.floor(rawTargetGasCount);
            } else {
                targetGasCount = Math.round(rawTargetGasCount);
            }
        }

        targetGasCount = Math.max(0, Math.min(effectiveParticleCount, targetGasCount));
        const targetRetainedCount = Math.max(
            0,
            Math.min(evaporationLayout.capacity, effectiveParticleCount - targetGasCount),
        );

        if (currentGasCount < targetGasCount && retainedSlotIds.length > targetRetainedCount && retainedSlotIds.length > 0) {
            const slotId = retainedSlotIds[retainedSlotIds.length - 1];
            const candidate = findLiquidParticleInSlot(slotId);

            if (candidate) {
                const slot = evaporationLayout.slots[slotId];
                const matterCenterX = matterRect.x + (matterRect.w / 2);
                const normalizedSide = slot
                    ? (slot.x - matterCenterX) / Math.max(1, matterRect.w * 0.5)
                    : 0;
                const edgeBias = normalizedSide * RISING_LATERAL_JITTER;

                retainedSlotIds = retainedSlotIds.slice(0, -1);
                liquidSlotMap.delete(candidate.id);
                launchParticleIntoGas(candidate, edgeBias, slot?.x ?? candidate.x, slot?.y ?? candidate.y);
            }
        } else if (currentGasCount > targetGasCount && retainedSlotIds.length < targetRetainedCount) {
            const slotId = retainedSlotIds.length;
            const candidate = findNearestGasParticle(slotId);

            if (candidate) {
                retainedSlotIds = [...retainedSlotIds, slotId];
                liquidSlotMap.set(candidate.id, slotId);
                setParticleLiquidTargetToSlot(candidate, slotId);
                candidate.state = ParticleState.CONDENSING;
                candidate.vx *= 0.2;
                candidate.vy = Math.max(80, Math.abs(candidate.vy) * 0.35);
            }
        }

        reconcileLiquidAssignments();
    } else if (isBoilingLike) {
        const targetGasCount = Math.floor(effectiveBoilProgress * effectiveParticleCount);
        const activeGasParticles = getGasParticles();

        if (activeGasParticles.length < targetGasCount) {
            const trapped = simState.particles.find((particle) => particle.state === ParticleState.TRAPPED);
            if (trapped) {
                launchParticleIntoGas(trapped, 0, trapped.homeX, trapped.homeY);
            }
        } else if (activeGasParticles.length > targetGasCount && !isSCFMode) {
            const gasCandidate = simState.particles.find((particle) => particle.state === ParticleState.GAS);
            if (gasCandidate) {
                gasCandidate.state = ParticleState.CONDENSING;
                gasCandidate.vx *= 0.2;
                gasCandidate.vy = Math.max(80, Math.abs(gasCandidate.vy) * 0.35);
            }
        }
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
        // Lattice Home
        const assignedLiquidSlotId = evaporationLayout ? liquidSlotMap.get(p.id) : undefined;

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
        } else if (assignedLiquidSlotId !== undefined && evaporationLayout && liquidSlotHomesEnabled) {
            const slot = evaporationLayout.slots[assignedLiquidSlotId];
            if (slot) {
                p.homeX = slot.x;
                p.homeY = slot.y;
            }
        } else {
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
        if (p.state === ParticleState.GAS || p.state === ParticleState.RISING) {
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
                     p.x = newtonX;
                     p.y = newtonY;
                     return;
                 }
            }

            if (phase === MatterState.TRANSITION_SCF && lastState === MatterState.SUPERCRITICAL && detectedPhase !== MatterState.GAS) {
                 if (p.state === ParticleState.TRAPPED) {
                      p.x = p.homeX; p.y = p.homeY; p.vx = 0; p.vy = 0;
                      return;
                 }
                 if (p.state === ParticleState.CONDENSING) {
                     p.vy += CONDENSING_ACCELERATION * dt;
                     p.vx += (p.homeX - p.x) * CONDENSING_PULL * dt;
                     p.vx *= CONDENSING_DAMPING;
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

        // Is this phase fundamentally a "Block" phase (S/L/Melt)?
        const isBlockPhase = phase === MatterState.SOLID || 
                             phase === MatterState.LIQUID || 
                             phase === MatterState.MELTING || 
                             phase === MatterState.EQUILIBRIUM_MELT ||
                             phase === MatterState.EQUILIBRIUM_TRIPLE ||
                             phase === MatterState.EQUILIBRIUM_SUB;
        
        if (isBlockPhase && p.state !== ParticleState.TRAPPED) {
            const distSq = (p.x - p.homeX)**2 + (p.y - p.homeY)**2;
            const shouldForceCondense = evaporationLayout
                ? assignedLiquidSlotId !== undefined
                : (distSq > 90000 || p.state === ParticleState.GAS);

            if (shouldForceCondense) {
                 if (phase !== MatterState.EQUILIBRIUM_TRIPLE && phase !== MatterState.EQUILIBRIUM_SUB) {
                    p.state = ParticleState.CONDENSING;
                }
            }
        }

        if (p.state === ParticleState.TRAPPED) {
            p.x = p.homeX; p.y = p.homeY; p.vx = 0; p.vy = 0; return;
        }

        if (p.state === ParticleState.CONDENSING) {
             p.vy += CONDENSING_ACCELERATION * dt; 
             const dx = p.homeX - p.x;
             p.vx += dx * CONDENSING_PULL * dt;
             p.vx *= CONDENSING_DAMPING;

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
             p.x = p.homeX; p.y = p.homeY; p.vx = 0; p.vy = 0; p.state = ParticleState.CONDENSING;
        }

        if (p.state === ParticleState.RISING) {
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
                 if (p1.state !== ParticleState.GAS && p1.state !== ParticleState.RISING) continue;
                 if (p2.state !== ParticleState.GAS && p2.state !== ParticleState.RISING) continue;
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

    simState.previousRetainedSlotIds = [...retainedSlotIds];

    if (phase === MatterState.LIQUID) {
        simState.previousBoilLikeProgress = 0;
    } else if (
        phase === MatterState.BOILING
        || phase === MatterState.EQUILIBRIUM_BOIL
        || isLiquidSyncTransition(phase, lastState, detectedPhase)
    ) {
        simState.previousBoilLikeProgress = effectiveBoilProgress;
    } else if (phase === MatterState.GAS || phase === MatterState.SUPERCRITICAL) {
        simState.previousBoilLikeProgress = 1;
    } else {
        simState.previousBoilLikeProgress = 0;
    }

    let finalPathProgress = targetPathProgress;
    if (
        phase === MatterState.TRANSITION_SCF
        && lastState === MatterState.SUPERCRITICAL
        && detectedPhase !== MatterState.GAS
        && retainedSlotIds.length === 0
    ) {
        finalPathProgress = 10;
    }

    return {
        meanParticleSpeed: currentMeanSpeed,
        pathProgress: finalPathProgress
    };
};
