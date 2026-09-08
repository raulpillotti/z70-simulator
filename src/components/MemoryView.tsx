import { useMemo, useRef, useEffect } from "react";

function toHex(value: number, pad: number = 2): string {
    return value.toString(16).toUpperCase().padStart(pad, "0");
}

interface MemoryViewProps {
    memory: number[];
    highlightAddr?: number | null;
    resetKey?: number;
}

function MemoryView({ memory, highlightAddr, resetKey }: MemoryViewProps) {
    const listRef = useRef<HTMLDivElement>(null);
    const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());

    const rows = useMemo(
        () => memory.map((byte, addr) => ({ addr, byte })),
        [memory],
    );

    useEffect(() => {
        if (highlightAddr == null) return;
        const el = rowRefs.current.get(highlightAddr);
        if (el) {
            el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
    }, [highlightAddr]);

    useEffect(() => {
        listRef.current?.scrollTo({ top: 0, behavior: "instant" });
    }, [resetKey]);

    useEffect(() => {
        const current = rowRefs.current;
        return () => {
            current.clear();
        };
    }, [memory.length]);

    if (memory.length === 0) {
        return (
            <div className="flex flex-col h-full rounded-lg border border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
                <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
                    No memory data.
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full rounded-lg border border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-neutral-700">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                    Memory
                </span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    {memory.length} bytes
                </span>
            </div>

            <div className="flex items-center px-3 py-1 border-b border-gray-100 dark:border-neutral-800 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                <span className="w-10 shrink-0">Addr</span>
                <span className="flex-1 text-right">Value</span>
            </div>

            <div ref={listRef} className="flex-1 overflow-y-auto min-h-0">
                {rows.map(({ addr, byte }) => (
                    <div
                        key={addr}
                        ref={(el) => {
                            if (el) rowRefs.current.set(addr, el);
                            else rowRefs.current.delete(addr);
                        }}
                        className={
                            "flex items-center px-3 py-0.75 font-mono text-xs transition-colors duration-300 " +
                            (addr === highlightAddr
                                ? "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200"
                                : byte !== 0xff
                                  ? "text-gray-900 dark:text-gray-100"
                                  : "text-gray-400 dark:text-gray-600") +
                            (addr % 2 === 0 && addr !== highlightAddr
                                ? " bg-transparent"
                                : addr !== highlightAddr
                                  ? " bg-gray-50 dark:bg-neutral-800/50"
                                  : "")
                        }
                    >
                        <span className="w-10 shrink-0 text-gray-500 dark:text-gray-400">
                            0x{toHex(addr)}
                        </span>
                        <span className="flex-1 text-right">
                            0x{toHex(byte)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default MemoryView;
