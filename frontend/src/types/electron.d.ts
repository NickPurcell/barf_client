export interface ElectronAPI {
    backendPort: () => Promise<number>;
    onStatusUpdate: (callback: (message: string) => void) => void;
}

declare global {
    interface Window {
        electron?: ElectronAPI;
    }
}
