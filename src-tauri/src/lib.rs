use cpu::Cpu;
use serde::Serialize;
use std::sync::Mutex;

pub mod assembler;
pub mod client;
pub mod control_unit;
pub mod cpu;
pub mod disassembler;
pub mod memory;
pub mod registers;

#[macro_use]
pub mod macros;

struct SimulatorState {
    cpu: Cpu,
    program_loaded: bool,
    program_size: usize,
    data_map: Vec<bool>,
    source_code: Option<String>,
    file_name: Option<String>,
    original_program: Vec<u8>,
}

#[derive(Serialize)]
struct LoadResult {
    file_name: String,
    program_size: usize,
    file_type: String,
}

#[tauri::command]
fn load_assembly_file(
    path: String,
    state: tauri::State<Mutex<SimulatorState>>,
) -> Result<LoadResult, String> {
    let source =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?;

    let program = assembler::assemble_program(&source)?;
    let machine_code = program.code;

    let mut state = lock!(state);
    state.original_program = machine_code.clone();
    state.cpu.reset_all();
    state.cpu.load_program(&machine_code);
    state.program_loaded = true;
    state.program_size = machine_code.len();
    state.data_map = program.data_map;
    state.source_code = Some(source);

    let file_name = std::path::Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());
    state.file_name = Some(file_name.clone());

    Ok(LoadResult {
        file_name,
        program_size: machine_code.len(),
        file_type: "assembly".to_string(),
    })
}

#[tauri::command]
fn load_binary_file(
    path: String,
    state: tauri::State<Mutex<SimulatorState>>,
) -> Result<LoadResult, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;

    let mut state = lock!(state);
    state.original_program = bytes.clone();
    state.cpu.reset_all();
    state.cpu.load_program(&bytes);
    state.program_loaded = true;
    state.program_size = bytes.len();
    state.data_map = Vec::new();
    state.source_code = None;

    let file_name = std::path::Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());
    state.file_name = Some(file_name.clone());

    Ok(LoadResult {
        file_name,
        program_size: bytes.len(),
        file_type: "binary".to_string(),
    })
}

#[tauri::command]
fn load_control_memory(
    path: String,
    state: tauri::State<Mutex<SimulatorState>>,
) -> Result<String, String> {
    let contents =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?;

    let control_rom = control_unit::parse_control_rom_file(&contents)?;

    let mut state = lock!(state);
    state.cpu.load_control_rom(control_rom);

    let file_name = std::path::Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());

    Ok(file_name)
}

#[tauri::command]
fn is_program_loaded(state: tauri::State<Mutex<SimulatorState>>) -> bool {
    lock!(state).program_loaded
}

#[tauri::command]
fn get_memory_dump(state: tauri::State<Mutex<SimulatorState>>) -> Result<Vec<u8>, String> {
    let state = lock!(state);

    if !state.program_loaded {
        return Err("No program loaded".to_string());
    }

    Ok(state.cpu.memory.clone())
}

use client::CpuSnapshotPayload;
use client::CpuStatePayload;
use client::MicroinstructionPayload;
use client::StepResult;
use disassembler::DisassembledInstruction;

#[tauri::command]
fn get_disassembled_instructions(
    state: tauri::State<Mutex<SimulatorState>>,
) -> Result<Vec<DisassembledInstruction>, String> {
    let state = lock!(state);

    if !state.program_loaded {
        return Err("No program loaded".to_string());
    }

    Ok(disassembler::disassemble(
        &state.cpu.memory,
        state.program_size,
        &state.data_map,
    ))
}

#[derive(Serialize)]
struct FlagsResponse {
    cf: bool,
    zf: bool,
    sf: bool,
    pf: bool,
    of: bool,
}

#[derive(Serialize)]
struct CpuStateResponse {
    pc: u8,
    a: u8,
    b: u8,
    i: u8,
    ir: u8,
    mar: u8,
    mdr: u8,
    s: u8,
    temp1: u8,
    temp2: u8,
    flags: FlagsResponse,
    state: String,
    cycle_count: u64,
    completed_instruction_count: u64,
    mem_reads: u64,
    mem_writes: u64,
    reg_reads: u64,
    reg_writes: u64,
    cond_jump_taken_count: u64,
    cond_jump_not_taken_count: u64,
    program_size: usize,
}

