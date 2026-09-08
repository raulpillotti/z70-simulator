import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

interface LoadResult {
    file_name: string;
    program_size: number;
    file_type: string;
}

interface FileLoadPageProps {
    onStart: (result: LoadResult) => void;
}

function extractErrorMessage(e: unknown): string {
    if (typeof e === "string") return e;
    if (e instanceof Error) return e.message;
    if (typeof e === "object" && e !== null && "message" in e) {
        return String((e as { message: unknown }).message);
    }
    return String(e);
}

function FileLoadPage({ onStart }: FileLoadPageProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loadResult, setLoadResult] = useState<LoadResult | null>(null);
    const [controlMemoryFile, setControlMemoryFile] = useState<string | null>(
        null,
    );

    const programLoaded = loadResult !== null;

    async function handleLoadProgram() {
        setError(null);
        try {
            const selected = await open({
                multiple: false,
                title: "Select program",
                filters: [
                    {
                        name: "Z70 Programs",
                        extensions: ["z70", "txt"],
                    },
                ],
            });

            if (!selected) return;

            setLoading(true);
            const path = selected as string;
            let result: LoadResult;
            result = await invoke<LoadResult>("load_assembly_file", { path });
            setLoadResult(result);
        } catch (e) {
            setLoadResult(null);
            setError("Failed to load program: " + extractErrorMessage(e));
        } finally {
            setLoading(false);
        }
    }

    async function handleLoadControlMemory() {
        setError(null);
        try {
            const selected = await open({
                multiple: false,
                title: "Select control memory",
                filters: [
                    {
                        name: "Control Memory",
                        extensions: ["z70m", "txt"],
                    },
                ],
            });

            if (!selected) return;

            const path = selected as string;
            const fileName = await invoke<string>("load_control_memory", {
                path,
            });
            setControlMemoryFile(fileName);
        } catch (e) {
            setControlMemoryFile(null);
            setError(
                "Failed to load control memory: " + extractErrorMessage(e),
            );
        }
    }

    function handleStart() {
        if (loadResult) {
            onStart(loadResult);
        }
    }

    return (
        <main className="flex items-center justify-center min-h-screen m-0 p-8 box-border bg-gray-50 text-gray-900 dark:bg-neutral-800 dark:text-gray-100">
            <div className="flex flex-col items-center gap-6 max-w-md w-full">
                <h1 className="text-3xl font-bold tracking-tight m-0">
                    Z70 Simulator
                </h1>

                <p className="m-0 text-sm text-center leading-relaxed text-gray-500 dark:text-gray-400">
                    {programLoaded ? (
                        <>
                            Program{" "}
                            <strong className="font-semibold text-gray-700 dark:text-gray-200">
                                {loadResult.file_name}
                            </strong>{" "}
                            loaded ({loadResult.program_size} bytes).
                        </>
                    ) : (
                        "Program not loaded."
                    )}
                </p>

                <div className="flex flex-col gap-3 w-full mt-2">
                    <button
                        className="flex items-center gap-4 w-full px-5 py-4 rounded-xl border-[1.5px] border-gray-300 bg-white text-gray-900 text-left font-sans shadow-sm cursor-pointer transition-all duration-200 hover:border-blue-500 hover:shadow-md active:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-neutral-700 dark:text-gray-100 dark:border-neutral-600 dark:hover:border-blue-400 dark:hover:shadow-blue-500/20 dark:active:bg-neutral-600"
                        onClick={handleLoadProgram}
                        disabled={loading}
                    >
                        <span className="text-3xl shrink-0 leading-none">
                            🗀
                        </span>
                        <span className="flex flex-col gap-0.5">
                            <strong className="text-sm font-semibold">
                                {programLoaded
                                    ? "Change Program"
                                    : "Load Program"}
                            </strong>
                            <small className="text-xs text-gray-400 dark:text-gray-500">
                                .z70
                            </small>
                        </span>
                    </button>

                    <button
                        className="flex items-center gap-4 w-full px-5 py-4 rounded-xl border-[1.5px] border-gray-200 bg-transparent text-gray-900 text-left font-sans cursor-pointer transition-all duration-200 hover:border-gray-400 hover:bg-black/2 active:bg-black/4 disabled:opacity-50 disabled:cursor-not-allowed dark:text-gray-100 dark:border-neutral-600 dark:hover:border-neutral-500 dark:hover:bg-white/4 dark:active:bg-white/6"
                        onClick={handleLoadControlMemory}
                        disabled={loading}
                    >
                        <span className="text-2xl shrink-0 leading-none">
                            ⚙
                        </span>
                        <span className="flex flex-col gap-0.5">
                            <strong className="text-sm font-semibold">
                                Custom Control ROM
                            </strong>
                            <small className="text-xs text-gray-400 dark:text-gray-500">
                                {controlMemoryFile
                                    ? controlMemoryFile
                                    : ".z70m (optional)"}
                            </small>
                        </span>
                    </button>
                </div>

                {controlMemoryFile && (
                    <div className="w-full px-4 py-3 rounded-lg text-sm bg-blue-500/10 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300">
                        Control ROM loaded:{" "}
                        <strong className="font-semibold">
                            {controlMemoryFile}
                        </strong>
                    </div>
                )}

                {error && (
                    <div className="w-full px-4 py-3 rounded-lg text-sm bg-red-500/10 text-red-700 wrap-break-word dark:bg-red-400/15 dark:text-red-300">
                        {error}
                    </div>
                )}

                {loading && (
                    <div className="text-sm text-gray-400 dark:text-gray-500">
                        Loading...
                    </div>
                )}

                <button
                    className="w-full mt-2 px-5 py-3 rounded-xl text-sm font-semibold cursor-pointer transition-all duration-200 border-[1.5px] disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 text-white border-blue-600 hover:bg-blue-700 hover:border-blue-700 active:bg-blue-800 disabled:hover:bg-blue-600 disabled:hover:border-blue-600 dark:bg-blue-500 dark:border-blue-500 dark:hover:bg-blue-600 dark:hover:border-blue-600 dark:active:bg-blue-700 dark:disabled:hover:bg-blue-500 dark:disabled:hover:border-blue-500"
                    onClick={handleStart}
                    disabled={!programLoaded || loading}
                >
                    Run
                </button>
            </div>

            <div className="fixed bottom-4 left-0 right-0 text-center">
                <small className="text-xs text-gray-400 dark:text-gray-500">
                    by Raul Tomedi Pillotti
                </small>
            </div>
        </main>
    );
}

export default FileLoadPage;
