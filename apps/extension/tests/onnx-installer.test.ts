import { EventEmitter } from "node:events";
import fs from "node:fs";
import https from "node:https";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { crc32, deflateRawSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const transformersRequire = createRequire(
  require.resolve("@huggingface/transformers")
);
const { installPackages } = transformersRequire(
  path.join(
    path.dirname(transformersRequire.resolve("onnxruntime-node/package.json")),
    "script/install-utils.js"
  )
);

// Build tiny archives directly so the fixture needs no ZIP dependency.
function zipFixture(
  entries: Record<string, string>,
  compressed = false
): Buffer {
  const localFiles: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const [filename, contents] of Object.entries(entries)) {
    const name = Buffer.from(filename);
    const data = Buffer.from(contents);
    const payload = compressed ? deflateRawSync(data) : data;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(compressed ? 8 : 0, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localFiles.push(local, name, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(compressed ? 8 : 0, 10);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, name);
    offset += local.length + name.length + payload.length;
  }
  const directoryBytes = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(directoryBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localFiles, directoryBytes, end]);
}

describe("ONNX native package installer", () => {
  let sandbox: string;
  let downloads: string;
  let destination: string;
  let archive: Buffer;
  const selectedEntry = "runtimes/linux-x64/native/libonnxruntime.so";
  const originalContents = "outside file must survive";

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "onnx-installer-test-"));
    downloads = path.join(sandbox, "downloads");
    fs.mkdirSync(downloads);
    destination = path.join(sandbox, "installed", "libonnxruntime.so");
    archive = zipFixture({
      [selectedEntry]: "selected native library",
      "unselected.txt": "must not be extracted",
    });
    vi.spyOn(os, "tmpdir").mockReturnValue(downloads);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(https, "get").mockImplementation(((url, callback) => {
      const address = String(url);
      let body: Buffer;
      if (address === "https://fixtures.invalid/index.json") {
        body = Buffer.from(
          JSON.stringify({
            resources: [
              {
                "@type": "PackageBaseAddress/3.0.0",
                "@id": "https://fixtures.invalid/packages/",
              },
            ],
          })
        );
      } else if (address.endsWith("/native/index.json")) {
        body = Buffer.from(JSON.stringify({ versions: ["1.0.0"] }));
      } else if (address.endsWith("/native.1.0.0.nupkg")) {
        body = archive;
      } else {
        throw new Error(`Unexpected download: ${address}`);
      }
      const response = Object.assign(Readable.from([body]), {
        statusCode: 200,
        headers: { "content-type": "application/json" },
      });
      queueMicrotask(() => callback(response));
      return new EventEmitter();
    }) as typeof https.get);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  function install(entry = selectedEntry) {
    const packageInfo = {
      name: "Native",
      versions: [{ feed: "fixture", version: "1.0.0" }],
    };
    return installPackages(
      [packageInfo],
      [
        {
          packagesInfo: packageInfo,
          filepath: destination,
          pathInPackage: entry,
        },
      ],
      {
        fixture: {
          type: "nuget",
          index: "https://fixtures.invalid/index.json",
        },
      }
    );
  }

  it("installs the selected manifest entry and removes temporary files", async () => {
    await install();
    expect(fs.readFileSync(destination, "utf8")).toBe(
      "selected native library"
    );
    expect(fs.readdirSync(path.dirname(destination))).toEqual([
      "libonnxruntime.so",
    ]);
    expect(fs.readdirSync(downloads)).toEqual([]);
  });

  it("rejects a missing manifest entry and removes temporary files", async () => {
    await expect(install("missing/library.so")).rejects.toThrow(
      /find|missing/i
    );
    expect(fs.existsSync(destination)).toBe(false);
    expect(fs.readdirSync(downloads)).toEqual([]);
  });

  it("replaces an ordinary existing destination during reinstall", async () => {
    fs.mkdirSync(path.dirname(destination));
    fs.writeFileSync(destination, "previous native library");

    await install();

    expect(fs.readFileSync(destination, "utf8")).toBe(
      "selected native library"
    );
    expect(fs.readdirSync(path.dirname(destination))).toEqual([
      "libonnxruntime.so",
    ]);
    expect(fs.readdirSync(downloads)).toEqual([]);
  });

  it("rejects an invalid ZIP and removes temporary files", async () => {
    archive = Buffer.from("This is not a ZIP archive.");
    await expect(install()).rejects.toThrow();
    expect(fs.existsSync(destination)).toBe(false);
    expect(fs.readdirSync(downloads)).toEqual([]);
  });

  it("rejects a corrupt entry without replacing an existing library", async () => {
    archive = zipFixture({ [selectedEntry]: "selected native library" });
    const payloadOffset = 30 + Buffer.byteLength(selectedEntry);
    archive[payloadOffset] ^= 0xff;
    fs.mkdirSync(path.dirname(destination));
    fs.writeFileSync(destination, "previous native library");

    const outcome = await install().then(
      () => "installed",
      () => "rejected"
    );

    expect(outcome).toBe("rejected");
    expect(fs.readFileSync(destination, "utf8")).toBe(
      "previous native library"
    );
    expect(fs.readdirSync(path.dirname(destination))).toEqual([
      "libonnxruntime.so",
    ]);
    expect(fs.readdirSync(downloads)).toEqual([]);
  });

  it("installs a deflated entry", async () => {
    archive = zipFixture({ [selectedEntry]: "selected native library" }, true);

    await install();

    expect(fs.readFileSync(destination, "utf8")).toBe(
      "selected native library"
    );
    expect(fs.readdirSync(downloads)).toEqual([]);
  });

  it("cleans up after an invalid deflate stream without replacing the library", async () => {
    archive = zipFixture({ [selectedEntry]: "selected native library" }, true);
    const payloadOffset = 30 + Buffer.byteLength(selectedEntry);
    // BTYPE=3 is reserved and must cause the inflate stream to fail.
    archive[payloadOffset] = 0x07;
    fs.mkdirSync(path.dirname(destination));
    fs.writeFileSync(destination, "previous native library");

    await expect(install()).rejects.toThrow();

    expect(fs.readFileSync(destination, "utf8")).toBe(
      "previous native library"
    );
    expect(fs.readdirSync(path.dirname(destination))).toEqual([
      "libonnxruntime.so",
    ]);
    expect(fs.readdirSync(downloads)).toEqual([]);
  });

  it("refuses an existing destination symlink without changing its target", async () => {
    const outside = path.join(sandbox, "outside.so");
    fs.writeFileSync(outside, originalContents);
    fs.mkdirSync(path.dirname(destination));
    fs.symlinkSync(outside, destination);

    const outcome = await install().then(
      () => "installed",
      () => "rejected"
    );

    expect(fs.readFileSync(outside, "utf8")).toBe(originalContents);
    expect(outcome).toBe("rejected");
    expect(fs.lstatSync(destination).isSymbolicLink()).toBe(true);
    expect(fs.readdirSync(downloads)).toEqual([]);
  });

  it("does not follow a symlink planted in the old predictable extraction directory", async () => {
    const timestamp = 1234567890;
    vi.spyOn(Date, "now").mockReturnValue(timestamp);
    const plantedDirectory = path.join(
      downloads,
      `onnxruntime-node-pkgs_${timestamp}`
    );
    const extracted = path.join(plantedDirectory, "extracted");
    const outside = path.join(sandbox, "outside.so");
    fs.mkdirSync(extracted, { recursive: true });
    fs.writeFileSync(outside, originalContents);
    fs.symlinkSync(outside, path.join(extracted, "libonnxruntime.so"));

    await install();

    expect(fs.readFileSync(outside, "utf8")).toBe(originalContents);
    expect(fs.readFileSync(destination, "utf8")).toBe(
      "selected native library"
    );
    expect(fs.readdirSync(downloads)).toEqual([
      path.basename(plantedDirectory),
    ]);
  });
});
