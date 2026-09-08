import { useEffect, useState, type PointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import FileLoadPage from "./components/FileLoadPage";
import InstructionView from "./components/InstructionView";
import MicroinstructionView from "./components/MicroinstructionView";
import CpuDiagram, { type AnimatedMicroOp } from "./components/CpuDiagram";
import "./App.css";

interface LoadResult {
    file_name: string;
    program_size: number;
    file_type: string;
}

interface FlagsState {
    cf: boolean;
    zf: boolean;
    sf: boolean;
    pf: boolean;
    of: boolean;
}

interface CpuState {
    pc: number;
    a: number;
    b: number;
    i: number;
    ir: number;
    mar: number;
    mdr: number;
    s: number;
    temp1: number;
    temp2: number;
    flags: FlagsState;
    state: string;
    cycle_count: number;
    completed_instruction_count: number;
    mem_reads: number;
    mem_writes: number;
    reg_reads: number;
    reg_writes: number;
    cond_jump_taken_count: number;
    cond_jump_not_taken_count: number;
}

export interface MicroinstructionPayload {
    src_reg: number;
    dst_reg: number;
    reg_write: boolean;
    reg_write_cond: number;
    mem_read: boolean;
    mem_write: boolean;
    inc_pc: boolean;
    mem_op: number;
    alu_op: number;
    seq_ctrl: number;
    raw: number;
}

interface CpuSnapshot {
    pc: number;
    a: number;
    b: number;
    i: number;
    ir: number;
    mar: number;
    mdr: number;
    s: number;
    temp1: number;
    temp2: number;
    flags: FlagsState;
}

interface StepResult {
    cpu_state: CpuState;
    micro_ops: MicroinstructionPayload[];
    snapshots: CpuSnapshot[];
    memory: number[];
}

function App() {
    const [loadResult, setLoadResult] = useState<LoadResult | null>(null);
    const [cpuState, setCpuState] = useState<CpuState | null>(null);
    const [memory, setMemory] = useState<number[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [microOps, setMicroOps] = useState<MicroinstructionPayload[]>([]);
    const [microOpcode, setMicroOpcode] = useState<number | null>(null);
    const [fetchLen, setFetchLen] = useState(0);
    const [microIndex, setMicroIndex] = useState(-1);
    const [pendingResult, setPendingResult] = useState<StepResult | null>(null);
    const [animatedMicroOp, setAnimatedMicroOp] =
        useState<AnimatedMicroOp | null>(null);
    const [resetKey, setResetKey] = useState(0);
    const [microStartPc, setMicroStartPc] = useState(-1);
    const [bottomHeight, setBottomHeight] = useState(200);

    const isMidMicro =
        pendingResult !== null &&
        microIndex >= 0 &&
        microIndex < microOps.length;

    function handleStart(result: LoadResult) {
        setLoadResult(result);
    }

    function handleResizeStart(e: PointerEvent) {
        e.preventDefault();
        const startY = e.clientY;
        const startHeight = bottomHeight;

        const onMove = (ev: globalThis.PointerEvent) => {
            const dy = startY - ev.clientY;
            const next = Math.min(600, Math.max(100, startHeight + dy));
            setBottomHeight(next);
        };

        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
    }

    async function handleBackToLoad() {
        try {
            await invoke("reset_all");
        } catch {}
        setLoadResult(null);
        setCpuState(null);
        setMemory([]);
        setMicroOps([]);
        setMicroOpcode(null);
        setFetchLen(0);
        setMicroIndex(-1);
        setMicroStartPc(-1);
        setPendingResult(null);
        setAnimatedMicroOp(null);
        setError(null);
    }

    function applySnapshot(snap: CpuSnapshot) {
        if (!cpuState) return;
        setCpuState({
            ...cpuState,
            pc: snap.pc,
            a: snap.a,
            b: snap.b,
            i: snap.i,
            ir: snap.ir,
            mar: snap.mar,
            mdr: snap.mdr,
            s: snap.s,
            temp1: snap.temp1,
            temp2: snap.temp2,
            flags: snap.flags,
        });
    }

    async function applyFullResult(result: StepResult) {
        setCpuState(result.cpu_state);
        setMemory(result.memory);
        setPendingResult(null);
        setMicroStartPc(-1);
        setError(null);

        try {
            const ops = await invoke<MicroinstructionPayload[]>(
                "get_microinstructions",
            );
            setMicroOps(ops);
            setMicroIndex(-1);
            setMicroOpcode(result.memory[result.cpu_state.pc] ?? null);
        } catch {
            setMicroOps([]);
            setMicroIndex(-1);
            setMicroOpcode(null);
        }
    }

    useEffect(() => {
        if (!loadResult) return;
        let cancelled = false;
        (async () => {
            try {
                const [state, mem, fLen] = await Promise.all([
                    invoke<CpuState>("get_cpu_state"),
                    invoke<number[]>("get_memory_dump"),
                    invoke<number>("get_fetch_length"),
                ]);
                if (!cancelled) {
                    setCpuState(state);
                    setMemory(mem);
                    setFetchLen(fLen);
                    try {
                        const ops = await invoke<MicroinstructionPayload[]>(
                            "get_microinstructions",
                        );
                        if (!cancelled) {
                            setMicroOps(ops);
                            setMicroIndex(-1);
                            setMicroOpcode(mem[state.pc] ?? null);
                        }
                    } catch {
                        if (!cancelled) {
                            setMicroOpcode(null);
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to fetch initial state:", e);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [loadResult]);

    async function handleStep() {
        try {
            setAnimatedMicroOp(null);
            if (pendingResult) {
                await applyFullResult(pendingResult);
                return;
            }
            const result = await invoke<StepResult>("execute_step");
            await applyFullResult(result);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            setError(message);
        }
    }

    async function handleMicroStep() {
        try {
            if (!isMidMicro) {
                const result = await invoke<StepResult>("execute_step");
                setPendingResult(result);
                setMicroOps(result.micro_ops);
                setMicroIndex(0);
                setMicroOpcode(cpuState ? (memory[cpuState.pc] ?? null) : null);
                setMicroStartPc(cpuState?.pc ?? -1);
                setError(null);
                setAnimatedMicroOp(null);
                return;
            }

            if (pendingResult!.snapshots[microIndex]) {
                const executedMi = microOps[microIndex];
                let condTaken: boolean | undefined;

                if (executedMi && executedMi.reg_write_cond >= 2) {
                    const prevSnap =
                        microIndex > 0
                            ? pendingResult!.snapshots[microIndex - 1]
                            : null;
                    const curSnap = pendingResult!.snapshots[microIndex];
                    if (prevSnap && curSnap) {
                        condTaken = curSnap.pc !== prevSnap.pc;
                    }
                }

                applySnapshot(pendingResult!.snapshots[microIndex]);

                if (executedMi) {
                    setAnimatedMicroOp({
                        mi: executedMi,
                        tick: Date.now(),
                        condTaken,
                    });
                }
            }

            const next = microIndex + 1;
            if (next >= microOps.length) {
                await applyFullResult(pendingResult!);
                return;
            }
            setMicroIndex(next);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            setError(message);
        }
    }

    async function handleRun() {
        try {
            setAnimatedMicroOp(null);
            if (pendingResult) {
                await applyFullResult(pendingResult);
            }
            const result = await invoke<StepResult>("execute_run");
            await applyFullResult(result);
        } catch (e) {
            try {
                const [freshState, freshMem] = await Promise.all([
                    invoke<CpuState>("get_cpu_state"),
                    invoke<number[]>("get_memory_dump"),
                ]);
                setCpuState(freshState);
                setMemory(freshMem);
            } catch {}
            const message = e instanceof Error ? e.message : String(e);
            setError(message);
        }
    }

    async function handleReset() {
        try {
            const result = await invoke<StepResult>("reset_cpu");
            await applyFullResult(result);
            setResetKey((k) => k + 1);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            setError(message);
        }
    }

    if (!loadResult) {
        return <FileLoadPage onStart={handleStart} />;
    }

    const isRunning = cpuState?.state === "Running";
    let cpi = "0";
    if (cpuState) {
        const result =
            cpuState.cycle_count / cpuState.completed_instruction_count;
        if (!Number.isNaN(result)) {
            cpi = result.toFixed(2);
        }
    }

    return (
        <main className="flex flex-col h-screen bg-gray-50 text-gray-900 dark:bg-neutral-800 dark:text-gray-100">
            <header className="flex items-center gap-4 px-4 py-2 border-b border-gray-200 dark:border-neutral-700 shrink-0">
                <button
                    onClick={handleBackToLoad}
                    title="Load a new program and control ROM"
                    className="text-sm text-white hover:text-gray-300 mr-1 cursor-pointer bg-transparent border-none p-0"
                >
                    ⏎
                </button>
                <span className="text-sm text-white mr-2">
                    {loadResult.file_name}
                </span>

                {loadResult && cpuState && (
                    <div className="flex items-center gap-4 pt-1 text-xs text-white">
                        <span className="group relative shrink-0">
                            <span className="cursor-help underline decoration-dotted underline-offset-2">
                                size
                            </span>
                            : <strong>{loadResult.program_size} B</strong>
                            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 rounded bg-gray-800 text-white text-[13px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 shadow-lg">
                                Total program size in bytes
                            </span>
                        </span>
                        <span className="group relative shrink-0">
                            <span className="cursor-help underline decoration-dotted underline-offset-2">
                                clocks
                            </span>
                            : <strong>{cpuState.cycle_count}</strong>
                            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 rounded bg-gray-800 text-white text-[13px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 shadow-lg">
                                Number of clock cycles executed
                            </span>
                        </span>
                        <span className="group relative shrink-0">
                            <span className="cursor-help underline decoration-dotted underline-offset-2">
                                instr
                            </span>
                            :{" "}
                            <strong>
                                {cpuState.completed_instruction_count}
                            </strong>
                            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 rounded bg-gray-800 text-white text-[13px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 shadow-lg">
                                Number of completed instructions
                            </span>
                        </span>
                        <span className="group relative shrink-0">
                            <span className="cursor-help underline decoration-dotted underline-offset-2">
                                CPI
                            </span>
                            : <strong>{cpi}</strong>
                            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 rounded bg-gray-800 text-white text-[13px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 shadow-lg">
                                Cycles per instruction (average)
                            </span>
                        </span>
                        <span className="group relative shrink-0">
                            <span className="cursor-help underline decoration-dotted underline-offset-2">
                                MRD
                            </span>
                            : <strong>{cpuState.mem_reads}</strong>
                            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 rounded bg-gray-800 text-white text-[13px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 shadow-lg">
                                Total memory reads
                            </span>
                        </span>
                        <span className="group relative shrink-0">
                            <span className="cursor-help underline decoration-dotted underline-offset-2">
                                MWR
                            </span>
                            : <strong>{cpuState.mem_writes}</strong>
                            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 rounded bg-gray-800 text-white text-[13px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 shadow-lg">
                                Total memory writes
                            </span>
                        </span>
                        <span className="group relative shrink-0">
                            <span className="cursor-help underline decoration-dotted underline-offset-2">
                                RRD
                            </span>
                            : <strong>{cpuState.reg_reads}</strong>
                            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 rounded bg-gray-800 text-white text-[13px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 shadow-lg">
                                Total register reads
                            </span>
                        </span>
                        <span className="group relative shrink-0">
                            <span className="cursor-help underline decoration-dotted underline-offset-2">
                                RWD
                            </span>
                            : <strong>{cpuState.reg_writes}</strong>
                            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 rounded bg-gray-800 text-white text-[13px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 shadow-lg">
                                Total register writes
                            </span>
                        </span>
                        <span className="group relative shrink-0">
                            <span className="cursor-help underline decoration-dotted underline-offset-2">
                                JTK
                            </span>
                            : <strong>{cpuState.cond_jump_taken_count}</strong>
                            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 rounded bg-gray-800 text-white text-[13px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 shadow-lg">
                                Number of conditional jumps that were taken
                            </span>
                        </span>
                        <span className="group relative shrink-0">
                            <span className="cursor-help underline decoration-dotted underline-offset-2">
                                JNTK
                            </span>
                            :{" "}
                            <strong>
                                {cpuState.cond_jump_not_taken_count}
                            </strong>
                            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 rounded bg-gray-800 text-white text-[13px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 shadow-lg">
                                Number of conditional jumps that were not taken
                            </span>
                        </span>
                    </div>
                )}

                <div className="ml-auto flex items-center gap-2">
                    <span
                        className={
                            "text-[10px] px-2 py-0.5 rounded-full font-semibold " +
                            (isRunning
                                ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                                : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400")
                        }
                    >
                        {cpuState?.state ?? "—"}
                    </span>

                    <button
                        onClick={handleMicroStep}
                        disabled={!isRunning && !isMidMicro}
                        title="Execute one microinstruction"
                        className={
                            "px-3 py-1 text-xs font-semibold rounded " +
                            (isRunning || isMidMicro
                                ? "bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700 cursor-pointer"
                                : "bg-gray-300 text-gray-500 dark:bg-neutral-600 dark:text-neutral-400 cursor-not-allowed")
                        }
                    >
                        µStep
                    </button>

                    <button
                        onClick={handleStep}
                        disabled={!isRunning && !isMidMicro}
                        title="Execute one complete instruction"
                        className={
                            "px-3 py-1 text-xs font-semibold rounded " +
                            (isRunning || isMidMicro
                                ? "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 cursor-pointer"
                                : "bg-gray-300 text-gray-500 dark:bg-neutral-600 dark:text-neutral-400 cursor-not-allowed")
                        }
                    >
                        Step
                    </button>

                    <button
                        onClick={handleRun}
                        disabled={!isRunning && !isMidMicro}
                        title="Run the program to completion"
                        className={
                            "px-3 py-1 text-xs font-semibold rounded " +
                            (isRunning || isMidMicro
                                ? "bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 cursor-pointer"
                                : "bg-gray-300 text-gray-500 dark:bg-neutral-600 dark:text-neutral-400 cursor-not-allowed")
                        }
                    >
                        Run
                    </button>

                    <button
                        onClick={handleReset}
                        title="Reset simulation to initial state"
                        className="px-3 py-1 text-xs font-semibold rounded bg-orange-500 text-white hover:bg-orange-600 active:bg-orange-700 dark:bg-orange-600 dark:hover:bg-orange-500 cursor-pointer"
                    >
                        Reset
                    </button>
                </div>
            </header>

            {error && (
                <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs border-b border-red-200 dark:border-red-800">
                    {error}
                </div>
            )}

            {cpuState && (
                <div className="flex items-center gap-3 px-4 py-1.5 border-b border-gray-200 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-900 text-[13px] font-mono text-white shrink-0 overflow-x-auto">
                    {(
                        [
                            ["PC", cpuState.pc],
                            ["A", cpuState.a],
                            ["B", cpuState.b],
                            ["I", cpuState.i],
                            ["IR", cpuState.ir],
                            ["MAR", cpuState.mar],
                            ["MDR", cpuState.mdr],
                            ["S", cpuState.s],
                            ["T1", cpuState.temp1],
                            ["T2", cpuState.temp2],
                        ] as [string, number][]
                    ).map(([name, val]) => (
                        <span key={name} className="flex items-center gap-1">
                            <span>{name}:</span>
                            <strong>
                                0x
                                {val
                                    .toString(16)
                                    .toUpperCase()
                                    .padStart(2, "0")}
                            </strong>
                        </span>
                    ))}
                    {(
                        [
                            ["CF", cpuState.flags.cf],
                            ["ZF", cpuState.flags.zf],
                            ["SF", cpuState.flags.sf],
                            ["PF", cpuState.flags.pf],
                            ["OF", cpuState.flags.of],
                        ] as [string, boolean][]
                    ).map(([name, val]) => (
                        <span
                            key={name}
                            className={
                                "flex items-center gap-1 " +
                                (val
                                    ? "px-1 rounded bg-yellow-200 text-yellow-800 dark:bg-yellow-700/40 dark:text-yellow-300 font-bold"
                                    : "text-white")
                            }
                        >
                            <span>{name}:</span>
                            <strong>{val ? "1" : "0"}</strong>
                        </span>
                    ))}
                </div>
            )}

            <div className="flex flex-1 min-h-0">
                <div className="flex-1 flex flex-col min-w-0 min-h-0">
                    <div className="flex-1 h-100 p-3">
                        <CpuDiagram
                            cpuState={cpuState}
                            memory={memory}
                            animatedMicroOp={animatedMicroOp}
                            resetKey={resetKey}
                        />
                    </div>

                    <div
                        onPointerDown={handleResizeStart}
                        className="shrink-0 h-1.5 cursor-ns-resize bg-gray-200 hover:bg-blue-400 dark:bg-neutral-700 dark:hover:bg-blue-500 transition-colors"
                        title="Drag to resize"
                    />

                    <div
                        className="flex shrink-0 border-t border-gray-200 dark:border-neutral-700"
                        style={{ height: bottomHeight }}
                    >
                        <div className="flex-1 min-w-0 p-2 h-full">
                            <InstructionView
                                pc={cpuState?.pc ?? 0}
                                microIndex={microIndex}
                                fetchLen={fetchLen}
                                microOpcode={microOpcode}
                                microStartPc={microStartPc}
                            />
                        </div>
                        <div className="flex-1 shrink-0 border-l border-gray-200 dark:border-neutral-700 p-2 h-full">
                            <MicroinstructionView
                                microOps={microOps}
                                opcode={microOpcode}
                                currentIndex={microIndex}
                                fetchLen={fetchLen}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}

export default App;
