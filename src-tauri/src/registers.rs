use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Flags {
    pub cf: bool, // Carry
    pub zf: bool, // Zero
    pub sf: bool, // Sign
    pub pf: bool, // Parity
    pub of: bool, // Overflow
}

impl Flags {
    pub fn new() -> Self {
        Self {
            cf: false,
            zf: false,
            sf: false,
            pf: false,
            of: false,
        }
    }

    pub fn update(&mut self, result: u8, carry: bool, overflow: bool) {
        self.cf = carry;
        self.zf = result == 0;
        self.sf = (result & 0x80) != 0;
        self.pf = (result.count_ones() % 2) == 0;
        self.of = overflow;
    }

    pub fn to_byte(&self) -> u8 {
        (self.cf as u8)
            | ((self.zf as u8) << 1)
            | ((self.sf as u8) << 2)
            | ((self.pf as u8) << 3)
            | ((self.of as u8) << 4)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub enum Reg {
    A,
    B,
    I,
    PC,
    RI,
    MAR,
    MDR,
    S,
    TEMP1,
    TEMP2,
}

impl Reg {
    pub fn to_binary(&self) -> u8 {
        match self {
            Reg::A => 0x0,
            Reg::B => 0x1,
            Reg::I => 0x2,
            Reg::PC => 0x3,
            Reg::RI => 0x4,
            Reg::MAR => 0x5,
            Reg::MDR => 0x6,
            Reg::S => 0x7,
            Reg::TEMP1 => 0x8,
            Reg::TEMP2 => 0x9,
        }
    }

    pub fn from_binary(code: u8) -> Option<Self> {
        match code {
            0x0 => Some(Reg::A),
            0x1 => Some(Reg::B),
            0x2 => Some(Reg::I),
            0x3 => Some(Reg::PC),
            0x4 => Some(Reg::RI),
            0x5 => Some(Reg::MAR),
            0x6 => Some(Reg::MDR),
            0x7 => Some(Reg::S),
            0x8 => Some(Reg::TEMP1),
            0x9 => Some(Reg::TEMP2),
            _ => None,
        }
    }
}

impl std::fmt::Display for Reg {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Reg::A => write!(f, "A"),
            Reg::B => write!(f, "B"),
            Reg::I => write!(f, "I"),
            Reg::PC => write!(f, "PC"),
            Reg::RI => write!(f, "RI"),
            Reg::MAR => write!(f, "MAR"),
            Reg::MDR => write!(f, "MDR"),
            Reg::S => write!(f, "S"),
            Reg::TEMP1 => write!(f, "TEMP1"),
            Reg::TEMP2 => write!(f, "TEMP2"),
        }
    }
}
