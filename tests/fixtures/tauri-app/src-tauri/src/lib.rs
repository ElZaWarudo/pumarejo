#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub fn run() {
    #[cfg(all(debug_assertions, feature = "pumarejo"))]
    let builder = tauri::Builder::default().plugin(tauri_plugin_wdio_webdriver::init());

    #[cfg(not(all(debug_assertions, feature = "pumarejo")))]
    let builder = tauri::Builder::default();

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
