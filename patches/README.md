`onnxruntime-node@1.24.3.patch` replaces the native runtime installer's
`adm-zip` dependency with `yauzl@3.4.0`. The extension uses ONNX in the browser,
and its embedding benchmark also needs the native Node backend.

The latest `adm-zip` release has no fix for
[GHSA-vwc7-r8mq-g2x9](https://github.com/advisories/GHSA-vwc7-r8mq-g2x9).
The workspace removes that dependency only from the patched ONNX version
and declares the replacement in `packageExtensions`. No advisory is ignored.

The installer streams manifest-selected ZIP entries, verifies their CRC,
and replaces destination files atomically from private staging directories.
It rejects existing destination symlinks and cleans up partial writes.
The native runtime API and browser bundles are unchanged.

Run `pnpm --filter @knoww/extension exec vitest run tests/onnx-installer.test.ts`
with Node 24 to check extraction, reinstall, symlink attacks, corrupt payloads,
and cleanup. These tests use local ZIP fixtures and mocked HTTPS.

When upgrading ONNX, review its installer before updating this patch.
Remove the patch, dependency removal override, and `yauzl` package extension
together once upstream supplies a safe installer. Recheck both
`pnpm audit --prod --audit-level=moderate` and
`pnpm audit --audit-level=moderate` afterward.
