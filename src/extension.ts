import * as fs from "fs";
import * as os from "os";
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  const saveAllWithoutFormat = vscode.commands.registerCommand(
    "vscode-extended-actions.saveAllWithoutFormatting",
    async () => {
      const activeEditor = vscode.window.activeTextEditor;
      const dirtyDocs = vscode.workspace.textDocuments.filter(
        (doc) => doc.isDirty
      );

      for (const doc of dirtyDocs) {
        await vscode.window.showTextDocument(doc, { preserveFocus: false });
        await vscode.commands.executeCommand(
          "workbench.action.files.saveWithoutFormatting"
        );
      }

      if (activeEditor) {
        await vscode.window.showTextDocument(activeEditor.document);
      }
    }
  );

  const createAndOpenFolder = vscode.commands.registerCommand(
    "vscode-extended-actions.createAndOpenFolder",
    async () => {
      const config = vscode.workspace.getConfiguration("git");
      let defaultCloneDirectory =
        config.get<string>("defaultCloneDirectory") || os.homedir();
      defaultCloneDirectory = defaultCloneDirectory.replace(/^~/, os.homedir());

      const folderPath = await vscode.window.showInputBox({
        prompt: "Enter the path for the new folder",
        value: defaultCloneDirectory,
        valueSelection: [
          defaultCloneDirectory.length,
          defaultCloneDirectory.length,
        ],
        validateInput: (value) => {
          if (!value) {
            return "Path cannot be empty";
          }
          const expandedPath = value.replace(/^~/, os.homedir());
          if (fs.existsSync(expandedPath)) {
            return "Folder already exists";
          }
          return null;
        },
      });

      if (!folderPath) {
        return;
      }

      const expandedFolderPath = folderPath.replace(/^~/, os.homedir());

      try {
        fs.mkdirSync(expandedFolderPath, { recursive: true });
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to create folder: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return;
      }

      const OPEN = "Open";
      const OPEN_NEW_WINDOW = "Open in New Window";
      const ADD_TO_WORKSPACE = "Add to Workspace";

      let message = "Would you like to open the created folder?";
      const choices = [OPEN, OPEN_NEW_WINDOW];

      if (vscode.workspace.workspaceFolders) {
        message =
          "Would you like to open the created folder, or add it to the current workspace?";
        choices.push(ADD_TO_WORKSPACE);
      }

      const result = await vscode.window.showInformationMessage(
        message,
        { modal: true },
        ...choices
      );

      if (!result) {
        return;
      }

      const uri = vscode.Uri.file(expandedFolderPath);

      switch (result) {
        case OPEN:
          vscode.commands.executeCommand("vscode.openFolder", uri, {
            forceReuseWindow: true,
          });
          break;
        case OPEN_NEW_WINDOW:
          vscode.commands.executeCommand("vscode.openFolder", uri, {
            forceNewWindow: true,
          });
          break;
        case ADD_TO_WORKSPACE:
          vscode.workspace.updateWorkspaceFolders(
            vscode.workspace.workspaceFolders!.length,
            0,
            { uri }
          );
          break;
      }
    }
  );

  const closeGitDiffAndOpenOriginal = vscode.commands.registerCommand(
    "vscode-extended-actions.closeGitDiffAndOpenOriginal",
    async () => {
      const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
      if (!activeTab) {
        return;
      }

      // Check if the active tab is a diff view
      const input = activeTab.input;
      if (!(input instanceof vscode.TabInputTextDiff)) {
        return;
      }

      // Get the original (left side) file URI
      const originalUri = input.original;

      // Close the diff view tab
      await vscode.window.tabGroups.close(activeTab);

      // Open the original file
      await vscode.window.showTextDocument(originalUri, {
        preserveFocus: false,
      });
    }
  );

  context.subscriptions.push(
    saveAllWithoutFormat,
    createAndOpenFolder,
    closeGitDiffAndOpenOriginal
  );
}

export function deactivate() {}
