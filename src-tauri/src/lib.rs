mod timer;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Manager,
};
use timer::TimerEngine;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let engine = TimerEngine::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(engine)
        .invoke_handler(tauri::generate_handler![
            timer::get_timer_state,
            timer::start_timer,
            timer::pause_timer,
            timer::toggle_timer,
            timer::reset_timer,
            timer::skip_session,
            timer::set_preset,
            timer::set_sessions_goal,
        ])
        .setup(|app| {
            // Start timer tick loop
            let engine = app.state::<TimerEngine>();
            engine.start_tick_loop(app.handle().clone());

            // Autostart plugin
            #[cfg(desktop)]
            {
                use tauri_plugin_autostart::MacosLauncher;
                app.handle().plugin(tauri_plugin_autostart::init(
                    MacosLauncher::LaunchAgent,
                    None,
                ))?;
            }

            // System tray
            let toggle_item =
                MenuItem::with_id(app, "toggle", "Start/Pause", true, None::<&str>)?;
            let reset_item = MenuItem::with_id(app, "reset", "Reset", true, None::<&str>)?;
            let skip_item = MenuItem::with_id(app, "skip", "Skip", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let show_item = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let menu = Menu::with_items(
                app,
                &[
                    &toggle_item,
                    &reset_item,
                    &skip_item,
                    &separator,
                    &show_item,
                    &quit_item,
                ],
            )?;

            let app_handle = app.handle().clone();
            TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("TimeTimer")
                .on_menu_event(move |_app, event| {
                    let engine = app_handle.state::<TimerEngine>();
                    match event.id().as_ref() {
                        "toggle" => {
                            let mut s = engine.state.lock().unwrap();
                            match s.status {
                                timer::Status::Running => {
                                    s.status = timer::Status::Paused;
                                }
                                timer::Status::Paused => {
                                    s.status = timer::Status::Running;
                                }
                                timer::Status::Stopped => {
                                    let p = engine.preset.lock().unwrap();
                                    s.phase = timer::Phase::Work;
                                    s.total_duration_sec = p.work_duration_sec;
                                    s.remaining_sec = p.work_duration_sec;
                                    s.current_session_index = s.completed_sessions + 1;
                                    s.status = timer::Status::Running;
                                }
                            }
                        }
                        "reset" => {
                            let mut s = engine.state.lock().unwrap();
                            let p = engine.preset.lock().unwrap();
                            s.phase = timer::Phase::Idle;
                            s.status = timer::Status::Stopped;
                            s.total_duration_sec = p.work_duration_sec;
                            s.remaining_sec = p.work_duration_sec;
                            s.completed_sessions = 0;
                            s.current_session_index = 1;
                            s.total_focus_time_sec = 0;
                        }
                        "skip" => {
                            let mut s = engine.state.lock().unwrap();
                            let p = engine.preset.lock().unwrap();
                            let next_phase = match s.phase {
                                timer::Phase::Work => {
                                    s.completed_sessions += 1;
                                    if s.completed_sessions % p.sessions_before_long_break == 0 {
                                        timer::Phase::LongBreak
                                    } else {
                                        timer::Phase::Break
                                    }
                                }
                                timer::Phase::Break | timer::Phase::LongBreak => timer::Phase::Work,
                                timer::Phase::Idle => timer::Phase::Work,
                            };
                            let next_duration = match next_phase {
                                timer::Phase::Work => {
                                    s.current_session_index = s.completed_sessions + 1;
                                    p.work_duration_sec
                                }
                                timer::Phase::Break => p.break_duration_sec,
                                timer::Phase::LongBreak => p.long_break_duration_sec,
                                timer::Phase::Idle => p.work_duration_sec,
                            };
                            s.phase = next_phase;
                            s.total_duration_sec = next_duration;
                            s.remaining_sec = next_duration;
                        }
                        "show" => {
                            if let Some(window) = _app.get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            _app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
