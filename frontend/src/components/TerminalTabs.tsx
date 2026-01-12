import React, { useState } from 'react';
import { UARTTerminal } from './UARTTerminal';
import { I2CTerminal } from './I2CTerminal';

type TabType = 'uart' | 'i2c';

export const TerminalTabs: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabType>('uart');

    return (
        <div className="h-full flex flex-col bg-black">
            {/* Tab Bar */}
            <div className="flex border-b border-border/50 bg-black">
                <button
                    className={`px-4 py-2 text-sm font-bold tracking-wider uppercase transition-colors ${
                        activeTab === 'uart'
                            ? 'border-b-2 border-retro-green-light text-retro-green-light'
                            : 'text-text/60 hover:text-text'
                    }`}
                    onClick={() => setActiveTab('uart')}
                >
                    UART
                </button>
                <button
                    className={`px-4 py-2 text-sm font-bold tracking-wider uppercase transition-colors ${
                        activeTab === 'i2c'
                            ? 'border-b-2 border-retro-blue-light text-retro-blue-light'
                            : 'text-text/60 hover:text-text'
                    }`}
                    onClick={() => setActiveTab('i2c')}
                >
                    I2C
                </button>
            </div>

            {/* Terminal Content */}
            <div className="flex-1 overflow-hidden">
                {activeTab === 'uart' ? <UARTTerminal /> : <I2CTerminal />}
            </div>
        </div>
    );
};
