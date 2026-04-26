import React, { useEffect, useRef, type MutableRefObject } from 'react';
import { MatterState, Particle, ParticleState, PhysicsState, ViewBoxDimensions } from '../../types';
import { interpolateValue } from '../../utils/interpolator';
import {
  getParticleVibration,
} from '../../utils/evaporationLayout';
import {
  createSpatialGrid,
  forEachSpatialGridPair,
  insertSpatialGridIndex,
  resetSpatialGrid,
} from '../../utils/spatialGrid';

type CanvasPalette = {
  solidColor: string;
  liquidColor: string;
  gasColor: string;
  solidOpacity: number;
  liquidOpacity: number;
  gasOpacity: number;
};

type ParticleCanvasLayerProps = {
  livePhysicsRef: MutableRefObject<PhysicsState>;
  liveFrameRef: MutableRefObject<number>;
  palette: CanvasPalette;
  showParticles: boolean;
  viewBounds: ViewBoxDimensions;
};

type CanvasViewportMetrics = {
  pixelWidth: number;
  pixelHeight: number;
};

type CanvasParticleNode = {
  id: number;
  state: ParticleState;
  r: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
};

const PARTICLE_RENDER_GRID_CELL_SIZE = 14;
const MAX_CANVAS_DPR = 2;
const TAU = Math.PI * 2;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const smoothstep = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - (2 * t));
};

const isMeltLikeState = (state: MatterState) => (
  state === MatterState.MELTING || state === MatterState.EQUILIBRIUM_MELT
);

const getTrappedJitterScale = (state: MatterState, meltProgress: number) => {
  if (!isMeltLikeState(state)) {
    return 1;
  }

  return interpolateValue(0.16, 0.28, smoothstep(meltProgress));
};

const getTrappedParticleAnchor = (
  particle: Particle,
  state: MatterState,
  meltProgress: number,
) => {
  const hasLiquidTarget =
    Number.isFinite(particle.liquidTargetX) && Number.isFinite(particle.liquidTargetY);

  if (!hasLiquidTarget) {
    return { x: particle.homeX, y: particle.homeY };
  }

  if (state === MatterState.MELTING || state === MatterState.EQUILIBRIUM_MELT) {
    const easedProgress = smoothstep(meltProgress);
    return {
      x: interpolateValue(particle.homeX, particle.liquidTargetX ?? particle.homeX, easedProgress),
      y: interpolateValue(particle.homeY, particle.liquidTargetY ?? particle.homeY, easedProgress),
    };
  }

  if (
    state === MatterState.LIQUID
    || state === MatterState.BOILING
    || state === MatterState.EQUILIBRIUM_BOIL
    || state === MatterState.TRANSITION_SCF
    || state === MatterState.GAS
  ) {
    return {
      x: particle.liquidTargetX ?? particle.homeX,
      y: particle.liquidTargetY ?? particle.homeY,
    };
  }

  return { x: particle.homeX, y: particle.homeY };
};

const clearCanvas = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
) => {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
};

const applyWorldTransform = (
  ctx: CanvasRenderingContext2D,
  metrics: CanvasViewportMetrics,
  viewBounds: ViewBoxDimensions,
) => {
  const scale = Math.min(
    metrics.pixelWidth / viewBounds.width,
    metrics.pixelHeight / viewBounds.height,
  );
  const offsetX = ((metrics.pixelWidth - (viewBounds.width * scale)) / 2) - (viewBounds.minX * scale);
  const offsetY = ((metrics.pixelHeight - (viewBounds.height * scale)) / 2) - (viewBounds.minY * scale);

  ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
};

