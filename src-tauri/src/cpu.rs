use crate::control_unit::{
    build_control_rom, ControlStore, Microinstruction, ALU_ADD, ALU_AND, ALU_DEC, ALU_INC, ALU_NOP,
    ALU_NOT, ALU_OR, ALU_SHL, ALU_SHR, ALU_SUB, WR_ALWAYS, WR_IF_CF, WR_IF_OF, WR_IF_PF, WR_IF_SF,
    WR_IF_ZF, WR_NONE,
};
use crate::memory::MEM_SIZE;

use super::registers::{Flags, Reg};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct CpuSnapshot {
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
    pub flags: Flags,
}

pub struct StepOutput {
    pub micro_ops: Vec<Microinstruction>,
    pub snapshots: Vec<CpuSnapshot>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub enum CpuState {
    Running,
    Halted,
    Error(String),
}

#[derive(Debug, Clone, Serialize)]
pub struct Cpu {
    pub a: u8,
    pub b: u8,
    pub temp1: u8,
    pub temp2: u8,
    pub s: u8,
    pub pc: u8,
    pub ir: u8,
    pub mar: u8,
    pub mdr: u8,
    pub i: u8,
    pub flags: Flags,
    pub memory: Vec<u8>,
    pub state: CpuState,
    pub cycle_count: u64,
    pub completed_instruction_count: u64,
    pub reg_reads: u64,
    pub reg_writes: u64,
    pub cond_jump_taken_count: u64,
    pub cond_jump_not_taken_count: u64,
    pub mem_reads: u64,
    pub mem_writes: u64,
    #[serde(skip)]
    control_rom: ControlStore,
}

impl Cpu {
    pub fn snapshot(&self) -> CpuSnapshot {
        CpuSnapshot {
            pc: self.pc,
            a: self.a,
            b: self.b,
            i: self.i,
            ir: self.ir,
            mar: self.mar,
            mdr: self.mdr,
            s: self.s,
            temp1: self.temp1,
            temp2: self.temp2,
            flags: self.flags.clone(),
        }
    }

    pub fn new() -> Self {
        Self {
            a: 0,
            b: 0,
            temp1: 0,
            temp2: 0,
            s: 0,
            pc: 0,
            ir: 0,
            mar: 0,
            mdr: 0,
            i: 0,
            flags: Flags::new(),
            memory: vec![0xFF; MEM_SIZE],
            state: CpuState::Halted,
            cycle_count: 0,
            completed_instruction_count: 0,
            reg_reads: 0,
            reg_writes: 0,
            cond_jump_taken_count: 0,
            cond_jump_not_taken_count: 0,
            mem_reads: 0,
            mem_writes: 0,
            control_rom: build_control_rom(),
        }
    }

    pub fn reset(&mut self) {
        self.a = 0;
        self.b = 0;
        self.temp1 = 0;
        self.temp2 = 0;
        self.s = 0;
        self.pc = 0;
        self.ir = 0;
        self.mar = 0;
        self.mdr = 0;
        self.i = 0;
        self.flags = Flags::new();
        self.state = CpuState::Halted;
        self.cycle_count = 0;
        self.completed_instruction_count = 0;
        self.cond_jump_taken_count = 0;
        self.cond_jump_not_taken_count = 0;
        self.reg_reads = 0;
        self.reg_writes = 0;
        self.mem_reads = 0;
        self.mem_writes = 0;
    }

    pub fn reset_all(&mut self) {
        self.reset();
        self.memory = vec![0xFF; MEM_SIZE];
    }

    pub fn load_program(&mut self, program: &[u8]) {
        self.reset();
        let len = program.len().min(MEM_SIZE);
        self.memory[..len].copy_from_slice(&program[..len]);
        self.state = CpuState::Running;
    }

    pub fn load_control_rom(&mut self, rom: ControlStore) {
        println!("Seq: {:?}", rom.get_sequence(0));
        self.control_rom = rom;
    }

    pub fn control_rom_ref(&self) -> &ControlStore {
        &self.control_rom
    }

    pub fn halt(&mut self) {
        self.state = CpuState::Halted;
    }

    fn is_cond_jump(opcode: u8) -> bool {
        matches!(opcode, 0xA1..=0xA5)
    }

