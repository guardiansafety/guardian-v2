import { z } from "zod";

export const EvidenceSourceSchema = z.enum(["audio", "vision", "device"]);
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;

export const EvidenceProvenanceSchema = z.object({
  kind: z.enum(["classifier", "llm", "device"]),
  provider: z.string().min(1),
  model: z.string().min(1).optional(),
  modelVersion: z.string().min(1).optional(),
  promptVersion: z.string().min(1).optional(),
});

export type EvidenceProvenance = z.infer<typeof EvidenceProvenanceSchema>;

export const EvidenceSchema = z.object({
  id: z.string().min(1),
  incidentId: z.string().min(1),
  source: EvidenceSourceSchema,
  signal: z.string().min(1),

  // Adapter-normalized signal strength, not a claim of calibrated probability.
  // In particular, an LLM should not invent its own "confidence" and have that
  // value treated as ground truth by the product.
  score: z.number().min(0).max(1),

  observedAt: z.coerce.date(),
  receivedAt: z.coerce.date(),
  provenance: EvidenceProvenanceSchema,
});

export type Evidence = z.infer<typeof EvidenceSchema>;

export function parseEvidence(input: unknown): Evidence {
  return EvidenceSchema.parse(input);
}
