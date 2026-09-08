use serde::Serialize;

use crate::assembler::InstructionCat;

#[derive(Debug, Clone, Serialize)]
pub struct DisassembledInstruction {
    pub address: u8,
    pub bytes: Vec<u8>,
    pub mnemonic: String,
    pub size: u8,
}

fn hex_str(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|b| format!("0x{:02X}", b))
        .collect::<Vec<_>>()
        .join(" ")
}

fn upper_nibble_to_mnemonic(upper: u8) -> Option<&'static str> {
    match upper {
        0x0 => Some("ADD"),
        0x1 => Some("SUB"),
        0x2 => Some("CMP"),
        0x3 => Some("INC"),
        0x4 => Some("DEC"),
        0x5 => Some("AND"),
        0x6 => Some("OR"),
        0x7 => Some("NOT"),
        0x8 => Some("SHR"),
        0x9 => Some("SHL"),
        0xA => None, // Jumps
        0xB => Some("MOV"),
        0xF => Some("NOP"),
        _ => None,
    }
}

fn decode_two_operand_mode(lower: u8) -> Option<(&'static str, bool)> {
    match lower {
        0x0 => Some(("A, B", false)),
        0x1 => Some(("B, A", false)),
        0x2 => Some(("A, I", false)),
        0x3 => Some(("I, A", false)),
        0x4 => Some(("A, [I]", false)),
        0x5 => Some(("[I], A", false)),
        0x6 => Some(("A, ", true)),
        0x7 => Some(("B, ", true)),
        0x8 => Some(("I, ", true)),
        0x9 => Some(("[I], ", true)),
        0xA => Some(("A, [", true)),
        0xB => Some(("B, [", true)),
        0xC => Some(("[", true)),
        0xD => Some(("[", true)),
        _ => None,
    }
}

fn format_two_operand_with_extra(lower: u8, extra: u8) -> String {
    let extra = hex_str(&[extra]);
    match lower {
        0x6 => format!("A, {}", extra),
        0x7 => format!("B, {}", extra),
        0x8 => format!("I, {}", extra),
        0x9 => format!("[I], {}", extra),
        0xA => format!("A, [{}]", extra),
        0xB => format!("B, [{}]", extra),
        0xC => format!("[{}], A", extra),
        0xD => format!("[{}], B", extra),
        _ => format!("???"),
    }
}

fn decode_single_operand(lower: u8) -> Option<&'static str> {
    match lower {
        0x0 => Some("A"),
        0x1 => Some("B"),
        0x2 => Some("I"),
        0x4 => Some("[I]"),
        _ => None,
    }
}

fn data_byte(pc: usize, byte: u8) -> DisassembledInstruction {
    DisassembledInstruction {
        address: pc as u8,
        bytes: vec![byte],
        mnemonic: format!("DB {}", hex_str(&[byte])),
        size: 1,
    }
}

fn decode_jump(opcode: u8) -> Option<&'static str> {
    match opcode {
        0xA0 => Some("JMP"),
        0xA1 => Some("JZ"),
        0xA2 => Some("JS"),
        0xA3 => Some("JC"),
        0xA4 => Some("JO"),
        0xA5 => Some("JP"),
        _ => None,
    }
}

pub fn disassemble(
    memory: &[u8],
    program_size: usize,
    data_map: &[bool],
) -> Vec<DisassembledInstruction> {
    let mut instructions = Vec::new();
    let limit = program_size.min(memory.len());
    let mut pc: usize = 0;

    let is_data = |addr: usize| data_map.get(addr).copied().unwrap_or(false);

    while pc < limit {
        let opcode = memory[pc];

        if is_data(pc) {
            instructions.push(data_byte(pc, opcode));
            pc += 1;
            continue;
        }

        let upper = (opcode >> 4) & 0x0F;
        let lower = opcode & 0x0F;
        let category = InstructionCat::from_upper_nibble(upper);

        match category {
            InstructionCat::Nop => {
                let mnemonic = match opcode {
                    0xFE => "HLT",
                    _ => "NOP",
                };
                instructions.push(DisassembledInstruction {
                    address: pc as u8,
                    bytes: vec![opcode],
                    mnemonic: mnemonic.to_string(),
                    size: 1,
                });
                pc += 1;
            }

            InstructionCat::Jump => match decode_jump(opcode) {
                Some(jmp_name) if pc + 1 < limit => {
                    let target = memory[pc + 1];
                    instructions.push(DisassembledInstruction {
                        address: pc as u8,
                        bytes: vec![opcode, target],
                        mnemonic: format!("{} {}", jmp_name, hex_str(&[target])),
                        size: 2,
                    });
                    pc += 2;
                }
                _ => {
                    instructions.push(data_byte(pc, opcode));
                    pc += 1;
                }
            },

            InstructionCat::SingleOperand => {
                match (
                    upper_nibble_to_mnemonic(upper),
                    decode_single_operand(lower),
                ) {
                    (Some(mnemonic_name), Some(reg_name)) => {
                        instructions.push(DisassembledInstruction {
                            address: pc as u8,
                            bytes: vec![opcode],
                            mnemonic: format!("{} {}", mnemonic_name, reg_name),
                            size: 1,
                        });
                        pc += 1;
                    }
                    _ => {
                        instructions.push(data_byte(pc, opcode));
                        pc += 1;
                    }
                }
            }

            InstructionCat::TwoOperand => {
                match (
                    upper_nibble_to_mnemonic(upper),
                    decode_two_operand_mode(lower),
                ) {
                    (Some(mnemonic_name), Some((operand_prefix, has_extra))) => {
                        if has_extra {
                            if pc + 1 >= limit {
                                instructions.push(data_byte(pc, opcode));
                                pc += 1;
                            } else {
                                let extra = memory[pc + 1];
                                let operand_str = format_two_operand_with_extra(lower, extra);
                                instructions.push(DisassembledInstruction {
                                    address: pc as u8,
                                    bytes: vec![opcode, extra],
                                    mnemonic: format!("{} {}", mnemonic_name, operand_str),
                                    size: 2,
                                });
                                pc += 2;
                            }
                        } else {
                            let operand_str = operand_prefix;
                            instructions.push(DisassembledInstruction {
                                address: pc as u8,
                                bytes: vec![opcode],
                                mnemonic: format!("{} {}", mnemonic_name, operand_str),
                                size: 1,
                            });
                            pc += 1;
                        }
                    }
                    _ => {
                        instructions.push(data_byte(pc, opcode));
                        pc += 1;
                    }
                }
            }
            _ => {
                instructions.push(data_byte(pc, opcode));
                pc += 1;
            }
        }
    }

    instructions
}
