import * as assert from "node:assert";
import * as vscode from "vscode";

async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}

async function openFileInGroup(
  content: string,
  viewColumn: vscode.ViewColumn
): Promise<vscode.TextEditor> {
  const doc = await vscode.workspace.openTextDocument({ content });
  return vscode.window.showTextDocument(doc, { viewColumn, preview: false });
}

suite("joinTwoGroupsInBackground", () => {
  setup(async () => {
    await closeAllEditors();
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test("should restore original active tab in target group after merge", async () => {
    // Setup: Create two editor groups with files
    // Group 1: fileA (active), fileB
    // Group 2: fileC (active)
    const editorA = await openFileInGroup(
      "content A",
      vscode.ViewColumn.One
    );
    await openFileInGroup("content B", vscode.ViewColumn.One);
    // Switch back to fileA to make it active in group 1
    await vscode.window.showTextDocument(editorA.document, {
      viewColumn: vscode.ViewColumn.One,
      preview: false,
    });

    await openFileInGroup("content C", vscode.ViewColumn.Two);

    // Make group 2 active
    await vscode.commands.executeCommand("workbench.action.focusSecondEditorGroup");

    // Execute the command
    await vscode.commands.executeCommand(
      "vscode-extended-actions.joinTwoGroupsInBackground"
    );

    // After merge, file A should be the active tab (was the active tab in group 1)
    const activeEditor = vscode.window.activeTextEditor;
    assert.ok(activeEditor, "Should have an active editor");
    assert.strictEqual(
      activeEditor.document.getText(),
      "content A",
      "Original active tab (fileA) should be restored as active"
    );
  });

  test("should correctly identify tabs with same filename but different paths", async () => {
    // This tests the URI-based identification fix
    // Create files with identical content to simulate same filename scenario
    const editorA1 = await openFileInGroup(
      "content from path A",
      vscode.ViewColumn.One
    );
    await openFileInGroup("content from path B", vscode.ViewColumn.One);
    // Make first file active
    await vscode.window.showTextDocument(editorA1.document, {
      viewColumn: vscode.ViewColumn.One,
      preview: false,
    });

    await openFileInGroup("content C", vscode.ViewColumn.Two);

    // Make group 2 active
    await vscode.commands.executeCommand("workbench.action.focusSecondEditorGroup");

    // Execute the command
    await vscode.commands.executeCommand(
      "vscode-extended-actions.joinTwoGroupsInBackground"
    );

    // Verify correct tab is active (the one with "content from path A")
    const activeEditor = vscode.window.activeTextEditor;
    assert.ok(activeEditor, "Should have an active editor");
    assert.strictEqual(
      activeEditor.document.getText(),
      "content from path A",
      "Should restore the correct tab using URI-based identification"
    );
  });

  test("should handle single editor group gracefully", async () => {
    // Setup: Only one group
    await openFileInGroup("content A", vscode.ViewColumn.One);

    // Execute the command - should show info message, not error
    await vscode.commands.executeCommand(
      "vscode-extended-actions.joinTwoGroupsInBackground"
    );

    // Should still have the editor open
    const activeEditor = vscode.window.activeTextEditor;
    assert.ok(activeEditor, "Should still have an active editor");
    assert.strictEqual(
      activeEditor.document.getText(),
      "content A",
      "Editor should remain unchanged"
    );
  });

  test("should work when merging from group 1 to group 2", async () => {
    // Setup: Group 1 is active, merge to group 2
    const editorA = await openFileInGroup(
      "content A",
      vscode.ViewColumn.One
    );
    await openFileInGroup("content B", vscode.ViewColumn.Two);
    const editorC = await openFileInGroup("content C", vscode.ViewColumn.Two);

    // Make fileB active in group 2
    await vscode.window.showTextDocument(editorC.document, {
      viewColumn: vscode.ViewColumn.Two,
      preview: false,
    });
    // Switch back to fileB
    await vscode.commands.executeCommand("workbench.action.focusSecondEditorGroup");
    await vscode.commands.executeCommand("workbench.action.previousEditorInGroup");

    // Focus group 1
    await vscode.window.showTextDocument(editorA.document, {
      viewColumn: vscode.ViewColumn.One,
      preview: false,
    });

    // Execute the command (from group 1)
    await vscode.commands.executeCommand(
      "vscode-extended-actions.joinTwoGroupsInBackground"
    );

    // After merge, fileB should be active (was active in target group 2)
    const activeEditor = vscode.window.activeTextEditor;
    assert.ok(activeEditor, "Should have an active editor");
    assert.strictEqual(
      activeEditor.document.getText(),
      "content B",
      "Original active tab in target group (fileB) should be restored"
    );
  });

  test("should restore Settings tab using label fallback", async () => {
    // Setup: Group 1 has Settings tab (active)
    // Group 2 has a file (active)
    // This tests the label-based fallback for special tabs like Settings

    // Open Settings in group 1
    await vscode.commands.executeCommand("workbench.action.openSettings");

    // Verify Settings is open
    const settingsTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    assert.ok(settingsTab, "Settings tab should be open");
    assert.strictEqual(
      settingsTab.label,
      "Settings",
      "Should have Settings tab"
    );

    // Open a file in group 2
    await openFileInGroup("content A", vscode.ViewColumn.Two);

    // Make group 2 active and execute the command
    await vscode.commands.executeCommand("workbench.action.focusSecondEditorGroup");

    await vscode.commands.executeCommand(
      "vscode-extended-actions.joinTwoGroupsInBackground"
    );

    // After merge, Settings should be restored as active tab
    const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    assert.ok(activeTab, "Should have an active tab");
    assert.strictEqual(
      activeTab.label,
      "Settings",
      "Settings tab should be restored as active using label fallback"
    );
  });

  test("should restore Settings tab when merging with multiple files", async () => {
    // More complex scenario: Settings + files in group 1, files in group 2

    // Open Settings in group 1
    await vscode.commands.executeCommand("workbench.action.openSettings");

    // Add a file to group 1
    await openFileInGroup("content B", vscode.ViewColumn.One);

    // Switch back to Settings
    await vscode.commands.executeCommand("workbench.action.previousEditorInGroup");

    // Verify Settings is active
    const settingsTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    assert.ok(settingsTab, "Settings tab should be active");
    assert.strictEqual(settingsTab.label, "Settings", "Should have Settings tab active");

    // Open files in group 2
    await openFileInGroup("content C", vscode.ViewColumn.Two);
    await openFileInGroup("content D", vscode.ViewColumn.Two);

    // Make group 2 active
    await vscode.commands.executeCommand("workbench.action.focusSecondEditorGroup");

    await vscode.commands.executeCommand(
      "vscode-extended-actions.joinTwoGroupsInBackground"
    );

    // Settings should be restored
    const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    assert.ok(activeTab, "Should have an active tab");
    assert.strictEqual(
      activeTab.label,
      "Settings",
      "Settings tab should be restored"
    );
  });
});