    fn alu_add(a: u8, b: u8) -> (u8, bool, bool) {
        let (result, carry) = a.overflowing_add(b);
        let overflow = ((a ^ result) & (b ^ result) & 0x80) != 0;
        (result, carry, overflow)
    }

    fn alu_sub(a: u8, b: u8) -> (u8, bool, bool) {
        let neg_b = (!b).wrapping_add(1);
        let (result, carry) = a.overflowing_add(neg_b);
        let overflow = ((a ^ b) & (a ^ result) & 0x80) != 0;
        let borrow = !carry;
        (result, borrow, overflow)
    }

    fn alu_inc(val: u8) -> (u8, bool, bool) {
        let (result, carry) = val.overflowing_add(1);
        let overflow = val == 0x7F;
        (result, carry, overflow)
    }

    fn alu_dec(val: u8) -> (u8, bool, bool) {
        let (result, borrow) = val.overflowing_sub(1);
        let overflow = val == 0x80;
        (result, borrow, overflow)
    }

    fn alu_and(a: u8, b: u8) -> (u8, bool, bool) {
        (a & b, false, false)
    }

    fn alu_or(a: u8, b: u8) -> (u8, bool, bool) {
        (a | b, false, false)
    }

    fn alu_not(val: u8) -> (u8, bool, bool) {
        (!val, false, false)
    }

    fn alu_shr(val: u8) -> (u8, bool, bool) {
        let carry = (val & 0x01) != 0;
        (val >> 1, carry, false)
    }

    fn alu_shl(val: u8) -> (u8, bool, bool) {
        let carry = (val & 0x80) != 0;
        let result = val << 1;
        let overflow = ((val ^ result) & 0x80) != 0;
        (result, carry, overflow)
    }

    fn execute_alu_from_op(alu_op: u8, op1: u8, op2: u8) -> (u8, bool, bool) {
        println!("EXECUTING ALU OP: {:x} op1={:x} op2={:x}", alu_op, op1, op2);
        match alu_op {
            ALU_ADD => Self::alu_add(op1, op2),
            ALU_SUB => Self::alu_sub(op1, op2),
            ALU_AND => Self::alu_and(op1, op2),
            ALU_OR => Self::alu_or(op1, op2),
            ALU_NOT => Self::alu_not(op1),
            ALU_SHR => Self::alu_shr(op1),
            ALU_SHL => Self::alu_shl(op1),
            ALU_INC => Self::alu_inc(op1),
            ALU_DEC => Self::alu_dec(op1),
            _ => (0, false, false),
        }
    }

    fn read_reg(&mut self, reg: Reg) -> u8 {
        match reg {
            Reg::A => self.a,
            Reg::B => self.b,
            Reg::I => self.i,
            Reg::PC => self.pc,
            Reg::RI => self.ir,
            Reg::MAR => self.mar,
            Reg::MDR => self.mdr,
            Reg::S => self.s,
            Reg::TEMP1 => self.temp1,
            Reg::TEMP2 => self.temp2,
        }
    }

    fn write_reg(&mut self, reg: Reg, val: u8) {
        match reg {
            Reg::A => self.a = val,
            Reg::B => self.b = val,
            Reg::I => self.i = val,
            Reg::PC => self.pc = val,
            Reg::RI => self.ir = val,
            Reg::MAR => self.mar = val,
            Reg::MDR => self.mdr = val,
            Reg::S => self.s = val,
            Reg::TEMP1 => self.temp1 = val,
            Reg::TEMP2 => self.temp2 = val,
        }
    }

    fn reg_from_code(code: u8) -> Reg {
        Reg::from_binary(code).unwrap_or(Reg::A)
    }

