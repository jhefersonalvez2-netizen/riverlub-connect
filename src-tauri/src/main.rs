#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|arg| arg == "--riverlub-supervisor") {
        riverlub_connect_lib::run_supervisor();
        return;
    }

    riverlub_connect_lib::run();
}
