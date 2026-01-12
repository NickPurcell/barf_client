import React, { useState, useEffect } from 'react';

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export const ThinkingIndicator: React.FC = () => {
    const [frame, setFrame] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setFrame(f => (f + 1) % frames.length);
        }, 80);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="flex items-center gap-2 text-gray-400 font-mono text-base py-1">
            <span className="inline-block w-4 text-center text-purple-400">{frames[frame]}</span>
            <span>Thinking...</span>
        </div>
    );
};