const resolveParticleNodes = (
  physics: PhysicsState,
  showParticles: boolean,
  trappedParticleCache: Map<number, { x: number; y: number }>,
  nextTrappedParticleCache: Map<number, { x: number; y: number }>,
  renderGrid: ReturnType<typeof createSpatialGrid>,
) => {
  const resolvedNodes: CanvasParticleNode[] = [];

  for (const particle of physics.particles) {
    const isHidden = !showParticles && particle.state === ParticleState.TRAPPED;
    if (isHidden) {
      continue;
    }

    let targetX = particle.x;
    let targetY = particle.y;

    if (particle.state === ParticleState.TRAPPED) {
      const anchor = getTrappedParticleAnchor(particle, physics.state, physics.meltProgress);
      const vibration = getParticleVibration(particle.id, physics.simTime, physics.temperature);
      const jitterScale = getTrappedJitterScale(physics.state, physics.meltProgress);
      targetX = anchor.x + (vibration.x * jitterScale);
      targetY = anchor.y + (vibration.y * jitterScale);

      if (isMeltLikeState(physics.state)) {
        const previous = trappedParticleCache.get(particle.id);
        if (previous) {
          const smoothing = interpolateValue(0.22, 0.3, smoothstep(physics.meltProgress));
          targetX = interpolateValue(previous.x, targetX, smoothing);
          targetY = interpolateValue(previous.y, targetY, smoothing);
        }
      }
    }

    resolvedNodes.push({
      id: particle.id,
      state: particle.state,
      r: particle.r,
      x: targetX,
      y: targetY,
      targetX,
      targetY,
    });
  }

  if (showParticles && resolvedNodes.length > 1) {
    const overlapNodes = physics.state === MatterState.BOILING || physics.state === MatterState.EQUILIBRIUM_BOIL
      ? resolvedNodes.filter((node) => node.state !== ParticleState.TRAPPED)
      : resolvedNodes;

    if (overlapNodes.length > 1) {
      const distanceEpsilon = 1e-6;
      const overlapTolerance = 1e-3;

      const applySeparationPass = () => {
        resetSpatialGrid(renderGrid, PARTICLE_RENDER_GRID_CELL_SIZE);
        for (let index = 0; index < overlapNodes.length; index += 1) {
          const node = overlapNodes[index];
          insertSpatialGridIndex(renderGrid, index, node.x, node.y);
        }

        let maxOverlap = 0;

        forEachSpatialGridPair(renderGrid, (firstIndex, secondIndex) => {
          const first = overlapNodes[firstIndex];
          const second = overlapNodes[secondIndex];
          if (!first || !second) return;

          const dx = second.x - first.x;
          const dy = second.y - first.y;
          const minDist = first.r + second.r;
          const minDistSq = minDist * minDist;
          const distSq = (dx * dx) + (dy * dy);

          if (distSq >= minDistSq) return;

          let nx = 1;
          let ny = 0;
          let dist = Math.sqrt(distSq);

          if (dist > distanceEpsilon) {
            nx = dx / dist;
            ny = dy / dist;
          } else {
            const seed = (first.id * 92821) + (second.id * 68917);
            const angle = (seed % 360) * (Math.PI / 180);
            nx = Math.cos(angle);
            ny = Math.sin(angle);
            dist = 0;
          }

          const overlap = minDist - dist;
          if (overlap > maxOverlap) {
            maxOverlap = overlap;
          }

          const isBothTrapped = first.state === ParticleState.TRAPPED && second.state === ParticleState.TRAPPED;
          const correctionStrength = isMeltLikeState(physics.state) && isBothTrapped ? 0.18 : 0.5;
          const correction = overlap * correctionStrength;

          first.x -= nx * correction;
          first.y -= ny * correction;
          second.x += nx * correction;
          second.y += ny * correction;
        });

        return maxOverlap;
      };

      applySeparationPass();
      for (const node of overlapNodes) {
        node.x = interpolateValue(node.x, node.targetX, 0.18);
        node.y = interpolateValue(node.y, node.targetY, 0.18);
      }

      const maxOverlap = applySeparationPass();
      if (maxOverlap > overlapTolerance) {
        applySeparationPass();
      }
    }
  }

  for (const node of resolvedNodes) {
    if (node.state === ParticleState.TRAPPED) {
      nextTrappedParticleCache.set(node.id, { x: node.x, y: node.y });
    }
  }

  return resolvedNodes;
};

