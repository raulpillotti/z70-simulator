import { toHex } from "./InstructionView";

interface MicroinstructionPayload {
    src_reg: number;
    dst_reg: number;
    reg_write: boolean;
    mem_read: boolean;
    mem_write: boolean;
    inc_pc: boolean;
    mem_op: number;
    alu_op: number;
    seq_ctrl: number;
    raw: number;
}

const REG_NAMES: Record<number, string> = {
    0x0: "A",
    0x1: "B",
    0x2: "I",
    0x3: "PC",
    0x4: "IR",
    0x5: "MAR",
    0x6: "MDR",
    0x7: "S",
    0x8: "TEMP1",
    0x9: "TEMP2",
};

const ALU_OPS: Record<number, string> = {
    0x0: "NOP", // no op
    0x1: "TEMP1 + TEMP2", // add
    0x2: "TEMP1 - TEMP2", // sub
    0x3: "TEMP1 & TEMP2", // and
    0x4: "TEMP1 | TEMP2", // or
    0x5: "~TEMP1", // not
    0x6: "TEMP1 >> 1", // shr
    0x7: "TEMP1 << 1", // shl
    0x8: "TEMP1 + 1", // inc
    0x9: "TEMP1 - 1", // dec
};

function regName(code: number): string {
    return REG_NAMES[code] ?? `R${code}`;
}

function aluOpName(code: number): string {
    return ALU_OPS[code] ?? `OP${code}`;
}

const JUMP_FLAG_BY_OPCODE: Record<number, string> = {
    0xa1: "ZF",
    0xa2: "SF",
    0xa3: "CF",
    0xa4: "OF",
    0xa5: "PF",
};

interface DescribeOptions {
    jumpFlag?: string;
    isLastStep: boolean;
}

function describeMicroOp(
    mi: MicroinstructionPayload,
    opts: DescribeOptions,
): string {
    const parts: string[] = [];

    const isConditionalJumpWriteback =
        Boolean(opts.jumpFlag) &&
        opts.isLastStep &&
        mi.reg_write &&
        mi.alu_op === 0 &&
        mi.src_reg === 0x6 && // MDR
        mi.dst_reg === 0x3; // PC

    if (isConditionalJumpWriteback) {
        parts.push(`PC ← (${opts.jumpFlag} ? MDR : PC)`);
    } else if (mi.reg_write) {
        if (mi.alu_op !== 0) {
            parts.push(`${regName(mi.dst_reg)} ← ${aluOpName(mi.alu_op)}`);
        } else {
            parts.push(`${regName(mi.dst_reg)} ← ${regName(mi.src_reg)}`);
        }
    }

    if (mi.mem_read) parts.push("MDR ← MEM[MAR]");
    if (mi.mem_write) parts.push("MEM[MAR] ← MDR");
    if (mi.inc_pc) parts.push("PC++");

    if (parts.length === 0) parts.push("NOP");

    return parts.join("; ");
}

interface MicroinstructionViewProps {
    microOps: MicroinstructionPayload[];
    opcode: number | null;
    currentIndex: number;
    fetchLen: number;
}

function MicroinstructionView({
    microOps,
    opcode,
    currentIndex,
    fetchLen,
}: MicroinstructionViewProps) {
    if (microOps.length === 0) {
        return (
            <div className="flex flex-col h-full overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
                <div className="flex items-center px-3 border-b border-gray-200 dark:border-neutral-700">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                        Microinstructions
                    </span>
                </div>
                <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
                    Click <strong>Step</strong> or <strong>µStep</strong> to
                    execute.
                </div>
            </div>
        );
    }

    const fetchInProgress = currentIndex < fetchLen;
    const visibleOps = fetchInProgress ? microOps.slice(0, fetchLen) : microOps;
    const allDone = currentIndex >= microOps.length;
    const executed = allDone ? microOps.length : Math.max(0, currentIndex);

    return (
        <div className="flex flex-col h-full overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex items-center justify-between px-3 py-1 border-b border-gray-200 dark:border-neutral-700">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                    Microinstructions
                </span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    {executed}/{microOps.length} µOPs
                </span>
            </div>

            <div className="flex items-center px-3 py-1 border-b border-gray-100 dark:border-neutral-800 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                <span className="w-6 shrink-0 text-center">#</span>
                <span className="w-16 shrink-0">Hex</span>
                <span className="flex-1">Description</span>
                <span className="w-10 shrink-0 text-center">Seq</span>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 h-0">
                {visibleOps.map((mi, idx) => {
                    const isCurrent = idx === currentIndex;
                    const isExecuted = idx < currentIndex;
                    const jumpFlag =
                        opcode != null
                            ? JUMP_FLAG_BY_OPCODE[opcode]
                            : undefined;

                    return (
                        <div
                            key={idx}
                            className={
                                "flex items-center px-3 py-0.75 font-mono text-xs " +
                                (isCurrent
                                    ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100 font-semibold "
                                    : isExecuted
                                      ? (idx % 2 === 0
                                            ? "bg-transparent "
                                            : "bg-gray-50 dark:bg-neutral-800/50 ") +
                                        "text-gray-900 dark:text-gray-100 "
                                      : (idx % 2 === 0
                                            ? "bg-transparent "
                                            : "bg-gray-50 dark:bg-neutral-800/50 ") +
                                        "text-gray-400 dark:text-gray-500 ")
                            }
                        >
                            <span className="w-6 shrink-0 text-center text-gray-400 dark:text-gray-500">
                                {idx}
                            </span>

                            <span
                                className={
                                    "w-16 shrink-0 " +
                                    (isCurrent
                                        ? "text-amber-700 dark:text-amber-300"
                                        : isExecuted
                                          ? "text-blue-600 dark:text-blue-400"
                                          : "text-gray-400 dark:text-gray-500")
                                }
                            >
                                {`0x${toHex(mi.raw, 4)}`}
                            </span>

                            <span className="flex-1 truncate">
                                {describeMicroOp(mi, {
                                    jumpFlag,
                                    isLastStep: idx === microOps.length - 1,
                                })}
                            </span>

                            <span className="w-10 shrink-0 text-center">
                                {mi.seq_ctrl}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default MicroinstructionView;
