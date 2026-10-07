"""Verify downloaded SDK archives and prepare an isolated, offline review runtime."""

import argparse
import base64
import hashlib
import json
import shutil
import tarfile
from pathlib import Path


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--sdk-root", type=Path, required=True)
args = parser.parse_args()
sdk_root = args.sdk_root.resolve()
repo_root = Path(__file__).resolve().parents[2]
installed_client = (repo_root / "packages/shared-types/node_modules/@polymarket/client").resolve()
installed_dependencies = installed_client.parent.parent
metadata = {}

for name in ("client", "bindings"):
    data = json.loads((sdk_root / f"{name}-metadata.json").read_text())
    if data["name"] != f"@polymarket/{name}" or data["version"] != "0.12.0":
        raise ValueError(f"Unexpected package identity for {name}")
    archive = sdk_root / f"{name}.tgz"
    actual = "sha512-" + base64.b64encode(hashlib.sha512(archive.read_bytes()).digest()).decode()
    if actual != data["dist"]["integrity"]:
        raise ValueError(f"Archive integrity mismatch for {name}")
    target = sdk_root / "node_modules/@polymarket" / name
    target.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive, "r:gz") as tar:
        for member in tar.getmembers():
            parts = Path(member.name).parts
            if not parts or parts[0] != "package" or ".." in parts:
                raise ValueError(f"Unexpected archive path: {member.name}")
            if not member.isfile():
                if member.isdir():
                    continue
                raise ValueError(f"Unsupported archive member: {member.name}")
            destination = target.joinpath(*parts[1:])
            destination.parent.mkdir(parents=True, exist_ok=True)
            with tar.extractfile(member) as source, destination.open("wb") as output:
                shutil.copyfileobj(source, output)
    metadata[name] = data

dependencies = set().union(*(data["dependencies"] for data in metadata.values()))
for dependency in sorted(dependencies - {"@polymarket/client", "@polymarket/bindings"}):
    source = installed_dependencies / dependency
    if not source.exists():
        raise FileNotFoundError(f"Install repository dependencies first: missing {dependency}")
    destination = sdk_root / "node_modules" / dependency
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.is_symlink():
        if destination.resolve() != source.resolve():
            raise ValueError(f"Unexpected existing dependency link: {destination}")
    elif destination.exists():
        raise ValueError(f"Unexpected existing dependency directory: {destination}")
    else:
        destination.symlink_to(source.resolve(), target_is_directory=True)

print("Verified @polymarket/client and bindings 0.12.0 against npm SHA512 metadata.")
print("Isolated SDK runtime prepared. Repository package manifests and lockfile unchanged.")
