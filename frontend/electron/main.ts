import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { spawn, ChildProcess, execSync } from 'child_process';
import getPort from 'get-port';
import { fileURLToPath } from 'url';
import http from 'http';
import Store from 'electron-store';

// ESM dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let backendPort = 0;
let raspberryPiIp = '';

const IS_DEV = process.env.NODE_ENV === 'development' || !app.isPackaged;
const DEFAULT_PI_IP = '10.0.0.104';

// Settings store initialization
interface SettingsSchema {
    piIp: string;
    openaiApiKey: string;
    openaiModel: string;
}

const store = new Store<SettingsSchema>({
    name: 'settings',
    defaults: {
        piIp: DEFAULT_PI_IP,
        openaiApiKey: '',
        openaiModel: 'o4-mini',
    },
});

// Settings interface for passing around
interface AppSettings {
    piIp: string;
    openaiApiKey: string;
    openaiModel: string;
}

// Conditional debug logging
const debug = (...args: unknown[]) => {
    if (IS_DEV) console.log('[Main]', ...args);
};

function getIconPath() {
    if (process.platform === 'win32') {
        return path.join(__dirname, '../build/icon.ico');
    } else if (process.platform === 'darwin') {
        return path.join(__dirname, '../build/icon.icns');
    }
    return path.join(__dirname, '../build/icon.png');
}

function createSplashWindow() {
    splashWindow = new BrowserWindow({
        width: 400,
        height: 300,
        frame: false,
        alwaysOnTop: true,
        transparent: true,
        icon: getIconPath(),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), // Vite builds to .mjs often, verify extension
        },
    });

    splashWindow.loadFile(path.join(__dirname, '../electron/splash.html'));
    return splashWindow;
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        show: false, // Don't show until ready
        autoHideMenuBar: true,
        icon: getIconPath(),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    if (IS_DEV) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
        // Ensure we quit the app when main window is closed
        // This triggers will-quit which runs cleanup()
        app.quit();
    });
}

function updateSplashStatus(message: string) {
    if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.webContents.send('status-update', message);
    }
}

