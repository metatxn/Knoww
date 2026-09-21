"""Build a versioned Knoww plugin ZIP from an explicit list of public files."""

import hashlib
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[2]
PLUGIN = ROOT / "plugins" / "knoww"
FILES = (
    ".codex-plugin/plugin.json",
    ".mcp.json",
    "hooks/hooks.json",
    "scripts/user-prompt-submit.mjs",
    "README.md",
)


def main():
    manifest = json.loads((PLUGIN / ".codex-plugin/plugin.json").read_text())
    version = manifest["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?", version):
        raise ValueError("Plugin version must be a release or prerelease version")
    # Validate every file before reading it. Never follow links outside the package.
    for name in FILES:
        path = PLUGIN / name
        if not path.is_file() or path.resolve() != path.absolute():
            raise ValueError(f"Missing or linked package file: {name}")
    if (PLUGIN / "plugin.json").exists() or (PLUGIN / "mcp.json").exists():
        raise ValueError("Portable root manifests hide bundled hooks in Codex CLI 0.155.1")
    output = ROOT / "dist" / "knoww-plugin"
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f"knoww-{version}.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
        for name in FILES:
            entry = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            bundle.writestr(entry, (PLUGIN / name).read_bytes())
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix(".zip.sha256").write_text(f"{digest}  {archive.name}\n")
    print(f"Built {archive}")


if __name__ == "__main__":
    main()
