const DEFAULT_PORT = 8000;

export async function getBackendPort(): Promise<number> {
    if (window.electron) {
        return window.electron.backendPort();
    }
    return DEFAULT_PORT;
}
