import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface DisassembledInstruction {
    address: number;
    bytes: number[];
    mnemonic: string;
    size: number;
}

interface InstructionViewProps {
    pc: number;
    microIndex?: number;
    fetchLen?: number;
    microOpcode?: number | null;
    microStartPc?: number;
}

export function toHex(value: number, pad: number = 2): string {
    return value.toString(16).toUpperCase().padStart(pad, "0");
}

function InstructionView({
    pc,
    microIndex = -1,
    microOpcode,
    microStartPc = -1,
}: InstructionViewProps) {
    const [instructions, setInstructions] = useState<DisassembledInstruction[]>(
        [],
    );
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const activeRowRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(null);

            try {
                const instrs = await invoke<DisassembledInstruction[]>(
                    "get_disassembled_instructions",
                );

                if (!cancelled) {
                    setInstructions(instrs);
                }
            } catch (e) {
                if (!cancelled) {
                    const message = e instanceof Error ? e.message : String(e);
                    setError(message);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        void load();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (activeRowRef.current) {
            activeRowRef.current.scrollIntoView({
                block: "nearest",
                behavior: "smooth",
            });
        }
    }, [pc, instructions, microIndex]);

    if (loading) {
        return (
            <div className="flex flex-col h-full overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
                <div className="flex items-center px-3 border-b border-gray-200 dark:border-neutral-700">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                        Instructions
                    </span>
                </div>
                <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
                    Loading...
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col h-full overflow-hidden rounded-lg border border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-900/20">
                <div className="flex items-center px-3 py-1 border-b border-red-200 dark:border-red-500/30">
                    <span className="text-xs font-semibold text-red-700 dark:text-red-400">
                        Instructions
                    </span>
                </div>
                <div className="px-3 py-2 text-xs text-red-600 dark:text-red-400">
                    {error}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex items-center justify-between px-3 py-1 border-b border-gray-200 dark:border-neutral-700">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                    Instructions
                </span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    PC: 0x{toHex(pc)}
                </span>
            </div>

            <div className="flex items-center px-3 py-1 border-b border-gray-100 dark:border-neutral-800 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                <span className="w-10 shrink-0">Addr</span>
                <span className="w-16 shrink-0">Hex</span>
                <span className="flex-1 ml-2">Instruction</span>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 h-0">
                {instructions.map((instr, idx) => {
                    const inMicroStep = microIndex >= 0 && microStartPc >= 0;
                    const isActive =
                        inMicroStep && microOpcode != null
                            ? instr.bytes[0] === microOpcode &&
                              instr.address === microStartPc
                            : instr.address === pc;
                    const bytesStr =
                        "0x" + instr.bytes.map((b) => toHex(b)).join(" 0x");

                    return (
                        <div
                            key={instr.address}
                            ref={isActive ? activeRowRef : undefined}
                            className={
                                "flex items-center px-3 py-0.75 font-mono text-xs " +
                                (isActive
                                    ? "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100 font-semibold"
                                    : idx % 2 === 0
                                      ? "bg-transparent text-gray-900 dark:text-gray-100"
                                      : "bg-gray-50 text-gray-900 dark:bg-neutral-800/50 dark:text-gray-100")
                            }
                        >
                            <span
                                className={
                                    "w-10 shrink-0 " +
                                    (isActive
                                        ? "text-blue-700 dark:text-blue-300"
                                        : "text-gray-500 dark:text-gray-400")
                                }
                            >
                                0x{toHex(instr.address)}
                            </span>
                            <span
                                className={
                                    "w-16 shrink-0 " +
                                    (isActive
                                        ? "text-blue-600 dark:text-blue-400"
                                        : "text-gray-400 dark:text-gray-500")
                                }
                            >
                                {bytesStr}
                            </span>
                            <span className="flex-1 ml-2">
                                {instr.mnemonic}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default InstructionView;
