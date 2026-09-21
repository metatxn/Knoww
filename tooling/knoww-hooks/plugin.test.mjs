import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../../plugins/knoww", import.meta.url));
const input = JSON.stringify({
  hook_event_name: "UserPromptSubmit",
  prompt: "Private test marker: plugin-input-123",
});

test("installed plugin runs outside Git from a path with spaces", () => {
  const temporary = mkdtempSync(join(tmpdir(), "knoww-plugin-"));
  try {
    const installed = join(temporary, "installed plugin $literal");
    cpSync(source, installed, { recursive: true });
    const config = JSON.parse(
      readFileSync(join(installed, "hooks/hooks.json"), "utf8")
    );
    const command = config.hooks.UserPromptSubmit[0].hooks[0].command;
    const result = spawnSync("/bin/sh", ["-c", command], {
      cwd: temporary,
      env: { PATH: process.env.PATH, PLUGIN_ROOT: installed },
      input,
      encoding: "utf8",
      timeout: 3000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(
      JSON.parse(result.stdout).hookSpecificOutput.hookEventName,
      "UserPromptSubmit"
    );
    assert.ok(!result.stdout.includes("plugin-input-123"));

    const legacy = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("./user-prompt-submit.mjs", import.meta.url))],
      { input, encoding: "utf8", timeout: 3000 }
    );
    assert.equal(legacy.status, 0, legacy.stderr);
    assert.equal(result.stdout, legacy.stdout);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("plugin bundles the public MCP endpoint without embedded authorization", () => {
  const manifest = JSON.parse(
    readFileSync(join(source, ".codex-plugin/plugin.json"), "utf8")
  );
  assert.equal(manifest.name, "knoww");
  assert.equal(manifest.mcpServers, "./.mcp.json");
  const mcp = JSON.parse(readFileSync(join(source, ".mcp.json"), "utf8"));
  assert.deepEqual(mcp, {
    mcpServers: {
      knoww: { type: "http", url: "https://mcp.knoww.app/mcp" },
    },
  });
  assert.equal(existsSync(join(source, "plugin.json")), false);
  assert.equal(existsSync(join(source, "mcp.json")), false);
});

test("release ZIP contains only public package files and runs after extraction", () => {
  const builder = fileURLToPath(
    new URL("./package_plugin.py", import.meta.url)
  );
  const result = spawnSync(
    "python3",
    [
      "-c",
      `
import hashlib, json, pathlib, subprocess, sys, tempfile, zipfile
builder, node = sys.argv[1:]
root = pathlib.Path(builder).resolve().parents[2]
version = json.loads((root / 'plugins/knoww/.codex-plugin/plugin.json').read_text())['version']
archive = root / 'dist/knoww-plugin' / ('knoww-' + version + '.zip')
subprocess.run([sys.executable, builder], check=True, capture_output=True)
first = archive.read_bytes()
subprocess.run([sys.executable, builder], check=True, capture_output=True)
assert first == archive.read_bytes(), 'Build must be reproducible'
assert archive.with_suffix('.zip.sha256').read_text().split()[0] == hashlib.sha256(first).hexdigest()
with tempfile.TemporaryDirectory(prefix='knoww release ') as directory:
    with zipfile.ZipFile(archive) as bundle:
        assert set(bundle.namelist()) == {'.codex-plugin/plugin.json', '.mcp.json', 'hooks/hooks.json', 'scripts/user-prompt-submit.mjs', 'README.md'}
        bundle.extractall(directory)
    script = pathlib.Path(directory) / 'scripts/user-prompt-submit.mjs'
    result = subprocess.run([node, str(script)], cwd=directory, input='{"hook_event_name":"UserPromptSubmit","prompt":"Test"}', text=True, capture_output=True, timeout=3, check=True)
    assert not result.stderr
    assert json.loads(result.stdout)['hookSpecificOutput']['hookEventName'] == 'UserPromptSubmit'
`,
      builder,
      process.execPath,
    ],
    { encoding: "utf8", timeout: 10000 }
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});
