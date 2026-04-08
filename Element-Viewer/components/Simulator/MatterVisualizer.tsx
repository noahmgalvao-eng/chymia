
import React, { useMemo, type MutableRefObject } from 'react';
import { PhysicsState, ChemicalElement, MatterState, ParticleState, ViewBoxDimensions } from '../../types';
import { interpolateColor, interpolateValue } from '../../utils/interpolator';
import { getPhaseStatusLabel } from '../../app/appDefinitions';
import { useI18n } from '../../i18n';
import {
    getMatterPathFromProgress,
    getMatterRenderTransform,
} from '../../utils/evaporationLayout';
import ParticleCanvasLayer from './ParticleCanvasLayer';

interface Props {
    physics: PhysicsState;
    element: ChemicalElement;
    livePhysicsRef: MutableRefObject<PhysicsState>;
    liveFrameRef: MutableRefObject<number>;
    showParticles: boolean;
    viewBounds: ViewBoxDimensions;
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

const MatterVisualizer: React.FC<Props> = ({
    physics,
    element,
    livePhysicsRef,
    liveFrameRef,
    showParticles,
    viewBounds,
    onInspect,
}) => {
    const { messages } = useI18n();
    const { pathProgress, state, particles, boilProgress, meltProgress, matterRect, gasBounds, sublimationProgress, powerInput } = physics;

    // --- 1. SVG Path Interpolator (Puddle / Solid) ---
    const currentPath = useMemo(() => getMatterPathFromProgress(pathProgress, 0.01), [pathProgress]);

    // --- DNA Visual Properties (Dynamic from JSON) ---
    const { solid, liquid, gas } = element.visualDNA;

    const isDarkTheme = (() => {
        if (typeof window === 'undefined') return false;

        const dataTheme = document.documentElement.getAttribute('data-theme');
        if (dataTheme === 'dark') return true;
        if (dataTheme === 'light') return false;

        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    })();

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

    const { scaleX, scaleY, centerX, centerY } = useMemo(
        () => getMatterRenderTransform(matterRect, meltProgress, state),
        [matterRect, meltProgress, state],
    );

    // --- VISIBILITY LOGIC ---
    const hasTrappedParticles = particles.some((particle) => particle.state === ParticleState.TRAPPED);

    const hasLiquidParticles = particles.some(
        (particle) => particle.state === ParticleState.TRAPPED || particle.state === ParticleState.CONDENSING,
    );

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
        if (isDarkTheme) {
            return '#111111';
        }

        return getRelativeLuminance(adjustedGasColor) > 0.56
            ? 'var(--color-text)'
            : 'var(--color-text-inverse)';
    }, [adjustedGasColor, isDarkTheme]);

    const identityTextStroke = isDarkTheme || identityTextColor === 'var(--color-text)'
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
    const canvasPalette = useMemo(() => ({
        solidColor: adjustedSolidColor,
        liquidColor: adjustedLiquidColor,
        gasColor: adjustedGasColor,
        solidOpacity: solid.opacidade,
        liquidOpacity: liquid.opacidade,
        gasOpacity: gas.opacidade,
    }), [
        adjustedGasColor,
        adjustedLiquidColor,
        adjustedSolidColor,
        gas.opacidade,
        liquid.opacidade,
        solid.opacidade,
    ]);

    const handleInteraction = (e: React.MouseEvent) => {
        if (onInspect) {
            e.stopPropagation();
            onInspect(e, {
                ...livePhysicsRef.current,
                particles: livePhysicsRef.current.particles.map((particle) => ({ ...particle })),
            });
        }
    };

    return (
        <div className="relative h-full w-full overflow-hidden select-none">
            <ParticleCanvasLayer
                liveFrameRef={liveFrameRef}
                livePhysicsRef={livePhysicsRef}
                palette={canvasPalette}
                showParticles={showParticles}
                viewBounds={viewBounds}
            />

            <svg
                width="100%"
                height="100%"
                viewBox={viewBoxString}
                preserveAspectRatio="xMidYMid meet"
                xmlns="http://www.w3.org/2000/svg"
                className="absolute inset-0 z-10 h-full w-full"
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
                </defs>

                {(state === MatterState.GAS || state === MatterState.BOILING || state === MatterState.EQUILIBRIUM_BOIL || state === MatterState.EQUILIBRIUM_TRIPLE || state === MatterState.SUPERCRITICAL || state === MatterState.TRANSITION_SCF || state === MatterState.SUBLIMATION || state === MatterState.EQUILIBRIUM_SUB) && gasBounds && (
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
                )}

                <g transform={`translate(${centerX}, ${centerY}) scale(${scaleX}, ${scaleY})`}>
                    <path
                        d={currentPath}
                        fill="#0f172a"
                        filter={`url(#contactShadow-${element.symbol})`}
                        opacity={puddleOpacity * 0.5}
                    />

                    <path
                        d={currentPath}
                        fill={bulkVisuals.fill}
                        stroke={isMetallic ? 'rgba(255,255,255,0.4)' : '#475569'}
                        strokeWidth="0.5"
                        opacity={puddleOpacity}
                        className="cursor-help transition-colors duration-200"
                        onClick={handleInteraction}
                    />

                    {isMetallic && state !== MatterState.GAS && state !== MatterState.SUPERCRITICAL && state !== MatterState.SUBLIMATION && state !== MatterState.EQUILIBRIUM_SUB && (
                        <>
                            <path
                                d={currentPath}
                                fill={`url(#metalSpot-${element.symbol})`}
                                style={{ mixBlendMode: 'overlay' }}
                                opacity={puddleOpacity}
                                pointerEvents="none"
                            />
                            <path
                                d={currentPath}
                                fill={`url(#metalSpread-${element.symbol})`}
                                style={{ mixBlendMode: 'overlay' }}
                                opacity={puddleOpacity}
                                pointerEvents="none"
                            />
                        </>
                    )}
                </g>
            </svg>

            <svg
                width="100%"
                height="100%"
                viewBox={viewBoxString}
                preserveAspectRatio="xMidYMid meet"
                xmlns="http://www.w3.org/2000/svg"
                className="absolute inset-0 z-30 h-full w-full"
            >
                <g
                    transform={`translate(${hudCenterX}, ${hudTopY})`}
                    pointerEvents="all"
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={handleInteraction}
                >
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
