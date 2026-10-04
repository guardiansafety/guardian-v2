import { describe, expect, it } from "vitest";

import {
  GeminiVisionAnalyzer,
  createGeminiVisionTask,
} from "./gemini-vision-analyzer";

const frame = {
  incidentId: "incident-1",
  imageBase64:
    Buffer.from("fake-image").toString(
      "base64",
    ),
  mimeType: "image/jpeg",
  observedAt: new Date(
    "2026-10-04T18:00:01.000Z",
  ),
  receivedAt: new Date(
    "2026-10-04T18:00:01.200Z",
  ),
};

describe("GeminiVisionAnalyzer", () => {
  it("maps structured signal severity into normalized Evidence", async () => {
    const client = fakeClient({
      signal:
        "possible_physical_altercation",
      severity: "high",
    });

    const analyzer =
      new GeminiVisionAnalyzer(client, {
        model: "gemini-test",
        promptVersion:
          "guardian-vision-v7",
      });

    const evidence =
      await analyzer.analyze(frame);

    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      incidentId: "incident-1",
      source: "vision",
      signal:
        "possible_physical_altercation",
      score: 0.9,
      provenance: {
        kind: "llm",
        provider: "google",
        model: "gemini-test",
        promptVersion:
          "guardian-vision-v7",
      },
    });
  });

  it("does not turn no_concern into positive risk evidence", async () => {
    const analyzer =
      new GeminiVisionAnalyzer(
        fakeClient({
          signal: "no_concern",
          severity: "low",
        }),
      );

    await expect(
      analyzer.analyze(frame),
    ).resolves.toEqual([]);
  });

  it("uses a deterministic evidence id for retrying the same frame", async () => {
    const analyzer =
      new GeminiVisionAnalyzer(
        fakeClient({
          signal:
            "person_in_distress",
          severity: "medium",
        }),
      );

    const first =
      await analyzer.analyze(frame);
    const second =
      await analyzer.analyze(frame);

    expect(first[0]?.id).toBe(
      second[0]?.id,
    );
  });

  it("rejects malformed model output instead of leaking it into product logic", async () => {
    const analyzer =
      new GeminiVisionAnalyzer({
        interactions: {
          create: async () => ({
            output_text: JSON.stringify({
              signal: "invented_signal",
              severity: "extreme",
            }),
          }),
        },
      });

    await expect(
      analyzer.analyze(frame),
    ).rejects.toThrow();
  });

  it("uses structured output and explicitly treats image text as untrusted", async () => {
    const requests: unknown[] = [];

    const analyzer =
      new GeminiVisionAnalyzer({
        interactions: {
          create: async (request) => {
            requests.push(request);
            return {
              output_text:
                JSON.stringify({
                  signal:
                    "weapon_visible",
                  severity: "high",
                }),
            };
          },
        },
      });

    await analyzer.analyze(frame);

    const request = requests[0] as {
      input: readonly {
        type: string;
        text?: string;
      }[];
      response_format: {
        mime_type: string;
        schema: {
          required: readonly string[];
        };
      };
    };

    expect(
      request.response_format.mime_type,
    ).toBe("application/json");
    expect(
      request.response_format.schema
        .required,
    ).toEqual(["signal", "severity"]);
    expect(
      request.input[0]?.text,
    ).toContain(
      "untrusted scene content",
    );
    expect(
      request.input[0]?.text,
    ).toContain(
      "not a probability",
    );
  });

  it("wraps the analyzer in the common inference task contract", async () => {
    const analyzer =
      new GeminiVisionAnalyzer(
        fakeClient({
          signal:
            "weapon_visible",
          severity: "high",
        }),
      );

    const task =
      createGeminiVisionTask(
        analyzer,
        frame,
      );

    expect(task.name).toBe(
      "gemini-vision",
    );
    expect(task.source).toBe("vision");
    await expect(task.run()).resolves.toHaveLength(
      1,
    );
  });
});

function fakeClient(output: {
  signal:
    | "no_concern"
    | "possible_physical_altercation"
    | "person_in_distress"
    | "weapon_visible";
  severity:
    | "low"
    | "medium"
    | "high";
}) {
  return {
    interactions: {
      create: async () => ({
        output_text:
          JSON.stringify(output),
      }),
    },
  };
}
