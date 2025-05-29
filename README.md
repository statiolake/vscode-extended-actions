# Extended Actions

Additional actions for VSCode including save all files without formatting or save participants.

## Features

This extension provides additional commands to enhance your VSCode workflow:

### Save All Without Formatting

- **Command**: `Save All Without Save Participants`
- **What it does**: Saves all modified files without running formatters or save participants
- **Use case**: When you want to quickly save all files without triggering automatic formatting or other save-time operations

This is particularly useful when:

- You have multiple files with unsaved changes
- You want to preserve the current formatting temporarily
- You need to save files quickly without waiting for formatters to run
- You're working with files where formatting might cause unwanted changes

## Usage

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type "Save All Without Save Participants"
3. Press Enter

The extension will:

- Find all files with unsaved changes
- Save each file without running formatters or save participants
- Preserve your current active editor
- Log the operation progress to the console

## Requirements

- VSCode 1.100.0 or higher

## Extension Settings

This extension does not contribute any settings.

## Known Issues

None at this time. Please report issues on the [GitHub repository](https://github.com/statiolake/vscode-extended-actions/issues).

## Release Notes

### 0.1.0

Initial release of Extended Actions.

- Added "Save All Without Save Participants" command

---

**Enjoy!**
