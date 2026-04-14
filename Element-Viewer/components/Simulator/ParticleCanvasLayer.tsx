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
const NOISE_TEXTURE_SIZE = 96;
const TAU = Math.PI * 2;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const smoothstep = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - (2 * t));
};

const hexToRgba = (hexColor: string, alpha: number) => {
  const normalized = hexColor.replace('#', '').trim();
  const full = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return `rgba(255, 255, 255, ${clamp01(alpha)})`;
  }

  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`;
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

const buildMistRibbonPath = (
  x: number,
  y: number,
  width: number,
  height: number,
  time: number,
  phase: number,
) => {
  const path = new Path2D();
  const left = x;
  const right = x + width;
  const top = y;
  const bottom = y + height;
  const waveA = Math.sin((time * 0.9) + phase);
  const waveB = Math.cos((time * 1.1) + (phase * 1.3));
  const waveC = Math.sin((time * 1.25) + (phase * 1.9));

  path.moveTo(left + (width * 0.04), bottom - (height * 0.16));
  path.bezierCurveTo(
    left + (width * 0.14),
    top + (height * (0.74 + (waveA * 0.03))),
    left + (width * 0.2),
    top + (height * (0.2 + (waveB * 0.04))),
    left + (width * 0.36),
    top + (height * (0.26 + (waveC * 0.03))),
  );
  path.bezierCurveTo(
    left + (width * 0.5),
    top + (height * (0.08 + (waveA * 0.02))),
    left + (width * 0.68),
    top + (height * (0.16 - (waveB * 0.03))),
    left + (width * 0.78),
    top + (height * (0.3 + (waveC * 0.03))),
  );
  path.bezierCurveTo(
    left + (width * 0.88),
    top + (height * (0.42 + (waveA * 0.03))),
    left + (width * 0.94),
    top + (height * (0.62 + (waveB * 0.03))),
    right - (width * 0.04),
    bottom - (height * 0.18),
  );
  path.bezierCurveTo(
    left + (width * 0.88),
    bottom - (height * 0.02),
    left + (width * 0.72),
    bottom - (height * 0.01),
    left + (width * 0.54),
    bottom - (height * 0.08),
  );
  path.bezierCurveTo(
    left + (width * 0.38),
    bottom - (height * 0.02),
    left + (width * 0.18),
    bottom - (height * 0.04),
    left + (width * 0.04),
    bottom - (height * 0.16),
  );
  path.closePath();

  return path;
};

const fillMistRibbon = (
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  opacity: number,
) => {
  if (opacity <= 0) {
    return;
  }

  ctx.save();
  ctx.clip(path);

  const verticalGradient = ctx.createLinearGradient(0, y, 0, y + height);
  verticalGradient.addColorStop(0, hexToRgba(color, 0));
  verticalGradient.addColorStop(0.18, hexToRgba(color, opacity * 0.58));
  verticalGradient.addColorStop(0.42, hexToRgba(color, opacity));
  verticalGradient.addColorStop(0.72, hexToRgba(color, opacity * 0.42));
  verticalGradient.addColorStop(1, hexToRgba(color, 0));
  ctx.fillStyle = verticalGradient;
  ctx.fillRect(x, y, width, height);

  const horizontalGradient = ctx.createLinearGradient(x, 0, x + width, 0);
  horizontalGradient.addColorStop(0, hexToRgba(color, 0));
  horizontalGradient.addColorStop(0.16, hexToRgba(color, opacity * 0.38));
  horizontalGradient.addColorStop(0.5, hexToRgba(color, opacity * 0.68));
  horizontalGradient.addColorStop(0.84, hexToRgba(color, opacity * 0.34));
  horizontalGradient.addColorStop(1, hexToRgba(color, 0));
  ctx.fillStyle = horizontalGradient;
  ctx.fillRect(x, y, width, height);

  const coreGradient = ctx.createLinearGradient(0, y + (height * 0.18), 0, y + (height * 0.68));
  coreGradient.addColorStop(0, hexToRgba(color, 0));
  coreGradient.addColorStop(0.5, hexToRgba(color, opacity * 0.52));
  coreGradient.addColorStop(1, hexToRgba(color, 0));
  ctx.fillStyle = coreGradient;
  ctx.fillRect(x + (width * 0.08), y + (height * 0.08), width * 0.84, height * 0.72);

  ctx.restore();
};

const drawSteamOverlay = (
  ctx: CanvasRenderingContext2D,
  physics: PhysicsState,
  palette: CanvasPalette,
  viewBounds: ViewBoxDimensions,
  metrics: CanvasViewportMetrics,
  showParticles: boolean,
) => {
  const steamStrength = shouldShowSteamEffect(physics.state) ? getSteamStrength(physics) : 0;
  if (steamStrength <= 0.001 || physics.pathProgress >= 9.9) {
    return;
  }

  applyWorldTransform(ctx, metrics, viewBounds);

  const intensity = steamStrength * (showParticles ? 0.55 : 1);
  const width = physics.matterRect.w + 56;
  const height = Math.max(34, physics.matterRect.h * (0.82 + (steamStrength * 0.28)));
  const x = physics.matterRect.x - 28;
  const y = physics.matterRect.y - (height * 0.68);
  const time = physics.simTime;

  const baseRibbon = buildMistRibbonPath(x, y, width, height, time, 0);
  fillMistRibbon(
    ctx,
    baseRibbon,
    x,
    y,
    width,
    height,
    palette.gasColor,
    intensity * 0.28,
  );

  const upperWidth = width * 0.9;
  const upperHeight = height * 0.76;
  const upperX = x + (width * 0.05) + (Math.sin(time * 0.75) * 4);
  const upperY = y - (height * 0.08);
  const upperRibbon = buildMistRibbonPath(upperX, upperY, upperWidth, upperHeight, time, 1.6);
  fillMistRibbon(
    ctx,
    upperRibbon,
    upperX,
    upperY,
    upperWidth,
    upperHeight,
    palette.gasColor,
    intensity * 0.18,
  );
};

const drawBackgroundEffects = (
  ctx: CanvasRenderingContext2D,
  physics: PhysicsState,
  palette: CanvasPalette,
  viewBounds: ViewBoxDimensions,
  metrics: CanvasViewportMetrics,
  noiseTexture: HTMLCanvasElement | null,
) => {
  const showScfFog =
    (physics.state === MatterState.SUPERCRITICAL || physics.state === MatterState.TRANSITION_SCF)
    && physics.scfOpacity > 0.01;

  if (!showScfFog) {
    return;
  }

  applyWorldTransform(ctx, metrics, viewBounds);

  const fogPadding = 20;
  const fogX = physics.gasBounds.minX - fogPadding;
  const fogY = physics.gasBounds.minY - fogPadding;
  const fogWidth = (physics.gasBounds.maxX - physics.gasBounds.minX) + (fogPadding * 2);
  const fogHeight = (physics.gasBounds.maxY - physics.gasBounds.minY) + (fogPadding * 2);
  const fogOpacity = physics.scfOpacity * 0.34;

  const verticalGradient = ctx.createLinearGradient(0, fogY, 0, fogY + fogHeight);
  verticalGradient.addColorStop(0, hexToRgba(palette.gasColor, 0));
  verticalGradient.addColorStop(0.24, hexToRgba(palette.gasColor, fogOpacity * 0.72));
  verticalGradient.addColorStop(0.54, hexToRgba(palette.gasColor, fogOpacity));
  verticalGradient.addColorStop(0.84, hexToRgba(palette.gasColor, fogOpacity * 0.48));
  verticalGradient.addColorStop(1, hexToRgba(palette.gasColor, 0));
  ctx.fillStyle = verticalGradient;
  ctx.fillRect(fogX, fogY, fogWidth, fogHeight);

  const horizontalGradient = ctx.createLinearGradient(fogX, 0, fogX + fogWidth, 0);
  horizontalGradient.addColorStop(0, hexToRgba(palette.gasColor, 0));
  horizontalGradient.addColorStop(0.18, hexToRgba(palette.gasColor, fogOpacity * 0.44));
  horizontalGradient.addColorStop(0.5, hexToRgba(palette.gasColor, fogOpacity * 0.7));
  horizontalGradient.addColorStop(0.82, hexToRgba(palette.gasColor, fogOpacity * 0.42));
  horizontalGradient.addColorStop(1, hexToRgba(palette.gasColor, 0));
  ctx.fillStyle = horizontalGradient;
  ctx.fillRect(fogX, fogY, fogWidth, fogHeight);

  const centerX = fogX + (fogWidth * (0.46 + (Math.sin(physics.simTime * 0.45) * 0.05)));
  const centerY = fogY + (fogHeight * 0.48);
  const radialGradient = ctx.createRadialGradient(
    centerX,
    centerY,
    0,
    centerX,
    centerY,
    Math.max(fogWidth, fogHeight) * 0.48,
  );
  radialGradient.addColorStop(0, hexToRgba(palette.gasColor, fogOpacity * 0.4));
  radialGradient.addColorStop(0.55, hexToRgba(palette.gasColor, fogOpacity * 0.16));
  radialGradient.addColorStop(1, hexToRgba(palette.gasColor, 0));
  ctx.fillStyle = radialGradient;
  ctx.fillRect(fogX, fogY, fogWidth, fogHeight);

  drawNoiseFill(
    ctx,
    noiseTexture,
    fogX,
    fogY,
    fogWidth,
    fogHeight,
    (physics.simTime * 8) % NOISE_TEXTURE_SIZE,
    (physics.simTime * 6) % NOISE_TEXTURE_SIZE,
    physics.scfOpacity * 0.04,
  );
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
          );

          drawSteamOverlay(
            foregroundCtx,
            livePhysics,
            palette,
            viewBounds,
            metrics,
            showParticles,
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
