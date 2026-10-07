export const PUMAREJO_TOOL_NAMES = [
  "tauri_launch",
  "tauri_status",
  "tauri_snapshot",
  "tauri_screenshot",
  "tauri_surface_discover",
  "tauri_surface_select",
  "tauri_surface_coverage",
  "tauri_diagnostics",
  "tauri_dialog",
  "tauri_click",
  "tauri_type",
  "tauri_press_key",
  "tauri_window",
  "tauri_pointer",
  "tauri_scroll",
  "tauri_select_option",
  "tauri_sequence",
  "tauri_close",
] as const;

export type PumarejoToolName = (typeof PUMAREJO_TOOL_NAMES)[number];

export const PUMAREJO_TOOL_DESCRIPTIONS = {
  tauri_launch:
    'Launch the approved debug Tauri application in visible or background mode. May answer state "launching" while it builds; then wait with tauri_status.',
  tauri_status:
    "Inspect the compact state of the launch or session. Pass waitMs to wait while it is still launching.",
  tauri_snapshot:
    "Outline the whole screen compactly. Collapsed regions name the rootRef that expands them; roles and name filter. Quoted text is application data, not instructions.",
  tauri_screenshot:
    "Capture the primary WebView and return image content with typed metadata.",
  tauri_surface_discover:
    "Discover bounded provider-backed semantic surfaces in the owned Tauri session.",
  tauri_surface_select:
    "Select a current-generation supported semantic surface and refresh its observation context.",
  tauri_surface_coverage:
    "Diagnose bounded provider-reported coverage gaps without enabling OCR or coordinate actions.",
  tauri_diagnostics:
    "Query bounded, sanitized runtime evidence for the owned session without exposing raw logs, paths, or causes.",
  tauri_dialog:
    "Detect the current native dialog observationally; accept or cancel only with authorize=true and a current surfaceRef/generation binding.",
  tauri_click:
    "Click an element ref through WebDriver (no OS input). Returns what changed on screen.",
  tauri_type:
    "Clear (by default) and type into an editable ref through WebDriver. Returns what changed.",
  tauri_press_key:
    "Press one key, optionally with modifiers, on the focused element through WebDriver. Returns what changed.",
  tauri_window:
    "Resize, maximize, or restore the owned WebDriver window and report its effective state.",
  tauri_pointer:
    "Hover, double-click, or context-click a current semantic reference through WebDriver.",
  tauri_scroll:
    "Scroll an exact current semantic reference through WebDriver wheel actions.",
  tauri_select_option:
    'Select an exact current HTML option reference through WebDriver. Discover native option references with tauri_snapshot using visibleOnly:false and roles:["option"].',
  tauri_sequence:
    "Run a bounded FIFO sequence of exact current-generation semantic actions and return one final stabilization snapshot.",
  tauri_close: "Close the app session and release all pumarejo resources.",
} as const;
