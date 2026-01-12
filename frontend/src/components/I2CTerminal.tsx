import React, { useState, useEffect, useRef } from 'react';
import { getBackendPort } from '../utils/backend';

const MAX_BUFFER_LINES = 1000;

interface I2CEvent {
    action: 'read' | 'write';
    device: number;
    register: number;
    success: boolean;
    data: number | number[];
}

interface EventEntry {
    id: number;
    event: I2CEvent;
}

function formatHex(value: number): string {
    return `0x${value.toString(16).toUpperCase().padStart(2, '0')}`;
}

function formatDataArray(data: number[]): string {
    if (data.length === 0) return '[]';
    return `[${data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(', ')}]`;
}

function formatEvent(event: I2CEvent): { label: string; data: string; success: boolean } {
    const deviceAddr = formatHex(event.device);
    const registerAddr = formatHex(event.register);

    if (event.action === 'write') {
        const dataValue = typeof event.data === 'number' ? formatHex(event.data) : formatHex(0);
        return {
            label: 'WRITE:',
            data: `Device Addr: ${deviceAddr} Register Addr: ${registerAddr} Data: ${dataValue}`,
            success: event.success,
        };
    } else {
        const dataValue = Array.isArray(event.data) ? formatDataArray(event.data) : '[]';
        return {
            label: 'READ: ',
            data: `Device Addr: ${deviceAddr} Register Addr: ${registerAddr} Data: ${dataValue}`,
            success: event.success,
        };
    }
}

export const I2CTerminal: React.FC = () => {
    const [events, setEvents] = useState<EventEntry[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const ws = useRef<WebSocket | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const eventIdRef = useRef(0);

    useEffect(() => {
        const connectWs = async () => {
            const port = await getBackendPort();
            ws.current = new WebSocket(`ws://localhost:${port}/ws/i2c`);

            ws.current.onopen = () => {
                setIsConnected(true);
            };

            ws.current.onclose = () => {
                setIsConnected(false);
            };

            ws.current.onerror = () => {
                setIsConnected(false);
            };

            ws.current.onmessage = (msg) => {
                try {
                    const event: I2CEvent = JSON.parse(msg.data);
                    const id = ++eventIdRef.current;
                    const entry: EventEntry = { id, event };
                    setEvents(prev => {
                        const next = [...prev, entry];
                        if (next.length > MAX_BUFFER_LINES) {
                            return next.slice(next.length - MAX_BUFFER_LINES);
                        }
                        return next;
                    });
                } catch {
                    // Ignore malformed JSON
                }
            };
        };
        connectWs();

        return () => {
            ws.current?.close();
        };
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [events]);

    return (
        <div className="relative h-full flex flex-col overflow-hidden terminal-window">
            {/* Scanlines overlay */}
            <div className="scanline"></div>
            {/* Title Tab */}
            <div className="relative sticky top-0 left-0 right-0 p-4 pb-2 z-30 border-b border-[#33ccff]/30 mx-2 flex justify-between items-center">
                <span className="terminal-text-blue text-sm tracking-widest uppercase font-bold">I2C Bus</span>
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#33ccff]' : 'bg-red-500'} shadow-[0_0_5px_currentColor]`} title={isConnected ? "Connected" : "Disconnected"}></span>
            </div>

            <div ref={scrollRef} className="relative flex-1 overflow-y-auto p-4 terminal-text-blue whitespace-pre-wrap z-10 scrollbar-thin scrollbar-thumb-[#33ccff]/20 scrollbar-track-transparent">
                {events.map((entry) => {
                    const formatted = formatEvent(entry.event);
                    return (
                        <div key={entry.id} className="flex leading-tight">
                            <span className="select-none mr-2 opacity-70">{formatted.label}</span>
                            <span>{formatted.data}</span>
                            <span className={`ml-2 ${formatted.success ? 'text-green-400' : 'text-red-400'}`}>
                                {formatted.success ? '\u2713' : '\u2717'}
                            </span>
                        </div>
                    );
                })}
                <div className="flex items-center leading-tight">
                    <span className="select-none mr-2 opacity-50">{'>'}</span>
                    <span className="animate-blink inline-block w-2.5 h-4 bg-[#33ccff]"></span>
                </div>
            </div>
        </div>
    );
};
