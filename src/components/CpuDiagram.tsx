import { useRef, useEffect, useState } from "react";
import MemoryView from "./MemoryView";
import * as d3 from "d3";

interface FlagsState {
    cf: boolean;
    zf: boolean;
    sf: boolean;
    pf: boolean;
    of: boolean;
}

interface MicroinstructionPayload {
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

export interface AnimatedMicroOp {
    mi: MicroinstructionPayload;
    tick: number;
    condTaken?: boolean;
}

interface CpuDiagramProps {
    memory?: number[];
    cpuState: {
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
    } | null;
    animatedMicroOp?: AnimatedMicroOp | null;
    resetKey?: number;
}

type Sel = d3.Selection<any, any, any, any>;
const C = "currentColor";

function toHex(v: number): string {
    let hex = v.toString(16).toUpperCase().padStart(2, "0");
    return "0x" + hex;
}

function drawRegister(
    parent: Sel,
    x: number,
    y: number,
    w: number,
    h: number,
    name: string,
    id: string,
) {
    const g = parent
        .append("g")
        .attr("id", `reg-${id}`)
        .attr("class", "cpu-register");

    g.append("rect")
        .attr("x", x)
        .attr("y", y)
        .attr("width", w)
        .attr("height", h)
        .attr("rx", 4)
        .attr("fill", "none")
        .attr("stroke", C)
        .attr("stroke-width", 0.8)
        .attr("opacity", 0.65);

    const nameY = y + Math.floor(h / 2) - 3;
    const valY = y + Math.floor(h / 2) + 7;

    g.append("text")
        .attr("x", x + w / 2)
        .attr("y", nameY)
        .attr("text-anchor", "middle")
        // .attr("dominant-baseline", "central")
        .attr("fill", C)
        .attr("opacity", 0.8)
        .attr("font-size", "0.7rem")
        .attr("font-weight", 600)
        .text(name);

    g.append("text")
        .attr("id", `val-${id}`)
        .attr("x", x + w / 2)
        .attr("y", valY)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("fill", C)
        .attr("opacity", 0.6)
        .attr("font-size", 11)
        .attr("font-family", "ui-monospace, monospace")
        .text("00");

    return g;
}

function drawBus(
    parent: Sel,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    id: string,
    strokeWidth = 1.8,
    opacity = 0.5,
    color = C,
) {
    return parent
        .append("line")
        .attr("id", id)
        .attr("class", "cpu-bus")
        .attr("x1", x1)
        .attr("y1", y1)
        .attr("x2", x2)
        .attr("y2", y2)
        .attr("stroke", color)
        .attr("stroke-width", strokeWidth)
        .attr("opacity", opacity);
}

function buildDiagram(svg: Sel) {
    const defs = svg.append("defs");
    defs.append("marker")
        .attr("id", "cpu-arrow")
        .attr("viewBox", "0 0 10 10")
        .attr("refX", 8)
        .attr("refY", 5)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto-start-reverse")
        .append("path")
        .attr("d", "M2 1L8 5L2 9")
        .attr("fill", "none")
        .attr("stroke", "context-stroke")
        .attr("stroke-width", 1.5)
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round");

    const ucG = svg.append("g").attr("class", "control-unit");
    ucG.append("rect")
        .attr("x", 155)
        .attr("y", 82)
        .attr("width", 185)
        .attr("height", 130)
        .attr("rx", 10)
        .attr("fill", "none")
        .attr("stroke", C)
        .attr("stroke-width", 1)
        .attr("opacity", 0.4);

    ucG.append("text")
        .attr("x", 252)
        .attr("y", 97)
        .attr("text-anchor", "middle")
        .attr("fill", C)
        .attr("opacity", 0.65)
        .attr("font-size", 13)
        .attr("font-weight", 500)
        .text("Control Unit");

    ucG.append("rect")
        .attr("id", "decoder-box")
        .attr("x", 190)
        .attr("y", 108 + 12)
        .attr("width", 120)
        .attr("height", 36)
        .attr("rx", 6)
        .attr("fill", "none")
        .attr("stroke", C)
        .attr("stroke-width", 0.7)
        .attr("opacity", 0.5);

    ucG.append("text")
        .attr("x", 252)
        .attr("y", 126 + 12)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("fill", C)
        .attr("font-size", 12)
        .text("Decoder");

    drawRegister(svg, 22, 148, 55, 28, "PC", "pc");
    drawRegister(svg, 90, 148, 55, 28, "IR", "ir");
    drawRegister(svg, 388, 144, 65, 28, "MAR", "mar");
    drawRegister(svg, 388, 184, 65, 28, "MDR", "mdr");
    drawRegister(svg, 60, 262, 72, 26, "TEMP1", "temp1");
    drawRegister(svg, 178, 262, 72, 26, "TEMP2", "temp2");
    drawRegister(svg, 280, 330, 50, 26, "S", "s");
    drawRegister(svg, 375, 265, 50, 26, "A", "a");
    drawRegister(svg, 435, 265, 50, 26, "B", "b");
    drawRegister(svg, 495, 265, 50, 26, "I", "i");

    const busBar = svg.append("g").attr("class", "internal-bus");
    busBar
        .append("rect")
        .attr("x", 22)
        .attr("y", 228)
        .attr("width", 538)
        .attr("height", 12)
        .attr("rx", 3)
        .attr("fill", C)
        .attr("opacity", 0.08);

    busBar
        .append("rect")
        .attr("id", "internal-bus-rect")
        .attr("class", "cpu-bus")
        .attr("x", 22)
        .attr("y", 228)
        .attr("width", 538)
        .attr("height", 12)
        .attr("rx", 3)
        .attr("fill", "none")
        .attr("stroke", C)
        .attr("stroke-width", 1.3)
        .attr("opacity", 0.45);

    const aluG = svg.append("g").attr("class", "alu");
    aluG.append("rect")
        .attr("x", 45)
        .attr("y", 298)
        .attr("width", 220)
        .attr("height", 90)
        .attr("rx", 10)
        .attr("fill", "none")
        .attr("stroke", C)
        .attr("stroke-width", 1.2)
        .attr("opacity", 0.55);

    aluG.append("text")
        .attr("x", 155)
        .attr("y", 314)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("fill", C)
        .attr("opacity", 0.8)
        .attr("font-size", 14)
        .attr("font-weight", 500)
        .text("ALU");

    aluG.append("rect")
        .attr("id", "alu-engine")
        .attr("x", 138)
        .attr("y", 330)
        .attr("width", 34)
        .attr("height", 26)
        .attr("rx", 5)
        .attr("fill", "none")
        .attr("stroke", C)
        .attr("stroke-width", 0.7)
        .attr("opacity", 0.5);

    aluG.append("text")
        .attr("x", 155)
        .attr("y", 343)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("fill", "white")
        .attr("font-size", 16)
        .text("⚙");

    const flagsG = svg.append("g").attr("class", "flags");
    flagsG
        .append("rect")
        .attr("id", "flags-box")
        .attr("x", 45)
        .attr("y", 408)
        .attr("width", 220)
        .attr("height", 26)
        .attr("rx", 4)
        .attr("fill", "none")
        .attr("stroke", C)
        .attr("stroke-width", 0.7)
        .attr("opacity", 0.55);

    const flagsText = flagsG
        .append("text")
        .attr("id", "flags-text")
        .attr("x", 155)
        .attr("y", 421)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("font-size", 10)
        .attr("font-family", "ui-monospace, monospace");

    const flagNames = ["OF", "CF", "ZF", "PF", "SF"];
    flagNames.forEach((name, idx) => {
        if (idx > 0) flagsText.append("tspan").text("  ");
        flagsText
            .append("tspan")
            .attr("id", `flag-${name.toLowerCase()}`)
            .attr("fill", C)
            .attr("opacity", 0.5)
            .text(`${name}:0`);
    });

    const buses = svg.append("g").attr("class", "buses");
    const INTERNAL_BUS_STROKE_WIDTH = 2.2;
    const BUS_OPACITY = 0.5;

    drawBus(
        buses,
        49,
        176,
        49,
        228,
        "bus-pc-internal",
        INTERNAL_BUS_STROKE_WIDTH,
        BUS_OPACITY,
    );

    drawBus(
        buses,
        145,
        162,
        155,
        162,
        "bus-ir-uc",
        INTERNAL_BUS_STROKE_WIDTH,
        BUS_OPACITY,
    );

    drawBus(
        buses,
        117,
        176,
        117,
        228,
        "bus-ir-internal",
        INTERNAL_BUS_STROKE_WIDTH,
        BUS_OPACITY,
    );

    drawBus(
        buses,
        247,
        212,
        247,
        228,
        "bus-uc-internal",
        INTERNAL_BUS_STROKE_WIDTH,
        BUS_OPACITY,
    );

    drawBus(
        buses,
        375,
        158,
        375,
        198,
        "bus-marmdr-vertical-upper",
        INTERNAL_BUS_STROKE_WIDTH,
        BUS_OPACITY,
    );

    drawBus(
        buses,
        375,
        198,
        375,
        228,
        "bus-marmdr-vertical-lower",
        INTERNAL_BUS_STROKE_WIDTH,
        BUS_OPACITY,
    );

    drawBus(
        buses,
        375,
        158,
        388,
        158,
        "bus-to-mar",
        INTERNAL_BUS_STROKE_WIDTH,
        BUS_OPACITY,
    );

    drawBus(
        buses,
        375,
        198,
        388,
        198,
        "bus-to-mdr",
        INTERNAL_BUS_STROKE_WIDTH,
        BUS_OPACITY,
    );

    drawBus(
        buses,
        96,
        262,
        96,
        240,
        "bus-temp1-internal",
        INTERNAL_BUS_STROKE_WIDTH,
        BUS_OPACITY,
    );

    drawBus(
        buses,
        96,
        288,
        96,
        298,
        "bus-temp1-alu",
        INTERNAL_BUS_STROKE_WIDTH,
        BUS_OPACITY,
    );

    drawBus(
        buses,
        214,
        262,
        214,
        240,
        "bus-temp2-internal",
        INTERNAL_BUS_STROKE_WIDTH,
        BUS_OPACITY,
    );

    drawBus(
        buses,
        214,
        288,
        214,
        298,
        "bus-temp2-alu",
        INTERNAL_BUS_STROKE_WIDTH,
        BUS_OPACITY,
    );

    drawBus(
        buses,
        265,
        343,
        280,
        343,
        "bus-alu-s",
        INTERNAL_BUS_STROKE_WIDTH,
        BUS_OPACITY,
    );

    drawBus(
        buses,
        305,
        330,
        305,
        240,
        "bus-s-internal",
        INTERNAL_BUS_STROKE_WIDTH,
        BUS_OPACITY,
    );

    drawBus(
        buses,
        340,
        240,
        340,
        421,
        "bus-vertical-main",
        INTERNAL_BUS_STROKE_WIDTH,
        BUS_OPACITY,
    );

    drawBus(
        buses,
        155,
        388,
        155,
        408,
        "bus-alu-flags",
        INTERNAL_BUS_STROKE_WIDTH,
        BUS_OPACITY,
    );

    drawBus(
        buses,
        265,
        421,
        340,
        421,
        "bus-flags-vertical",
        INTERNAL_BUS_STROKE_WIDTH,
        BUS_OPACITY,
    );

    drawBus(
        buses,
        400,
        265,
        400,
        240,
        "bus-a-internal",
        INTERNAL_BUS_STROKE_WIDTH,
        BUS_OPACITY,
    );

    drawBus(
        buses,
        460,
        265,
        460,
        240,
        "bus-b-internal",
        INTERNAL_BUS_STROKE_WIDTH,
        BUS_OPACITY,
    );

    drawBus(
        buses,
        520,
        265,
        520,
        240,
        "bus-i-internal",
        INTERNAL_BUS_STROKE_WIDTH,
        BUS_OPACITY,
    );

    const memIF = svg.append("g").attr("class", "memory-interface");
    const RD_RW_STROKE_WIDTH = 1.5;
    const RD_RW_OPACITY = 0.5;

    drawBus(
        memIF,
        351,
        92,
        620,
        92,
        "signal-rd",
        RD_RW_STROKE_WIDTH,
        RD_RW_OPACITY,
    );

    memIF
        .append("text")
        .attr("id", "label-rd")
        .attr("x", 341)
        .attr("y", 92)
        .attr("text-anchor", "start")
        .attr("dominant-baseline", "central")
        .attr("fill", C)
        .attr("opacity", 0.45)
        .attr("font-size", 11)
        .text("rd");

    drawBus(
        memIF,
        351,
        108,
        620,
        108,
        "signal-wr",
        RD_RW_STROKE_WIDTH,
        RD_RW_OPACITY,
    );

    memIF
        .append("text")
        .attr("id", "label-wr")
        .attr("x", 341)
        .attr("y", 108)
        .attr("text-anchor", "start")
        .attr("dominant-baseline", "central")
        .attr("fill", C)
        .attr("opacity", 0.45)
        .attr("font-size", 11)
        .text("wr");

    drawBus(
        memIF,
        453,
        158,
        620,
        158,
        "bus-address",
        INTERNAL_BUS_STROKE_WIDTH,
        BUS_OPACITY,
    );

    drawBus(
        memIF,
        453,
        198,
        620,
        198,
        "bus-data",
        INTERNAL_BUS_STROKE_WIDTH,
        BUS_OPACITY,
    );
}

function updateValues(svg: Sel, state: CpuDiagramProps["cpuState"]) {
    if (!state) return;

    svg.select("#val-pc").text(toHex(state.pc));
    svg.select("#val-ir").text(toHex(state.ir));
    svg.select("#val-mar").text(toHex(state.mar));
    svg.select("#val-mdr").text(toHex(state.mdr));
    svg.select("#val-temp1").text(toHex(state.temp1));
    svg.select("#val-temp2").text(toHex(state.temp2));
    svg.select("#val-s").text(toHex(state.s));
    svg.select("#val-a").text(toHex(state.a));
    svg.select("#val-b").text(toHex(state.b));
    svg.select("#val-i").text(toHex(state.i));

    const f = state.flags;
    const flagMap: Record<string, boolean> = {
        of: f.of,
        cf: f.cf,
        zf: f.zf,
        pf: f.pf,
        sf: f.sf,
    };

    Object.entries(flagMap).forEach(([name, val]) => {
        svg.select(`#flag-${name}`)
            .text(`${name.toUpperCase()}:${val ? 1 : 0}`)
            .attr("opacity", val ? 0.95 : 0.4)
            .attr("font-weight", val ? 700 : 400);
    });
}

interface Flow {
    id: string;
    reverse: boolean;
}

const OVERLAY_ID = "__internal_bus_overlay__";
const PC_INC_OVERLAY_ID = "__pc_inc_bus_overlay__";
const FLAGS_UC_OVERLAY_ID = "__flags_uc_bus_overlay__";

type Stage = Flow[];

const REG_TO_BUS_FLOWS: Record<number, Flow[]> = {
    0x0: [{ id: "bus-a-internal", reverse: false }],
    0x1: [{ id: "bus-b-internal", reverse: false }],
    0x2: [{ id: "bus-i-internal", reverse: false }],
    0x3: [{ id: "bus-pc-internal", reverse: false }],
    0x4: [{ id: "bus-ir-internal", reverse: false }],
    0x5: [
        { id: "bus-to-mar", reverse: true },
        { id: "bus-marmdr-vertical-upper", reverse: false },
        { id: "bus-marmdr-vertical-lower", reverse: false },
    ],
    0x6: [
        { id: "bus-to-mdr", reverse: true },
        { id: "bus-marmdr-vertical-lower", reverse: false },
    ],
    0x7: [{ id: "bus-s-internal", reverse: false }],
    0x8: [{ id: "bus-temp1-internal", reverse: false }],
    0x9: [{ id: "bus-temp2-internal", reverse: false }],
};

const REG_BUS_X: Record<number, number> = {
    0x0: 400, // A
    0x1: 460, // B
    0x2: 520, // I
    0x3: 49, // PC
    0x4: 117, // IR
    0x5: 375, // MAR
    0x6: 375, // MDR
    0x7: 305, // S
    0x8: 96, // TEMP1
    0x9: 214, // TEMP2
};

const UC_BUS_X = 247;
const FLAGS_BUS_X = 340;

const REG_ID: Record<number, string> = {
    0x0: "a",
    0x1: "b",
    0x2: "i",
    0x3: "pc",
    0x4: "ir",
    0x5: "mar",
    0x6: "mdr",
    0x7: "s",
    0x8: "temp1",
    0x9: "temp2",
};

const BINARY_ALU_OPS = new Set([0x1, 0x2, 0x3, 0x4]);

const WR_FIRST_CONDITIONAL = 2;

function reverseFlows(flows: Flow[]): Flow[] {
    // Reverse the path AND each segment's direction
    return flows
        .slice()
        .reverse()
        .map((f) => ({ id: f.id, reverse: !f.reverse }));
}

function getStages(mi: MicroinstructionPayload, condTaken?: boolean): Stage[] {
    const stages: Stage[] = [];

    if (mi.mem_read || mi.inc_pc) {
        if (mi.inc_pc) {
            stages.push([
                { id: "bus-address", reverse: false },
                { id: "bus-uc-internal", reverse: false },
            ]);
            stages.push([
                { id: "signal-rd", reverse: false },
                { id: PC_INC_OVERLAY_ID, reverse: false },
            ]);
            stages.push([
                { id: "bus-data", reverse: true },
                { id: "bus-pc-internal", reverse: true },
            ]);
        } else {
            stages.push([{ id: "bus-address", reverse: false }]);
            stages.push([{ id: "signal-rd", reverse: false }]);
            stages.push([{ id: "bus-data", reverse: true }]);
        }
    } else if (mi.mem_write) {
        stages.push([
            { id: "bus-address", reverse: false },
            { id: "bus-data", reverse: false },
        ]);
        stages.push([{ id: "signal-wr", reverse: false }]);
    }

    if (mi.reg_write_cond >= WR_FIRST_CONDITIONAL) {
        stages.push([{ id: "bus-flags-vertical", reverse: false }]);
        stages.push([{ id: "bus-vertical-main", reverse: true }]);
        stages.push([{ id: FLAGS_UC_OVERLAY_ID, reverse: false }]);
        stages.push([{ id: "bus-uc-internal", reverse: true }]);

        if (!condTaken) return stages;

        if (mi.alu_op === 0) {
            const srcPath = REG_TO_BUS_FLOWS[mi.src_reg] ?? [];
            if (srcPath.length > 0) stages.push(srcPath.slice());
            stages.push([
                {
                    id: OVERLAY_ID,
                    reverse: false,
                } as Flow & { srcReg?: number; dstReg?: number },
            ]);
            const dstPath = reverseFlows(REG_TO_BUS_FLOWS[mi.dst_reg] ?? []);
            if (dstPath.length > 0) stages.push(dstPath);
        }
        return stages;
    }

    if (mi.reg_write && mi.alu_op === 0) {
        const srcPath = REG_TO_BUS_FLOWS[mi.src_reg] ?? [];
        if (srcPath.length > 0) stages.push(srcPath.slice());
        stages.push([
            {
                id: OVERLAY_ID,
                reverse: false,
            } as Flow & { srcReg?: number; dstReg?: number },
        ]);
        const dstPath = reverseFlows(REG_TO_BUS_FLOWS[mi.dst_reg] ?? []);
        if (dstPath.length > 0) stages.push(dstPath);
        if (mi.dst_reg === 0x4) {
            stages.push([{ id: "bus-ir-uc", reverse: false }]);
        }
    } else if (mi.reg_write && mi.alu_op !== 0) {
        const aluInputs: Flow[] = [{ id: "bus-temp1-alu", reverse: false }];
        if (BINARY_ALU_OPS.has(mi.alu_op)) {
            aluInputs.push({ id: "bus-temp2-alu", reverse: false });
        }
        stages.push(aluInputs);
        stages.push([
            { id: "bus-alu-s", reverse: false },
            { id: "bus-alu-flags", reverse: false },
        ]);
    } else if (mi.alu_op !== 0) {
        const aluInputs: Flow[] = [{ id: "bus-temp1-alu", reverse: false }];
        if (BINARY_ALU_OPS.has(mi.alu_op)) {
            aluInputs.push({ id: "bus-temp2-alu", reverse: false });
        }
        stages.push(aluInputs);
        stages.push([
            { id: "bus-alu-s", reverse: false },
            { id: "bus-alu-flags", reverse: false },
        ]);
    }

    return stages;
}

const HIGHLIGHT_COLOR = "#f59e0b";
const RD_HIGHLIGHT_COLOR = "#3b82f6";
const WR_HIGHLIGHT_COLOR = "#ef4444";
const STAGE_DURATION_MS = 450;
const HOLD_MS = 1000;
const FADE_MS = 350;

function getLineLength(node: SVGGraphicsElement): number {
    const anyNode = node as any;
    if (typeof anyNode.getTotalLength === "function") {
        try {
            const len = anyNode.getTotalLength();
            if (Number.isFinite(len) && len > 0) return len;
        } catch {}
    }

    const x1 = parseFloat(node.getAttribute("x1") ?? "0");
    const y1 = parseFloat(node.getAttribute("y1") ?? "0");
    const x2 = parseFloat(node.getAttribute("x2") ?? "0");
    const y2 = parseFloat(node.getAttribute("y2") ?? "0");

    return Math.hypot(x2 - x1, y2 - y1);
}

function animateFlowLine(
    bus: d3.Selection<SVGGraphicsElement, unknown, null, undefined>,
    reverse: boolean,
    duration: number,
    color = HIGHLIGHT_COLOR,
) {
    const node = bus.node();
    if (!node) return;

    const ds = node.dataset as DOMStringMap;
    if (!ds.origStroke) {
        ds.origStroke = bus.attr("stroke") ?? "currentColor";
        ds.origOpacity = bus.attr("opacity") ?? "0.5";
        ds.origWidth = bus.attr("stroke-width") ?? "2";
    }

    const len = getLineLength(node);
    if (len <= 0) return;

    bus.interrupt();
    bus.attr("stroke", color)
        .attr("opacity", 1)
        .attr("stroke-width", 4)
        .attr("stroke-linecap", "round")
        .attr("stroke-dasharray", `${len} ${len}`)
        .attr("stroke-dashoffset", reverse ? -len : len);

    bus.transition()
        .duration(duration)
        .ease(d3.easeLinear)
        .attr("stroke-dashoffset", 0)
        .transition()
        .delay(HOLD_MS)
        .duration(FADE_MS)
        .attr("opacity", ds.origOpacity!)
        .attr("stroke-width", ds.origWidth!)
        .on("end", function () {
            d3.select(this)
                .attr("stroke", ds.origStroke!)
                .attr("stroke-dasharray", null)
                .attr("stroke-dashoffset", null)
                .attr("stroke-linecap", null);
        });
}

const INTERNAL_BUS_Y = 228;
const INTERNAL_BUS_HEIGHT = 12;

function animateBusOverlayXY(
    svg: Sel,
    srcX: number | undefined,
    dstX: number | undefined,
    duration: number,
) {
    if (srcX == null || dstX == null || srcX === dstX) return;

    svg.selectAll(".internal-bus-flow").remove();

    const y = INTERNAL_BUS_Y + INTERNAL_BUS_HEIGHT / 2;
    const x1 = srcX;
    const x2 = dstX;
    const len = Math.abs(dstX - srcX);
    const reverse = false;
    const overlay = svg
        .append("line")
        .attr("class", "internal-bus-flow")
        .attr("x1", x1)
        .attr("y1", y)
        .attr("x2", x2)
        .attr("y2", y)
        .attr("stroke", HIGHLIGHT_COLOR)
        .attr("stroke-width", INTERNAL_BUS_HEIGHT)
        .attr("opacity", 1)
        .attr("stroke-linecap", "butt")
        .attr("stroke-dasharray", `${len} ${len}`)
        .attr("stroke-dashoffset", reverse ? -len : len);

    overlay
        .transition()
        .duration(duration)
        .ease(d3.easeLinear)
        .attr("stroke-dashoffset", 0)
        .transition()
        .delay(HOLD_MS)
        .duration(FADE_MS)
        .attr("opacity", 0)
        .on("end", function () {
            d3.select(this).remove();
        });
}

function animateInternalBusOverlay(
    svg: Sel,
    srcReg: number,
    dstReg: number,
    duration: number,
) {
    animateBusOverlayXY(svg, REG_BUS_X[srcReg], REG_BUS_X[dstReg], duration);
}

function highlightRectSel(
    rect: d3.Selection<SVGRectElement, unknown, null, undefined>,
) {
    const node = rect.node();
    if (!node) return;

    const ds = node.dataset as DOMStringMap;
    if (!ds.origStroke) {
        ds.origStroke = rect.attr("stroke") ?? "currentColor";
        ds.origOpacity = rect.attr("opacity") ?? "0.65";
        ds.origWidth = rect.attr("stroke-width") ?? "0.8";
    }

    rect.interrupt();
    rect.attr("stroke", HIGHLIGHT_COLOR)
        .attr("opacity", 1)
        .attr("stroke-width", 2.5)
        .transition()
        .delay(HOLD_MS)
        .duration(FADE_MS)
        .attr("opacity", ds.origOpacity!)
        .attr("stroke-width", ds.origWidth!)
        .on("end", function () {
            d3.select(this).attr("stroke", ds.origStroke!);
        });
}

function highlightRegister(svg: Sel, regNum: number) {
    const id = REG_ID[regNum];
    if (!id) return;
    const rect = svg.select<SVGRectElement>(`#reg-${id} rect`);
    if (rect.empty()) return;
    highlightRectSel(rect);
}

function highlightDecoder(svg: Sel) {
    const rect = svg.select<SVGRectElement>("#decoder-box");
    if (rect.empty()) return;
    highlightRectSel(rect);
}

function highlightAluEngine(svg: Sel) {
    const rect = svg.select<SVGRectElement>("#alu-engine");
    if (rect.empty()) return;
    highlightRectSel(rect);
}

function highlightFlags(svg: Sel) {
    const rect = svg.select<SVGRectElement>("#flags-box");
    if (rect.empty()) return;
    highlightRectSel(rect);
}

let currentAnimToken = 0;

function animateMicroOp(
    svg: Sel,
    mi: MicroinstructionPayload,
    condTaken?: boolean,
) {
    const stages = getStages(mi, condTaken);
    if (stages.length === 0) return;

    currentAnimToken += 1;
    const myToken = currentAnimToken;

    svg.selectAll(".internal-bus-flow").remove();

    const isRegTransfer =
        mi.alu_op === 0 &&
        (mi.reg_write ||
            (mi.reg_write_cond >= WR_FIRST_CONDITIONAL && !!condTaken));

    if (isRegTransfer) {
        const overlayIdx = stages.findIndex((s) =>
            s.some((f) => f.id === OVERLAY_ID),
        );
        if (overlayIdx >= 0) {
            const delay = (overlayIdx + 1) * STAGE_DURATION_MS;
            window.setTimeout(() => {
                if (myToken !== currentAnimToken) return;
                highlightRegister(svg, mi.dst_reg);
            }, delay);
        }
    }

    if (mi.mem_read || mi.inc_pc) {
        const dataIdx = stages.findIndex((s) =>
            s.some((f) => f.id === "bus-data"),
        );

        if (dataIdx >= 0) {
            const delay = dataIdx * STAGE_DURATION_MS;
            window.setTimeout(() => {
                if (myToken !== currentAnimToken) return;
                highlightRegister(svg, 0x6); // MDR
            }, delay);
        }
    }

    if (mi.alu_op !== 0) {
        const aluIdx = stages.findIndex((s) =>
            s.some((f) => f.id === "bus-alu-s"),
        );

        if (aluIdx >= 0) {
            const delay = aluIdx * STAGE_DURATION_MS;
            window.setTimeout(() => {
                if (myToken !== currentAnimToken) return;
                highlightAluEngine(svg);
                highlightFlags(svg);
                if (mi.reg_write) highlightRegister(svg, mi.dst_reg);
            }, delay);
        }
    }

    if (mi.reg_write_cond >= WR_FIRST_CONDITIONAL) {
        const flagsUcIdx = stages.findIndex((s) =>
            s.some((f) => f.id === FLAGS_UC_OVERLAY_ID),
        );
        if (flagsUcIdx >= 0) {
            window.setTimeout(() => {
                if (myToken !== currentAnimToken) return;
                highlightFlags(svg);
            }, 0);
        }
    }

    {
        const irUcIdx = stages.findIndex((s) =>
            s.some((f) => f.id === "bus-ir-uc"),
        );
        if (irUcIdx >= 0) {
            const delay = irUcIdx * STAGE_DURATION_MS;
            window.setTimeout(() => {
                if (myToken !== currentAnimToken) return;
                highlightDecoder(svg);
            }, delay);
        }
    }

    if (mi.inc_pc) {
        const pcIdx = stages.findIndex((s) =>
            s.some((f) => f.id === PC_INC_OVERLAY_ID),
        );

        if (pcIdx >= 0) {
            const delay = (pcIdx + 1) * STAGE_DURATION_MS;
            window.setTimeout(() => {
                if (myToken !== currentAnimToken) return;
                highlightRegister(svg, 0x3); // PC
            }, delay);
        }
    }

    stages.forEach((stage, i) => {
        const startDelay = i * STAGE_DURATION_MS;

        window.setTimeout(() => {
            if (myToken !== currentAnimToken) return;

            stage.forEach((flow) => {
                if (flow.id === OVERLAY_ID) {
                    animateInternalBusOverlay(
                        svg,
                        mi.src_reg,
                        mi.dst_reg,
                        STAGE_DURATION_MS,
                    );
                    return;
                }

                if (flow.id === PC_INC_OVERLAY_ID) {
                    animateBusOverlayXY(
                        svg,
                        UC_BUS_X,
                        REG_BUS_X[0x3],
                        STAGE_DURATION_MS,
                    );
                    return;
                }

                if (flow.id === FLAGS_UC_OVERLAY_ID) {
                    animateBusOverlayXY(
                        svg,
                        FLAGS_BUS_X,
                        UC_BUS_X,
                        STAGE_DURATION_MS,
                    );
                    return;
                }

                const bus = svg.select<SVGGraphicsElement>(`#${flow.id}`);
                if (bus.empty()) return;
                let color: string | undefined;
                if (flow.id === "signal-rd") color = RD_HIGHLIGHT_COLOR;
                else if (flow.id === "signal-wr") color = WR_HIGHLIGHT_COLOR;
                animateFlowLine(bus, flow.reverse, STAGE_DURATION_MS, color);
            });
        }, startDelay);
    });
}

export default function CpuDiagram({
    cpuState,
    memory,
    animatedMicroOp,
    resetKey,
}: CpuDiagramProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [highlightAddr, setHighlightAddr] = useState<number | null>(null);
    const prevMemoryRef = useRef<number[] | undefined>(memory);

    useEffect(() => {
        setHighlightAddr(null);
        prevMemoryRef.current = memory;
    }, [resetKey]);
    useEffect(() => {
        const el = svgRef.current;
        if (!el) return;

        const svg = d3.select(el);
        buildDiagram(svg);

        return () => {
            svg.selectAll("*").remove();
        };
    }, []);

    useEffect(() => {
        const el = svgRef.current;
        if (!el || !cpuState) return;

        updateValues(d3.select(el), cpuState);
    }, [cpuState]);

    useEffect(() => {
        const el = svgRef.current;
        if (!el || !animatedMicroOp) return;

        animateMicroOp(
            d3.select(el),
            animatedMicroOp.mi,
            animatedMicroOp.condTaken,
        );
    }, [animatedMicroOp]);

    useEffect(() => {
        if (!memory) return;
        const prev = prevMemoryRef.current;
        if (!prev || prev.length !== memory.length) {
            prevMemoryRef.current = memory;
            return;
        }
        for (let i = 0; i < memory.length; i++) {
            if (memory[i] !== prev[i]) {
                setHighlightAddr(i);
                break;
            }
        }
        prevMemoryRef.current = memory;
    }, [memory]);

    return (
        <div className="flex h-full justify-center">
            <svg
                ref={svgRef}
                viewBox="0 48 620 400"
                className="flex h-full min-w-100"
                preserveAspectRatio="xMidYMid meet"
                style={{ fontFamily: "inherit" }}
            />
            {memory && (
                <div className="w-60 shrink-0 h-full pb-3">
                    <MemoryView
                        memory={memory}
                        highlightAddr={highlightAddr}
                        resetKey={resetKey}
                    />
                </div>
            )}
        </div>
    );
}
