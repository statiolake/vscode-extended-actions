import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import * as os from "node:os";
import {
  buildDevcontainerUri,
  collectFromEntry,
  expandDateFormat,
  expandHome,
  hasRootDevcontainer,
  isGitRepo,
  isGitWorktree,
  listNamedDevcontainers,
  matchesFilter,
} from "../extension";

// Workspace-local temp root so we don't depend on OS tmpdir semantics
// (test-tmp is gitignored).
const tempRoot = path.resolve(__dirname, "..", "..", ".test-tmp");

async function makeTempDir(prefix: string): Promise<string> {
  await fs.promises.mkdir(tempRoot, { recursive: true });
  return fs.promises.mkdtemp(path.join(tempRoot, `${prefix}-`));
}

async function rmrf(dir: string): Promise<void> {
  await fs.promises.rm(dir, { recursive: true, force: true });
}

async function touch(file: string, content = ""): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, content);
}

async function mkdirp(dir: string): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true });
}

const sink = (out: Set<string>) => (dir: string) => {
  out.add(dir);
};

suite("expandDateFormat", () => {
  const fixed = new Date(2026, 3, 24, 9, 7, 5); // 2026-04-24 09:07:05

  test("substitutes YYYY/MM/DD tokens", () => {
    assert.strictEqual(
      expandDateFormat("YYYY/MM/DD", fixed),
      "2026/04/24"
    );
  });

  test("passes [literal] through verbatim", () => {
    assert.strictEqual(
      expandDateFormat("[workspace]/[daily]", fixed),
      "workspace/daily"
    );
  });

  test("matches the longer MMDD token before MM/DD", () => {
    assert.strictEqual(expandDateFormat("MMDD", fixed), "0424");
  });

  test("combines literals and date tokens", () => {
    assert.strictEqual(
      expandDateFormat("~/[workspace]/[daily]/YYYY/MMDD", fixed),
      "~/workspace/daily/2026/0424"
    );
  });

  test("expands HH/mm/ss", () => {
    assert.strictEqual(
      expandDateFormat("[junk_]HHmmss", fixed),
      "junk_090705"
    );
  });

  test("emits an unterminated [ verbatim", () => {
    assert.strictEqual(
      expandDateFormat("foo/[unterminated", fixed),
      "foo/[unterminated"
    );
  });

  test("leaves non-token characters untouched", () => {
    assert.strictEqual(expandDateFormat("abc/def", fixed), "abc/def");
  });
});

suite("buildDevcontainerUri", () => {
  test("hex-encodes the host path when no configFile is given", () => {
    const uri = buildDevcontainerUri("/home/user/project");
    const expectedHex = Buffer.from("/home/user/project", "utf8").toString(
      "hex"
    );
    assert.strictEqual(uri.scheme, "vscode-remote");
    assert.strictEqual(uri.authority, `dev-container+${expectedHex}`);
    assert.strictEqual(uri.path, "/workspaces/project");
  });

  test("hex-encodes a JSON payload when configFile is given", () => {
    const hostPath = "/home/user/project";
    const configFile = "/home/user/project/.devcontainer/api/devcontainer.json";
    const uri = buildDevcontainerUri(hostPath, configFile);

    const authority = uri.authority;
    const prefix = "dev-container+";
    assert.ok(authority.startsWith(prefix), "authority has dev-container+ prefix");
    const hex = authority.slice(prefix.length);
    const decoded = Buffer.from(hex, "hex").toString("utf8");
    const parsed = JSON.parse(decoded);
    assert.deepStrictEqual(parsed, {
      hostPath,
      configFile: { $mid: 1, path: configFile, scheme: "file" },
    });
    assert.strictEqual(uri.path, "/workspaces/project");
  });
});

