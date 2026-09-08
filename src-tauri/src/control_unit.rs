pub const SEQ_NEXT: u8 = 0x0;
pub const SEQ_FETCH: u8 = 0x1;
pub const WR_NONE: u8 = 0x0;
pub const WR_ALWAYS: u8 = 0x1;
pub const WR_IF_ZF: u8 = 0x2;
pub const WR_IF_OF: u8 = 0x3;
pub const WR_IF_SF: u8 = 0x4;
pub const WR_IF_CF: u8 = 0x5;
pub const WR_IF_PF: u8 = 0x6;
pub const MEM_NOP: u8 = 0x0;
pub const MEM_READ: u8 = 0x1;
pub const MEM_WRITE: u8 = 0x2;
pub const MEM_READ_INC_PC: u8 = 0x3;
pub const ALU_NOP: u8 = 0x0;
pub const ALU_ADD: u8 = 0x1;
pub const ALU_SUB: u8 = 0x2;
pub const ALU_AND: u8 = 0x3;
pub const ALU_OR: u8 = 0x4;
pub const ALU_NOT: u8 = 0x5;
pub const ALU_SHR: u8 = 0x6;
pub const ALU_SHL: u8 = 0x7;
pub const ALU_INC: u8 = 0x8;
pub const ALU_DEC: u8 = 0x9;

#[rustfmt::skip]
pub const VALID_OPCODES: &[u8] = &[
    0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,0x09,0x0A,0x0B,0x0C,0x0D,
    0x10,0x11,0x12,0x13,0x14,0x15,0x16,0x17,0x18,0x19,0x1A,0x1B,0x1C,0x1D,
    0x20,0x21,0x22,0x23,0x24,0x25,0x26,0x27,0x28,0x29,0x2A,0x2B,0x2C,0x2D,
    0x30,0x31,0x32,0x34,
    0x40,0x41,0x42,0x44,
    0x50,0x51,0x52,0x53,0x54,0x55,0x56,0x57,0x58,0x59,0x5A,0x5B,0x5C,0x5D,
    0x60,0x61,0x62,0x63,0x64,0x65,0x66,0x67,0x68,0x69,0x6A,0x6B,0x6C,0x6D,
    0x70,0x71,0x72,0x74,
    0x80,0x81,0x82,0x84,
    0x90,0x91,0x92,0x94,
    0xA0,0xA1,0xA2,0xA3,0xA4,0xA5,
    0xB0,0xB1,0xB2,0xB3,0xB4,0xB5,0xB6,0xB7,0xB8,0xB9,0xBA,0xBB,0xBC,0xBD,
    0xFF,
];

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Microinstruction {
    pub raw: u32,
}

impl Microinstruction {
    pub fn from_raw(raw: u32) -> Self {
        Self { raw }
    }

    pub fn from_fields(
        src_reg: u8,
        dst_reg: u8,
        reg_write_cond: u8,
        mem_op: u8,
        alu_op: u8,
        seq_ctrl: u8,
    ) -> Self {
        let raw = ((src_reg as u32 & 0xF) << 14)
            | ((dst_reg as u32 & 0xF) << 10)
            | ((reg_write_cond as u32 & 0x7) << 7)
            | ((mem_op as u32 & 0x3) << 5)
            | ((alu_op as u32 & 0xF) << 1)
            | (seq_ctrl as u32 & 0x1);
        Self { raw }
    }

    pub fn src_reg(&self) -> u8 {
        ((self.raw >> 14) & 0xF) as u8
    }

    pub fn dst_reg(&self) -> u8 {
        ((self.raw >> 10) & 0xF) as u8
    }

    pub fn reg_write_cond(&self) -> u8 {
        ((self.raw >> 7) & 0x7) as u8
    }

    pub fn reg_write(&self) -> bool {
        self.reg_write_cond() != WR_NONE
    }

    pub fn mem_op(&self) -> u8 {
        ((self.raw >> 5) & 0x3) as u8
    }

    pub fn mem_read(&self) -> bool {
        let mo = self.mem_op();
        mo & 1 != 0
    }

