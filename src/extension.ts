import * as fs from "fs";
import * as os from "os";
import * as path from "path";
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

  const openProject = vscode.commands.registerCommand(
    "vscode-extended-actions.openProject",
    async () => {
      const pick = await pickProject();
      if (!pick) {
        return;
      }
      switch (pick.action) {
        case "new":
          await vscode.commands.executeCommand(
            "vscode-extended-actions.createAndOpenFolder"
          );
          return;
        case "folder":
          await vscode.commands.executeCommand(
            "vscode.openFolder",
            vscode.Uri.file(pick.dirPath),
            { forceReuseWindow: true }
          );
          return;
        case "devcontainer":
          await vscode.commands.executeCommand(
            "vscode.openFolder",
            buildDevcontainerUri(pick.dirPath, pick.configFile),
            { forceReuseWindow: true }
          );
          return;
        case "none":
          return;
      }
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
    createAndOpenFolder,
    closeDiffAndOpenFile,
    joinTwoGroupsInBackground,
    openProject,
    delay
  );
}

export function deactivate() {}

type ProjectPickItem = vscode.QuickPickItem &
  (
    | { action: "new" }
    | { action: "folder"; dirPath: string }
    | { action: "devcontainer"; dirPath: string; configFile?: string }
    | { action: "none" }
  );

export type ProjectDirFilter = "gitRepo" | "gitWorktree";

export interface ProjectDirEntry {
  path: string;
  recursive?: boolean;
  maxDepth?: number;
  filter?: ProjectDirFilter[];
  formatDate?: boolean;
}

export type DirSink = (dir: string) => void | Promise<void>;

export async function collectProjectDirsStreaming(
  onDir: DirSink,
  signal?: AbortSignal
): Promise<void> {
  const config = vscode.workspace.getConfiguration("vscode-extended-actions");
  const entries =
    config.get<ProjectDirEntry[]>("openProject.directories") ?? [];
  await Promise.all(
    entries.map((entry) => collectFromEntry(entry, onDir, signal))
  );
}

export async function collectFromEntry(
  entry: ProjectDirEntry,
  onDir: DirSink,
  signal?: AbortSignal
): Promise<void> {
  if (!entry || typeof entry.path !== "string" || entry.path === "") {
    return;
  }
  const formatted = entry.formatDate
    ? expandDateFormat(entry.path)
    : entry.path;
  // formatDate could leave unmatched [...] only if the user didn't escape; in
  // either case we shouldn't try to use a path that still has unresolved markers.
  if (entry.formatDate && /[[\]]/.test(formatted)) {
    return;
  }
  const root = expandHome(formatted);
  const filter = entry.filter ?? [];
  const maxDepth = entry.recursive ? entry.maxDepth ?? 1 : 0;

  await walkAndCollect(root, 0, maxDepth, filter, onDir, signal);
}

export function expandHome(p: string): string {
  if (p === "~") {
    return os.homedir();
  }
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

// Collects topmost directories (within the target set defined by depth) that
// satisfy the filter. Conceptually orthogonal: the target set is determined by
// recursive/maxDepth, the match condition by filter; the result is the topmost
// matches in their intersection. Returning early at a match is an optimization
// — descendants of a match cannot themselves be topmost.
export async function walkAndCollect(
  dir: string,
  depth: number,
  maxDepth: number,
  filter: ProjectDirFilter[],
  onDir: DirSink,
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) {
    return;
  }
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(dir);
  } catch {
    return;
  }
  if (!stat.isDirectory()) {
    return;
  }
  if (filter.length === 0 || (await matchesFilter(dir, filter))) {
    await onDir(dir);
    return;
  }
  if (depth >= maxDepth) {
    return;
  }
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(
    entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) =>
        walkAndCollect(
          path.join(dir, e.name),
          depth + 1,
          maxDepth,
          filter,
          onDir,
          signal
        )
      )
  );
}

export async function matchesFilter(
  dir: string,
  filter: ProjectDirFilter[]
): Promise<boolean> {
  for (const kind of filter) {
    if (kind === "gitRepo" && (await isGitRepo(dir))) {
      return true;
    }
    if (kind === "gitWorktree" && (await isGitWorktree(dir))) {
      return true;
    }
  }
  return false;
}

export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const stat = await fs.promises.stat(path.join(dir, ".git"));
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function isGitWorktree(dir: string): Promise<boolean> {
  try {
    const stat = await fs.promises.stat(path.join(dir, ".git"));
    return stat.isFile();
  } catch {
    return false;
  }
}

// Apply moment/dayjs-style formatting: [literal] is passed through verbatim,
// date tokens (YYYY, MM, DD, HH, mm, ss, ...) are substituted with now.
export function expandDateFormat(
  fmt: string,
  now: Date = new Date()
): string {
  const pad = (n: number, width: number): string =>
    n.toString().padStart(width, "0");
  const tokens: [string, string][] = [
    ["YYYY", pad(now.getFullYear(), 4)],
    ["YY", pad(now.getFullYear() % 100, 2)],
    ["MMDD", pad(now.getMonth() + 1, 2) + pad(now.getDate(), 2)],
    ["MM", pad(now.getMonth() + 1, 2)],
    ["DD", pad(now.getDate(), 2)],
    ["HH", pad(now.getHours(), 2)],
    ["mm", pad(now.getMinutes(), 2)],
    ["ss", pad(now.getSeconds(), 2)],
  ];

  let out = "";
  let i = 0;
  while (i < fmt.length) {
    if (fmt[i] === "[") {
      const end = fmt.indexOf("]", i + 1);
      if (end === -1) {
        out += fmt.slice(i);
        break;
      }
      out += fmt.slice(i + 1, end);
      i = end + 1;
      continue;
    }
    let matched: [string, string] | undefined;
    for (const entry of tokens) {
      if (fmt.startsWith(entry[0], i)) {
        matched = entry;
        break;
      }
    }
    if (matched) {
      out += matched[1];
      i += matched[0].length;
    } else {
      out += fmt[i];
      i += 1;
    }
  }
  return out;
}