suite("isGitRepo / isGitWorktree", () => {
  let root: string;

  setup(async () => {
    root = await makeTempDir("gitkind");
  });

  teardown(async () => {
    await rmrf(root);
  });

  test("isGitRepo is true for a .git directory", async () => {
    const repo = path.join(root, "repo");
    await mkdirp(path.join(repo, ".git"));
    assert.strictEqual(await isGitRepo(repo), true);
    assert.strictEqual(await isGitWorktree(repo), false);
  });

  test("isGitWorktree is true for a .git file", async () => {
    const wt = path.join(root, "wt");
    await mkdirp(wt);
    await touch(path.join(wt, ".git"), "gitdir: /elsewhere\n");
    assert.strictEqual(await isGitWorktree(wt), true);
    assert.strictEqual(await isGitRepo(wt), false);
  });

  test("both are false when .git is missing", async () => {
    const plain = path.join(root, "plain");
    await mkdirp(plain);
    assert.strictEqual(await isGitRepo(plain), false);
    assert.strictEqual(await isGitWorktree(plain), false);
  });

  test("matchesFilter matches gitRepo only when requested", async () => {
    const repo = path.join(root, "r");
    await mkdirp(path.join(repo, ".git"));
    assert.strictEqual(await matchesFilter(repo, ["gitRepo"]), true);
    assert.strictEqual(await matchesFilter(repo, ["gitWorktree"]), false);
    assert.strictEqual(
      await matchesFilter(repo, ["gitWorktree", "gitRepo"]),
      true
    );
  });
});

suite("hasRootDevcontainer", () => {
  let dir: string;

  setup(async () => {
    dir = await makeTempDir("devroot");
  });

  teardown(async () => {
    await rmrf(dir);
  });

  test("returns true for .devcontainer/devcontainer.json", async () => {
    await touch(path.join(dir, ".devcontainer", "devcontainer.json"), "{}");
    assert.strictEqual(await hasRootDevcontainer(dir), true);
  });

  test("returns true for a top-level .devcontainer.json", async () => {
    await touch(path.join(dir, ".devcontainer.json"), "{}");
    assert.strictEqual(await hasRootDevcontainer(dir), true);
  });

  test("returns false when neither exists", async () => {
    assert.strictEqual(await hasRootDevcontainer(dir), false);
  });
});

suite("listNamedDevcontainers", () => {
  let dir: string;

  setup(async () => {
    dir = await makeTempDir("devnamed");
  });

  teardown(async () => {
    await rmrf(dir);
  });

  test("lists subdirectories that contain a devcontainer.json", async () => {
    await touch(
      path.join(dir, ".devcontainer", "api", "devcontainer.json"),
      "{}"
    );
    await touch(
      path.join(dir, ".devcontainer", "worker", "devcontainer.json"),
      "{}"
    );
    await mkdirp(path.join(dir, ".devcontainer", "empty"));

    const names = await listNamedDevcontainers(dir);
    assert.deepStrictEqual(names, ["api", "worker"]);
  });

  test("returns an empty list when .devcontainer is missing", async () => {
    const names = await listNamedDevcontainers(dir);
    assert.deepStrictEqual(names, []);
  });
});

suite("expandHome", () => {
  test("returns the home directory for a bare ~", () => {
    assert.strictEqual(expandHome("~"), os.homedir());
  });

  test("expands ~/ prefix", () => {
    assert.strictEqual(expandHome("~/foo/bar"), path.join(os.homedir(), "foo/bar"));
  });

  test("leaves an absolute path untouched", () => {
    assert.strictEqual(expandHome("/etc/hosts"), "/etc/hosts");
  });

  test("does not expand ~user (only ~ alone or ~/)", () => {
    assert.strictEqual(expandHome("~other"), "~other");
  });
});