    pub fn mem_write(&self) -> bool {
        self.mem_op() == MEM_WRITE
    }

    pub fn inc_pc(&self) -> bool {
        self.mem_op() == MEM_READ_INC_PC
    }

    pub fn alu_op(&self) -> u8 {
        ((self.raw >> 1) & 0xF) as u8
    }

    pub fn seq_ctrl(&self) -> u8 {
        (self.raw & 0x1) as u8
    }

    pub fn is_nop(&self) -> bool {
        self.reg_write_cond() == WR_NONE && self.mem_op() == MEM_NOP
    }
}

pub const MAX_MICRO_STEPS: usize = 16;
pub const ROM_SIZE: usize = 256 * MAX_MICRO_STEPS;

#[derive(Debug, Clone)]
pub struct ControlStore {
    pub rom: Vec<u32>,
    pub fetch_sequence: Vec<u32>,
    populated: Vec<bool>,
}

impl ControlStore {
    pub fn new() -> Self {
        let nop_fetch =
            Microinstruction::from_fields(0, 0, WR_NONE, MEM_NOP, ALU_NOP, SEQ_FETCH).raw;
        Self {
            rom: vec![nop_fetch; ROM_SIZE],
            fetch_sequence: Vec::new(),
            populated: vec![false; 256],
        }
    }

    pub fn addr(opcode: u8, micro_step: u8) -> usize {
        let base = opcode as usize * MAX_MICRO_STEPS;
        base + micro_step as usize
    }

    pub fn fetch(&self, opcode: u8, micro_step: u8) -> Microinstruction {
        Microinstruction::from_raw(self.rom[Self::addr(opcode, micro_step)])
    }

    pub fn fetch_step(&self, step: usize) -> Option<Microinstruction> {
        self.fetch_sequence
            .get(step)
            .map(|raw| Microinstruction::from_raw(*raw))
    }

    pub fn set_fetch_sequence(&mut self, steps: &[u32]) -> Result<(), String> {
        if steps.len() > MAX_MICRO_STEPS {
            return Err(format!(
                "too many fetch micro-steps: {} > {}",
                steps.len(),
                MAX_MICRO_STEPS,
            ));
        }

        for &word in steps {
            if (word & 0x1) as u8 != SEQ_NEXT {
                return Err(format!(
                    "fetch micro-step must have seq_ctrl = SEQ_NEXT (word=0x{:04X})",
                    word
                ));
            }
        }

        self.fetch_sequence = steps.to_vec();
        Ok(())
    }

    pub fn write_sequence(&mut self, opcode: u8, steps: &[u32]) -> Result<(), String> {
        if steps.len() > MAX_MICRO_STEPS {
            return Err(format!(
                "too many micro-steps for opcode 0x{:02X}: {} > {}",
                opcode,
                steps.len(),
                MAX_MICRO_STEPS,
            ));
        }

        for (i, &word) in steps.iter().enumerate() {
            self.rom[Self::addr(opcode, i as u8)] = word;
        }

        self.populated[opcode as usize] = true;
        Ok(())
    }

    pub fn has_opcode(&self, opcode: u8) -> bool {
        self.populated[opcode as usize]
    }

    pub fn get_fetch_sequence(&self) -> Vec<Microinstruction> {
        self.fetch_sequence
            .iter()
            .map(|&w| Microinstruction::from_raw(w))
            .collect()
    }

    pub fn get_sequence_for_opcode(&self, opcode: u8) -> Vec<Microinstruction> {
        let mut result = Vec::new();

        for step in 0..MAX_MICRO_STEPS {
            let mi = self.fetch(opcode, step as u8);
            result.push(mi);
            if mi.seq_ctrl() == SEQ_FETCH {
                break;
            }
        }

        result
    }

    pub fn get_sequence(&self, opcode: u8) -> Vec<Microinstruction> {
        let mut result = self.get_fetch_sequence();
        result.extend(self.get_sequence_for_opcode(opcode));
        result
    }
}

pub fn is_valid_opcode(opcode: u8) -> bool {
    VALID_OPCODES.contains(&opcode)
}

