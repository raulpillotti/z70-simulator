use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct MicroinstructionPayload {
    src_reg: u8,
    dst_reg: u8,
    reg_write: bool,
    reg_write_cond: u8,
    mem_read: bool,
    mem_write: bool,
    inc_pc: bool,
    mem_op: u8,
    alu_op: u8,
    seq_ctrl: u8,
    raw: u32,
}

impl MicroinstructionPayload {
    pub fn from_u32(raw: u32) -> Self {
        let mem_op = ((raw >> 5) & 0x3) as u8;
        let reg_write_cond = ((raw >> 7) & 0x7) as u8;
        Self {
            src_reg: ((raw >> 14) & 0xF) as u8,
            dst_reg: ((raw >> 10) & 0xF) as u8,
            reg_write: reg_write_cond != 0,
            reg_write_cond,
            mem_read: mem_op & 1 != 0,
            mem_write: mem_op == 2,
            inc_pc: mem_op == 3,
            mem_op,
            alu_op: ((raw >> 1) & 0xF) as u8,
            seq_ctrl: (raw & 1) as u8,
            raw,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct FlagsPayload {
    pub cf: bool,
    pub zf: bool,
    pub sf: bool,
    pub pf: bool,
    pub of: bool,
}

#[derive(Debug, Serialize)]
pub struct CpuStatePayload {
    pub pc: u8,
    pub a: u8,
    pub b: u8,
    pub i: u8,
    pub ir: u8,
    pub mar: u8,
    pub mdr: u8,
    pub s: u8,
    pub temp1: u8,
    pub temp2: u8,
    pub flags: FlagsPayload,
    pub state: String,
    pub cycle_count: u64,
    pub completed_instruction_count: u64,
    pub mem_reads: u64,
    pub mem_writes: u64,
    pub reg_reads: u64,
    pub reg_writes: u64,
    pub cond_jump_taken_count: u64,
    pub cond_jump_not_taken_count: u64,
}

impl CpuStatePayload {
    pub fn from_cpu(cpu: &crate::cpu::Cpu) -> Self {
        let state_str = match &cpu.state {
            crate::cpu::CpuState::Running => "Running".to_string(),
            crate::cpu::CpuState::Halted => "Halted".to_string(),
            crate::cpu::CpuState::Error(msg) => msg.clone(),
        };

        Self {
            pc: cpu.pc,
            a: cpu.a,
            b: cpu.b,
            i: cpu.i,
            ir: cpu.ir,
            mar: cpu.mar,
            mdr: cpu.mdr,
            s: cpu.s,
            temp1: cpu.temp1,
            temp2: cpu.temp2,
            flags: FlagsPayload {
                cf: cpu.flags.cf,
                zf: cpu.flags.zf,
                sf: cpu.flags.sf,
                pf: cpu.flags.pf,
                of: cpu.flags.of,
            },
            state: state_str,
            cycle_count: cpu.cycle_count,
            completed_instruction_count: cpu.completed_instruction_count,
            reg_reads: cpu.reg_reads,
            reg_writes: cpu.reg_writes,
            cond_jump_taken_count: cpu.cond_jump_taken_count,
            cond_jump_not_taken_count: cpu.cond_jump_not_taken_count,
            mem_reads: cpu.mem_reads,
            mem_writes: cpu.mem_writes,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct CpuSnapshotPayload {
    pub pc: u8,
    pub a: u8,
    pub b: u8,
    pub i: u8,
    pub ir: u8,
    pub mar: u8,
    pub mdr: u8,
    pub s: u8,
    pub temp1: u8,
    pub temp2: u8,
    pub flags: FlagsPayload,
}

impl CpuSnapshotPayload {
    pub fn from_snapshot(snap: &crate::cpu::CpuSnapshot) -> Self {
        Self {
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
            flags: FlagsPayload {
                cf: snap.flags.cf,
                zf: snap.flags.zf,
                sf: snap.flags.sf,
                pf: snap.flags.pf,
                of: snap.flags.of,
            },
        }
    }
}

#[derive(Debug, Serialize)]
pub struct StepResult {
    pub cpu_state: CpuStatePayload,
    pub micro_ops: Vec<MicroinstructionPayload>,
    pub snapshots: Vec<CpuSnapshotPayload>,
    pub memory: Vec<u8>,
}
