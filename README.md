# Guardian v2

Guardian v2 is an independent continuation of the original Guardian safety prototype.

The original project explored whether a wearable could capture useful audio, visual, and location context during a potential emergency. This repository revisits the idea with a different question:

> What does the software between **AI perception** and **real-world action** need to look like if we want to trust it?

The v2 design treats model output as evidence, not as an instruction. Audio, vision, and device analyzers feed a typed evidence contract; deterministic product logic owns risk, state transitions, degraded-mode behavior, and what a human sees.

## Current architecture

```text
analyzers
   ↓
validated Evidence
   ↓
risk fusion
   ↓
incident lifecycle
   ↓
React incident console
```

The implementation currently includes:

- typed evidence with model / prompt provenance
- an explicit incident state machine
- freshness-aware, multimodal risk fusion with hysteresis
- deduplication and idempotent evidence ingestion
- failure-tolerant inference orchestration with timeouts and runtime validation
- a deterministic end-to-end incident pipeline
- a TypeScript/Express read API
- a React incident console that exposes evidence, failures, provenance, and decision trace
- a replay evaluation harness for high-signal incident scenarios

The original hackathon backend is intentionally still present at the repository root so the evolution from prototype to v2 remains inspectable.

## Run the current v2 slice

Install dependencies:

```bash
npm install
```

Run the API:

```bash
npm run dev:api
```

Run the React console in a second terminal:

```bash
npm run dev:web
```

Then open the Vite development URL. The console loads the deterministic demo incident from:

```text
GET /api/incidents/demo
```

Run the automated checks:

```bash
npm run typecheck
npm test
npm run eval
npm run build:web
```

## Evaluation philosophy

The replay harness exists so a model, prompt, or policy change can be challenged against the same incident scenarios instead of being accepted because a demo looked better.

The current scenarios cover weak single-modality evidence, fresh multimodal corroboration, repeated correlated frames, partial provider failure, total analyzer failure, and stale multimodal evidence.

The project is still incremental. Persistence, reliable notification delivery, real provider adapters, and broader measured evaluation come next.
