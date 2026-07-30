# Extended Actions

Additional useful commands for VS Code.

## Features

### Save All Without Format

Saves all dirty files without running save participants (formatters, organizers, etc.).

- **Command**: `File: Save All Without Format`
- **Command ID**: `vscode-extended-actions.saveAllWithoutFormat`

This is useful when you want to save all files quickly without triggering automatic formatting.

### Create and Open Folder

Creates a new folder and opens it in VS Code.

- **Command**: `File: Create and Open New Folder`
- **Command ID**: `vscode-extended-actions.createAndOpenFolder`

This command allows you to quickly create a new folder and open it in the current VS Code window.

The `New project...` item in `File: Open Project...` follows the same shortcuts as
existing projects: press Enter to open the created project in the current window,
or Cmd+Enter on macOS / Ctrl+Enter on Windows and Linux to open it in a new window.

## Usage

1. Open the Command Palette (`Cmd+Shift+P` on macOS, `Ctrl+Shift+P` on Windows/Linux)
2. Type "Save All Without Format" or "Create and Open New Folder"
3. Press Enter

You can also assign a keyboard shortcut to this command in your keybindings.json:

```json
{
  "key": "cmd+k s",
  "command": "vscode-extended-actions.saveAllWithoutFormat"
}
```
