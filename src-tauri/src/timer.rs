use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    Idle,
    Work,
    Break,
    LongBreak,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    Running,
    Paused,
    Stopped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub work_duration_sec: u32,
    pub break_duration_sec: u32,
    pub long_break_duration_sec: u32,
    pub sessions_before_long_break: u32,
}

impl Default for Preset {
    fn default() -> Self {
        Self {
            id: "pomodoro".to_string(),
            name: "Pomodoro".to_string(),
            work_duration_sec: 25 * 60,
            break_duration_sec: 5 * 60,
            long_break_duration_sec: 15 * 60,
            sessions_before_long_break: 4,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerState {
    pub phase: Phase,
    pub status: Status,
    pub total_duration_sec: u32,
    pub remaining_sec: u32,
    pub completed_sessions: u32,
    pub current_session_index: u32,
    pub total_focus_time_sec: u32,
    pub sessions_goal: u32,
}

impl Default for TimerState {
    fn default() -> Self {
        let preset = Preset::default();
        Self {
            phase: Phase::Idle,
            status: Status::Stopped,
            total_duration_sec: preset.work_duration_sec,
            remaining_sec: preset.work_duration_sec,
            completed_sessions: 0,
            current_session_index: 1,
            total_focus_time_sec: 0,
            sessions_goal: 8,
        }
    }
}

pub struct TimerEngine {
    pub state: Arc<Mutex<TimerState>>,
    pub preset: Arc<Mutex<Preset>>,
    last_tick: Arc<Mutex<Option<Instant>>>,
}

impl TimerEngine {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(TimerState::default())),
            preset: Arc::new(Mutex::new(Preset::default())),
            last_tick: Arc::new(Mutex::new(None)),
        }
    }

    pub fn start_tick_loop(&self, app: AppHandle) {
        let state = self.state.clone();
        let preset = self.preset.clone();
        let last_tick = self.last_tick.clone();

        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_millis(100));

            let mut s = state.lock().unwrap();
            if s.status != Status::Running {
                *last_tick.lock().unwrap() = None;
                continue;
            }

            let now = Instant::now();
            let mut lt = last_tick.lock().unwrap();
            if let Some(prev) = *lt {
                let elapsed = now.duration_since(prev);
                if elapsed >= Duration::from_secs(1) {
                    let secs_elapsed = elapsed.as_secs() as u32;
                    *lt = Some(now);

                    if s.remaining_sec <= secs_elapsed {
                        s.remaining_sec = 0;
                        // Session complete
                        if s.phase == Phase::Work {
                            s.completed_sessions += 1;
                            s.total_focus_time_sec += s.total_duration_sec;
                        }

                        let p = preset.lock().unwrap();
                        let next_phase = match s.phase {
                            Phase::Work => {
                                if s.completed_sessions > 0
                                    && s.completed_sessions % p.sessions_before_long_break == 0
                                {
                                    Phase::LongBreak
                                } else {
                                    Phase::Break
                                }
                            }
                            Phase::Break | Phase::LongBreak => Phase::Work,
                            Phase::Idle => Phase::Work,
                        };

                        let next_duration = match next_phase {
                            Phase::Work => {
                                s.current_session_index = s.completed_sessions + 1;
                                p.work_duration_sec
                            }
                            Phase::Break => p.break_duration_sec,
                            Phase::LongBreak => p.long_break_duration_sec,
                            Phase::Idle => p.work_duration_sec,
                        };
                        drop(p);

                        // Emit completion event before transitioning
                        let completed_phase = s.phase.clone();
                        let _ = app.emit("timer:completed", &completed_phase);

                        s.phase = next_phase;
                        s.total_duration_sec = next_duration;
                        s.remaining_sec = next_duration;
                        // Stop and wait for manual start
                        s.status = Status::Stopped;
                    } else {
                        s.remaining_sec -= secs_elapsed;
                    }

                    let _ = app.emit("timer:tick", &*s);
                }
            } else {
                *lt = Some(now);
            }
        });
    }
}