async function checkMcpConnection(ip: string): Promise<boolean> {
    return new Promise((resolve) => {
        const url = `http://${ip}:8000/mcp`;
        const req = http.get(url, { timeout: 5000 }, (res) => {
            // Any response means the server is there
            resolve(true);
        });

        req.on('error', () => {
            resolve(false);
        });

        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

async function showSettingsPrompt(errorMessage?: string): Promise<AppSettings | null> {
    return new Promise((resolve) => {
        const promptWindow = new BrowserWindow({
            width: 500,
            height: 420,
            frame: false,
            resizable: false,
            alwaysOnTop: true,
            webPreferences: {
                contextIsolation: false,  // Allow executeJavaScript to work simply
                nodeIntegration: false,
            },
        });

        promptWindow.loadFile(path.join(__dirname, '../electron/prompt.html'));

        let resolved = false;

        // Load saved settings from store
        const savedPiIp = store.get('piIp', DEFAULT_PI_IP);
        const savedApiKey = store.get('openaiApiKey', '');
        const savedModel = store.get('openaiModel', 'o4-mini');

        promptWindow.webContents.once('did-finish-load', async () => {
            // Inject saved values and handlers
            await promptWindow.webContents.executeJavaScript(`
                document.getElementById('ip').value = '${savedPiIp}';
                document.getElementById('apiKey').value = '${savedApiKey.replace(/'/g, "\\'")}';
                document.getElementById('model').value = '${savedModel}';
                document.getElementById('ip').select();
                document.getElementById('error').textContent = '${errorMessage || ''}';

                // Toggle password visibility
                document.getElementById('toggleApiKey').onclick = () => {
                    const input = document.getElementById('apiKey');
                    const btn = document.getElementById('toggleApiKey');
                    if (input.type === 'password') {
                        input.type = 'text';
                        btn.textContent = 'Hide';
                    } else {
                        input.type = 'password';
                        btn.textContent = 'Show';
                    }
                };

                document.getElementById('connectBtn').onclick = () => {
                    const ip = document.getElementById('ip').value.trim();
                    const apiKey = document.getElementById('apiKey').value.trim();
                    const model = document.getElementById('model').value.trim();
                    // Encode as JSON in hash
                    const data = JSON.stringify({ ip, apiKey, model });
                    location.hash = 'submit:' + encodeURIComponent(data);
                };

                document.getElementById('cancelBtn').onclick = () => {
                    location.hash = 'cancel';
                };

                // Enter key submits, Escape cancels
                document.querySelectorAll('input').forEach(el => {
                    el.onkeydown = (e) => {
                        if (e.key === 'Enter') document.getElementById('connectBtn').click();
                        if (e.key === 'Escape') document.getElementById('cancelBtn').click();
                    };
                });

                true; // Return serializable value to avoid IPC cloning error
            `);
        });

        // Listen for hash changes (our simple IPC mechanism)
        promptWindow.webContents.on('did-navigate-in-page', async (_event, url) => {
            const hash = new URL(url).hash;

            if (hash === '#cancel') {
                resolved = true;
                promptWindow.close();
                resolve(null);
                return;
            }

            if (hash.startsWith('#submit:')) {
                const encoded = hash.slice(8); // Remove '#submit:'
                const { ip, apiKey, model } = JSON.parse(decodeURIComponent(encoded));

                // Validate IP format
                const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
                if (!ip) {
                    await promptWindow.webContents.executeJavaScript(`
                        document.getElementById('error').textContent = 'Please enter a Pi IP address.';
                        location.hash = '';
                        true;
                    `);
                    return;
                }
                if (!ipRegex.test(ip)) {
                    await promptWindow.webContents.executeJavaScript(`
                        document.getElementById('error').textContent = 'Invalid IP address format.';
                        location.hash = '';
                        true;
                    `);
                    return;
                }

                // Validate API key is present
                if (!apiKey) {
                    await promptWindow.webContents.executeJavaScript(`
                        document.getElementById('error').textContent = 'Please enter your OpenAI API key.';
                        location.hash = '';
                        true;
                    `);
                    return;
                }

                // Validate model is present
                if (!model) {
                    await promptWindow.webContents.executeJavaScript(`
                        document.getElementById('error').textContent = 'Please enter an OpenAI model name.';
                        location.hash = '';
                        true;
                    `);
                    return;
                }

                // Show checking status
                await promptWindow.webContents.executeJavaScript(`
                    document.getElementById('error').textContent = 'Checking Pi connection...';
                    document.getElementById('connectBtn').disabled = true;
                    true;
                `);

                // Check if Pi is reachable
                const connected = await checkMcpConnection(ip);

                if (connected) {
                    // Save settings to store
                    store.set('piIp', ip);
                    store.set('openaiApiKey', apiKey);
                    store.set('openaiModel', model);

                    resolved = true;
                    promptWindow.close();
                    resolve({ piIp: ip, openaiApiKey: apiKey, openaiModel: model });
                } else {
                    await promptWindow.webContents.executeJavaScript(`
                        document.getElementById('error').textContent = 'No Pi found at that IP address.';
                        document.getElementById('connectBtn').disabled = false;
                        location.hash = '';
                        true;
                    `);
                }
            }
        });

        promptWindow.on('closed', () => {
            if (!resolved) {
                resolve(null);
            }
        });
    });
}

async function startBackend(settings: AppSettings) {
    backendPort = await getPort({ port: 8000 });
    debug(`Selected backend port: ${backendPort}`);
    updateSplashStatus(`Starting backend on port ${backendPort}...`);

    let exePath = '';
    let args: string[] = [];
    let cwd = '';

    // Set environment variables for the backend
    const env = {
        ...process.env,
        BARF_MCP_URL: `http://${settings.piIp}:8000/mcp`,
        BARF_UART_URL: `http://${settings.piIp}:8000/uart`,
        BARF_I2C_URL: `http://${settings.piIp}:8000/i2c`,
        OPENAI_API_KEY: settings.openaiApiKey,
        OPENAI_MODEL: settings.openaiModel,
    };

    if (IS_DEV) {
        // In Dev: Spawn with uv run
        // Assuming CWD is frontend/, so ../ is host/
        cwd = path.join(process.cwd(), '..');
        exePath = 'uv';
        args = ['run', 'python', 'backend/src/host_backend/server.py', '--port', backendPort.toString()];
    } else {
        // In Prod: Spawn bundled executable
        // TODO: Adjust path for where electron-builder puts extraResources
        const resourcesPath = process.resourcesPath;
        exePath = path.join(resourcesPath, 'backend', 'server.exe');
        cwd = path.dirname(exePath);
        args = ['--port', backendPort.toString()];
    }

    debug(`Spawning: ${exePath} ${args.join(' ')} in ${cwd}`);
    debug(`Using Pi IP: ${settings.piIp}`);

    backendProcess = spawn(exePath, args, {
        cwd,
        env,
        stdio: 'inherit',
        shell: IS_DEV ? true : false,
    });

    backendProcess.on('error', (err) => {
        debug('Failed to start backend:', err);
        updateSplashStatus(`Error starting backend: ${err.message}`);
    });

    backendProcess.on('exit', (code, signal) => {
        debug(`Backend exited with code ${code} signal ${signal}`);
    });
}

async function checkBackendHealth(): Promise<boolean> {
    return new Promise((resolve) => {
        const req = http.get(`http://localhost:${backendPort}`, { timeout: 5000 }, () => {
            resolve(true);
        });

        req.on('error', () => {
            resolve(false);
        });

        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

app.whenReady().then(async () => {
    let errorMessage: string | undefined;

    // Loop until we successfully connect or user cancels
    while (true) {
        // Show settings prompt dialog
        const settings = await showSettingsPrompt(errorMessage);

        if (settings === null) {
            // User cancelled
            app.quit();
            return;
        }

        raspberryPiIp = settings.piIp;

        // Show splash screen while starting backend
        createSplashWindow();
        updateSplashStatus(`Connected to Pi at ${settings.piIp}! Starting backend...`);

        await startBackend(settings);

        // Wait for backend with 15s timeout
        const startTime = Date.now();
        let ready = false;

        while (Date.now() - startTime < 15000) {
            updateSplashStatus(`Connecting to backend... (${Math.ceil((15000 - (Date.now() - startTime)) / 1000)}s)`);
            if (await checkBackendHealth()) {
                ready = true;
                break;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        if (ready) {
            updateSplashStatus('Backend Ready! Launching UI...');
            await new Promise(r => setTimeout(r, 500)); // Brief pause

            createMainWindow();

            if (splashWindow && !splashWindow.isDestroyed()) {
                splashWindow.close();
            }

            if (mainWindow) {
                mainWindow.show();
                mainWindow.focus();
            }
            break; // Success - exit the loop
        } else {
            // Backend failed to start - kill it and try again
            cleanup();

            if (splashWindow && !splashWindow.isDestroyed()) {
                splashWindow.close();
                splashWindow = null;
            }

            errorMessage = 'Unable to connect to MCP server on raspberry pi';
            // Loop continues, will show dialog again with error
        }
    }
});

// IPC Handler for port
ipcMain.handle('get-backend-port', () => backendPort);

// Lifecycle Management
function cleanup() {
    if (backendProcess && backendProcess.pid) {
        debug('Killing backend process tree...');
        try {
            if (process.platform === 'win32') {
                // Windows: taskkill with /T kills process tree
                execSync(`taskkill /F /T /PID ${backendProcess.pid}`);
            } else {
                // Unix: Kill the entire process group
                // When spawned with shell: true, we need to kill the whole tree
                // Using pkill to find and kill children, then the parent
                try {
                    // Kill all child processes
                    execSync(`pkill -P ${backendProcess.pid}`, { stdio: 'ignore' });
                } catch {
                    // No children or already dead
                }
                // Kill the shell process itself
                process.kill(backendProcess.pid, 'SIGTERM');
            }
        } catch {
            // Process already dead, ignore
        }
        backendProcess = null;
    }
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    cleanup();
});
