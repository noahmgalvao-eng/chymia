import { useChatGPT } from './useChatGPT';
import { ChemicalElement } from '../types';
import { useI18n } from '../i18n';

interface UseElementViewerChatProps {
    globalTemperature: number;
    globalPressure: number;
    selectedElements: ChemicalElement[];
}

export function useElementViewerChat({
    globalTemperature,
    globalPressure,
    selectedElements
}: UseElementViewerChatProps) {
    const { messages } = useI18n();

    const {
        displayMode,
        theme,
        userAgent,
        maxHeight,
        safeArea,
        isFullscreen,
        requestDisplayMode,
        sendFollowUpMessage
    } = useChatGPT();

    const handleInfoClick = async () => {
        if (!sendFollowUpMessage) {
            console.warn('ChatGPT SDK: sendFollowUpMessage not available');
            return;
        }

        const isMulti = selectedElements.length > 1;
        const formattedTemperature = globalTemperature.toFixed(1);
        const formattedPressure = globalPressure.toExponential(2);
        const prompt = isMulti
            ? messages.app.chatPrompts.multi(formattedTemperature, formattedPressure)
            : messages.app.chatPrompts.single(formattedTemperature, formattedPressure);

        await sendFollowUpMessage(prompt);
    };

    return {
        displayMode,
        theme,
        userAgent,
        maxHeight,
        safeArea,
        isFullscreen,
        requestDisplayMode,
        handleInfoClick
    };
}
