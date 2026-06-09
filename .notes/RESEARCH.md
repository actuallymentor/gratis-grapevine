# Research

- 2026-06-09: Browser-local transcription model pass. `onnx-community/whisper-small` is directly Transformers.js-compatible and improves quality over `onnx-community/whisper-base` while remaining multilingual. Use `q8` dtype by default to keep the mobile/browser download and memory profile lower than fp32/fp16. `distil-whisper/distil-small.en` is lighter/faster for English-only voice notes, but do not switch to it without confirming English-only transcription is acceptable for the community.
