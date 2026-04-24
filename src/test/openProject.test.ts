import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  buildDevcontainerUri,
  expandDateFormat,
  hasRootDevcontainer,
  listNamedDevcontainers,
  walkForGitRepos,
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

suite("walkForGitRepos", () => {
  let root: string;

  setup(async () => {
    root = await makeTempDir("walk");
  });

  teardown(async () => {
    await rmrf(root);
  });

  test("collects directories that contain a .git subdirectory", async () => {
    await mkdirp(path.join(root, "a", ".git"));
    await mkdirp(path.join(root, "b", "c", ".git"));
    await mkdirp(path.join(root, "d", "no-repo"));

    const out = new Set<string>();
    await walkForGitRepos(root, 4, out);

    const sorted = [...out].sort();
    assert.deepStrictEqual(sorted, [
      path.join(root, "a"),
      path.join(root, "b", "c"),
    ]);
  });

  test("stops descending once a .git is found", async () => {
    // outer repo with a nested repo inside — only the outer is collected
    await mkdirp(path.join(root, "outer", ".git"));
    await mkdirp(path.join(root, "outer", "inner", ".git"));

    const out = new Set<string>();
    await walkForGitRepos(root, 4, out);

    assert.deepStrictEqual([...out], [path.join(root, "outer")]);
  });

  test("respects the maxDepth limit", async () => {
    await mkdirp(path.join(root, "a", "b", "c", "d", ".git"));

    const shallow = new Set<string>();
    await walkForGitRepos(root, 2, shallow);
    assert.strictEqual(shallow.size, 0, "depth 2 should not reach the repo");

    const deep = new Set<string>();
    await walkForGitRepos(root, 4, deep);
    assert.deepStrictEqual(
      [...deep],
      [path.join(root, "a", "b", "c", "d")]
    );
  });

  test("silently ignores a missing root", async () => {
    const out = new Set<string>();
    await walkForGitRepos(path.join(root, "does-not-exist"), 4, out);
    assert.strictEqual(out.size, 0);
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
