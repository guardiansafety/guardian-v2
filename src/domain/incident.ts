export const INCIDENT_STATES = [
  "CREATED",
  "MONITORING",
  "HIGH_RISK",
  "ALERTED",
  "ACKED",
  "RESOLVED",
] as const;

export type IncidentState = (typeof INCIDENT_STATES)[number];

export type IncidentActor =
  | { type: "system"; id: string }
  | { type: "human"; id: string };

export interface IncidentTransition {
  from: IncidentState;
  to: IncidentState;
  at: Date;
  actor: IncidentActor;
  reason: string;
}

export interface Incident {
  id: string;
  state: IncidentState;
  createdAt: Date;
  updatedAt: Date;
  transitions: readonly IncidentTransition[];
}

const VALID_TRANSITIONS: Record<IncidentState, readonly IncidentState[]> = {
  CREATED: ["MONITORING"],
  MONITORING: ["HIGH_RISK", "RESOLVED"],
  HIGH_RISK: ["MONITORING", "ALERTED"],
  ALERTED: ["ACKED"],
  ACKED: ["RESOLVED"],
  RESOLVED: [],
};

export class InvalidIncidentTransitionError extends Error {
  constructor(from: IncidentState, to: IncidentState) {
    super(`Invalid incident transition: ${from} -> ${to}`);
    this.name = "InvalidIncidentTransitionError";
  }
}

export function createIncident(input: { id: string; at: Date }): Incident {
  return {
    id: input.id,
    state: "CREATED",
    createdAt: input.at,
    updatedAt: input.at,
    transitions: [],
  };
}

export function canTransition(from: IncidentState, to: IncidentState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function transitionIncident(
  incident: Incident,
  input: {
    to: IncidentState;
    at: Date;
    actor: IncidentActor;
    reason: string;
  },
): Incident {
  if (!canTransition(incident.state, input.to)) {
    throw new InvalidIncidentTransitionError(incident.state, input.to);
  }

  if (input.reason.trim().length === 0) {
    throw new Error("Incident transitions require a reason");
  }

  const transition: IncidentTransition = {
    from: incident.state,
    to: input.to,
    at: input.at,
    actor: input.actor,
    reason: input.reason,
  };

  return {
    ...incident,
    state: input.to,
    updatedAt: input.at,
    transitions: [...incident.transitions, transition],
  };
}
