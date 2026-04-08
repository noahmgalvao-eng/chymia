
import { ChemicalElement, MatterState, Particle, ParticleState, MatterRect, Bounds } from '../../types';
import { ParticleFrameScratch, SimulationMutableState } from './types';
import { interpolateValue } from '../../utils/interpolator';
import { buildEvaporationLayout, getEvaporationPathProgress } from '../../utils/evaporationLayout';
import { forEachSpatialGridPair, insertSpatialGridIndex, resetSpatialGrid } from '../../utils/spatialGrid';

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
const COLLISION_GRID_CELL_SIZE = (PARTICLE_RADIUS * 2) + 1;
const DISTANCE_EPSILON = 1e-6;

const clearArray = <T>(values: T[]) => {
    values.length = 0;
    return values;
};

export const createParticleFrameScratch = (): ParticleFrameScratch => ({
    particleById: new Map(),
    particleIdBySlot: new Map(),
    liquidParticles: [],
    gasParticles: [],
    trappedParticles: [],
    condensingParticles: [],
    liquidParticlesWithoutSlot: [],
    availableRetainedSlotIds: [],
    retainedSlotSet: new Set(),
    claimedSlotSet: new Set(),
    occupiedSlotSet: new Set(),
});

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
        return 5;
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
    const particleCount = simState.particles.length;
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
    simState.layoutCacheKey = evaporationLayout?.key ?? '';
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
        particle.state = ParticleState.RISING;
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
    const normalizeRetainedSlotIds = (slotIds: number[]) => {
        if (!evaporationLayout) return [];

        return [...new Set(
            slotIds.filter((slotId) => slotId >= 0 && slotId < evaporationLayout.capacity),
        )].sort((a, b) => a - b);
    };
    const countOccupiedNeighbors = (slotId: number, occupiedSet: Set<number>) => {
        if (!evaporationLayout) return 0;
        const slot = evaporationLayout.slots[slotId];
        if (!slot) return 0;

        let occupiedNeighbors = 0;
        for (const neighborSlotId of slot.neighborSlotIds) {
            if (occupiedSet.has(neighborSlotId)) {
                occupiedNeighbors += 1;
            }
        }

        return occupiedNeighbors;
    };
    const getDynamicExposedFaces = (slotId: number, occupiedSet: Set<number>) => {
        if (!evaporationLayout) return 0;
        const slot = evaporationLayout.slots[slotId];
        if (!slot) return 0;

        return Math.max(0, 6 - countOccupiedNeighbors(slotId, occupiedSet));
    };
    const syncOccupiedSlotSet = (slotIds: number[]) => {
        const occupiedSet = simState.frameScratch.occupiedSlotSet;
        occupiedSet.clear();

        for (const slotId of slotIds) {
            occupiedSet.add(slotId);
        }

        return occupiedSet;
    };
    const insertRetainedSlot = (slotIds: number[], slotId: number) => (
        normalizeRetainedSlotIds([...slotIds, slotId])
    );
    const removeRetainedSlot = (slotIds: number[], slotId: number) => (
        slotIds.filter((candidate) => candidate !== slotId)
    );
    const chooseEvaporationSlot = (slotIds: number[]) => {
        if (!evaporationLayout || slotIds.length === 0) return null;

        const occupiedSet = syncOccupiedSlotSet(slotIds);
        let bestSlotId: number | null = null;
        let bestScore = Number.NEGATIVE_INFINITY;

        for (const slotId of slotIds) {
            const slot = evaporationLayout.slots[slotId];
            if (!slot) continue;

            const exposedFaces = getDynamicExposedFaces(slotId, occupiedSet);
            if (exposedFaces <= 0) continue;

            const score = (slot.retentionScore * 0.78)
                + ((exposedFaces / 6) * 0.14)
                + (slot.organicBias * 0.08);

            if (
                score > bestScore
                || (score === bestScore && bestSlotId !== null && slotId < bestSlotId)
            ) {
                bestScore = score;
                bestSlotId = slotId;
            }
        }

        return bestSlotId ?? slotIds[slotIds.length - 1] ?? null;
    };
    const chooseCondensationSlot = (slotIds: number[]) => {
        if (!evaporationLayout) return null;

        const occupiedSet = syncOccupiedSlotSet(slotIds);
        let bestSlotId: number | null = null;
        let bestScore = Number.NEGATIVE_INFINITY;

        for (const slot of evaporationLayout.slots) {
            if (occupiedSet.has(slot.index)) continue;

            const occupiedNeighborCount = countOccupiedNeighbors(slot.index, occupiedSet);
            if (occupiedSet.size > 0 && occupiedNeighborCount === 0) continue;

            const enclosureScore = occupiedSet.size === 0
                ? (1 - slot.retentionScore)
                : (occupiedNeighborCount / 6);
            const surfacePenalty = slot.retentionScore;
            const score = (enclosureScore * 0.62)
                + ((1 - surfacePenalty) * 0.28)
                + ((1 - slot.sideExposure) * 0.06)
                + ((1 - slot.organicBias) * 0.04);

            if (
                score > bestScore
                || (score === bestScore && bestSlotId !== null && slot.index < bestSlotId)
            ) {
                bestScore = score;
                bestSlotId = slot.index;
            }
        }

        return bestSlotId;
    };
    const getDirectionalTargetGasCount = (
        progress: number,
        currentPhase: MatterState,
    ) => {
        if (currentPhase === MatterState.LIQUID) return 0;
        if (currentPhase === MatterState.GAS) return particleCount;
        if (progress <= BOIL_DIRECTION_EPSILON) return 0;
        if (progress >= 1 - BOIL_DIRECTION_EPSILON) return particleCount;

        const previousProgress = simState.previousBoilLikeProgress;
        const rawTargetGasCount = progress * particleCount;
        const isRisingProgress = progress > previousProgress + BOIL_DIRECTION_EPSILON;
        const isFallingProgress = progress < previousProgress - BOIL_DIRECTION_EPSILON;

        if (isRisingProgress) {
            return Math.min(particleCount, Math.max(0, Math.ceil(rawTargetGasCount)));
        }
        if (isFallingProgress) {
            return Math.min(particleCount, Math.max(0, Math.floor(rawTargetGasCount)));
        }

        return Math.min(particleCount, Math.max(0, Math.round(rawTargetGasCount)));
    };

    type ParticleFrameIndex = ParticleFrameScratch;

    const buildParticleFrameIndex = (): ParticleFrameIndex => {
        const scratch = simState.frameScratch;
        scratch.particleById.clear();
        scratch.particleIdBySlot.clear();
        clearArray(scratch.liquidParticles);
        clearArray(scratch.gasParticles);
        clearArray(scratch.trappedParticles);
        clearArray(scratch.condensingParticles);
        clearArray(scratch.liquidParticlesWithoutSlot);
        clearArray(scratch.availableRetainedSlotIds);
        scratch.retainedSlotSet.clear();
        scratch.claimedSlotSet.clear();

        for (const particle of simState.particles) {
            scratch.particleById.set(particle.id, particle);

            if (particle.state === ParticleState.TRAPPED) {
                scratch.trappedParticles.push(particle);
                scratch.liquidParticles.push(particle);
            } else if (particle.state === ParticleState.CONDENSING) {
                scratch.condensingParticles.push(particle);
                scratch.liquidParticles.push(particle);
            } else if (particle.state === ParticleState.GAS || particle.state === ParticleState.RISING) {
                scratch.gasParticles.push(particle);
            }
        }

        for (const slotId of retainedSlotIds) {
            scratch.retainedSlotSet.add(slotId);
        }

        for (const [particleId, slotId] of liquidSlotMap.entries()) {
            const particle = scratch.particleById.get(particleId);
            const isLiquidParticle = particle?.state === ParticleState.TRAPPED || particle?.state === ParticleState.CONDENSING;
            if (!particle || !isLiquidParticle || !scratch.retainedSlotSet.has(slotId) || scratch.claimedSlotSet.has(slotId)) {
                continue;
            }

            scratch.claimedSlotSet.add(slotId);
            scratch.particleIdBySlot.set(slotId, particleId);
        }

        for (const particle of scratch.liquidParticles) {
            const slotId = liquidSlotMap.get(particle.id);
            if (slotId === undefined || scratch.particleIdBySlot.get(slotId) !== particle.id) {
                scratch.liquidParticlesWithoutSlot.push(particle);
            }
        }

        for (const slotId of retainedSlotIds) {
            if (!scratch.particleIdBySlot.has(slotId)) {
                scratch.availableRetainedSlotIds.push(slotId);
            }
        }

        simState.activeGasCount = scratch.gasParticles.length;
        return scratch;
    };

    let frameIndex = buildParticleFrameIndex();
    const refreshFrameIndex = () => {
        frameIndex = buildParticleFrameIndex();
        return frameIndex;
    };
    const pruneInvalidLiquidMappings = () => {
        if (!evaporationLayout) {
            liquidSlotMap.clear();
            retainedSlotIds = [];
            refreshFrameIndex();
            return;
        }

        const retainedSet = simState.frameScratch.retainedSlotSet;
        const claimedSlots = simState.frameScratch.claimedSlotSet;
        retainedSet.clear();
        claimedSlots.clear();

        for (const slotId of retainedSlotIds) {
            retainedSet.add(slotId);
        }

        for (const [particleId, slotId] of [...liquidSlotMap.entries()]) {
            const particle = frameIndex.particleById.get(particleId);
            const isLiquidParticle = particle?.state === ParticleState.TRAPPED || particle?.state === ParticleState.CONDENSING;

            if (!particle || !isLiquidParticle || !retainedSet.has(slotId) || claimedSlots.has(slotId)) {
                if (particle) {
                    clearParticleLiquidTarget(particle);
                }
                liquidSlotMap.delete(particleId);
                continue;
            }

            claimedSlots.add(slotId);
        }

        refreshFrameIndex();
    };
    const assignLiquidParticlesToRetainedSlots = () => {
        if (!evaporationLayout) return;

        pruneInvalidLiquidMappings();

        const availableSlots = [...frameIndex.availableRetainedSlotIds];
        for (const particle of frameIndex.liquidParticlesWithoutSlot) {
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

        refreshFrameIndex();
        for (const particle of frameIndex.liquidParticles) {
            const slotId = liquidSlotMap.get(particle.id);
            if (slotId === undefined || frameIndex.particleIdBySlot.get(slotId) !== particle.id) {
                clearParticleLiquidTarget(particle);
                continue;
            }

            setParticleLiquidTargetToSlot(particle, slotId);
        }
    };
    const ensureRetainedSlotCoverage = () => {
        if (!evaporationLayout) return;

        retainedSlotIds = normalizeRetainedSlotIds(retainedSlotIds);
        refreshFrameIndex();

        while (retainedSlotIds.length < Math.min(evaporationLayout.capacity, frameIndex.liquidParticles.length)) {
            const slotId = chooseCondensationSlot(retainedSlotIds);
            if (slotId === null) break;
            retainedSlotIds = insertRetainedSlot(retainedSlotIds, slotId);
        }

        refreshFrameIndex();
        while (retainedSlotIds.length > frameIndex.liquidParticles.length) {
            const removableSlotId = retainedSlotIds.find((slotId) => !frameIndex.particleIdBySlot.has(slotId));
            if (removableSlotId === undefined) break;
            retainedSlotIds = removeRetainedSlot(retainedSlotIds, removableSlotId);
            refreshFrameIndex();
        }

        assignLiquidParticlesToRetainedSlots();
    };
    const getLaunchParametersForSlot = (slotId?: number) => {
        const slot = slotId === undefined || !evaporationLayout
            ? null
            : evaporationLayout.slots[slotId];
        const matterCenterX = matterRect.x + (matterRect.w / 2);
        const normalizedSide = slot
            ? (slot.x - matterCenterX) / Math.max(1, matterRect.w * 0.5)
            : 0;

        return {
            slot,
            edgeBias: normalizedSide * RISING_LATERAL_JITTER,
        };
    };
    const findNearestGasParticleForSlot = (slotId: number) => {
        if (!evaporationLayout) return frameIndex.gasParticles[0] ?? null;

        const slot = evaporationLayout.slots[slotId];
        if (!slot) return frameIndex.gasParticles[0] ?? null;

        let candidate: Particle | null = null;
        let bestDistanceSq = Number.POSITIVE_INFINITY;

        for (const particle of frameIndex.gasParticles) {
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
    const releaseLiquidParticleFromSlot = (requestedSlotId?: number | null) => {
        if (!evaporationLayout) return false;

        refreshFrameIndex();
        const slotId = requestedSlotId ?? chooseEvaporationSlot(retainedSlotIds);
        const particleId = slotId === null || slotId === undefined
            ? undefined
            : frameIndex.particleIdBySlot.get(slotId);
        const candidate = particleId !== undefined
            ? frameIndex.particleById.get(particleId) ?? null
            : frameIndex.liquidParticlesWithoutSlot[0] ?? frameIndex.liquidParticles[0] ?? null;

        if (!candidate) {
            return false;
        }

        const resolvedSlotId = slotId ?? liquidSlotMap.get(candidate.id);
        if (resolvedSlotId !== undefined) {
            retainedSlotIds = removeRetainedSlot(retainedSlotIds, resolvedSlotId);
        }
        liquidSlotMap.delete(candidate.id);

        const { slot, edgeBias } = getLaunchParametersForSlot(resolvedSlotId);
        launchParticleIntoGas(candidate, edgeBias, slot?.x ?? candidate.x, slot?.y ?? candidate.y);
        refreshFrameIndex();
        return true;
    };
    const condenseParticleIntoSlot = (
        particle: Particle,
        slotId: number,
        snapToTrapped = false,
    ) => {
        if (!evaporationLayout) return false;

        if (!retainedSlotIds.includes(slotId)) {
            retainedSlotIds = insertRetainedSlot(retainedSlotIds, slotId);
        }

        liquidSlotMap.set(particle.id, slotId);
        setParticleLiquidTargetToSlot(particle, slotId);

        if (snapToTrapped) {
            particle.state = ParticleState.TRAPPED;
            particle.vx = 0;
            particle.vy = 0;
            particle.x = particle.homeX;
            particle.y = particle.homeY;
        } else {
            particle.state = ParticleState.CONDENSING;
            particle.vx *= 0.2;
            particle.vy = Math.max(80, Math.abs(particle.vy) * 0.35);
        }

        refreshFrameIndex();
        return true;
    };
    const snapAllParticlesToLiquid = () => {
        if (!evaporationLayout) return;

        refreshFrameIndex();
        while (retainedSlotIds.length < Math.min(evaporationLayout.capacity, particleCount)) {
            const slotId = chooseCondensationSlot(retainedSlotIds);
            if (slotId === null) break;
            retainedSlotIds = insertRetainedSlot(retainedSlotIds, slotId);
        }

        assignLiquidParticlesToRetainedSlots();
        refreshFrameIndex();

        while (frameIndex.gasParticles.length > 0) {
            const slotId = frameIndex.availableRetainedSlotIds[0] ?? chooseCondensationSlot(retainedSlotIds);
            if (slotId === undefined || slotId === null) break;

            const candidate = frameIndex.gasParticles[0];
            if (!candidate) break;
            condenseParticleIntoSlot(candidate, slotId, true);
        }

        for (const particle of simState.particles) {
            if (
                particle.state === ParticleState.CONDENSING
                || particle.state === ParticleState.GAS
                || particle.state === ParticleState.RISING
            ) {
                const slotId = liquidSlotMap.get(particle.id);
                if (slotId !== undefined) {
                    setParticleLiquidTargetToSlot(particle, slotId);
                } else {
                    clearParticleLiquidTarget(particle);
                }
                particle.state = ParticleState.TRAPPED;
                particle.vx = 0;
                particle.vy = 0;
                particle.x = particle.homeX;
                particle.y = particle.homeY;
            }
        }

        refreshFrameIndex();
        assignLiquidParticlesToRetainedSlots();
    };
    const releaseAllLiquidParticles = () => {
        if (!evaporationLayout) return;

        refreshFrameIndex();
        while (frameIndex.liquidParticles.length > 0) {
            if (!releaseLiquidParticleFromSlot()) {
                break;
            }
        }

        refreshFrameIndex();
        for (const particle of frameIndex.liquidParticles) {
            liquidSlotMap.delete(particle.id);
            clearParticleLiquidTarget(particle);
            launchParticleIntoGas(particle, 0, particle.x, particle.y);
        }

        retainedSlotIds = [];
        liquidSlotMap.clear();
        simState.particles.forEach(clearParticleLiquidTarget);
        refreshFrameIndex();
    };
    const syncLiquidStateToLayoutCapacity = () => {
        if (!evaporationLayout) {
            liquidSlotMap.clear();
            retainedSlotIds = [];
            simState.particles.forEach(clearParticleLiquidTarget);
            refreshFrameIndex();
            return;
        }

        ensureRetainedSlotCoverage();
        refreshFrameIndex();

        while (frameIndex.liquidParticles.length > evaporationLayout.capacity) {
            if (!releaseLiquidParticleFromSlot()) {
                break;
            }
        }

        ensureRetainedSlotCoverage();
    };

    syncLiquidStateToLayoutCapacity();

    // --- SUBLIMATION LOGIC (Direct Solid -> Gas) ---
    const isSublimation = phase === MatterState.SUBLIMATION || phase === MatterState.EQUILIBRIUM_SUB;
    
    if (isSublimation) {
        // Target Gas Count proportional to sublimation progress
        const targetGasCount = Math.floor(sublimationProgress * particleCount);
        
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
        const targetGasCount = Math.floor(particleCount * 0.15);
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
        const targetGasCount = getDirectionalTargetGasCount(effectiveBoilProgress, phase);

        if (targetGasCount === particleCount) {
            releaseAllLiquidParticles();
        } else if (targetGasCount === 0) {
            snapAllParticlesToLiquid();
        } else {
            ensureRetainedSlotCoverage();
            refreshFrameIndex();

            while (frameIndex.gasParticles.length < targetGasCount) {
                if (!releaseLiquidParticleFromSlot()) {
                    break;
                }
            }

            ensureRetainedSlotCoverage();
            refreshFrameIndex();

            while (frameIndex.gasParticles.length > targetGasCount) {
                let slotId = frameIndex.availableRetainedSlotIds[0];
                if (slotId === undefined) {
                    const nextSlotId = chooseCondensationSlot(retainedSlotIds);
                    if (nextSlotId === null) break;
                    retainedSlotIds = insertRetainedSlot(retainedSlotIds, nextSlotId);
                    refreshFrameIndex();
                    slotId = nextSlotId;
                }

                const candidate = findNearestGasParticleForSlot(slotId);
                if (!candidate) {
                    break;
                }

                condenseParticleIntoSlot(candidate, slotId);
            }

            assignLiquidParticlesToRetainedSlots();
        }
    } else if (isBoilingLike) {
        const targetGasCount = getDirectionalTargetGasCount(effectiveBoilProgress, phase);
        let gasCount = frameIndex.gasParticles.length;

        while (gasCount < targetGasCount) {
            const trapped = simState.particles.find((particle) => particle.state === ParticleState.TRAPPED);
            if (!trapped) {
                break;
            }

            launchParticleIntoGas(trapped, 0, trapped.homeX, trapped.homeY);
            gasCount += 1;
        }

        while (gasCount > targetGasCount && !isSCFMode) {
            const gasCandidate = simState.particles.find(
                (particle) => particle.state === ParticleState.GAS || particle.state === ParticleState.RISING,
            );
            if (!gasCandidate) {
                break;
            }

            gasCandidate.state = ParticleState.CONDENSING;
            gasCandidate.vx *= 0.2;
            gasCandidate.vy = Math.max(80, Math.abs(gasCandidate.vy) * 0.35);
            gasCount -= 1;
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
    const initCellW = INIT_RECT.w / COLS;
    const initCellH = INIT_RECT.h / ROWS;
    const squeezeProgress = Math.pow(Math.max(0, Math.min(1, meltProgress)), 0.4);
    const liquidOffsetY = (20 * squeezeProgress) * compressionFactor;
    const matterCellW = matterRect.w / COLS;
    const matterCellH = matterRect.h / ROWS;
    const scfGasW = gasBounds.maxX - gasBounds.minX;
    const scfGasH = gasBounds.maxY - gasBounds.minY;
    const scfCellW = scfGasW / COLS;
    const scfTotalRows = Math.ceil(particleCount / COLS);
    const scfCellH = scfGasH / scfTotalRows;
    const scfWaveTime = simState.simTime * 5.0;
    const isBlockPhase = phase === MatterState.SOLID
        || phase === MatterState.LIQUID
        || phase === MatterState.MELTING
        || phase === MatterState.EQUILIBRIUM_MELT
        || phase === MatterState.EQUILIBRIUM_TRIPLE
        || phase === MatterState.EQUILIBRIUM_SUB;

    // Reset Settled Flag
    let currentFrameSettled = true;

    // --- MAIN LOOP ---
    simState.particles.forEach((p, i) => {
        // Lattice Home
        const assignedLiquidSlotId = evaporationLayout ? liquidSlotMap.get(p.id) : undefined;

        // FIX: For Sublimation, use static lattice anchored to bottom to prevent squashing
        if (isSublimation) {
             const col = i % COLS;
             const row = Math.floor(i / COLS);
             
             p.homeX = INIT_RECT.x + (col * initCellW) + (initCellW / 2);
             // Standard grid is Top-Down. We want Row 0 to be Top.
             // INIT_RECT.y + (row * cellH) places Row 0 at top.
             // Since INIT_RECT height is fixed, and matterRect shrinks "from top", 
             // removing top rows (Low IDs) correctly exposes lower rows which stay in place.
             p.homeY = INIT_RECT.y + (row * initCellH) + (initCellH / 2);
        } else if (assignedLiquidSlotId !== undefined && evaporationLayout && liquidSlotHomesEnabled) {
            const slot = evaporationLayout.slots[assignedLiquidSlotId];
            if (slot) {
                p.homeX = slot.x;
                p.homeY = slot.y;
            }
        } else {
            // Standard Squeezing logic for Liquid/Melt
            const col = i % COLS;
            const row = Math.floor(i / COLS);
            const standardHomeX = matterRect.x + (col * matterCellW) + (matterCellW / 2);
            const standardHomeY = matterRect.y + (row * matterCellH) + (matterCellH / 2) + liquidOffsetY;
            
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
            const targetX = gasBounds.minX + (scfCol * scfCellW) + (scfCellW / 2);
            const rowBaseY = gasBounds.minY + (scfRow * scfCellH) + (scfCellH / 2);
            const frequency = 0.05;
            const amplitude = 10;
            const waveOffsetY = Math.sin((targetX * frequency) + scfWaveTime) * amplitude;
            const scfTargetY = rowBaseY + waveOffsetY;

            if (phase === MatterState.TRANSITION_SCF && lastState === MatterState.GAS) {
                 p.state = ParticleState.GAS;
                 const randomFactor = (p.id * 37) % particleCount; 
                 const staggerOffset = (randomFactor / particleCount) * 0.6; 
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
    refreshFrameIndex();

    // Collisions
    if (!isSCFMode) {
        const particles = frameIndex.gasParticles;
        const collisionGrid = simState.collisionGrid;
        resetSpatialGrid(collisionGrid, COLLISION_GRID_CELL_SIZE);

        for (let index = 0; index < particles.length; index += 1) {
            const particle = particles[index];
            insertSpatialGridIndex(collisionGrid, index, particle.x, particle.y);
        }

        forEachSpatialGridPair(collisionGrid, (firstIndex, secondIndex) => {
            const p1 = particles[firstIndex];
            const p2 = particles[secondIndex];
            if (!p1 || !p2) return;

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const minDist = p1.r + p2.r;
            const minDistSq = minDist * minDist;
            const distSq = (dx * dx) + (dy * dy);
            if (distSq >= minDistSq) return;

            let nx = 1;
            let ny = 0;
            let dist = Math.sqrt(distSq);

            if (dist > DISTANCE_EPSILON) {
                nx = dx / dist;
                ny = dy / dist;
            } else {
                const seed = (p1.id * 92821) + (p2.id * 68917);
                const angle = (seed % 360) * (Math.PI / 180);
                nx = Math.cos(angle);
                ny = Math.sin(angle);
                dist = 0;
            }

            const dvx = p2.vx - p1.vx;
            const dvy = p2.vy - p1.vy;
            const velAlongNormal = (dvx * nx) + (dvy * ny);
            if (velAlongNormal > 0) return;

            const impulse = -velAlongNormal;
            p1.vx -= impulse * nx;
            p1.vy -= impulse * ny;
            p2.vx += impulse * nx;
            p2.vy += impulse * ny;

            const overlap = minDist - dist;
            if (overlap <= 0) return;

            const correction = overlap / 2;
            p1.x -= correction * nx;
            p1.y -= correction * ny;
            p2.x += correction * nx;
            p2.y += correction * ny;
        });
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
