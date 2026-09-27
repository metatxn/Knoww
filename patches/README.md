`onnxruntime-node@1.30.0.patch` protects the native runtime installer's temporary
directories and final file writes. The extension uses ONNX in the browser,
and its embedding benchmark also needs the native Node backend.

[adm-zip 0.6.1](https://github.com/cthackers/adm-zip/releases/tag/v0.6.1) fixes
extraction through existing symlinks, the issue behind
[GHSA-vwc7-r8mq-g2x9](https://github.com/advisories/GHSA-vwc7-r8mq-g2x9).
The workspace pins that version for ONNX 1.30.0, within its declared `^0.6.0`
range. This replaces the previous custom ZIP reader and `yauzl` dependency.
No advisory is ignored.

The upstream installer still creates predictable temporary directories and uses
`copyFileSync` for final writes, which follows destination symlinks outside the
ZIP library's checks. The smaller patch creates private temporary directories,
rejects archive and destination symlinks, and replaces destination files
atomically from private staging directories on the destination filesystem.
It cleans up staging files on failure. `adm-zip` handles decoding and CRC checks.
The patch only changes the native installer; it adds no browser runtime code.

Run `pnpm --filter @knoww/extension exec vitest run tests/onnx-installer.test.ts`
with Node 24 to check extraction, reinstall, symlink attacks, corrupt payloads,
and cleanup. These tests use local ZIP fixtures and mocked HTTPS.

When upgrading ONNX, review its installer before updating this patch.
Remove the patch once upstream supplies these installer protections. Remove the
`adm-zip` override once ONNX requires a fixed version. Recheck both
`pnpm audit --prod --audit-level=moderate` and
`pnpm audit --audit-level=moderate` afterward.