#[tauri::command]
fn get_cpu_state(state: tauri::State<Mutex<SimulatorState>>) -> Result<CpuStateResponse, String> {
    let state = lock!(state);

    if !state.program_loaded {
        return Err("No program loaded".to_string());
    }

    let cpu = &state.cpu;

    let state_str = match &cpu.state {
        cpu::CpuState::Running => "Running".to_string(),
        cpu::CpuState::Halted => "Halted".to_string(),
        cpu::CpuState::Error(msg) => msg.clone(),
    };

    Ok(CpuStateResponse {
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
        flags: FlagsResponse {
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
        program_size: state.program_size,
    })
}

#[tauri::command]
fn get_fetch_length(state: tauri::State<Mutex<SimulatorState>>) -> usize {
    let state = lock!(state);
    state.cpu.control_rom_ref().fetch_sequence.len()
}

#[tauri::command]
fn get_microinstructions(
    state: tauri::State<Mutex<SimulatorState>>,
) -> Result<Vec<MicroinstructionPayload>, String> {
    let state = lock!(state);

    if !state.program_loaded {
        return Err("No program loaded".to_string());
    }

    let opcode = state.cpu.memory[state.cpu.pc as usize];

    if !state.cpu.control_rom_ref().has_opcode(opcode) {
        return Err(format!("Unknown opcode: {:02X}h", opcode));
    }

    println!("Opcode {}", opcode);
    let sequence = state.cpu.control_rom_ref().get_sequence(opcode);
    println!("Seq {} {:?}", sequence.len(), sequence);
    let payloads: Vec<MicroinstructionPayload> = sequence
        .iter()
        .map(|mi| MicroinstructionPayload::from_u32(mi.raw))
        .collect();

    Ok(payloads)
}

#[tauri::command]
fn execute_step(state: tauri::State<Mutex<SimulatorState>>) -> Result<StepResult, String> {
    let mut state = lock!(state);

    if !state.program_loaded {
        return Err("No program loaded".to_string());
    }

    let output = state.cpu.step();

    let (payloads, snapshot_payloads) = match &output {
        Some(out) => (
            out.micro_ops
                .iter()
                .map(|mi| MicroinstructionPayload::from_u32(mi.raw))
                .collect(),
            out.snapshots
                .iter()
                .map(|s| CpuSnapshotPayload::from_snapshot(s))
                .collect(),
        ),
        None => (vec![], vec![]),
    };

    Ok(StepResult {
        cpu_state: CpuStatePayload::from_cpu(&state.cpu),
        micro_ops: payloads,
        snapshots: snapshot_payloads,
        memory: state.cpu.memory.clone(),
    })
}

#[tauri::command]
fn execute_run(state: tauri::State<Mutex<SimulatorState>>) -> Result<StepResult, String> {
    const MAX_STEPS: u64 = 100000;
    let mut state = lock!(state);
    let mut steps_executed: u64 = 0;

    while state.cpu.state == crate::cpu::CpuState::Running {
        if steps_executed >= MAX_STEPS {
            break;
        }
        if state.cpu.step().is_none() {
            break;
        }
        steps_executed += 1;
    }

    let result = StepResult {
        cpu_state: CpuStatePayload::from_cpu(&state.cpu),
        micro_ops: vec![],
        snapshots: vec![],
        memory: state.cpu.memory.clone(),
    };

    Ok(result)
}

#[tauri::command]
fn reset_all(state: tauri::State<Mutex<SimulatorState>>) -> Result<(), String> {
    let mut state = lock!(state);
    state.cpu = Cpu::new();
    state.program_loaded = false;
    state.program_size = 0;
    state.data_map = vec![];
    state.source_code = None;
    state.file_name = None;
    state.original_program = vec![];
    Ok(())
}

#[tauri::command]
fn reset_cpu(state: tauri::State<Mutex<SimulatorState>>) -> Result<StepResult, String> {
    let mut state = lock!(state);

    if !state.program_loaded {
        return Err("Nenhum programa carregado".to_string());
    }

    let program = state.original_program.clone();
    state.cpu.reset_all();
    state.cpu.load_program(&program);
    state.cpu.state = crate::cpu::CpuState::Running;

    Ok(StepResult {
        cpu_state: CpuStatePayload::from_cpu(&state.cpu),
        micro_ops: vec![],
        snapshots: vec![],
        memory: state.cpu.memory.clone(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(SimulatorState {
            cpu: Cpu::new(),
            program_loaded: false,
            program_size: 0,
            data_map: vec![],
            source_code: None,
            file_name: None,
            original_program: vec![],
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_assembly_file,
            load_binary_file,
            load_control_memory,
            is_program_loaded,
            get_memory_dump,
            get_disassembled_instructions,
            get_cpu_state,
            get_microinstructions,
            get_fetch_length,
            execute_step,
            execute_run,
            reset_cpu,
            reset_all
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
