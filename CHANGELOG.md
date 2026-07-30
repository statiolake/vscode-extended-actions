# Change Log

All notable changes to the "vscode-extended-actions" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.1.0] - 2025-05-30

### Added

- Initial release
- `Save All Without Save Participants` command to save all modified files without running formatters or save participants
- Proper error handling and logging
- Preservation of active editor state during batch save operations

## [Unreleased]

### Changed

- Make `New project...` honor Enter / Cmd+Enter / Ctrl+Enter from the project
  picker and open the created folder directly without a second dialog.

## [0.6.5] - 2026-07-29

### Added

- Add an option to show Dev Container entries in the project picker.
- Open a selected project in a new window with Cmd+Enter on macOS or Ctrl+Enter on Windows and Linux.

## [0.6.4] - 2026-05-21

### Fixed

- Respect the active Docker context when opening projects in Dev Containers.
