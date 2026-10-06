# Guardian v2

Guardian v2 is an independent continuation of the original Guardian safety prototype.

The original hackathon project proved that a wearable could collect audio, visual, and location context around a possible emergency. V2 asks a different question:

> What should exist between **probabilistic AI perception** and **real-world product action** if the workflow has to be understandable, replayable, and retry-safe?

The core design rule is simple: **model output is evidence, not an instruction**.

## Current architecture

```text
Gemini / audio / device analyzers
            ↓
     validated Evidence
       + provenance
            ↓
        risk fusion
   freshness + source rules
            ↓
     incident lifecycle
            ↓
 durable alert commitment
            ↓
 SQLite notification outbox
            ↓
 retry-safe provider worker

            +
 React incident console
            +
 deterministic replay evals
```

The implementation currently includes:

- TypeScript evidence contracts with runtime Zod validation
- provider/model/prompt provenance
- a current Google GenAI vision adapter using structured output
- freshness-aware multimodal risk fusion
- strongest-per-source aggregation so repeated frames are not independent votes
- cross-source corroboration and hysteresis
- an explicit incident state machine
- duplicate-event and conflicting-ID handling
- failure-tolerant analyzer orchestration
- canonical evidence ordering so async completion timing does not change product state
- a TypeScript/Express API
- a React incident console that exposes evidence, provenance, failures, and decision trace
- a SQLite-backed notification outbox with leases, retry policy, and stable provider idempotency keys
- a deterministic replay harness that runs in CI

The original hackathon backend remains at the repository root intentionally so the v1 → v2 evolution is inspectable rather than rewritten out of history.

## Run the demo

Install dependencies:

```bash
npm install
```

Start the API in one terminal:

```bash
npm run dev:api
```

The API defaults to:

```text
http://localhost:3101
```

Useful endpoints:

```text
GET /
GET /healthz
GET /api/incidents/demo
```

Start the React console in a second terminal:

```bash
npm run dev:web
```

Then open:

```text
http://localhost:5173
```

The browser demo uses deterministic analyzer fixtures so the interview walkthrough is stable and does not depend on a paid external model call. The real Gemini adapter is implemented and contract-tested separately.

## Verify the whole project

Run one command:

```bash
npm run check
```

That runs:

```text
TypeScript typecheck
→ unit/integration tests
→ replay evaluation suite
→ production React build
```

You can also run the replay harness directly:

```bash
npm run eval
```

## Evaluation philosophy

The replay harness is intentionally closer to backtesting than demo testing: a model, prompt, threshold, or policy change should face the same incident scenarios before it is accepted.

Current scenarios cover:

- weak single-modality evidence
- fresh audio + vision corroboration
- repeated correlated frames
- partial analyzer failure
- total analyzer failure
- stale multimodal evidence

The harness already caught one policy bug: stale high-score observations could still earn a corroboration bonus. Corroboration now requires signal strength that remains strong **after freshness decay**, and the scenario stays as a regression test.

A useful next extension would be metamorphic evaluation: reorder equivalent async events, duplicate frames, delay a modality, or perturb irrelevant image content and check that semantically equivalent incidents still produce the same product decision.

## Scope

This is not presented as a production emergency-response system. It is a focused engineering reconstruction of the critical path between AI perception and trustworthy action.

The same architecture shape appears in other AI-native workflows: models collect and interpret uncertain information, while deterministic software owns contracts, state, side effects, auditability, evaluation, and the human-facing workflow.
