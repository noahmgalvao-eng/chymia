import { useChatGPT } from './useChatGPT';

export function useElementViewerChat() {
    const {
        displayMode,
        theme,
        userAgent,
        maxHeight,
        safeArea,
        isFullscreen,
        requestDisplayMode,
    } = useChatGPT();

    return {
        displayMode,
        theme,
        userAgent,
        maxHeight,
        safeArea,
        isFullscreen,
        requestDisplayMode,
    };
}