#[tauri::command]
pub fn get_timer_state(engine: tauri::State<'_, TimerEngine>) -> TimerState {
    engine.state.lock().unwrap().clone()
}

#[tauri::command]
pub fn start_timer(engine: tauri::State<'_, TimerEngine>) -> TimerState {
    let mut s = engine.state.lock().unwrap();
    if s.phase == Phase::Idle {
        let p = engine.preset.lock().unwrap();
        s.phase = Phase::Work;
        s.total_duration_sec = p.work_duration_sec;
        s.remaining_sec = p.work_duration_sec;
        s.current_session_index = s.completed_sessions + 1;
    }
    s.status = Status::Running;
    s.clone()
}

#[tauri::command]
pub fn pause_timer(engine: tauri::State<'_, TimerEngine>) -> TimerState {
    let mut s = engine.state.lock().unwrap();
    s.status = Status::Paused;
    s.clone()
}

#[tauri::command]
pub fn toggle_timer(engine: tauri::State<'_, TimerEngine>) -> TimerState {
    let mut s = engine.state.lock().unwrap();
    match s.status {
        Status::Running => {
            s.status = Status::Paused;
        }
        Status::Paused => {
            s.status = Status::Running;
        }
        Status::Stopped => {
            let p = engine.preset.lock().unwrap();
            s.phase = Phase::Work;
            s.total_duration_sec = p.work_duration_sec;
            s.remaining_sec = p.work_duration_sec;
            s.current_session_index = s.completed_sessions + 1;
            s.status = Status::Running;
        }
    }
    s.clone()
}

#[tauri::command]
pub fn reset_timer(engine: tauri::State<'_, TimerEngine>) -> TimerState {
    let mut s = engine.state.lock().unwrap();
    let p = engine.preset.lock().unwrap();
    s.phase = Phase::Idle;
    s.status = Status::Stopped;
    s.total_duration_sec = p.work_duration_sec;
    s.remaining_sec = p.work_duration_sec;
    s.completed_sessions = 0;
    s.current_session_index = 1;
    s.total_focus_time_sec = 0;
    s.clone()
}

#[tauri::command]
pub fn skip_session(engine: tauri::State<'_, TimerEngine>) -> TimerState {
    let mut s = engine.state.lock().unwrap();
    let p = engine.preset.lock().unwrap();

    let next_phase = match s.phase {
        Phase::Work => {
            s.completed_sessions += 1;
            if s.completed_sessions % p.sessions_before_long_break == 0 {
                Phase::LongBreak
            } else {
                Phase::Break
            }
        }
        Phase::Break | Phase::LongBreak => Phase::Work,
        Phase::Idle => Phase::Work,
    };

    let next_duration = match next_phase {
        Phase::Work => {
            s.current_session_index = s.completed_sessions + 1;
            p.work_duration_sec
        }
        Phase::Break => p.break_duration_sec,
        Phase::LongBreak => p.long_break_duration_sec,
        Phase::Idle => p.work_duration_sec,
    };

    s.phase = next_phase;
    s.total_duration_sec = next_duration;
    s.remaining_sec = next_duration;
    s.clone()
}

#[tauri::command]
pub fn set_preset(engine: tauri::State<'_, TimerEngine>, preset: Preset) -> TimerState {
    *engine.preset.lock().unwrap() = preset.clone();
    let mut s = engine.state.lock().unwrap();
    // Reset timer with new preset
    s.phase = Phase::Idle;
    s.status = Status::Stopped;
    s.total_duration_sec = preset.work_duration_sec;
    s.remaining_sec = preset.work_duration_sec;
    s.completed_sessions = 0;
    s.current_session_index = 1;
    s.total_focus_time_sec = 0;
    s.clone()
}

#[tauri::command]
pub fn set_sessions_goal(engine: tauri::State<'_, TimerEngine>, goal: u32) -> TimerState {
    let mut s = engine.state.lock().unwrap();
    s.sessions_goal = goal;
    s.clone()
}
