import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
    backendPort: () => ipcRenderer.invoke('get-backend-port'),
    onStatusUpdate: (callback: (message: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, value: string) => callback(value);
        ipcRenderer.on('status-update', handler);
        return () => ipcRenderer.removeListener('status-update', handler);
    }
});