suite("collectFromEntry", () => {
  let root: string;

  setup(async () => {
    root = await makeTempDir("entry");
  });

  teardown(async () => {
    await rmrf(root);
  });

  test("non-recursive adds the root itself", async () => {
    const out = new Set<string>();
    await collectFromEntry({ path: root }, sink(out));
    assert.deepStrictEqual([...out], [root]);
  });

  test("non-recursive skips non-existent directories silently", async () => {
    const out = new Set<string>();
    await collectFromEntry({ path: path.join(root, "missing") }, sink(out));
    assert.strictEqual(out.size, 0);
  });

  test("non-recursive applies filter to the root", async () => {
    const repo = path.join(root, "repo");
    const plain = path.join(root, "plain");
    await mkdirp(path.join(repo, ".git"));
    await mkdirp(plain);

    const matched = new Set<string>();
    await collectFromEntry({ path: repo, filter: ["gitRepo"] }, sink(matched));
    assert.deepStrictEqual([...matched], [repo]);

    const unmatched = new Set<string>();
    await collectFromEntry(
      { path: plain, filter: ["gitRepo"] },
      sink(unmatched)
    );
    assert.strictEqual(unmatched.size, 0);
  });

  test("recursive with empty filter yields only the root (root is the topmost match)", async () => {
    await mkdirp(path.join(root, "a"));
    await mkdirp(path.join(root, "b", "deep"));
    await touch(path.join(root, "c.txt"));

    const out = new Set<string>();
    await collectFromEntry(
      { path: root, recursive: true, maxDepth: 4 },
      sink(out)
    );
    assert.deepStrictEqual([...out], [root]);
  });

  test("recursive with filter walks for topmost matches", async () => {
    await mkdirp(path.join(root, "repo1", ".git"));
    await mkdirp(path.join(root, "nested", "repo2", ".git"));
    await mkdirp(path.join(root, "no-git"));

    const out = new Set<string>();
    await collectFromEntry(
      { path: root, recursive: true, maxDepth: 4, filter: ["gitRepo"] },
      sink(out)
    );
    assert.deepStrictEqual(
      [...out].sort(),
      [path.join(root, "nested", "repo2"), path.join(root, "repo1")]
    );
  });

  test("nested matches collapse to the outermost (topmost-only)", async () => {
    await mkdirp(path.join(root, "outer", ".git"));
    await mkdirp(path.join(root, "outer", "inner", ".git"));

    const out = new Set<string>();
    await collectFromEntry(
      { path: root, recursive: true, maxDepth: 4, filter: ["gitRepo"] },
      sink(out)
    );
    assert.deepStrictEqual([...out], [path.join(root, "outer")]);
  });

  test("filter that matches the root yields only the root", async () => {
    await mkdirp(path.join(root, ".git"));
    await mkdirp(path.join(root, "subrepo", ".git"));

    const out = new Set<string>();
    await collectFromEntry(
      { path: root, recursive: true, maxDepth: 4, filter: ["gitRepo"] },
      sink(out)
    );
    assert.deepStrictEqual([...out], [root]);
  });

  test("recursive with combined filter matches both repos and worktrees", async () => {
    const repo = path.join(root, "repo");
    const wt = path.join(root, "wt");
    await mkdirp(path.join(repo, ".git"));
    await mkdirp(wt);
    await touch(path.join(wt, ".git"), "gitdir: /elsewhere\n");

    const out = new Set<string>();
    await collectFromEntry(
      {
        path: root,
        recursive: true,
        maxDepth: 2,
        filter: ["gitRepo", "gitWorktree"],
      },
      sink(out)
    );
    assert.deepStrictEqual([...out].sort(), [repo, wt]);
  });

  test("maxDepth bounds how deep the walk can reach", async () => {
    await mkdirp(path.join(root, "a", "b", "c", ".git"));

    const shallow = new Set<string>();
    await collectFromEntry(
      { path: root, recursive: true, maxDepth: 2, filter: ["gitRepo"] },
      sink(shallow)
    );
    assert.strictEqual(shallow.size, 0, "depth 2 cannot reach the depth-3 repo");

    const deep = new Set<string>();
    await collectFromEntry(
      { path: root, recursive: true, maxDepth: 3, filter: ["gitRepo"] },
      sink(deep)
    );
    assert.deepStrictEqual([...deep], [path.join(root, "a", "b", "c")]);
  });

  test("formatDate expands moment-style tokens before resolving", async () => {
    const yyyy = new Date().getFullYear().toString();
    const concreteDir = path.join(root, "literal-segment", yyyy);
    await mkdirp(concreteDir);

    const out = new Set<string>();
    await collectFromEntry(
      {
        path: path.join(root, "[literal-segment]", "YYYY"),
        formatDate: true,
      },
      sink(out)
    );
    assert.deepStrictEqual([...out], [concreteDir]);
  });

  test("ignores entries with empty or missing path", async () => {
    const out = new Set<string>();
    await collectFromEntry({ path: "" }, sink(out));
    await collectFromEntry({} as never, sink(out));
    assert.strictEqual(out.size, 0);
  });

  test("aborts walk when AbortSignal fires", async () => {
    await mkdirp(path.join(root, "a", "b", "c", ".git"));
    const ac = new AbortController();
    ac.abort();

    const out = new Set<string>();
    await collectFromEntry(
      { path: root, recursive: true, maxDepth: 4, filter: ["gitRepo"] },
      sink(out),
      ac.signal
    );
    assert.strictEqual(out.size, 0);
  });
});

suite("openProject command", () => {
  test("is registered", async () => {
    // The extension is lazily activated by command invocation, so force
    // activation before checking the command registry.
    const ext = vscode.extensions.getExtension(
      "statiolake.vscode-extended-actions"
    );
    assert.ok(ext, "extension should be discoverable");
    await ext.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("vscode-extended-actions.openProject"),
      "openProject command should be registered"
    );
  });
});