function makeNewProjectItem(): ProjectPickItem {
  return {
    action: "new",
    label: "$(add) New project...",
    description: "Create a new folder and open it",
  };
}

function makeProjectsSeparator(): ProjectPickItem {
  return {
    action: "none",
    label: "Projects",
    kind: vscode.QuickPickItemKind.Separator,
  };
}

// Streams items into a QuickPick as project candidates are discovered, so the
// picker is interactive immediately and remains so while large directory trees
// are walked.
async function pickProject(): Promise<ProjectPickItem | undefined> {
  const home = os.homedir();
  const qp = vscode.window.createQuickPick<ProjectPickItem>();
  qp.placeholder = "Select a project to open in the current window";
  qp.matchOnDescription = true;
  qp.busy = true;

  const newItem = makeNewProjectItem();
  const separator = makeProjectsSeparator();
  const projectItems: ProjectPickItem[] = [];
  const seen = new Set<string>();
  let renderScheduled = false;

  const render = () => {
    renderScheduled = false;
    const sorted = [...projectItems].sort((a, b) =>
      a.label.localeCompare(b.label)
    );
    qp.items = [newItem, separator, ...sorted];
  };
  // Coalesce rapid pushes into one render per microtask burst — avoids
  // re-assigning items on every fs.stat completion.
  const scheduleRender = () => {
    if (renderScheduled) {
      return;
    }
    renderScheduled = true;
    queueMicrotask(render);
  };

  render();

  const pickPromise = new Promise<ProjectPickItem | undefined>((resolve) => {
    let resolved = false;
    const finish = (value: ProjectPickItem | undefined) => {
      if (resolved) {
        return;
      }
      resolved = true;
      resolve(value);
    };
    qp.onDidAccept(() => {
      finish(qp.activeItems[0]);
      qp.hide();
    });
    qp.onDidHide(() => finish(undefined));
  });

  qp.show();

  const cancel = new AbortController();
  qp.onDidHide(() => cancel.abort());

  const collecting = (async () => {
    try {
      await collectProjectDirsStreaming(async (dir) => {
        if (cancel.signal.aborted || seen.has(dir)) {
          return;
        }
        seen.add(dir);
        const items = await buildItemsForDir(dir, home);
        if (cancel.signal.aborted) {
          return;
        }
        projectItems.push(...items);
        scheduleRender();
      }, cancel.signal);
    } finally {
      if (!cancel.signal.aborted) {
        qp.busy = false;
      }
    }
  })();

  const pick = await pickPromise;
  cancel.abort();
  await collecting.catch(() => undefined);
  qp.dispose();
  return pick;
}

async function buildItemsForDir(
  dir: string,
  home: string
): Promise<ProjectPickItem[]> {
  const display = compactHome(dir, home);
  const base = path.basename(dir);
  const out: ProjectPickItem[] = [
    { action: "folder", label: base, description: display, dirPath: dir },
  ];
  if (await hasRootDevcontainer(dir)) {
    out.push({
      action: "devcontainer",
      label: `${base} [Dev Container]`,
      description: display,
      dirPath: dir,
    });
  }
  for (const name of await listNamedDevcontainers(dir)) {
    out.push({
      action: "devcontainer",
      label: `${base} [Dev Container:${name}]`,
      description: display,
      dirPath: dir,
      configFile: path.join(dir, ".devcontainer", name, "devcontainer.json"),
    });
  }
  return out;
}

function compactHome(p: string, home: string): string {
  if (p === home) {
    return "~";
  }
  if (p.startsWith(home + path.sep)) {
    return "~" + p.slice(home.length);
  }
  return p;
}

export async function hasRootDevcontainer(dir: string): Promise<boolean> {
  const candidates = [
    path.join(dir, ".devcontainer", "devcontainer.json"),
    path.join(dir, ".devcontainer.json"),
  ];
  for (const candidate of candidates) {
    try {
      await fs.promises.access(candidate, fs.constants.F_OK);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

export async function listNamedDevcontainers(dir: string): Promise<string[]> {
  const devDir = path.join(dir, ".devcontainer");
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(devDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const configPath = path.join(devDir, entry.name, "devcontainer.json");
    try {
      await fs.promises.access(configPath, fs.constants.F_OK);
      names.push(entry.name);
    } catch {
      continue;
    }
  }
  names.sort();
  return names;
}

export function buildDevcontainerUri(
  hostPath: string,
  configFile?: string
): vscode.Uri {
  const base = path.basename(hostPath);
  let hex: string;
  if (configFile) {
    const payload = JSON.stringify({
      hostPath,
      configFile: { $mid: 1, path: configFile, scheme: "file" },
    });
    hex = Buffer.from(payload, "utf8").toString("hex");
  } else {
    hex = Buffer.from(hostPath, "utf8").toString("hex");
  }
  return vscode.Uri.parse(
    `vscode-remote://dev-container+${hex}/workspaces/${base}`
  );
}
