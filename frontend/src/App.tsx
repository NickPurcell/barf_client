import { useState, useRef, useEffect } from 'react';
import { AgentChat } from './components/AgentChat';
import { TerminalTabs } from './components/TerminalTabs';

function App() {
  const [leftWidth, setLeftWidth] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const style = window.getComputedStyle(container);
      const paddingLeft = parseFloat(style.paddingLeft) || 0;
      const paddingRight = parseFloat(style.paddingRight) || 0;

      // Calculate available width for content (excluding padding)
      // clientWidth includes padding, so subtract it
      const contentWidth = container.clientWidth - paddingLeft - paddingRight;

      // Calculate position relative to the content area
      const relativeX = e.clientX - rect.left - paddingLeft;

      // Convert to percentage
      let newLeftWidth = (relativeX / contentWidth) * 100;

      // Clamp between 20% and 80% to prevent panels from disappearing
      newLeftWidth = Math.min(Math.max(newLeftWidth, 20), 80);

      setLeftWidth(newLeftWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    e.preventDefault();
  };

  return (
    <div ref={containerRef} className="flex h-screen w-screen p-4">
      <div style={{ width: `${leftWidth}%` }} className="h-full min-w-0">
        <AgentChat />
      </div>

      {/* Resizer Handle */}
      <div
        className="w-4 flex flex-shrink-0 items-center justify-center cursor-col-resize hover:bg-white/5 transition-colors rounded"
        onMouseDown={handleMouseDown}
      >
        <div className="h-12 w-1 bg-gray-600/50 rounded-full" />
      </div>

      <div className="flex-1 h-full min-w-0 relative flex items-center justify-center">
        <div className="w-full h-full z-10">
          <TerminalTabs />
        </div>
      </div>
    </div>
  );
}

export default App;
