interface ConsoleProps {
    title: string;
    children: React.ReactNode;
    className?: string;
}

export const Console: React.FC<ConsoleProps> = ({ title, children, className = '' }) => {
    return (
        <div className={`flex flex-col bg-console border border-border rounded-lg overflow-hidden shadow-lg ${className}`}>
            <div className="bg-border px-4 py-2 text-sm font-semibold uppercase tracking-wider text-gray-300 select-none">
                {title}
            </div>
            <div className="flex-1 overflow-hidden relative">
                {children}
            </div>
        </div>
    );
};
