import React, { useState, useEffect, useRef } from 'react';
import { getBackendPort } from '../utils/backend';

const MAX_BUFFER_LINES = 1000;

interface LineEntry {
    id: number;
    text: string;
}

export const UARTTerminal: React.FC = () => {
    const [lines, setLines] = useState<LineEntry[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const ws = useRef<WebSocket | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const lineIdRef = useRef(0);

    useEffect(() => {
        const connectWs = async () => {
            const port = await getBackendPort();
            ws.current = new WebSocket(`ws://localhost:${port}/ws/uart`);

            ws.current.onopen = () => {
                setIsConnected(true);
            };

            ws.current.onclose = () => {
                setIsConnected(false);
            };

            ws.current.onerror = () => {
                setIsConnected(false);
            };

            ws.current.onmessage = (event) => {
                const id = ++lineIdRef.current;
                const entry: LineEntry = { id, text: event.data };
                setLines(prev => {
                    const next = [...prev, entry];
                    if (next.length > MAX_BUFFER_LINES) {
                        return next.slice(next.length - MAX_BUFFER_LINES);
                    }
                    return next;
                });
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
    }, [lines]);

    return (
        <div className="relative h-full flex flex-col overflow-hidden terminal-window">
            {/* Scanlines overlay */}
            <div className="scanline"></div>
            {/* Title Tab */}
            <div className="relative sticky top-0 left-0 right-0 p-4 pb-2 z-30 border-b border-[#33ff33]/30 mx-2 flex justify-between items-center">
                <span className="terminal-text text-sm tracking-widest uppercase font-bold">UART Output</span>
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#33ff33]' : 'bg-red-500'} shadow-[0_0_5px_currentColor]`} title={isConnected ? "Connected" : "Disconnected"}></span>
            </div>

            <div ref={scrollRef} className="relative flex-1 overflow-y-auto p-4 terminal-text whitespace-pre-wrap z-10 scrollbar-thin scrollbar-thumb-[#33ff33]/20 scrollbar-track-transparent">
                {lines.map((entry) => (
                    <div key={entry.id} className="flex leading-tight">
                        <span className="select-none mr-2 opacity-50">{'>'}</span>
                        <span>{entry.text}</span>
                    </div>
                ))}
                <div className="flex items-center leading-tight">
                    <span className="select-none mr-2 opacity-50">{'>'}</span>
                    <span className="animate-blink inline-block w-2.5 h-4 bg-[#33ff33]"></span>
                </div>
            </div>
        </div>
    );
};
