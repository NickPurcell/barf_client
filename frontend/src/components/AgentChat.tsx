import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Console } from './Console';
import { ThinkingIndicator } from './ThinkingIndicator';
import { getBackendPort } from '../utils/backend';

interface ToolCall {
    name: string;
    args: string;
    message?: string;  // Formatted message from backend
}

interface Message {
    sender: 'User' | 'AI';
    text: string;
    toolCalls?: ToolCall[];
}

// Inline Chevron Icon Component
const ChevronRight = ({ className }: { className?: string }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="m9 18 6-6-6-6" />
    </svg>
);

const ToolCallDisplay: React.FC<{ toolCalls: ToolCall[]; hasContentAfter?: boolean }> = ({ toolCalls, hasContentAfter }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!toolCalls || toolCalls.length === 0) return null;

    const formatToolLog = (tc: ToolCall) => {
        // Use backend-formatted message if available
        if (tc.message) return tc.message;

        // Fallback to frontend formatting for legacy/missing messages
        if (tc.name === 'read_uart') return "Reading UART";

        // Handle uart_write or similar names
        if (tc.name.includes('uart') && (tc.name.includes('write') || tc.name.includes('send'))) {
            try {
                const args = JSON.parse(tc.args);
                const content = args.command || args.text || args.data || args.payload || args.message;
                if (content) return `Writing "${content}" to UART`;
            } catch {
                const match = tc.args.match(/"(?:command|text|data|payload|message)":\s*"([^"]+)"/);
                if (match) return `Writing "${match[1]}" to UART`;
            }
            return "Writing to UART";
        }

        // Generic fallback
        const displayArgs = tc.args.length > 50 ? tc.args.substring(0, 50) + '...' : tc.args;
        return `Using Tool: ${tc.name}(${displayArgs})`;
    };

    return (
        <div className={hasContentAfter ? "mb-2" : "mb-0.5"}>
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1.5 text-gray-400 hover:text-gray-200 transition-colors font-mono text-base group"
            >
                <ChevronRight className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                <span>{isExpanded ? 'Tool Usage' : formatToolLog(toolCalls[toolCalls.length - 1])}</span>
                {!isExpanded && toolCalls.length > 1 && (
                    <span className="text-xs bg-gray-800 px-1.5 py-0.5 rounded text-gray-500 group-hover:text-gray-300">
                        +{toolCalls.length - 1} more
                    </span>
                )}
            </button>

            {isExpanded && (
                <div className="pl-4 mt-1 space-y-0.5 border-l border-gray-800 ml-1.5">
                    {toolCalls.map((tc, idx) => (
                        <div key={idx} className="font-mono text-base text-gray-500">
                            {formatToolLog(tc)}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export const AgentChat: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const ws = useRef<WebSocket | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const isAtBottomRef = useRef(true);

    const scrollToBottom = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    };

    useEffect(() => {
        // Connect to WebSocket

        const connectWs = async () => {
            const port = await getBackendPort();
            ws.current = new WebSocket(`ws://localhost:${port}/ws/chat`);

            ws.current.onopen = () => {
                setIsConnected(true);
            };
            ws.current.onclose = () => {
                setIsThinking(false);
                setIsConnected(false);
            };
            ws.current.onerror = () => {
                setIsThinking(false);
                setIsConnected(false);
            };

            ws.current.onmessage = (event) => {
                let data;
                try {
                    data = JSON.parse(event.data);
                } catch {
                    return; // Ignore malformed messages
                }

                if (data.type === 'tool_call') {
                    const newToolCall: ToolCall = {
                        name: data.tool_data?.name || "unknown",
                        args: data.tool_data?.args || "",
                        message: data.message,  // Use formatted message from backend
                    };

                    setMessages(prev => {
                        const last = prev[prev.length - 1];
                        // If last message is User, start a new AI message
                        // If last message is AI, append tool call
                        if (!last || last.sender === 'User') {
                            return [...prev, { sender: 'AI', text: '', toolCalls: [newToolCall] }];
                        } else {
                            // AI message exists
                            return [
                                ...prev.slice(0, -1),
                                {
                                    ...last,
                                    toolCalls: [...(last.toolCalls || []), newToolCall]
                                }
                            ];
                        }
                    });
                    setIsThinking(true);

                    if (isAtBottomRef.current) {
                        setTimeout(scrollToBottom, 0);
                    }
                }
                else if (data.type === 'content') {
                    setIsThinking(false);
                    setMessages(prev => {
                        const last = prev[prev.length - 1];
                        if (last && last.sender === 'AI') {
                            // Update last message
                            return [...prev.slice(0, -1), { ...last, text: last.text + data.delta }];
                        } else {
                            // New AI message (unlikely if tool calls came first, but handle it)
                            return [...prev, { sender: 'AI', text: data.delta }];
                        }
                    });
                }
                else if (data.type === 'end_turn') {
                    setIsThinking(false);
                }
            };

        };

        connectWs();

        return () => {
            ws.current?.close();
        };
    }, []);

    useEffect(() => {
        const container = scrollRef.current;
        if (!container) return;

        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = container;
            isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50;
        };

        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, []);

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || !ws.current || ws.current.readyState !== WebSocket.OPEN) return;

        setMessages(prev => [...prev, { sender: 'User', text: input }]);
        setIsThinking(true);
        ws.current.send(input);
        setInput('');

        isAtBottomRef.current = true;
        setTimeout(scrollToBottom, 0);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <Console title="Agent Chat" className="h-full">
            <div className="flex flex-col h-full">
                {/* Messages Area */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 text-base">
                    <div className="max-w-[35vw] mx-auto space-y-2">
                        {messages.map((msg, idx) => (
                            <div
                                key={idx}
                                className={`flex w-full ${msg.sender === 'User' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-[85%] rounded-2xl py-2 ${msg.sender === 'User'
                                        ? 'bg-[#2f2f2f] text-white rounded-br-sm px-4'
                                        : 'text-gray-100 px-1'
                                        }`}
                                >
                                    {msg.sender === 'AI' ? (
                                        <div className="flex flex-col">
                                            {/* Tool Calls */}
                                            {msg.toolCalls && msg.toolCalls.length > 0 && (
                                                <ToolCallDisplay toolCalls={msg.toolCalls} hasContentAfter={!!msg.text} />
                                            )}

                                            {/* Text Content */}
                                            {msg.text && (
                                                <div className="prose prose-invert prose-base max-w-none leading-snug">
                                                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                                                </div>
                                            )}

                                            {/* Thinking Indicator (Integrated) */}
                                            {isThinking && idx === messages.length - 1 && (
                                                <div className="mt-1">
                                                    <ThinkingIndicator />
                                                </div>
                                            )}

                                        </div>
                                    ) : (
                                        <div className="text-left whitespace-pre-wrap">{msg.text}</div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Thinking Indicator (Standalone - when no AI message exists yet) */}
                        {isThinking && messages.length > 0 && messages[messages.length - 1].sender !== 'AI' && (
                            <div className="flex w-full justify-start">
                                <div className="max-w-[85%] rounded-2xl py-2 text-gray-100 px-1">
                                    <ThinkingIndicator />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Input Area */}
                <div className="p-3 bg-console border-t border-border">
                    <div className="flex gap-2 max-w-[35vw] mx-auto">
                        <input
                            className="flex-1 bg-background border border-border rounded px-3 py-1.5 text-base focus:outline-none focus:border-blue-500 transition-colors text-white caret-white placeholder-gray-400"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Type a message..."
                            autoFocus
                        />
                        <button
                            onClick={() => handleSubmit()}
                            disabled={!isConnected}
                            className={`px-3 py-1.5 rounded text-base font-medium transition-colors ${isConnected
                                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                }`}
                        >
                            {isConnected ? 'Send' : 'Connecting...'}
                        </button>
                    </div>
                </div>
            </div>
        </Console>
    );
};
