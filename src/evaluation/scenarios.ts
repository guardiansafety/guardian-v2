import type { Evidence } from "../domain/evidence";
import type { ReplayScenario } from "./scenario";

const incidentId = "eval-incident";
const createdAt = new Date("2026-10-04T18:00:00.000Z");
const now = new Date("2026-10-04T18:00:03.000Z");

export const REPLAY_SCENARIOS: readonly ReplayScenario[] = [
  {
    id: "weak_audio_only",
    description: "One weak audio signal should start monitoring without escalating.",
    incidentId,
    createdAt,
    now,
    analyzers: [
      success("audio-v1", "audio", [
        evidence({
          id: "audio-weak",
          source: "audio",
          signal: "aggression",
          score: 0.4,
        }),
      ]),
    ],
    expected: {
      state: "MONITORING",
      degraded: false,
      evidenceCount: 1,
      riskBand: "WATCH",
    },
  },
  {
    id: "audio_and_vision_agree",
    description: "Fresh independent audio and vision signals should corroborate.",
    incidentId,
    createdAt,
    now,
    analyzers: [
      success("audio-v1", "audio", [
        evidence({
          id: "audio-strong",
          source: "audio",
          signal: "aggression",
          score: 0.78,
        }),
      ]),
      success("vision-v1", "vision", [
        evidence({
          id: "vision-strong",
          source: "vision",
          signal: "possible_physical_altercation",
          score: 0.73,
          receivedAt: new Date("2026-10-04T18:00:01.400Z"),
        }),
      ]),
    ],
    expected: {
      state: "HIGH_RISK",
      degraded: false,
      evidenceCount: 2,
      riskBand: "HIGH",
    },
  },
  {
    id: "repeated_audio_frames",
    description: "Repeated frames from one source should not masquerade as corroboration.",
    incidentId,
    createdAt,
    now,
    analyzers: [
      success("audio-v1", "audio", [
        evidence({
          id: "audio-1",
          source: "audio",
          signal: "aggression",
          score: 0.95,
        }),
        evidence({
          id: "audio-2",
          source: "audio",
          signal: "aggression",
          score: 0.92,
          receivedAt: new Date("2026-10-04T18:00:01.100Z"),
        }),
        evidence({
          id: "audio-3",
          source: "audio",
          signal: "aggression",
          score: 0.89,
          receivedAt: new Date("2026-10-04T18:00:01.200Z"),
        }),
      ]),
    ],
    expected: {
      state: "MONITORING",
      degraded: false,
      evidenceCount: 3,
      riskBand: "WATCH",
    },
  },
  {
    id: "vision_failure_with_audio",
    description: "A provider failure should degrade the run without erasing successful evidence.",
    incidentId,
    createdAt,
    now,
    analyzers: [
      success("audio-v1", "audio", [
        evidence({
          id: "audio-only",
          source: "audio",
          signal: "aggression",
          score: 0.55,
        }),
      ]),
      {
        name: "vision-v1",
        source: "vision",
        outcome: {
          type: "error",
          message: "vision provider unavailable",
        },
      },
    ],
    expected: {
      state: "MONITORING",
      degraded: true,
      evidenceCount: 1,
      riskBand: "WATCH",
    },
  },
  {
    id: "total_analyzer_failure",
    description: "A total analyzer outage should preserve state rather than invent negative evidence.",
    incidentId,
    createdAt,
    now,
    analyzers: [
      {
        name: "audio-v1",
        source: "audio",
        outcome: { type: "error", message: "audio unavailable" },
      },
      {
        name: "vision-v1",
        source: "vision",
        outcome: { type: "error", message: "vision unavailable" },
      },
    ],
    expected: {
      state: "CREATED",
      degraded: true,
      evidenceCount: 0,
      riskBand: null,
    },
  },
  {
    id: "stale_multimodal_evidence",
    description: "Old high-score signals should decay and should not earn fresh corroboration.",
    incidentId,
    createdAt,
    now: new Date("2026-10-04T18:02:00.000Z"),
    analyzers: [
      success("audio-v1", "audio", [
        evidence({
          id: "audio-stale",
          source: "audio",
          signal: "aggression",
          score: 1.0,
          observedAt: new Date("2026-10-04T18:00:00.000Z"),
          receivedAt: new Date("2026-10-04T18:00:00.100Z"),
        }),
      ]),
      success("vision-v1", "vision", [
        evidence({
          id: "vision-stale",
          source: "vision",
          signal: "possible_physical_altercation",
          score: 1.0,
          observedAt: new Date("2026-10-04T18:00:00.000Z"),
          receivedAt: new Date("2026-10-04T18:00:00.200Z"),
        }),
      ]),
    ],
    expected: {
      state: "MONITORING",
      degraded: false,
      evidenceCount: 2,
      riskBand: "WATCH",
    },
  },
];

function success(
  name: string,
  source: Evidence["source"],
  items: readonly Evidence[],
) {
  return {
    name,
    source,
    outcome: {
      type: "evidence" as const,
      items,
    },
  };
}

function evidence(input: {
  id: string;
  source: Evidence["source"];
  signal: string;
  score: number;
  observedAt?: Date;
  receivedAt?: Date;
}): Evidence {
  const observedAt =
    input.observedAt ?? new Date("2026-10-04T18:00:01.000Z");

  return {
    id: input.id,
    incidentId,
    source: input.source,
    signal: input.signal,
    score: input.score,
    observedAt,
    receivedAt: input.receivedAt ?? observedAt,
    provenance: {
      kind:
        input.source === "vision"
          ? "llm"
          : input.source === "device"
            ? "device"
            : "classifier",
      provider: "guardian-eval",
      model: input.source === "vision" ? "vision-eval" : "audio-eval",
      modelVersion: "fixture-v1",
      ...(input.source === "vision" ? { promptVersion: "vision-v1" } : {}),
    },
  };
}