const drawParticles = (
  ctx: CanvasRenderingContext2D,
  physics: PhysicsState,
  palette: CanvasPalette,
  showParticles: boolean,
  viewBounds: ViewBoxDimensions,
  metrics: CanvasViewportMetrics,
  trappedParticleCache: Map<number, { x: number; y: number }>,
  nextTrappedParticleCache: Map<number, { x: number; y: number }>,
  renderGrid: ReturnType<typeof createSpatialGrid>,
) => {
  const visibleNodes = resolveParticleNodes(
    physics,
    showParticles,
    trappedParticleCache,
    nextTrappedParticleCache,
    renderGrid,
  );

  if (visibleNodes.length === 0) {
    return;
  }

  applyWorldTransform(ctx, metrics, viewBounds);

  for (const node of visibleNodes) {
    let fill = palette.gasColor;
    let opacity = palette.gasOpacity;
    let stroke = 'transparent';

    if (node.state === ParticleState.RISING || node.state === ParticleState.CONDENSING) {
      fill = palette.liquidColor;
      opacity = palette.liquidOpacity;
    }

    if (physics.state === MatterState.SUBLIMATION || physics.state === MatterState.EQUILIBRIUM_SUB) {
      if (node.state === ParticleState.RISING || node.state === ParticleState.CONDENSING) {
        fill = palette.gasColor;
        opacity = palette.gasOpacity;
      }
    }

    if (node.state === ParticleState.TRAPPED) {
      fill = physics.state === MatterState.SOLID || physics.state === MatterState.SUBLIMATION || physics.state === MatterState.EQUILIBRIUM_SUB
        ? palette.solidColor
        : palette.liquidColor;
      opacity = 0.9;
      stroke = 'rgba(0,0,0,0.2)';
    }

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.r, 0, TAU);
    ctx.fill();

    if (stroke !== 'transparent') {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    ctx.restore();
  }
};

const ParticleCanvasLayerComponent: React.FC<ParticleCanvasLayerProps> = ({
  livePhysicsRef,
  liveFrameRef,
  palette,
  showParticles,
  viewBounds,
}) => {
  const foregroundCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportMetricsRef = useRef<CanvasViewportMetrics>({ pixelWidth: 0, pixelHeight: 0 });
  const renderGridRef = useRef(createSpatialGrid(PARTICLE_RENDER_GRID_CELL_SIZE));
  const trappedParticleCacheRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const redrawVersionRef = useRef(0);

  useEffect(() => {
    redrawVersionRef.current += 1;
  }, [palette, showParticles, viewBounds]);

  useEffect(() => {
    const foregroundCanvas = foregroundCanvasRef.current;
    const container = foregroundCanvas?.parentElement;

    if (!foregroundCanvas || !container) {
      return undefined;
    }

    const resizeCanvases = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_DPR);
      const pixelWidth = Math.max(1, Math.round(container.clientWidth * dpr));
      const pixelHeight = Math.max(1, Math.round(container.clientHeight * dpr));

      viewportMetricsRef.current = {
        pixelWidth,
        pixelHeight,
      };

      if (foregroundCanvas.width !== pixelWidth || foregroundCanvas.height !== pixelHeight) {
        foregroundCanvas.width = pixelWidth;
        foregroundCanvas.height = pixelHeight;
      }

      redrawVersionRef.current += 1;
    };

    resizeCanvases();

    const resizeObserver = new ResizeObserver(resizeCanvases);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    let animationFrameId = 0;
    let lastFrameVersion = -1;
    let lastRedrawVersion = -1;

    const drawFrame = () => {
      const foregroundCanvas = foregroundCanvasRef.current;
      if (!foregroundCanvas) {
        animationFrameId = requestAnimationFrame(drawFrame);
        return;
      }

      const frameVersion = liveFrameRef.current;
      const redrawVersion = redrawVersionRef.current;

      if (frameVersion !== lastFrameVersion || redrawVersion !== lastRedrawVersion) {
        const foregroundCtx = foregroundCanvas.getContext('2d');
        const metrics = viewportMetricsRef.current;

        if (foregroundCtx && metrics.pixelWidth > 0 && metrics.pixelHeight > 0) {
          clearCanvas(foregroundCtx, foregroundCanvas);

          const livePhysics = livePhysicsRef.current;
          const nextTrappedParticleCache = new Map<number, { x: number; y: number }>();
          drawParticles(
            foregroundCtx,
            livePhysics,
            palette,
            showParticles,
            viewBounds,
            metrics,
            trappedParticleCacheRef.current,
            nextTrappedParticleCache,
            renderGridRef.current,
          );
          trappedParticleCacheRef.current = nextTrappedParticleCache;
        }

        lastFrameVersion = frameVersion;
        lastRedrawVersion = redrawVersion;
      }

      animationFrameId = requestAnimationFrame(drawFrame);
    };

    animationFrameId = requestAnimationFrame(drawFrame);
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [liveFrameRef, livePhysicsRef, palette, showParticles, viewBounds]);

  return (
    <canvas
      ref={foregroundCanvasRef}
      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
    />
  );
};

const ParticleCanvasLayer = React.memo(ParticleCanvasLayerComponent);

export default ParticleCanvasLayer;
