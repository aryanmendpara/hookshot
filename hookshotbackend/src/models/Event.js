const mongoose = require("mongoose");

// An event is a message some other application sent us ("an invoice was paid").
// Storing it is this step's whole job; actually POSTing it to the user's
// endpoints is a later phase.
// minimize:false — Mongoose's default (true) silently DELETES empty objects and
// empty arrays anywhere in a document on save. That would quietly drop `{}` from
// the data default below, and strip `{"user":{}}` or `"tags":[]` out of a real
// webhook payload. A payload has to round-trip exactly as the sender wrote it,
// so the stripping has to go.
const eventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      // Every read scopes on this, so an unscoped collection scan here would be a
      // cross-tenant data leak — same reasoning as Endpoint.userId.
      index: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
    },
    data: {
      // Whatever the producer sent. Mixed rather than a typed shape: the whole
      // point of a webhook is that the sender decides the payload, and every
      // consumer here has to cope with fields it has never seen.
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
    },
    endpointIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Endpoint",
      },
    ],
    // endpointIds is a snapshot of who was active when the event arrived, not a
    // live lookup. Toggling an endpoint afterwards must not change which events
    // were addressed to it, or a paused webhook silently rewrites history.
  },
  { timestamps: true, minimize: false },
);

// Serves the list query exactly: filter by userId, sort newest first, take 50.
// Unrelated to the idempotencyKey uniqueness above — this one is read-only.
//
// _id is the tiebreaker, and it has to be in the index, not just the sort. Two
// events can share a createdAt millisecond, and sort({createdAt:-1}) alone
// leaves their relative order up to Mongo — which made "newest first" genuinely
// nondeterministic under load. An ObjectId increments within a single process,
// so _id: -1 breaks the tie the same way every time. Mongo can't serve a sort
// on a field absent from the index, hence three keys rather than two.
eventSchema.index({ userId: 1, createdAt: -1, _id: -1 });

// The duplicate-prevention guarantee, enforced by the database rather than by
// application code — which is the only version of this that survives concurrent
// requests. An in-process "have I seen this key?" check would pass ten parallel
// POSTs of the same key straight through, because all ten read before any of
// them wrote.
//
// Scoped to userId, so it is per-user uniqueness: two accounts may both use
// "abc123" without colliding. A globally unique idempotencyKey would make one
// tenant's key leak the existence of another tenant's, and reject a perfectly
// legitimate event.
eventSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });

module.exports = mongoose.model("Event", eventSchema);
