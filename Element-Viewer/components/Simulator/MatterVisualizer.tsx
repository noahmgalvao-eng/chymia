
import React, { useMemo, useRef } from 'react';
import { PhysicsState, ChemicalElement, MatterState, Particle, ParticleState, ViewBoxDimensions } from '../../types';
import { MATTER_PATH_FRAMES } from '../../data/elements';
import { interpolatePath, interpolateColor, interpolateValue } from '../../utils/interpolator';
import { getPhaseStatusLabel } from '../../app/appDefinitions';
import { useI18n } from '../../i18n';

interface Props {
    physics: PhysicsState;
    element: ChemicalElement;
    showParticles: boolean;
    viewBounds: ViewBoxDimensions;
    totalElements: number;
    onInspect?: (e: React.MouseEvent, physics: PhysicsState) => void;
}

const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

const hexToRgb = (hexColor: string) => {
    const normalized = hexColor.replace('#', '').trim();
    const full = normalized.length === 3
        ? normalized.split('').map((char) => `${char}${char}`).join('')
        : normalized;

    if (!/^[0-9a-fA-F]{6}$/.test(full)) {
        return null;
    }

    return {
        r: Number.parseInt(full.slice(0, 2), 16),
        g: Number.parseInt(full.slice(2, 4), 16),
        b: Number.parseInt(full.slice(4, 6), 16),
    };
};

const mixColors = (sourceHex: string, targetHex: string, weight: number) => {
    const source = hexToRgb(sourceHex);
    const target = hexToRgb(targetHex);

    if (!source || !target) return sourceHex;

    const clampedWeight = Math.max(0, Math.min(1, weight));
    const r = clampChannel(source.r + (target.r - source.r) * clampedWeight);
    const g = clampChannel(source.g + (target.g - source.g) * clampedWeight);
    const b = clampChannel(source.b + (target.b - source.b) * clampedWeight);

    return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
};

const getRelativeLuminance = (hexColor: string) => {
    const rgb = hexToRgb(hexColor);
    if (!rgb) return 0.5;

    const toLinear = (channel: number) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
            ? normalized / 12.92
            : Math.pow((normalized + 0.055) / 1.055, 2.4);
    };

    return (0.2126 * toLinear(rgb.r)) + (0.7152 * toLinear(rgb.g)) + (0.0722 * toLinear(rgb.b));
};

const tuneColorForTheme = (hexColor: string, isDarkTheme: boolean) => {
    const luminance = getRelativeLuminance(hexColor);

    if (isDarkTheme && luminance < 0.2) {
        return mixColors(hexColor, '#cbd5e1', 0.4);
    }

    if (!isDarkTheme && luminance > 0.78) {
        return mixColors(hexColor, '#334155', 0.45);
    }

    return hexColor;
};

