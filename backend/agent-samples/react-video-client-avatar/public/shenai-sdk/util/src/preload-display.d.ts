declare global {
    interface Window {
        MxUpdatePreloadDisplay: (text: string, timestamp?: number) => void;
        MxClosePreloadDisplay: () => void;
    }
}
export declare function createPreloadDisplay(canvasId: string, options?: {
    hideLogo?: boolean;
}): void;
export declare function updatePreloadDisplay(text: string, timestamp?: number): void;
export declare function updateLoadingProgress(progress: number): void;
export declare function setLoadingProgressCallback(cb: (progress: number) => void): void;
