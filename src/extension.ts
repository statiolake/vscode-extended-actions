import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "vscode-extended-actions.saveAllWithoutFormatting",
    async () => {
      try {
        // Only process documents that have unsaved changes to avoid unnecessary operations
        const dirtyDocuments = vscode.workspace.textDocuments.filter(
          (doc) => doc.isDirty
        );

        console.log(`Found ${dirtyDocuments.length} dirty documents to save`);

        if (dirtyDocuments.length === 0) {
          console.log("No modified files to save");
          return;
        }

        // Preserve current editor state to restore user context after batch operation
        const originalActiveEditor = vscode.window.activeTextEditor;
        let savedCount = 0;
        let skippedCount = 0;

        for (const document of dirtyDocuments) {
          try {
            console.log(`Attempting to save: ${document.fileName}`);

            // Activate each document to ensure save command targets the correct file
            await vscode.window.showTextDocument(document, {
              preview: true,
              preserveFocus: true,
            });

            // Execute built-in command to bypass formatting and save participants
            await vscode.commands.executeCommand(
              "workbench.action.files.saveWithoutFormatting"
            );

            savedCount++;
            console.log(`Successfully saved: ${document.fileName}`);
          } catch (error) {
            skippedCount++;
            console.log(`Skipped ${document.fileName}: ${error}`);
          }
        }

        // Restore original editor to maintain user workflow continuity
        if (originalActiveEditor) {
          try {
            await vscode.window.showTextDocument(
              originalActiveEditor.document,
              {
                preview: false,
                preserveFocus: false,
              }
            );
          } catch (error) {
            console.log(`Failed to restore original active editor: ${error}`);
          }
        }

        console.log(
          `Save operation completed. Saved: ${savedCount}, Skipped: ${skippedCount}`
        );
      } catch (error) {
        console.error(`Error in saveAllWithoutFormatting: ${error}`);
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
