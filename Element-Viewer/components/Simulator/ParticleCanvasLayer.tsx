import React, { useEffect, useRef, type MutableRefObject } from 'react';
import { MatterState, Particle, ParticleState, PhysicsState, ViewBoxDimensions } from '../../types';
import { interpolateValue } from '../../utils/interpolator';
import {
  getMatterPathFromProgress,
  getMatterRenderTransform,
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
const NOISE_TEXTURE_SIZE = 96;
const PATH_CACHE_LIMIT = 32;
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

const ensurePathCacheLimit = (cache: Map<string, Path2D>) => {
  while (cache.size > PATH_CACHE_LIMIT) {
    const firstKey = cache.keys().next().value;
    if (!firstKey) break;
    cache.delete(firstKey);
  }
};

const getCachedPath2D = (cache: Map<string, Path2D>, pathData: string) => {
  let path = cache.get(pathData);
  if (path) {
    return path;
  }

  path = new Path2D(pathData);
  cache.set(pathData, path);
  ensurePathCacheLimit(cache);
  return path;
};

const createNoiseTexture = () => {
  if (typeof document === 'undefined') {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = NOISE_TEXTURE_SIZE;
  canvas.height = NOISE_TEXTURE_SIZE;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  const imageData = ctx.createImageData(NOISE_TEXTURE_SIZE, NOISE_TEXTURE_SIZE);
  for (let index = 0; index < imageData.data.length; index += 4) {
    const noise = Math.floor(Math.random() * 255);
    imageData.data[index] = noise;
    imageData.data[index + 1] = noise;
    imageData.data[index + 2] = noise;
    imageData.data[index + 3] = 52 + Math.floor(Math.random() * 96);
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
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

const shouldShowSteamEffect = (state: MatterState) => (
  state === MatterState.BOILING
  || state === MatterState.EQUILIBRIUM_BOIL
  || state === MatterState.TRANSITION_SCF
  || state === MatterState.EQUILIBRIUM_TRIPLE
  || state === MatterState.SUBLIMATION
  || state === MatterState.EQUILIBRIUM_SUB
);

const getSteamStrength = (physics: PhysicsState) => {
  switch (physics.state) {
    case MatterState.BOILING:
    case MatterState.EQUILIBRIUM_BOIL:
      return 0.22 + (physics.boilProgress * 0.35);
    case MatterState.TRANSITION_SCF:
      return 0.32 + (physics.scfTransitionProgress * 0.24);
    case MatterState.EQUILIBRIUM_TRIPLE:
      return 0.22;
    case MatterState.SUBLIMATION:
    case MatterState.EQUILIBRIUM_SUB:
      return 0.16 + (physics.sublimationProgress * 0.18);
    default:
      return 0;
  }
};

const drawNoiseFill = (
  ctx: CanvasRenderingContext2D,
  texture: HTMLCanvasElement | null,
  x: number,
  y: number,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
  alpha: number,
) => {
  if (!texture || alpha <= 0 || width <= 0 || height <= 0) {
    return;
  }

  const pattern = ctx.createPattern(texture, 'repeat');
  if (!pattern) {
    return;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(offsetX, offsetY);
  ctx.fillStyle = pattern;
  ctx.fillRect(x - offsetX, y - offsetY, width, height);
  ctx.restore();
};

const drawBackgroundEffects = (
  ctx: CanvasRenderingContext2D,
  physics: PhysicsState,
  palette: CanvasPalette,
  viewBounds: ViewBoxDimensions,
  metrics: CanvasViewportMetrics,
  noiseTexture: HTMLCanvasElement | null,
  pathCache: Map<string, Path2D>,
) => {
  const steamStrength = shouldShowSteamEffect(physics.state) ? getSteamStrength(physics) : 0;
  const showScfFog =
    (physics.state === MatterState.SUPERCRITICAL || physics.state === MatterState.TRANSITION_SCF)
    && physics.scfOpacity > 0.01;

  if (steamStrength <= 0.001 && !showScfFog) {
    return;
  }

  applyWorldTransform(ctx, metrics, viewBounds);

  if (steamStrength > 0.001 && physics.pathProgress < 9.9) {
    const pathData = getMatterPathFromProgress(physics.pathProgress, 0.01);
    const matterPath = getCachedPath2D(pathCache, pathData);
    const { scaleX, scaleY, centerX, centerY } = getMatterRenderTransform(
      physics.matterRect,
      physics.meltProgress,
      physics.state,
    );

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(scaleX, scaleY);
    ctx.globalAlpha = steamStrength;
    if ('filter' in ctx) {
      ctx.filter = 'blur(18px)';
    }
    ctx.fillStyle = palette.gasColor;
    ctx.fill(matterPath);
    ctx.translate(0, -18 / Math.max(0.32, Math.abs(scaleY)));
    ctx.globalAlpha = steamStrength * 0.65;
    ctx.fill(matterPath);
    ctx.restore();

    const plumeHeight = Math.max(34, physics.matterRect.h * 0.9);
    ctx.save();
    if ('filter' in ctx) {
      ctx.filter = 'blur(10px)';
    }
    ctx.globalAlpha = steamStrength * 0.18;
    ctx.fillStyle = palette.gasColor;
    for (let index = 0; index < 5; index += 1) {
      const ratio = (index + 0.5) / 5;
      const plumeX = physics.matterRect.x + (physics.matterRect.w * ratio);
      const sway = Math.sin((physics.simTime * 1.6) + (index * 1.35)) * 7;
      const plumeY = physics.matterRect.y - (plumeHeight * (0.42 + (ratio * 0.18)));
      ctx.beginPath();
      ctx.ellipse(
        plumeX + sway,
        plumeY,
        16 + (steamStrength * 18),
        22 + (steamStrength * 24),
        0,
        0,
        TAU,
      );
      ctx.fill();
    }
    ctx.restore();

    drawNoiseFill(
      ctx,
      noiseTexture,
      physics.matterRect.x - 18,
      physics.matterRect.y - plumeHeight,
      physics.matterRect.w + 36,
      plumeHeight + 18,
      (physics.simTime * 14) % NOISE_TEXTURE_SIZE,
      (-physics.simTime * 18) % NOISE_TEXTURE_SIZE,
      steamStrength * 0.1,
    );
  }

  if (showScfFog) {
    const fogPadding = 20;
    const fogX = physics.gasBounds.minX - fogPadding;
    const fogY = physics.gasBounds.minY - fogPadding;
    const fogWidth = (physics.gasBounds.maxX - physics.gasBounds.minX) + (fogPadding * 2);
    const fogHeight = (physics.gasBounds.maxY - physics.gasBounds.minY) + (fogPadding * 2);

    ctx.save();
    if ('filter' in ctx) {
      ctx.filter = 'blur(14px)';
    }
    ctx.globalAlpha = physics.scfOpacity * 0.55;
    ctx.fillStyle = palette.gasColor;
    ctx.fillRect(fogX, fogY, fogWidth, fogHeight);
    ctx.restore();

    ctx.save();
    if ('filter' in ctx) {
      ctx.filter = 'blur(18px)';
    }
    ctx.globalAlpha = physics.scfOpacity * 0.32;
    ctx.fillStyle = palette.gasColor;
    for (let index = 0; index < 6; index += 1) {
      const ratio = (index + 1) / 7;
      const ellipseX = physics.gasBounds.minX + (fogWidth * ratio) + (Math.sin(physics.simTime + index) * 10);
      const ellipseY = physics.gasBounds.minY + (fogHeight * (0.15 + (ratio * 0.62)));
      ctx.beginPath();
      ctx.ellipse(
        ellipseX,
        ellipseY,
        Math.max(18, fogWidth * 0.16),
        Math.max(18, fogHeight * 0.1),
        0,
        0,
        TAU,
      );
      ctx.fill();
    }
    ctx.restore();

    drawNoiseFill(
      ctx,
      noiseTexture,
      fogX,
      fogY,
      fogWidth,
      fogHeight,
      (physics.simTime * 10) % NOISE_TEXTURE_SIZE,
      (physics.simTime * 8) % NOISE_TEXTURE_SIZE,
      physics.scfOpacity * 0.14,
    );
  }
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
  const backgroundCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const foregroundCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportMetricsRef = useRef<CanvasViewportMetrics>({ pixelWidth: 0, pixelHeight: 0 });
  const renderGridRef = useRef(createSpatialGrid(PARTICLE_RENDER_GRID_CELL_SIZE));
  const trappedParticleCacheRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pathCacheRef = useRef<Map<string, Path2D>>(new Map());
  const noiseTextureRef = useRef<HTMLCanvasElement | null>(null);
  const redrawVersionRef = useRef(0);

  useEffect(() => {
    redrawVersionRef.current += 1;
  }, [palette, showParticles, viewBounds]);

  useEffect(() => {
    if (!noiseTextureRef.current) {
      noiseTextureRef.current = createNoiseTexture();
    }
  }, []);

  useEffect(() => {
    const backgroundCanvas = backgroundCanvasRef.current;
    const foregroundCanvas = foregroundCanvasRef.current;
    const container = foregroundCanvas?.parentElement;

    if (!backgroundCanvas || !foregroundCanvas || !container) {
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

      for (const canvas of [backgroundCanvas, foregroundCanvas]) {
        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
          canvas.width = pixelWidth;
          canvas.height = pixelHeight;
        }
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
      const backgroundCanvas = backgroundCanvasRef.current;
      const foregroundCanvas = foregroundCanvasRef.current;
      if (!backgroundCanvas || !foregroundCanvas) {
        animationFrameId = requestAnimationFrame(drawFrame);
        return;
      }

      const frameVersion = liveFrameRef.current;
      const redrawVersion = redrawVersionRef.current;

      if (frameVersion !== lastFrameVersion || redrawVersion !== lastRedrawVersion) {
        const backgroundCtx = backgroundCanvas.getContext('2d');
        const foregroundCtx = foregroundCanvas.getContext('2d');
        const metrics = viewportMetricsRef.current;

        if (backgroundCtx && foregroundCtx && metrics.pixelWidth > 0 && metrics.pixelHeight > 0) {
          clearCanvas(backgroundCtx, backgroundCanvas);
          clearCanvas(foregroundCtx, foregroundCanvas);

          const livePhysics = livePhysicsRef.current;
          drawBackgroundEffects(
            backgroundCtx,
            livePhysics,
            palette,
            viewBounds,
            metrics,
            noiseTextureRef.current,
            pathCacheRef.current,
          );

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
    <>
      <canvas
        ref={backgroundCanvasRef}
        className="pointer-events-none absolute inset-0 z-0 h-full w-full"
      />
      <canvas
        ref={foregroundCanvasRef}
        className="pointer-events-none absolute inset-0 z-20 h-full w-full"
      />
    </>
  );
};

const ParticleCanvasLayer = React.memo(ParticleCanvasLayerComponent);

export default ParticleCanvasLayer;
