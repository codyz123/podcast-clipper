use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// Types for the API
#[derive(Debug, Serialize, Deserialize)]
pub struct AudioFile {
    pub path: String,
    pub duration: f64,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportOptions {
    pub clip_id: String,
    pub format: String,
    pub template_id: String,
    pub output_dir: String,
    pub quality: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportResult {
    pub success: bool,
    pub output_path: Option<String>,
    pub error: Option<String>,
}

// Command to open file dialog and get audio file
#[tauri::command]
async fn select_audio_file() -> Result<Option<AudioFile>, String> {
    // In a real implementation, this would use tauri-plugin-dialog
    // For now, return None as the frontend handles file selection via drag-drop
    Ok(None)
}

// Command to get audio file info
#[tauri::command]
async fn get_audio_info(path: String) -> Result<AudioFile, String> {
    // Basic implementation - would need actual audio parsing
    let file_path = PathBuf::from(&path);
    let name = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string();

    Ok(AudioFile {
        path,
        duration: 0.0, // Would be calculated from actual audio
        name,
    })
}

// Command to export a video clip (placeholder for Remotion integration)
#[tauri::command]
async fn export_clip(options: ExportOptions) -> Result<ExportResult, String> {
    // This would integrate with Remotion CLI for actual video rendering
    // For now, return a success placeholder
    Ok(ExportResult {
        success: true,
        output_path: Some(format!(
            "{}/clip_{}_{}.mp4",
            options.output_dir, options.clip_id, options.format
        )),
        error: None,
    })
}

// Command to open a URL in the default browser
#[tauri::command]
async fn open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

// Command to get the app data directory
#[tauri::command]
fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            select_audio_file,
            get_audio_info,
            export_clip,
            open_url,
            get_app_data_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