const APPS_UI_FONT_STACK = 'ui-sans-serif, -apple-system, system-ui, "Segoe UI", "Noto Sans", "Helvetica", "Arial", sans-serif';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const smoothstep = (value: number) => {
    const t = clamp01(value);
    return t * t * (3 - (2 * t));
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

const shouldResolveParticleVisually = (particle: Particle, showParticles: boolean) => (
    (particle.state === ParticleState.TRAPPED && showParticles)
    || particle.state === ParticleState.RISING
    || particle.state === ParticleState.CONDENSING
);

const isMeltLikeState = (state: MatterState) => (
    state === MatterState.MELTING || state === MatterState.EQUILIBRIUM_MELT
);

const getTrappedJitterScale = (state: MatterState, meltProgress: number) => {
    if (!isMeltLikeState(state)) {
        return 1;
    }

    return interpolateValue(0.16, 0.28, smoothstep(meltProgress));
};

const MatterVisualizer: React.FC<Props> = ({ physics, element, showParticles, viewBounds, totalElements, onInspect }) => {
    const { messages } = useI18n();
    const { pathProgress, state, particles, boilProgress, meltProgress, matterRect, gasBounds, scfOpacity, simTime, sublimationProgress, powerInput } = physics;
    const trappedParticleRenderCacheRef = useRef<Map<number, { x: number; y: number }>>(new Map());

    // --- 1. SVG Path Interpolator (Puddle / Solid) ---
    const currentPath = useMemo(() => {
        // pathProgress goes 0 -> 10
        const frameIndex = Math.min(Math.floor(pathProgress), MATTER_PATH_FRAMES.length - 2);
        const nextFrameIndex = frameIndex + 1;
        const progressInFrame = pathProgress - frameIndex;

        const d1 = MATTER_PATH_FRAMES[frameIndex];
        const d2 = MATTER_PATH_FRAMES[nextFrameIndex];

        if (!d1 || !d2) return MATTER_PATH_FRAMES[0];
        return interpolatePath(d1, d2, progressInFrame);
    }, [pathProgress]);

    // --- DNA Visual Properties (Dynamic from JSON) ---
    const { solid, liquid, gas } = element.visualDNA;

    const isDarkTheme = useMemo(() => {
        if (typeof window === 'undefined') return false;

        const dataTheme = document.documentElement.getAttribute('data-theme');
        if (dataTheme === 'dark') return true;
        if (dataTheme === 'light') return false;

        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }, []);

    const adjustedSolidColor = useMemo(() => tuneColorForTheme(solid.color, isDarkTheme), [solid.color, isDarkTheme]);
    const adjustedLiquidColor = useMemo(() => tuneColorForTheme(liquid.color, isDarkTheme), [liquid.color, isDarkTheme]);
    const adjustedGasColor = useMemo(() => tuneColorForTheme(gas.color, isDarkTheme), [gas.color, isDarkTheme]);

    // --- Dynamic Color & Opacity Logic ---
    const bulkVisuals = useMemo(() => {
        // 1. Determine base Visual DNA based on state
        let targetVisual = solid;
        if (state === MatterState.LIQUID || state === MatterState.BOILING || state === MatterState.EQUILIBRIUM_BOIL || state === MatterState.EQUILIBRIUM_TRIPLE) {
            targetVisual = liquid;
        } else if (state === MatterState.GAS || state === MatterState.SUPERCRITICAL || state === MatterState.TRANSITION_SCF) {
            targetVisual = gas;
        } else if (state === MatterState.SUBLIMATION || state === MatterState.EQUILIBRIUM_SUB) {
            // Sublimation starts as Solid color
            targetVisual = solid;
        }

        // 2. Interpolate if Melting
        let finalOpacity = targetVisual.opacidade;
        let finalFill = targetVisual === liquid ? adjustedLiquidColor : targetVisual === gas ? adjustedGasColor : adjustedSolidColor;

        if (state === MatterState.MELTING || state === MatterState.EQUILIBRIUM_MELT) {
            finalOpacity = interpolateValue(solid.opacidade, liquid.opacidade, meltProgress);
            finalFill = interpolateColor(adjustedSolidColor, adjustedLiquidColor, meltProgress);
        }

        // Triple Point interpolation
        if (state === MatterState.EQUILIBRIUM_TRIPLE) {
            const tProgress = Math.min(1, Math.max(0, meltProgress));
            finalOpacity = interpolateValue(solid.opacidade, liquid.opacidade, tProgress);
            finalFill = interpolateColor(adjustedSolidColor, adjustedLiquidColor, tProgress);
        }

        // X-Ray Mode Override
        if (showParticles) {
            return { fill: finalFill, opacity: 0.3 };
        }

        return {
            fill: finalFill,
            opacity: finalOpacity
        };
    }, [state, meltProgress, solid, liquid, gas, adjustedSolidColor, adjustedLiquidColor, adjustedGasColor, showParticles]);

    const { scaleX, scaleY, centerX, centerY } = useMemo(() => {
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
    }, [state, meltProgress, matterRect]);

    const shouldResolveParticleOverlaps =
        [
            MatterState.SOLID,
            MatterState.MELTING,
            MatterState.EQUILIBRIUM_MELT,
            MatterState.LIQUID,
            MatterState.BOILING,
            MatterState.EQUILIBRIUM_BOIL,
            MatterState.EQUILIBRIUM_TRIPLE,
            MatterState.TRANSITION_SCF,
            MatterState.GAS,
        ].includes(state);

    const particleRenderMap = useMemo(() => {
        const resolved = new Map<number, { x: number; y: number }>();
        if (!shouldResolveParticleOverlaps) {
            trappedParticleRenderCacheRef.current = new Map();
            return resolved;
        }

        const visibleParticles = particles.filter((particle) => shouldResolveParticleVisually(particle, showParticles));
        if (visibleParticles.length === 0) {
            trappedParticleRenderCacheRef.current = new Map();
            return resolved;
        }

        const isMeltLike = isMeltLikeState(state);
        const vibrationAmp = Math.sqrt(Math.max(0, physics.temperature)) * 0.15;
        const time = physics.simTime * 25;
        const trappedJitterScale = getTrappedJitterScale(state, meltProgress);
        const previousTrappedRenderCache = trappedParticleRenderCacheRef.current;
        const nextTrappedRenderCache = new Map<number, { x: number; y: number }>();
        const nodes: Array<{
            id: number;
            state: ParticleState;
            r: number;
            x: number;
            y: number;
            targetX: number;
            targetY: number;
        }> = visibleParticles.map((particle) => {
            let targetX = particle.x;
            let targetY = particle.y;

            if (particle.state === ParticleState.TRAPPED) {
                const anchor = getTrappedParticleAnchor(particle, state, meltProgress);
                const jitterX = Math.sin(time + particle.id * 123) * vibrationAmp * trappedJitterScale;
                const jitterY = Math.cos(time + particle.id * 321) * vibrationAmp * trappedJitterScale;
                targetX = anchor.x + jitterX;
                targetY = anchor.y + jitterY;

                if (isMeltLike) {
                    const previous = previousTrappedRenderCache.get(particle.id);
                    if (previous) {
                        const smoothing = interpolateValue(0.22, 0.3, smoothstep(meltProgress));
                        targetX = interpolateValue(previous.x, targetX, smoothing);
                        targetY = interpolateValue(previous.y, targetY, smoothing);
                    }
                }
            }

            return {
                id: particle.id,
                state: particle.state,
                r: particle.r,
                x: targetX,
                y: targetY,
                targetX,
                targetY,
            };
        });

        const overlapTolerance = 1e-3;
        const distanceEpsilon = 1e-6;

        const applySeparationPass = (): number => {
            let maxOverlap = 0;

            for (let i = 0; i < nodes.length; i += 1) {
                const p1 = nodes[i];

                for (let j = i + 1; j < nodes.length; j += 1) {
                    const p2 = nodes[j];
                    const dx = p2.x - p1.x;
                    const dy = p2.y - p1.y;
                    const minDist = p1.r + p2.r;
                    const minDistSq = minDist * minDist;
                    const distSq = (dx * dx) + (dy * dy);

                    if (distSq >= minDistSq) continue;

                    let nx = 1;
                    let ny = 0;
                    let dist = Math.sqrt(distSq);

                    if (dist > distanceEpsilon) {
                        nx = dx / dist;
                        ny = dy / dist;
                    } else {
                        const seed = (p1.id * 92821) + (p2.id * 68917);
                        const angle = (seed % 360) * (Math.PI / 180);
                        nx = Math.cos(angle);
                        ny = Math.sin(angle);
                        dist = 0;
                    }

                    const overlap = minDist - dist;
                    if (overlap > maxOverlap) {
                        maxOverlap = overlap;
                    }
                    const isBothTrapped = p1.state === ParticleState.TRAPPED && p2.state === ParticleState.TRAPPED;
                    const correctionStrength = isMeltLike && isBothTrapped ? 0.18 : 0.5;
                    const correction = overlap * correctionStrength;

                    p1.x -= nx * correction;
                    p1.y -= ny * correction;
                    p2.x += nx * correction;
                    p2.y += ny * correction;
                }
            }

            return maxOverlap;
        };

        const relaxationPasses = isMeltLike ? 4 : 8;
        const targetBlend = isMeltLike ? 0.26 : 0.15;
        const finalPassLimit = isMeltLike ? 3 : 8;

        for (let iter = 0; iter < relaxationPasses; iter += 1) {
            applySeparationPass();

            for (const node of nodes) {
                node.x = interpolateValue(node.x, node.targetX, targetBlend);
                node.y = interpolateValue(node.y, node.targetY, targetBlend);
            }
        }

        for (let pass = 0; pass < finalPassLimit; pass += 1) {
            const maxOverlap = applySeparationPass();
            if (maxOverlap < overlapTolerance) {
                break;
            }
        }

        for (const node of nodes) {
            resolved.set(node.id, { x: node.x, y: node.y });
            if (node.state === ParticleState.TRAPPED) {
                nextTrappedRenderCache.set(node.id, { x: node.x, y: node.y });
            }
        }

        trappedParticleRenderCacheRef.current = nextTrappedRenderCache;

        return resolved;
    }, [
        meltProgress,
        particles,
        physics.simTime,
        physics.temperature,
        showParticles,
        state,
        shouldResolveParticleOverlaps,
    ]);

    // --- VISIBILITY LOGIC ---
    const hasTrappedParticles = useMemo(() => {
        return particles.some(p => p.state === ParticleState.TRAPPED);
    }, [particles]);

    const hasLiquidParticles = useMemo(() => {
        return particles.some(p => p.state === ParticleState.TRAPPED || p.state === ParticleState.CONDENSING);
    }, [particles]);

    const shouldShowPuddle =
        state === MatterState.SOLID ||
        state === MatterState.MELTING ||
        state === MatterState.EQUILIBRIUM_MELT ||
        state === MatterState.LIQUID ||
        state === MatterState.EQUILIBRIUM_TRIPLE ||
        ((state === MatterState.BOILING || state === MatterState.EQUILIBRIUM_BOIL) && (boilProgress < 1.0 || hasTrappedParticles)) ||
        (state === MatterState.TRANSITION_SCF && hasLiquidParticles) ||
        (state === MatterState.GAS && hasLiquidParticles) ||
        // Sublimation Visibility
        ((state === MatterState.SUBLIMATION || state === MatterState.EQUILIBRIUM_SUB) && sublimationProgress < 1.0);

    const puddleOpacity = shouldShowPuddle && pathProgress < 9.9 ? bulkVisuals.opacity : 0;

    // --- Turbulence Scale Logic (Gradient based on Temperature) ---
    let displacementScale = 0;

    if (state === MatterState.SOLID || state === MatterState.MELTING || state === MatterState.EQUILIBRIUM_MELT) {
        displacementScale = 0;
    } else if (state === MatterState.LIQUID) {
        displacementScale = 0;
    } else if (state === MatterState.EQUILIBRIUM_TRIPLE) {
        displacementScale = 0.8;
    } else if (state === MatterState.BOILING || state === MatterState.EQUILIBRIUM_BOIL || state === MatterState.TRANSITION_SCF) {
        displacementScale = 5 + (boilProgress * 15);
    } else if (state === MatterState.SUBLIMATION || state === MatterState.EQUILIBRIUM_SUB) {
        // Mild shimmer for Sublimation
        displacementScale = 2 + (sublimationProgress * 2);
    } else {
        displacementScale = 0;
    }

    // --- ANIMATION VALUES ---
    const hazeFreq = 0.02 + (0.01 * Math.abs(Math.sin(simTime * 0.3)));
    const boilingSeed = Math.floor(simTime * 60) % 100;
    const steamFreq = 0.02 + (0.005 * Math.abs(Math.sin(simTime * 0.5)));
    const scfSeed = Math.floor(simTime * 20) % 100;
    const scfNoiseSeed = Math.floor(simTime * 15) % 100;

    // --- FILTER ACTIVATION LOGIC ---
    const showBoilingEffect =
        state === MatterState.BOILING ||
        state === MatterState.EQUILIBRIUM_BOIL ||
        state === MatterState.TRANSITION_SCF ||
        state === MatterState.EQUILIBRIUM_TRIPLE ||
        state === MatterState.SUBLIMATION ||
        state === MatterState.EQUILIBRIUM_SUB;

    const showSteamBlur =
        state === MatterState.BOILING ||
        state === MatterState.EQUILIBRIUM_BOIL ||
        state === MatterState.TRANSITION_SCF ||
        state === MatterState.EQUILIBRIUM_TRIPLE ||
        state === MatterState.SUBLIMATION ||
        state === MatterState.EQUILIBRIUM_SUB;

    const isMetallic = ['metal', 'metalloid'].includes(element.category);
    const viewBoxString = `${viewBounds.minX} ${viewBounds.minY} ${viewBounds.width} ${viewBounds.height}`;

    const hudCenterX = viewBounds.minX + (viewBounds.width / 2);
    const hudTopY = viewBounds.minY + 30;
    const isReactionProduct = element.category === 'reaction_product';
    const identityLabel = element.symbol;
    const identityVisual = useMemo(() => {
        if (!isReactionProduct) {
            return {
                shape: 'circle' as const,
                width: 60,
                height: 60,
                fontSize: 24,
                textY: 0,
                textDy: '0.03em',
                statusY: 45,
            };
        }

        const maxWidth = 320;
        const minWidth = 120;
        const horizontalPadding = 24;
        let fontSize = 14;
        let measuredWidth = identityLabel.length * (fontSize * 0.62);
        const fontStack =
            typeof document !== 'undefined'
                ? getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim() || APPS_UI_FONT_STACK
                : APPS_UI_FONT_STACK;

        if (typeof document !== 'undefined') {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
                while (fontSize > 10) {
                    ctx.font = `600 ${fontSize}px ${fontStack}`;
                    measuredWidth = ctx.measureText(identityLabel).width;
                    if (measuredWidth + horizontalPadding <= maxWidth) {
                        break;
                    }
                    fontSize -= 1;
                }
            }
        }

        const capsuleWidth = Math.min(
            maxWidth,
            Math.max(minWidth, Math.ceil(measuredWidth + horizontalPadding)),
        );

        return {
            shape: 'capsule' as const,
            width: capsuleWidth,
            height: 42,
            fontSize,
            textY: 0,
            textDy: '0.02em',
            statusY: 38,
        };
    }, [identityLabel, isReactionProduct]);

    const identityTextColor = useMemo(() => {
        return getRelativeLuminance(adjustedGasColor) > 0.56
            ? 'var(--color-text)'
            : 'var(--color-text-inverse)';
    }, [adjustedGasColor]);

    const identityTextStroke = identityTextColor === 'var(--color-text)'
        ? 'rgba(255, 255, 255, 0.72)'
        : 'rgba(15, 23, 42, 0.24)';

    const phaseStatusLabel = useMemo(
        () => getPhaseStatusLabel(messages, state, powerInput),
        [messages, powerInput, state],
    );

    const phaseStatusColor = useMemo(() => {
        if (state === MatterState.SUPERCRITICAL || state === MatterState.TRANSITION_SCF) {
            return 'var(--color-text-danger-outline)';
        }

        if (state === MatterState.EQUILIBRIUM_TRIPLE) {
            return 'var(--color-text-success-outline)';
        }

        if (state === MatterState.EQUILIBRIUM_MELT || state === MatterState.EQUILIBRIUM_BOIL || state === MatterState.LIQUID) {
            return 'var(--color-text-info-outline)';
        }

        if (state === MatterState.SUBLIMATION || state === MatterState.EQUILIBRIUM_SUB || state === MatterState.GAS) {
            return 'var(--color-text-discovery-outline)';
        }

        if (state === MatterState.MELTING || state === MatterState.BOILING) {
            return 'var(--color-text-warning-outline)';
        }

        return 'var(--color-text-secondary)';
    }, [state]);

    const handleInteraction = (e: React.MouseEvent) => {
        if (onInspect) {
            e.stopPropagation();
            onInspect(e, physics);
        }
    };

    return (
        <div className="w-full h-full flex items-center justify-center relative overflow-hidden select-none">

            <svg
                width="100%"
                height="100%"
                viewBox={viewBoxString}
                preserveAspectRatio="xMidYMid meet"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full h-full z-10"
            >
                <defs>
                    <radialGradient id={`metalSpot-${element.symbol}`} cx="30%" cy="30%" r="80%" fx="20%" fy="20%">
                        <stop offset="0%" stopColor="white" stopOpacity="0.6" />
                        <stop offset="40%" stopColor="white" stopOpacity="0.1" />
                        <stop offset="100%" stopColor="black" stopOpacity="0.1" />
                    </radialGradient>

                    <linearGradient id={`metalSpread-${element.symbol}`} x1="0%" y1="100%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="white" stopOpacity="0.0" />
                        <stop offset="50%" stopColor="white" stopOpacity="0.15" />
                        <stop offset="100%" stopColor="white" stopOpacity="0.0" />
                    </linearGradient>

                    <filter id={`contactShadow-${element.symbol}`}>
                        <feGaussianBlur in="SourceGraphic" stdDeviation="6" />
                    </filter>

                    <filter id={`heatHaze-${element.symbol}`}>
                        <feTurbulence type="fractalNoise" baseFrequency={hazeFreq} numOctaves="2" result="noise" />
                        <feDisplacementMap in="SourceGraphic" in2="noise" scale={displacementScale > 5 ? 5 : 0} />
                    </filter>

                    <filter id={`boilingEffect-${element.symbol}`} x="-20%" y="-20%" width="140%" height="140%">
                        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed={boilingSeed} />
                        <feDisplacementMap in="SourceGraphic" scale={displacementScale} xChannelSelector="R" yChannelSelector="G" />
                    </filter>

                    <filter id={`steamBlur-${element.symbol}`} x="-200%" y="-200%" width="500%" height="500%" filterUnits="objectBoundingBox">
                        <feTurbulence type="fractalNoise" baseFrequency={steamFreq} numOctaves="4" seed="2" result="cloudNoise" />
                        <feDisplacementMap in="SourceGraphic" in2="cloudNoise" scale="80" xChannelSelector="R" yChannelSelector="G" result="puddleExplosion" />
                        <feComposite operator="in" in="cloudNoise" in2="puddleExplosion" result="texturedVapor" />
                        <feOffset in="texturedVapor" dx="0" dy="-30" result="risingVapor" />
                        <feGaussianBlur in="risingVapor" stdDeviation="18" result="finalGasRaw" />
                        <feMorphology in="SourceAlpha" operator="dilate" radius="60" result="expandedBase" />
                        <feGaussianBlur in="expandedBase" stdDeviation="40" result="softFadeMask" />
                        <feComposite in="finalGasRaw" in2="softFadeMask" operator="in" result="finalGasFaded" />
                        <feColorMatrix in="finalGasFaded" type="matrix" values="1 0 0 0 0.95 0 1 0 0 0.95 0 0 1 0 0.95 0 0 0 1 0" />
                    </filter>

                    {/* SUPERCRITICAL NEBULA NOISE FILTER (Organic Cloud) */}
                    <filter id={`scfNoise-${element.symbol}`} x="-20%" y="-20%" width="140%" height="140%">
                        {/* 1. Internal Texture */}
                        <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" seed={scfNoiseSeed} result="noise" />
                        <feColorMatrix in="noise" type="matrix" values="1 0 0 0 0.9   0 1 0 0 0.9   0 0 1 0 0.9  0 0 0 1 0" result="coloredNoise" />

                        {/* 2. Soft Mask Generation */}
                        <feGaussianBlur in="SourceAlpha" stdDeviation="15" result="softEdge" />
                        <feComposite in="coloredNoise" in2="softEdge" operator="in" result="softCloud" />

                        {/* 3. Edge Distortion */}
                        <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed={scfSeed} result="edgeNoise" />
                        <feDisplacementMap in="softCloud" in2="edgeNoise" scale="20" xChannelSelector="R" yChannelSelector="G" />
                    </filter>
                </defs>

                {/* Dynamic Pressure Volume Box / Background (Bounds) */}
                {(state === MatterState.GAS || state === MatterState.BOILING || state === MatterState.EQUILIBRIUM_BOIL || state === MatterState.EQUILIBRIUM_TRIPLE || state === MatterState.SUPERCRITICAL || state === MatterState.TRANSITION_SCF || state === MatterState.SUBLIMATION || state === MatterState.EQUILIBRIUM_SUB) && gasBounds && (
                    <>
                        {/* 1. SUPERCRITICAL FOG LAYER (NEBULA) */}
                        <rect
                            x={gasBounds.minX - 20}
                            y={gasBounds.minY - 20}
                            width={(gasBounds.maxX - gasBounds.minX) + 40}
                            height={(gasBounds.maxY - gasBounds.minY) + 40}
                            fill={adjustedGasColor}
                            opacity={scfOpacity}
                            filter={`url(#scfNoise-${element.symbol})`}
                            className="transition-opacity duration-300"
                            pointerEvents="none"
                        />

                        {/* 2. Dotted Outline - Fixed real-time sync by removing CSS transitions on geometry */}
                        <rect
                            x={gasBounds.minX}
                            y={gasBounds.minY}
                            width={gasBounds.maxX - gasBounds.minX}
                            height={gasBounds.maxY - gasBounds.minY}
                            fill="transparent"
                            stroke="#64748b"
                            strokeWidth="2"
                            strokeDasharray="6,6"
                            opacity={0.1}
                            pointerEvents="all"
                            onClick={handleInteraction}
                            className="cursor-help"
                        />
                    </>
                )}

                {/* --- BULK MATTER (PUDDLE) GROUP --- */}
                <g transform={`translate(${centerX}, ${centerY}) scale(${scaleX}, ${scaleY})`}>
                    <path
                        d={currentPath}
                        fill="#0f172a"
                        filter={`url(#contactShadow-${element.symbol})`}
                        opacity={puddleOpacity * 0.5}
                    />

                    <path
                        d={currentPath}
                        fill={adjustedGasColor}
                        filter={`url(#steamBlur-${element.symbol})`}
                        opacity={showSteamBlur && puddleOpacity > 0 ? 1 : 0}
                        className="transition-opacity duration-700"
                        pointerEvents="none"
                    />

                    {/* 1. BASE MATERIAL LAYER (Interactive) */}
                    <path
                        d={currentPath}
                        fill={bulkVisuals.fill}
                        stroke={isMetallic ? "rgba(255,255,255,0.4)" : "#475569"}
                        strokeWidth="0.5"
                        opacity={puddleOpacity}
                        filter={showBoilingEffect ? `url(#boilingEffect-${element.symbol})` : undefined}
                        className="transition-colors duration-200 cursor-help"
                        onClick={handleInteraction}
                    />

                    {/* 2. SPECULAR SHINE LAYERS */}
                    {isMetallic && state !== MatterState.GAS && state !== MatterState.SUPERCRITICAL && state !== MatterState.SUBLIMATION && state !== MatterState.EQUILIBRIUM_SUB && (
                        <>
                            <path
                                d={currentPath}
                                fill={`url(#metalSpot-${element.symbol})`}
                                style={{ mixBlendMode: 'overlay' }}
                                opacity={puddleOpacity}
                                pointerEvents="none"
                                filter={showBoilingEffect ? `url(#boilingEffect-${element.symbol})` : undefined}
                            />
                            <path
                                d={currentPath}
                                fill={`url(#metalSpread-${element.symbol})`}
                                style={{ mixBlendMode: 'overlay' }}
                                opacity={puddleOpacity}
                                pointerEvents="none"
                                filter={showBoilingEffect ? `url(#boilingEffect-${element.symbol})` : undefined}
                            />
                        </>
                    )}
                </g>

                {/* --- PARTICLE SYSTEM LAYER --- */}
                <g filter={`url(#heatHaze-${element.symbol})`} pointerEvents="none">
                    {particles.map((p) => {
                        // VISIBILITY FIX:
                        // Only hide particles if they are TRAPPED inside the bulk solid/liquid.
                        // Free floating (GAS, RISING) or Condensing particles should be visible.
                        const isHiddenStrict = !showParticles && p.state === ParticleState.TRAPPED;

                        if (isHiddenStrict) return null;

                        let fill = adjustedGasColor;
                        let opacity = gas.opacidade;
                        let renderX = p.x;
                        let renderY = p.y;

                        if (p.state === ParticleState.RISING || p.state === ParticleState.CONDENSING) {
                            fill = adjustedLiquidColor;
                            opacity = liquid.opacidade;
                        }

                        if (state === MatterState.SUBLIMATION || state === MatterState.EQUILIBRIUM_SUB) {
                            if (p.state === ParticleState.RISING || p.state === ParticleState.CONDENSING) {
                                fill = adjustedGasColor; // Sublimation creates gas directly, and condensation is gas -> solid
                                opacity = gas.opacidade;
                            }
                        }

                        if (p.state === ParticleState.TRAPPED) {
                            fill = state === MatterState.SOLID || state === MatterState.SUBLIMATION || state === MatterState.EQUILIBRIUM_SUB ? adjustedSolidColor : adjustedLiquidColor;
                            opacity = 0.9;

                            const resolvedParticlePosition = particleRenderMap.get(p.id);
                            if (resolvedParticlePosition) {
                                renderX = resolvedParticlePosition.x;
                                renderY = resolvedParticlePosition.y;
                            } else {
                                const anchor = getTrappedParticleAnchor(p, state, meltProgress);
                                const vibrationAmp = Math.sqrt(Math.max(0, physics.temperature)) * 0.15;
                                const jitterScale = getTrappedJitterScale(state, meltProgress);
                                const time = physics.simTime * 25;
                                const jitterX = Math.sin(time + p.id * 123) * vibrationAmp * jitterScale;
                                const jitterY = Math.cos(time + p.id * 321) * vibrationAmp * jitterScale;
                                renderX = anchor.x + jitterX;
                                renderY = anchor.y + jitterY;
                            }
                        } else {
                            const resolvedParticlePosition = particleRenderMap.get(p.id);
                            if (resolvedParticlePosition) {
                                renderX = resolvedParticlePosition.x;
                                renderY = resolvedParticlePosition.y;
                            }
                        }

                        return (
                            <circle
                                key={p.id}
                                cx={renderX}
                                cy={renderY}
                                r={p.r}
                                fill={fill}
                                opacity={opacity}
                                className="transition-opacity duration-300"
                                stroke={p.state === ParticleState.TRAPPED ? 'rgba(0,0,0,0.2)' : 'none'}
                                strokeWidth="0.5"
                            />
                        );
                    })}
                </g>

                {/* --- HUD: CENTERED IDENTITY & MOLECULAR STATUS --- */}
                <g
                    transform={`translate(${hudCenterX}, ${hudTopY})`}
                    pointerEvents="all"
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={handleInteraction}
                >

                    {/* 1. Identity Shape */}
                    {identityVisual.shape === 'capsule' ? (
                        <rect
                            x={-identityVisual.width / 2}
                            y={-identityVisual.height / 2}
                            width={identityVisual.width}
                            height={identityVisual.height}
                            rx={identityVisual.height / 2}
                            ry={identityVisual.height / 2}
                            fill={adjustedGasColor}
                            stroke="none"
                            strokeWidth="0"
                            opacity="1"
                            className="drop-shadow-xl"
                        />
                    ) : (
                        <circle
                            r="30"
                            fill={adjustedGasColor}
                            stroke="none"
                            strokeWidth="0"
                            opacity="1"
                            className="drop-shadow-xl"
                        />
                    )}

                    {/* 2. Identity Label */}
                    <text
                        x="0"
                        y={identityVisual.textY}
                        dy={identityVisual.textDy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontFamily="var(--font-sans)"
                        fontWeight="var(--font-heading-lg-weight)"
                        letterSpacing="var(--font-heading-lg-tracking)"
                        fontSize={identityVisual.fontSize}
                        fill={identityTextColor}
                        stroke={identityTextStroke}
                        strokeWidth="0.9px"
                        style={{ paintOrder: 'stroke fill', userSelect: 'none' }}
                    >
                        {identityLabel}
                    </text>

                    {/* 3. Phase Status */}
                    <text
                        y={identityVisual.statusY}
                        textAnchor="middle"
                        fontFamily="var(--font-sans)"
                        fontWeight="var(--font-weight-semibold)"
                        fontSize="var(--font-text-xs-size)"
                        letterSpacing="var(--font-text-xs-tracking)"
                        fill={phaseStatusColor}
                        stroke="var(--color-surface-elevated)"
                        strokeWidth="3px"
                        style={{ paintOrder: 'stroke', userSelect: 'none' }}
                    >
                        {phaseStatusLabel}
                    </text>
                </g>

            </svg>
        </div>
    );
};

export default MatterVisualizer;
