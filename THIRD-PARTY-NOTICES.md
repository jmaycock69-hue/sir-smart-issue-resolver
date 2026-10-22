# Third-party runtime notices

SIR's own source is staged under the MIT licence in LICENSE. The following licences apply to their respective bundled components.

| Component | Version | Location | Upstream | Licence |
| --- | --- | --- | --- | --- |
| Mozilla PDF.js / pdfjs-dist | 5.6.205 | vendor/pdfjs | https://github.com/mozilla/pdf.js | Apache-2.0; full LICENSE retained |
| @napi-rs/canvas | 0.1.100 | vendor/node_modules/@napi-rs/canvas | https://github.com/Brooooooklyn/canvas | MIT; full LICENSE retained |
| @napi-rs/canvas-win32-x64-msvc | 0.1.100 | vendor/node_modules/@napi-rs/canvas-win32-x64-msvc | Same canvas upstream | MIT per package metadata; canvas licence copied beside it |

Runtime files were copied unchanged from the installed packages. PDF.js module files, package metadata and licence are retained. Canvas JavaScript, metadata, native binary and data files are retained. No vendor source was modified. The native component targets Windows x64. Rendering assets/source maps not needed by the text-extraction rehearsal are omitted.

This inventory records package-level licences, not a complete audit of every native library embedded in Skia. A full native notice review remains necessary before broader commercial distribution. The release owner should review this inventory before publication.
