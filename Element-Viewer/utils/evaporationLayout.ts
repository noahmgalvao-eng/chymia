import { MATTER_PATH_FRAMES } from '../data/elements';
import { MatterRect, MatterState } from '../types';
import { interpolatePath } from './interpolator';

const PATH_NUMBER_REGEX = /[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g;
const HEX_VERTICAL_FACTOR = Math.sqrt(3) / 2;
const PERIMETER_ANGLES = Array.from({ length: 8 }, (_, index) => (Math.PI / 4) * index);
const MAX_LAYOUT_CACHE_ENTRIES = 64;
const MAX_PATH_CACHE_ENTRIES = 128;
const NEIGHBOR_DISTANCE_FACTOR = 1.18;
const HEX_NEIGHBOR_COUNT = 6;
const VISIBLE_PATH_PRECISION = 0.01;
const INTERNAL_LAYOUT_PATH_PRECISION = 0.1;
const INTERNAL_LAYOUT_SCALE_PRECISION = 0.01;

let sharedCanvasContext: CanvasRenderingContext2D | null | undefined;
const evaporationLayoutCache = new Map<string, EvaporationLayout>();
const matterPathCache = new Map<string, string>();
const matterPathBoundsCache = new Map<string, ReturnType<typeof getPathBounds>>();
const matterPathShapeCache = new Map<string, Path2D>();

export interface MatterRenderTransform {
    scaleX: number;
    scaleY: number;
    centerX: number;
    centerY: number;
}

export interface ParticleVibration {
    x: number;
    y: number;
    amplitude: number;
}

export interface ParticleVibrationVelocity {
    vx: number;
    vy: number;
}

export interface EvaporationLayoutSlot {
    index: number;
    x: number;
    y: number;
    retentionScore: number;
    topExposure: number;
    sideExposure: number;
    organicBias: number;
    neighborSlotIds: number[];
    boundaryFaceCount: number;
}

export interface EvaporationLayout {
    key: string;
    pathProgress: number;
    currentPath: string;
    slots: EvaporationLayoutSlot[];
    capacity: number;
    topExitY: number;
}

interface BuildEvaporationLayoutInput {
    pathProgress: number;
    matterRect: MatterRect;
    meltProgress: number;
    state: MatterState;
    effectiveRadius: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const fract = (value: number) => value - Math.floor(value);
const quantize = (value: number, precision: number) => (
    Math.round(value / precision) * precision
);

const getOrganicBias = (index: number) => fract(Math.sin((index + 1) * 91.345) * 47453.5453);

const getCanvasContext = () => {
    if (typeof document === 'undefined') return null;
    if (sharedCanvasContext !== undefined) return sharedCanvasContext;

    const canvas = document.createElement('canvas');
    sharedCanvasContext = canvas.getContext('2d');
    return sharedCanvasContext;
};

const ensureMapLimit = <T>(cache: Map<string, T>, maxEntries: number) => {
    while (cache.size > maxEntries) {
        const firstKey = cache.keys().next().value;
        if (!firstKey) break;
        cache.delete(firstKey);
    }
};

const ensureLayoutCacheLimit = () => ensureMapLimit(evaporationLayoutCache, MAX_LAYOUT_CACHE_ENTRIES);
const ensurePathCacheLimit = () => {
    ensureMapLimit(matterPathCache, MAX_PATH_CACHE_ENTRIES);
    ensureMapLimit(matterPathBoundsCache, MAX_PATH_CACHE_ENTRIES);
    ensureMapLimit(matterPathShapeCache, MAX_PATH_CACHE_ENTRIES);
};

const getPathBounds = (path: string) => {
    const numericTokens = path.match(PATH_NUMBER_REGEX);
    const coordinates = numericTokens ? numericTokens.map((value) => Number(value)) : [];

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < coordinates.length - 1; index += 2) {
        const x = coordinates[index];
        const y = coordinates[index + 1];
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
        return null;
    }

    return { minX, maxX, minY, maxY };
};

const circleFitsInPath = (
    ctx: CanvasRenderingContext2D,
    path: Path2D,
    localX: number,
    localY: number,
    radiusX: number,
    radiusY: number,
) => {
    if (!ctx.isPointInPath(path, localX, localY)) return false;

    for (const angle of PERIMETER_ANGLES) {
        const testX = localX + (Math.cos(angle) * radiusX);
        const testY = localY + (Math.sin(angle) * radiusY);
        if (!ctx.isPointInPath(path, testX, testY)) {
            return false;
        }
    }

    return true;
};

export const getMatterPathFromProgress = (
    pathProgress: number,
    precision = VISIBLE_PATH_PRECISION,
) => {
    const quantizedProgress = quantize(pathProgress, precision);
    const cacheKey = `${precision}:${quantizedProgress.toFixed(precision >= 0.1 ? 1 : 2)}`;
    const cachedPath = matterPathCache.get(cacheKey);
    if (cachedPath) {
        return cachedPath;
    }

    const frameIndex = Math.min(Math.floor(quantizedProgress), MATTER_PATH_FRAMES.length - 2);
    const nextFrameIndex = frameIndex + 1;
    const progressInFrame = quantizedProgress - frameIndex;

    const d1 = MATTER_PATH_FRAMES[frameIndex];
    const d2 = MATTER_PATH_FRAMES[nextFrameIndex];

    if (!d1 || !d2) return MATTER_PATH_FRAMES[0];
    const interpolatedPath = interpolatePath(d1, d2, progressInFrame);
    matterPathCache.set(cacheKey, interpolatedPath);
    ensurePathCacheLimit();
    return interpolatedPath;
};

export const getMatterRenderTransform = (
    matterRect: MatterRect,
    meltProgress: number,
    state: MatterState,
): MatterRenderTransform => {
    let refWidth = 120 + (180 * meltProgress);
    let refHeight = 120 - (70 * meltProgress);

    if (state === MatterState.SUBLIMATION || state === MatterState.EQUILIBRIUM_SUB) {
        refWidth = 120;
        refHeight = 120;
    }

    return {
        scaleX: matterRect ? matterRect.w / refWidth : 1,
        scaleY: matterRect ? matterRect.h / refHeight : 1,
        centerX: 200,
        centerY: 300,
    };
};

export const getEvaporationPathProgress = (boilProgress: number) => {
    return 5 + (clamp01(boilProgress) * 4.5);
};

export const getParticleVibrationAmplitude = (temperature: number) => {
    return Math.sqrt(Math.max(0, temperature)) * 0.15;
};

export const getParticleVibration = (id: number, simTime: number, temperature: number): ParticleVibration => {
    const amplitude = getParticleVibrationAmplitude(temperature);
    const time = simTime * 25;

    return {
        x: Math.sin(time + (id * 123)) * amplitude,
        y: Math.cos(time + (id * 321)) * amplitude,
        amplitude,
    };
};

export const getParticleVibrationVelocity = (id: number, simTime: number, temperature: number): ParticleVibrationVelocity => {
    const amplitude = getParticleVibrationAmplitude(temperature);
    const time = simTime * 25;
    const omega = 25;

    return {
        vx: Math.cos(time + (id * 123)) * amplitude * omega,
        vy: -Math.sin(time + (id * 321)) * amplitude * omega,
    };
};

export const buildEvaporationLayout = ({
    pathProgress,
    matterRect,
    meltProgress,
    state,
    effectiveRadius,
}: BuildEvaporationLayoutInput): EvaporationLayout | null => {
    const ctx = getCanvasContext();
    if (!ctx || typeof Path2D === 'undefined') return null;

    const { scaleX, scaleY, centerX, centerY } = getMatterRenderTransform(matterRect, meltProgress, state);
    const quantizedPathProgress = quantize(pathProgress, INTERNAL_LAYOUT_PATH_PRECISION);
    const quantizedScaleX = quantize(scaleX, INTERNAL_LAYOUT_SCALE_PRECISION);
    const quantizedScaleY = quantize(scaleY, INTERNAL_LAYOUT_SCALE_PRECISION);
    const currentPath = getMatterPathFromProgress(quantizedPathProgress, INTERNAL_LAYOUT_PATH_PRECISION);
    const safeScaleX = Math.max(1e-6, Math.abs(scaleX));
    const safeScaleY = Math.max(1e-6, Math.abs(scaleY));
    const cacheKey = [
        quantizedPathProgress.toFixed(1),
        quantizedScaleX.toFixed(2),
        quantizedScaleY.toFixed(2),
        effectiveRadius.toFixed(4),
    ].join(':');

    const cachedLayout = evaporationLayoutCache.get(cacheKey);
    if (cachedLayout) {
        return cachedLayout;
    }

    let bounds = matterPathBoundsCache.get(currentPath);
    if (bounds === undefined) {
        bounds = getPathBounds(currentPath);
        matterPathBoundsCache.set(currentPath, bounds);
        ensurePathCacheLimit();
    }
    if (!bounds) return null;

    const { minX, maxX, minY, maxY } = bounds;
    const localCenterX = (minX + maxX) / 2;
    const worldCenterX = centerX + (localCenterX * scaleX);
    const worldMinX = centerX + (minX * scaleX);
    const worldMaxX = centerX + (maxX * scaleX);
    const worldMinY = centerY + (minY * scaleY);
    const worldMaxY = centerY + (maxY * scaleY);
    const halfWorldWidth = Math.max(1, Math.abs(worldMaxX - worldMinX) / 2);
    const worldHeight = Math.max(1, Math.abs(worldMaxY - worldMinY));
    const spacingWorld = (effectiveRadius * 2) + 1.5;
    const spacingLocalX = spacingWorld / safeScaleX;
    const spacingLocalY = (spacingWorld * HEX_VERTICAL_FACTOR) / safeScaleY;
    const rowOffsetLocalX = (spacingWorld * 0.5) / safeScaleX;
    const localRadiusX = effectiveRadius / safeScaleX;
    const localRadiusY = effectiveRadius / safeScaleY;
    let path = matterPathShapeCache.get(currentPath);
    if (!path) {
        path = new Path2D(currentPath);
        matterPathShapeCache.set(currentPath, path);
        ensurePathCacheLimit();
    }
    const slots: EvaporationLayoutSlot[] = [];

    let rowIndex = 0;
    for (let localY = maxY - localRadiusY; localY >= minY + localRadiusY; localY -= spacingLocalY) {
        const localXOffset = rowIndex % 2 === 0 ? 0 : rowOffsetLocalX;
        for (let localX = minX + localRadiusX + localXOffset; localX <= maxX - localRadiusX; localX += spacingLocalX) {
            if (!circleFitsInPath(ctx, path, localX, localY, localRadiusX, localRadiusY)) continue;

            const worldX = centerX + (localX * scaleX);
            const worldY = centerY + (localY * scaleY);
            const topExposure = clamp01((worldMaxY - worldY) / worldHeight);
            const sideExposure = clamp01(Math.abs(worldX - worldCenterX) / halfWorldWidth);
            const cornerLoss = Math.sqrt(((topExposure * topExposure) + (sideExposure * sideExposure)) / 2);
            const retentionScore = (topExposure * 0.62) + (sideExposure * 0.24) + (cornerLoss * 0.14);

            slots.push({
                index: slots.length,
                x: worldX,
                y: worldY,
                retentionScore,
                topExposure,
                sideExposure,
                organicBias: getOrganicBias(slots.length),
                neighborSlotIds: [],
                boundaryFaceCount: 0,
            });
        }

        rowIndex += 1;
    }

    const indexedSlots = slots.map((slot, index) => ({
        ...slot,
        index,
    }));

    const neighborDistance = spacingWorld * NEIGHBOR_DISTANCE_FACTOR;
    const neighborDistanceSq = neighborDistance * neighborDistance;

    for (let i = 0; i < indexedSlots.length; i += 1) {
        const source = indexedSlots[i];

        for (let j = i + 1; j < indexedSlots.length; j += 1) {
            const target = indexedSlots[j];
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const distanceSq = (dx * dx) + (dy * dy);

            if (distanceSq > neighborDistanceSq) continue;

            source.neighborSlotIds.push(target.index);
            target.neighborSlotIds.push(source.index);
        }
    }

    indexedSlots.forEach((slot) => {
        slot.boundaryFaceCount = Math.max(0, HEX_NEIGHBOR_COUNT - slot.neighborSlotIds.length);
        slot.neighborSlotIds.sort((a, b) => a - b);
    });

    const topSlotY = indexedSlots.reduce((minY, slot) => Math.min(minY, slot.y), Number.POSITIVE_INFINITY);
    const topExitY = Number.isFinite(topSlotY) ? topSlotY : worldMinY;

    const layout: EvaporationLayout = {
        key: cacheKey,
        pathProgress,
        currentPath,
        slots: indexedSlots,
        capacity: indexedSlots.length,
        topExitY,
    };

    evaporationLayoutCache.set(cacheKey, layout);
    ensureLayoutCacheLimit();
    return layout;
};
