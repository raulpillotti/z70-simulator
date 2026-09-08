use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub enum Operand {
    RegA,
    RegB,
    RegI,
    IndirectI,
    Immediate(u8),
    DirectAddr(u8),
    Label(String),
    LabelAddr(String),
}

#[derive(Debug, Clone, PartialEq)]
pub enum InstructionCat {
    TwoOperand,
    SingleOperand,
    Jump,
    Nop,
    Halt,
    Unknown,
}

impl InstructionCat {
    fn from_mnemonic(mnemonic: &str) -> Self {
        match mnemonic.to_lowercase().as_str() {
            "nop" => Self::Nop,
            "hlt" => Self::Halt,
            "jmp" | "jz" | "js" | "jc" | "jo" | "jp" => Self::Jump,
            "inc" | "dec" | "not" | "shr" | "shl" => Self::SingleOperand,
            "add" | "sub" | "cmp" | "and" | "or" | "mov" => Self::TwoOperand,
            _ => Self::Unknown,
        }
    }

    pub fn from_upper_nibble(nibble: u8) -> Self {
        match nibble {
            0x0 => InstructionCat::TwoOperand,
            0x1 => InstructionCat::TwoOperand,
            0x2 => InstructionCat::TwoOperand,
            0x3 => InstructionCat::SingleOperand,
            0x4 => InstructionCat::SingleOperand,
            0x5 => InstructionCat::TwoOperand,
            0x6 => InstructionCat::TwoOperand,
            0x7 => InstructionCat::SingleOperand,
            0x8 => InstructionCat::SingleOperand,
            0x9 => InstructionCat::SingleOperand,
            0xA => InstructionCat::Jump,
            0xB => InstructionCat::TwoOperand,
            0xF => InstructionCat::Nop,
            _ => InstructionCat::Unknown,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Section {
    Text,
    Data,
}

#[derive(Debug, Clone, Default)]
pub struct AssembledProgram {
    pub code: Vec<u8>,
    pub data_map: Vec<bool>,
}

#[derive(Debug, Clone)]
pub enum Line {
    Instruction {
        mnemonic: String,
        operands: Vec<Operand>,
    },
    LabelDef {
        name: String,
    },
    LabelAndInstruction {
        label: String,
        mnemonic: String,
        operands: Vec<Operand>,
    },
    LabelAndDb {
        label: String,
        values: Vec<u8>,
    },
    Db {
        values: Vec<u8>,
    },
    Org {
        address: u8,
    },
    SectionDirective {
        section: Section,
    },
    Empty,
    Halt,
}

fn instruction_size(mnemonic: &str, operands: &[Operand]) -> usize {
    match InstructionCat::from_mnemonic(mnemonic) {
        InstructionCat::Nop => return 1,
        InstructionCat::Halt => return 1,
        InstructionCat::SingleOperand => return 1,
        InstructionCat::Jump => return 2,
        _ => {}
    };

    let has_extra = operands.iter().any(|op| match op {
        Operand::Immediate(_) => true,
        Operand::DirectAddr(_) => true,
        Operand::Label(_) => true,
        Operand::LabelAddr(_) => true,
        _ => false,
    });

    match has_extra {
        true => 2,
        false => 1,
    }
}

fn parse_operand(s: &str) -> Operand {
    let s = s.trim();

    match s.to_lowercase().as_str() {
        "a" => return Operand::RegA,
        "b" => return Operand::RegB,
        "i" => return Operand::RegI,
        _ => {}
    }

    if s.starts_with('[') && s.ends_with(']') {
        let inner = s[1..s.len() - 1].trim();
        if inner.to_lowercase() == "i" {
            return Operand::IndirectI;
        }
        if let Some(val) = parse_number(inner) {
            return Operand::DirectAddr(val);
        }
        return Operand::LabelAddr(inner.to_lowercase());
    }

    if let Some(val) = parse_number(s) {
        return Operand::Immediate(val);
    }

    Operand::Label(s.to_lowercase())
}

fn parse_number(s: &str) -> Option<u8> {
    let s = s.trim();

    if s.to_lowercase().starts_with("0x") {
        return u8::from_str_radix(&s[2..], 16).ok();
    }

    if s.to_lowercase().ends_with('h') {
        return u8::from_str_radix(&s[..s.len() - 1], 16).ok();
    }

    match s.parse::<i8>() {
        Ok(signed) => Some(signed as u8),
        Err(_) => s.parse::<u8>().ok(),
    }
}

fn parse_db_value(s: &str) -> Result<Vec<u8>, String> {
    let s = s.trim();

    if s.is_empty() {
        return Err("Empty db value".to_string());
    }

    if s.contains(',') {
        return Err(
            "db does not support multiple comma-separated values; use one db per value".to_string(),
        );
    }

    if (s.starts_with('"') && s.ends_with('"')) || (s.starts_with('\'') && s.ends_with('\'')) {
        let inner = &s[1..s.len() - 1];
        return Ok(inner.bytes().collect());
    }

    if let Some(val) = parse_number(s) {
        return Ok(vec![val]);
    }

    Err(format!("Invalid db value: '{}'", s))
}

fn parse_line(line: &str) -> Result<Line, String> {
    let line = if let Some(pos) = line.find(';') {
        &line[..pos]
    } else {
        line
    };

    let line = line.trim();
    if line.is_empty() {
        return Ok(Line::Empty);
    }

    match line.to_lowercase().as_str() {
        ".text" => {
            return Ok(Line::SectionDirective {
                section: Section::Text,
            })
        }
        ".data" => {
            return Ok(Line::SectionDirective {
                section: Section::Data,
            })
        }
        _ => {}
    }

    let lower = line.to_lowercase();
    if lower.starts_with("org ") || lower.starts_with("org\t") {
        let rest = line[3..].trim();
        if let Some(addr) = parse_number(rest) {
            return Ok(Line::Org { address: addr });
        } else {
            return Err(format!("Invalid address for org: '{}'", rest));
        }
    }

    if lower.starts_with("db ") || lower.starts_with("db\t") {
        let rest = line[2..].trim();
        let values = parse_db_value(rest)?;
        return Ok(Line::Db { values });
    }

    if let Some(pos) = line.find(':') {
        let label = line[..pos].trim().to_lowercase();
        let rest = line[pos + 1..].trim();

        if rest.is_empty() {
            return Ok(Line::LabelDef { name: label });
        }

        let rest_lower = rest.to_lowercase();
        if rest_lower.starts_with("db ") || rest_lower.starts_with("db\t") {
            let db_rest = rest[2..].trim();
            let values = parse_db_value(db_rest)?;
            return Ok(Line::LabelAndDb { label, values });
        }

        if rest_lower.starts_with("org ") || rest_lower.starts_with("org\t") {
            return Err(
                "org directive cannot be combined with a label on the same line".to_string(),
            );
        }

        let (mnemonic, operands) = parse_instruction(rest);
        return Ok(Line::LabelAndInstruction {
            label,
            mnemonic,
            operands,
        });
    }

    let (mnemonic, operands) = parse_instruction(line);
    Ok(Line::Instruction { mnemonic, operands })
}

fn parse_instruction(s: &str) -> (String, Vec<Operand>) {
    let s = s.trim();
    let parts: Vec<&str> = s.splitn(2, char::is_whitespace).collect();
    let mnemonic = parts[0].to_lowercase();

    if parts.len() == 1 {
        return (mnemonic, vec![]);
    }

    let operands_str = parts[1].trim();
    let operand_strings: Vec<&str> = operands_str.split(',').collect();
    let operands: Vec<Operand> = operand_strings.iter().map(|s| parse_operand(s)).collect();

    (mnemonic, operands)
}

fn mnemonic_to_upper_nibble(mnemonic: &str) -> Option<u8> {
    match mnemonic.to_lowercase().as_str() {
        "add" => Some(0x00),
        "sub" => Some(0x10),
        "cmp" => Some(0x20),
        "inc" => Some(0x30),
        "dec" => Some(0x40),
        "and" => Some(0x50),
        "or" => Some(0x60),
        "not" => Some(0x70),
        "shr" => Some(0x80),
        "shl" => Some(0x90),
        "mov" => Some(0xB0),
        "nop" => Some(0xFF),
        "hlt" => Some(0xFE),
        "jmp" => Some(0xA0),
        "jz" => Some(0xA1),
        "js" => Some(0xA2),
        "jc" => Some(0xA3),
        "jo" => Some(0xA4),
        "jp" => Some(0xA5),
        "halt" => Some(0xFE),
        _ => None,
    }
}

fn encode_jump_operands(
    mnemonic: &str,
    operands: &[Operand],
    symbols: &HashMap<String, u8>,
) -> Result<(u8, Option<u8>), String> {
    if operands.len() != 1 {
        return Err(format!(
            "Jump instruction '{}' requires exactly 1 operand",
            mnemonic
        ));
    }

    let addr = resolve_jump_target(&operands[0], symbols)?;
    return Ok((0x00, Some(addr)));
}

fn encode_single_operand(mnemonic: &str, operands: &[Operand]) -> Result<(u8, Option<u8>), String> {
    if operands.len() != 1 {
        return Err(format!(
            "Instruction '{}' requires exactly 1 operand",
            mnemonic
        ));
    }

    let nibble = match &operands[0] {
        Operand::RegA => 0x00,
        Operand::RegB => 0x01,
        Operand::RegI => 0x02,
        Operand::IndirectI => 0x04,
        _ => {
            return Err(format!(
                "Invalid operand for '{}': expected register A, B, I or [I]",
                mnemonic
            ))
        }
    };

    return Ok((nibble, None));
}

fn resolve_operands(
    operands: &[Operand],
    symbols: &HashMap<String, u8>,
) -> Result<Vec<Operand>, String> {
    let mut resolved = Vec::with_capacity(operands.len());

    for op in operands {
        match op {
            Operand::LabelAddr(name) => {
                let addr = resolve_label(name, symbols)?;
                resolved.push(Operand::DirectAddr(addr));
            }
            Operand::Label(name) => {
                let addr = resolve_label(name, symbols)?;
                resolved.push(Operand::DirectAddr(addr));
            }
            other => resolved.push(other.clone()),
        }
    }

    Ok(resolved)
}

fn encode_double_operands(
    mnemonic: &str,
    operands: &[Operand],
) -> Result<(u8, Option<u8>), String> {
    if operands.len() != 2 {
        return Err(format!(
            "Instruction '{}' requires exactly 2 operands, got {}",
            mnemonic,
            operands.len()
        ));
    }

    let (addr_mode, extra) = match (&operands[0], &operands[1]) {
        (Operand::RegA, Operand::RegB) => (0x00, None),
        (Operand::RegB, Operand::RegA) => (0x01, None),
        (Operand::RegA, Operand::RegI) => (0x02, None),
        (Operand::RegI, Operand::RegA) => (0x03, None),
        (Operand::RegA, Operand::IndirectI) => (0x04, None),
        (Operand::IndirectI, Operand::RegA) => (0x05, None),
        (Operand::RegA, Operand::Immediate(v)) => (0x06, Some(*v)),
        (Operand::RegB, Operand::Immediate(v)) => (0x07, Some(*v)),
        (Operand::RegI, Operand::Immediate(v)) => (0x08, Some(*v)),
        (Operand::IndirectI, Operand::Immediate(v)) => (0x09, Some(*v)),
        (Operand::RegA, Operand::DirectAddr(v)) => (0x0A, Some(*v)),
        (Operand::RegB, Operand::DirectAddr(v)) => (0x0B, Some(*v)),
        (Operand::DirectAddr(v), Operand::RegA) => (0x0C, Some(*v)),
        (Operand::DirectAddr(v), Operand::RegB) => (0x0D, Some(*v)),
        _ => {
            return Err(format!(
                "Invalid operand combination for '{}': {:?}, {:?}",
                mnemonic, operands[0], operands[1]
            ))
        }
    };

    Ok((addr_mode, extra))
}

fn encode_operands(
    mnemonic: &str,
    operands: &[Operand],
    symbols: &HashMap<String, u8>,
) -> Result<(u8, Option<u8>), String> {
    match InstructionCat::from_mnemonic(mnemonic) {
        InstructionCat::Nop => return Ok((0xFF, None)),
        InstructionCat::Halt => return Ok((0xFE, None)),
        InstructionCat::Jump => encode_jump_operands(mnemonic, operands, symbols),
        InstructionCat::SingleOperand => encode_single_operand(mnemonic, operands),
        InstructionCat::TwoOperand => {
            let resolved = resolve_operands(operands, symbols)?;
            encode_double_operands(mnemonic, &resolved)
        }
        InstructionCat::Unknown => return Err(format!("Unknown mnemonic: {}", mnemonic)),
    }
}

fn resolve_jump_target(operand: &Operand, symbols: &HashMap<String, u8>) -> Result<u8, String> {
    match operand {
        Operand::Immediate(v) => Ok(*v),
        Operand::DirectAddr(v) => Ok(*v),
        Operand::Label(name) => resolve_label(name, symbols),
        Operand::LabelAddr(name) => resolve_label(name, symbols),
        _ => Err(format!(
            "Invalid operand for jump instruction: {:?}",
            operand
        )),
    }
}

fn resolve_label(name: &str, symbols: &HashMap<String, u8>) -> Result<u8, String> {
    symbols
        .get(name)
        .copied()
        .ok_or_else(|| format!("Undefined label: {}", name))
}

fn build_symbol_table(lines: &[Line]) -> HashMap<String, u8> {
    let mut symbols: HashMap<String, u8> = HashMap::new();
    let mut address: usize = 0;

    for line in lines {
        match line {
            Line::Empty | Line::Halt => {}
            Line::SectionDirective { .. } => {}
            Line::Org { address: addr } => {
                address = *addr as usize;
            }
            Line::Instruction { mnemonic, operands } => {
                address += instruction_size(mnemonic, operands);
            }
            Line::Db { values } => {
                address += values.len();
            }
            Line::LabelDef { name } => {
                symbols.insert(name.clone(), address as u8);
            }
            Line::LabelAndInstruction {
                label,
                mnemonic,
                operands,
            } => {
                symbols.insert(label.clone(), address as u8);
                address += instruction_size(mnemonic, operands);
            }
            Line::LabelAndDb { label, values } => {
                symbols.insert(label.clone(), address as u8);
                address += values.len();
            }
        }
    }

    symbols
}

fn build_machine_code(
    lines: &[Line],
    symbols: &HashMap<String, u8>,
) -> Result<AssembledProgram, String> {
    let mut machine_code: Vec<u8> = Vec::new();
    let mut data_map: Vec<bool> = Vec::new();
    let mut current_address: usize = 0;
    for line in lines {
        match line {
            Line::Empty | Line::LabelDef { .. } | Line::SectionDirective { .. } => continue,
            Line::Org { address } => {
                let target = *address as usize;
                if target < current_address {
                    return Err(format!(
                        "org address 0x{:02X} is before current address 0x{:02X}",
                        target, current_address
                    ));
                }
                while current_address < target {
                    machine_code.push(0xFF);
                    data_map.push(false);
                    current_address += 1;
                }
                continue;
            }
            Line::Db { values } => {
                for v in values {
                    machine_code.push(*v);
                    data_map.push(true);
                    current_address += 1;
                }
                continue;
            }
            Line::LabelAndDb { values, .. } => {
                for v in values {
                    machine_code.push(*v);
                    data_map.push(true);
                    current_address += 1;
                }
                continue;
            }
            _ => {}
        }
        let (mnemonic, operands) = match line {
            Line::Instruction { mnemonic, operands } => (mnemonic, operands),
            Line::LabelAndInstruction {
                label: _,
                mnemonic,
                operands,
            } => (mnemonic, operands),
            _ => continue,
        };

        let operand_kind = InstructionCat::from_mnemonic(&mnemonic);
        if operand_kind == InstructionCat::Nop {
            machine_code.push(0xFF);
            data_map.push(false);
            current_address += 1;
            continue;
        }

        if operand_kind == InstructionCat::Halt {
            machine_code.push(0xFE);
            data_map.push(false);
            current_address += 1;
            continue;
        }

        let base = mnemonic_to_upper_nibble(&mnemonic)
            .ok_or_else(|| format!("Unknown mnemonic: {}", mnemonic))?;

        if operand_kind == InstructionCat::Jump {
            let (_, extra) = encode_operands(&mnemonic, operands, &symbols)?;
            machine_code.push(base);
            data_map.push(false);
            current_address += 1;
            if let Some(addr) = extra {
                machine_code.push(addr);
                data_map.push(false);
                current_address += 1;
            }
            continue;
        }

        let (addr_mode, extra_byte) = encode_operands(&mnemonic, operands, &symbols)?;
        let opcode = base | addr_mode;
        machine_code.push(opcode);
        data_map.push(false);
        current_address += 1;

        if let Some(val) = extra_byte {
            machine_code.push(val);
            data_map.push(false);
            current_address += 1;
        }
    }

    Ok(AssembledProgram {
        code: machine_code,
        data_map,
    })
}

pub fn assemble_program(source: &str) -> Result<AssembledProgram, String> {
    let lines: Result<Vec<Line>, String> = source.lines().map(|l| parse_line(l)).collect();
    let lines = lines?;
    let symbols = build_symbol_table(&lines);
    build_machine_code(&lines, &symbols)
}

pub fn assemble(source: &str) -> Result<Vec<u8>, String> {
    Ok(assemble_program(source)?.code)
}