pub fn parse_control_rom_file(contents: &str) -> Result<ControlStore, String> {
    let mut cs = ControlStore::new();
    let mut errors: Vec<String> = Vec::new();
    let mut loaded_count = 0usize;

    for (line_num, line) in contents.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() || line.starts_with(';') || line.starts_with('#') {
            continue;
        }

        let line_num = line_num + 1;
        let parts: Vec<&str> = line.splitn(2, "->").collect();
        if parts.len() != 2 {
            errors.push(format!(
                "line {}: malformed line (expected 'OPCODE -> WORDS'): {}",
                line_num, line
            ));
            continue;
        }

        let label = parts[0].trim();
        let is_fetch_line = label.eq_ignore_ascii_case("FETCH") || label.eq_ignore_ascii_case("F");
        let opcode = if is_fetch_line {
            None
        } else {
            let opcode_str = label.trim_start_matches("0x").trim_start_matches("0X");
            match u8::from_str_radix(opcode_str, 16) {
                Ok(v) => Some(v),
                Err(_) => {
                    errors.push(format!(
                        "line {}: invalid opcode '{}': {}",
                        line_num, label, line
                    ));
                    continue;
                }
            }
        };

        let signals_str = parts[1].trim();
        let mut words: Vec<u32> = Vec::new();
        let mut line_ok = true;
        for hex_token in signals_str.split(',') {
            let hex_token = hex_token
                .trim()
                .trim_start_matches("0x")
                .trim_start_matches("0X");

            if hex_token.is_empty() {
                continue;
            }

            match u32::from_str_radix(hex_token, 16) {
                Ok(word) => words.push(word),
                Err(_) => {
                    errors.push(format!(
                        "line {}: invalid hex value '{}' for {}",
                        line_num,
                        hex_token,
                        match opcode {
                            Some(op) => format!("opcode 0x{:02X}", op),
                            None => "FETCH".to_string(),
                        }
                    ));

                    line_ok = false;
                    break;
                }
            }
        }

        if line_ok && !words.is_empty() {
            if words.len() > MAX_MICRO_STEPS {
                errors.push(format!(
                    "line {}: too many micro-steps ({}) for {} (max {})",
                    line_num,
                    words.len(),
                    match opcode {
                        Some(op) => format!("opcode 0x{:02X}", op),
                        None => "FETCH".to_string(),
                    },
                    MAX_MICRO_STEPS
                ));
                continue;
            }

            match opcode {
                Some(op) => {
                    if let Err(e) = cs.write_sequence(op, &words) {
                        errors.push(format!("line {}: {}", line_num, e));
                        continue;
                    }
                    loaded_count += 1;
                }
                None => {
                    let invalid = words.iter().any(|w| (w & 0x1) as u8 == SEQ_FETCH);
                    if invalid {
                        errors.push(format!(
                            "line {}: FETCH micro-steps must all have seq_ctrl = SEQ_NEXT",
                            line_num
                        ));
                        continue;
                    }

                    if words[words.len() - 1] != 0x19080 {
                        errors.push(format!(
                            "line {}: last FETCH micro-step must be 0x19080 (RI <- MDR), got 0x{:05X}",
                            line_num,
                            words[words.len() - 1]
                        ));
                        continue;
                    }

                    if let Err(e) = cs.set_fetch_sequence(&words) {
                        errors.push(format!("line {}: {}", line_num, e));
                        continue;
                    }
                }
            }
        }
    }

    if !errors.is_empty() {
        return Err(format!(
            "CONTROL_ROM: {} error(s) parsing ROM file:\n{}",
            errors.len(),
            errors.join("\n")
        ));
    }

    println!("Control ROM loaded!");
    println!("{} instructions parsed from ROM file", loaded_count);

    Ok(cs)
}

pub fn build_control_rom() -> ControlStore {
    const MICRO_CODE_ROM: &str = include_str!("CONTROL_ROM.z70m");
    parse_control_rom_file(MICRO_CODE_ROM).expect("Error parsing ROM file")
}
