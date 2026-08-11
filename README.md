# Extended Actions

Additional useful commands for VS Code.

## Features

### Save All Without Format

Saves all dirty files without running save participants (formatters, organizers, etc.).

- **Command**: `File: Save All Without Format`
- **Command ID**: `vscode-extended-actions.saveAllWithoutFormat`

This is useful when you want to save all files quickly without triggering automatic formatting.

Project opening is provided by the separate
[`Project Picker`](https://marketplace.visualstudio.com/items?itemName=statiolake.vscode-project-picker)
extension. It runs as a UI extension, so project discovery and new-folder
creation happen on the local machine even when this window is connected to a
Dev Container or another remote host.

## Usage

1. Open the Command Palette (`Cmd+Shift+P` on macOS, `Ctrl+Shift+P` on Windows/Linux)
2. Type "Save All Without Format"
3. Press Enter

You can also assign a keyboard shortcut to this command in your keybindings.json:

```json
{
  "key": "cmd+k s",
  "command": "vscode-extended-actions.saveAllWithoutFormat"
}
```