    fn execute_microop(&mut self, mi: &Microinstruction, opcode: Option<u8>) {
        self.cycle_count += 1;

        if opcode.is_some() && mi.seq_ctrl() == 1 {
            self.completed_instruction_count += 1;
        }

        let src_reg = Self::reg_from_code(mi.src_reg());
        let dst_reg = Self::reg_from_code(mi.dst_reg());
        let wr_cond = mi.reg_write_cond();
        let do_write = match wr_cond {
            WR_NONE => false,
            WR_ALWAYS => true,
            WR_IF_ZF => self.flags.zf,
            WR_IF_OF => self.flags.of,
            WR_IF_SF => self.flags.sf,
            WR_IF_CF => self.flags.cf,
            WR_IF_PF => self.flags.pf,
            _ => false,
        };

        let (dst, val) = match mi.alu_op() {
            ALU_NOP => {
                let val = self.read_reg(src_reg);
                if do_write {
                    self.reg_reads += 1;
                }
                (dst_reg, val)
            }
            op => {
                let op1 = self.read_reg(Reg::TEMP1);
                let op2 = self.read_reg(Reg::TEMP2);
                self.reg_reads += 2;
                let (result, carry, overflow) = Self::execute_alu_from_op(op, op1, op2);
                self.flags.update(result, carry, overflow);
                self.reg_writes += 1;
                (dst_reg, result)
            }
        };

        if do_write {
            self.write_reg(dst, val);
            self.reg_writes += 1;
        }

        if let Some(opcode) = opcode {
            if Self::is_cond_jump(opcode) && mi.seq_ctrl() == 1 {
                if do_write {
                    self.cond_jump_taken_count += 1;
                } else {
                    self.cond_jump_not_taken_count += 1;
                }
            }
        }

        if mi.mem_read() {
            let addr = self.mar;
            let val = self.memory[addr as usize];
            self.mdr = val;
            self.mem_reads += 1;
            self.reg_reads += 1;
            self.reg_writes += 1;
        }

        if mi.mem_write() {
            let addr = self.mar;
            let val = self.mdr;
            self.memory[addr as usize] = val;
            self.mem_writes += 1;
            self.reg_reads += 2;
        }

        if mi.inc_pc() {
            self.pc = self.pc.wrapping_add(1);
            self.reg_writes += 1;
        }
    }

    pub fn step(&mut self) -> Option<StepOutput> {
        if self.state != CpuState::Running {
            return None;
        }

        let fetch_seq = self.control_rom.get_fetch_sequence();
        let mut micro_ops: Vec<Microinstruction> = Vec::new();
        let mut snapshots: Vec<CpuSnapshot> = Vec::new();

        let opcode = self.memory[self.pc as usize];
        if opcode == 0xFE {
            self.state = CpuState::Halted;
            return None;
        }

        for mi in &fetch_seq {
            self.execute_microop(mi, None);
            snapshots.push(self.snapshot());
        }
        micro_ops.extend(fetch_seq);

        let opcode = self.ir;

        if !self.control_rom.has_opcode(opcode) {
            self.state = CpuState::Error(format!(
                "unknown opcode: {:02X}h in PC={:02X}h",
                opcode,
                self.pc.wrapping_sub(1)
            ));
            return None;
        }

        let exec_seq = self.control_rom.get_sequence_for_opcode(opcode);
        for mi in exec_seq.iter() {
            self.execute_microop(mi, Some(opcode));
            snapshots.push(self.snapshot());
        }
        micro_ops.extend(exec_seq);

        Some(StepOutput {
            micro_ops,
            snapshots,
        })
    }

    pub fn run(&mut self, max_cycles: u64) -> Vec<Microinstruction> {
        self.state = CpuState::Running;
        let mut ret = Vec::new();

        while self.state == CpuState::Running && self.cycle_count < max_cycles {
            let output = self.step();
            match output {
                Some(out) => ret.extend(out.micro_ops),
                None => break,
            }
        }
        ret
    }

    pub fn dump_state(&self) -> String {
        format!(
            "PC={:02X} RI={:02X} A={:02X} B={:02X} I={:02X} \
             S={:02X} T1={:02X} T2={:02X} MAR={:02X} MDR={:02X} \
             Flags=[CF={} ZF={} SF={} PF={} OF={}] \
             State={:?} Cycles={} MemReads={} MemWrites={}",
            self.pc,
            self.ir,
            self.a,
            self.b,
            self.i,
            self.s,
            self.temp1,
            self.temp2,
            self.mar,
            self.mdr,
            self.flags.cf as u8,
            self.flags.zf as u8,
            self.flags.sf as u8,
            self.flags.pf as u8,
            self.flags.of as u8,
            self.state,
            self.cycle_count,
            self.mem_reads,
            self.mem_writes,
        )
    }
}
