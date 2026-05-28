// Canonical state machine for plan records. Every status change goes through
// transition() — no call site writes record.state directly.

const STATES = Object.freeze({
  pending: "pending",
  generating: "generating",
  review: "review",
  revising: "revising",
  approved: "approved",
  sent: "sent",
  failed: "failed",
});

const TRANSITIONS = Object.freeze({
  pending: ["generating", "failed"],
  generating: ["review", "failed"],
  review: ["revising", "approved", "failed"],
  revising: ["review", "failed"],
  approved: ["sent", "failed"],
  sent: [],
  failed: ["generating"],
});

class IllegalTransitionError extends Error {
  constructor(from, to) {
    super(`illegal state transition: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
    this.from = from;
    this.to = to;
  }
}

function transition(record, to, { reason } = {}) {
  const from = record.state || "pending";
  const allowed = TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new IllegalTransitionError(from, to);
  }

  record.state = to;
  record.status = to === "review" ? "needs_review" : to;

  if (!Array.isArray(record.history)) {
    record.history = [];
  }
  record.history.push({
    from,
    to,
    at: new Date().toISOString(),
    reason: reason || null,
  });

  return record;
}

function initRecord(record) {
  record.state = STATES.pending;
  record.status = "pending";
  record.history = [{
    from: null,
    to: "pending",
    at: new Date().toISOString(),
    reason: "record created",
  }];
  return record;
}

module.exports = {
  STATES,
  TRANSITIONS,
  IllegalTransitionError,
  transition,
  initRecord,
};
