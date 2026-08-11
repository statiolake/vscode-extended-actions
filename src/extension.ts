import * as vscode from "vscode";

/**
 * Gets a unique identifier string from a tab for comparison purposes.
 * Uses URI-based identification for file tabs, falls back to label for special tabs.
 */
function getTabId(tab: vscode.Tab): string {
  const input = tab.input;
  if (input instanceof vscode.TabInputText) {
    return `text:${input.uri.toString()}`;
  }
  if (input instanceof vscode.TabInputTextDiff) {
    return `diff:${input.original.toString()}:${input.modified.toString()}`;
  }
  if (input instanceof vscode.TabInputNotebook) {
    return `notebook:${input.uri.toString()}`;
  }
  if (input instanceof vscode.TabInputNotebookDiff) {
    return `notebookDiff:${input.original.toString()}:${input.modified.toString()}`;
  }
  if (input instanceof vscode.TabInputCustom) {
    return `custom:${input.uri.toString()}:${input.viewType}`;
  }
  // For Webview, Terminal, and unknown types, fall back to label
  return `label:${tab.label}`;
}

/**
 * Converts a git URI to a writable workspace file URI
 * Handles git:// URIs by extracting the actual file path from the query parameters
 */
function toWorkspaceFileUri(uri: vscode.Uri): vscode.Uri {
  // If it's already a file:// URI, just return it
  if (uri.scheme === "file") {
    return uri;
  }

  // If it's a git:// URI, extract the path from query parameters
  if (uri.scheme === "git") {
    const query = JSON.parse(uri.query);
    const pathStr = query.path;
    if (pathStr) {
      return vscode.Uri.file(pathStr);
    }
  }

  // Fallback: return as-is
  return uri;
}

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

  const closeDiffAndOpenFile = vscode.commands.registerCommand(
    "vscode-extended-actions.closeDiffAndOpenFile",
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

      const originalUri = input.original;
      const modifiedUri = input.modified;

      // Git diff if either side is a git:// URI — open the workspace file
      // side automatically. Otherwise, ask the user which side to open.
      const isGitDiff =
        originalUri.scheme === "git" || modifiedUri.scheme === "git";

      let targetUri: vscode.Uri;
      let sourceSideUri: vscode.Uri;
      if (isGitDiff) {
        sourceSideUri = modifiedUri;
        targetUri = toWorkspaceFileUri(modifiedUri);
      } else {
        const pick = await vscode.window.showQuickPick(
          [
            {
              label: vscode.workspace.asRelativePath(originalUri),
              description: "Left",
              uri: originalUri,
            },
            {
              label: vscode.workspace.asRelativePath(modifiedUri),
              description: "Right",
              uri: modifiedUri,
            },
          ],
          { placeHolder: "Which side to open?" }
        );
        if (!pick) {
          return;
        }
        sourceSideUri = pick.uri;
        targetUri = pick.uri;
      }

      // Preserve cursor and scroll only when the active editor corresponds
      // to the side we are opening — otherwise line numbers wouldn't match.
      const activeEditor = vscode.window.activeTextEditor;
      const shouldPreserve =
        activeEditor?.document.uri.toString() === sourceSideUri.toString();
      const selection = shouldPreserve ? activeEditor?.selection : undefined;
      const visibleRange = shouldPreserve
        ? activeEditor?.visibleRanges[0]
        : undefined;

      // Close the diff view tab
      await vscode.window.tabGroups.close(activeTab);

      // Open the target file
      const editor = await vscode.window.showTextDocument(targetUri, {
        preserveFocus: false,
        selection,
      });

      if (visibleRange) {
        editor.revealRange(
          visibleRange,
          vscode.TextEditorRevealType.AtTop
        );
      }
    }
  );

  const joinTwoGroupsInBackground = vscode.commands.registerCommand(
    "vscode-extended-actions.joinTwoGroupsInBackground",
    async () => {
      const tabGroups = vscode.window.tabGroups;

      // Check if there's only one group
      if (tabGroups.all.length <= 1) {
        vscode.window.showInformationMessage(
          "No other editor group to merge with"
        );
        return;
      }

      // Save entire groups (except the one to be merged from) before merge to
      // later determine original active tab
      const groupTabsBeforeMerge = tabGroups.all
        .filter((group) => !group.isActive)
        .map((group) =>
          group.tabs.map((tab) => ({
            tabId: getTabId(tab),
            isActive: tab.isActive,
          }))
        );

      // Use the built-in join two groups command
      await vscode.commands.executeCommand("workbench.action.joinTwoGroups");

      // Determine target tab group (the one that received the tabs)
      // We can find that because only that tab group will have a different
      // size or different active tab than before
      const targetGroupIndex = groupTabsBeforeMerge.findIndex((groupTabs) => {
        return tabGroups.all.every((group) => {
          return (
            groupTabs.length !== group.tabs.length ||
            groupTabs.some(
              ({ tabId, isActive }, index) =>
                tabId !== getTabId(group.tabs[index]) ||
                isActive !== group.tabs[index].isActive
            )
          );
        });
      });
      if (targetGroupIndex === -1) {
        // In some cases (the original group is completely a subset of the
        // target group) it makes no difference to the target group before and
        // after merge. In this case we doesn't need to do anything.
        console.log("unchanged before and after merge, nothing to restore");
        return;
      }

      const restoreTabId = groupTabsBeforeMerge[targetGroupIndex].find(
        ({ isActive }) => isActive
      )?.tabId;
      console.log("restoreTabId:", restoreTabId);

      // Restore focus to the original active tab in target group (in background)
      if (!restoreTabId) {
        console.log("no original target active tab, nothing to restore");
        return;
      }

      const activeGroupTabs = tabGroups.activeTabGroup.tabs;
      console.log(
        "activeGroupTabs:",
        activeGroupTabs.map((tab) => getTabId(tab))
      );
      const currentTabIndex = activeGroupTabs.findIndex((tab) => tab.isActive);
      const targetTabIndex = activeGroupTabs.findIndex(
        (tab) => getTabId(tab) === restoreTabId
      );

      const nextCount =
        (targetTabIndex + activeGroupTabs.length - currentTabIndex) %
        activeGroupTabs.length;
      const previousCount =
        (currentTabIndex + activeGroupTabs.length - targetTabIndex) %
        activeGroupTabs.length;
      const direction = nextCount < previousCount ? "next" : "previous";
      const count = Math.min(nextCount, previousCount);
      await Promise.all(
        [...Array(count)].map((_) =>
          vscode.commands.executeCommand(
            `workbench.action.${direction}EditorInGroup`
          )
        )
      );
    }
  );

  const delay = vscode.commands.registerCommand(
    "vscode-extended-actions.delay",
    async (ms: number) => {
      if (typeof ms !== "number" || ms < 0) {
        vscode.window.showErrorMessage(
          "delay command requires a non-negative number argument (milliseconds)"
        );
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  );

  context.subscriptions.push(
    saveAllWithoutFormat,
    closeDiffAndOpenFile,
    joinTwoGroupsInBackground,
    delay
  );
}

export function deactivate() {}
