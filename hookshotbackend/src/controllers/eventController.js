const Event = require("../models/Event");
const { getActiveEndpoints } = require("../utils/endpoints");

const LIST_LIMIT = 50;

// Mongo's duplicate-key error. Thrown when a write would violate a unique index.
const DUP_KEY = 11000;

exports.create = async (req, res, next) => {
  const { type, data } = req.body ?? {};

  if (typeof type !== "string" || !type.trim()) {
    return res.status(400).json({ error: "type is required." });
  }

  // From the header, never the body. It describes the delivery attempt rather
  // than the payload, which keeps a retry byte-identical to the original and
  // lets a proxy or client library set it without touching the JSON.
  const idempotencyKey = req.get("Idempotency-Key");
  if (typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
    return res.status(400).json({ error: "Idempotency-Key header is required." });
  }

  // The schema types this as an object. A scalar or array here would be stored
  // as-is by Mixed and break every consumer that assumes it can read fields.
  if (data !== undefined && (data === null || typeof data !== "object" || Array.isArray(data))) {
    return res.status(400).json({ error: "data must be a JSON object." });
  }

  const key = idempotencyKey.trim();

  try {
    // userId comes from the verified token, never the body — same rule as
    // endpointController, so a client can't file an event under someone else.
    //
    // No active endpoints is not an error: the event is still recorded, it just
    // has nobody to go to yet. 400ing here would punish someone for subscribing
    // after their first event.
    const active = await getActiveEndpoints(req.user.id);

    const event = await Event.create({
      userId: req.user.id,
      type: type.trim(),
      data: data ?? {},
      idempotencyKey: key,
      endpointIds: active.map((e) => e._id),
    });

    res.status(201).json(event);
  } catch (err) {
    // A retry of a key this user already used. The unique index is what decides
    // this, not a lookup beforehand — a check-then-insert would let ten parallel
    // requests of the same key all pass the check before any of them wrote.
    //
    // Re-query rather than assume anything about who won. We cannot know whether
    // this request was the one that inserted the document or one of the nine
    // that lost the race, so the only safe move is to go read the winner back.
    if (err.code === DUP_KEY) {
      // The .catch() is load-bearing. Express 4 does not catch a rejected promise
      // from an async handler, so if this query threw, the rejection would escape
      // `create` entirely — no response, and Node kills the process on an
      // unhandled rejection by default. The try/catch above cannot cover this line
      // because we are already inside its catch block.
      //
      // Swallowing the error is correct here, not lazy: a failed re-query means we
      // cannot tell which document won the race, so the only honest answer is the
      // same 500 any other database failure produces.
      const existing = await Event.findOne({ userId: req.user.id, idempotencyKey: key }).catch(
        () => null,
      );
      // The re-query doubles as the discriminator. A 11000 from some *other*
      // unique index would leave nothing under this key, so it falls through to
      // the error handler instead of returning an unrelated event as a "replay".
      if (existing) return res.status(200).json(existing);
    }
    next(err);
  }
};

exports.list = async (req, res, next) => {
  try {
    // Ownership is part of the query, and the compound index serves the filter
    // and the sort together. _id breaks createdAt ties — without it two events
    // in the same millisecond can come back in either order. Capped so one noisy
    // user can't ask for their whole history in one response.
    const events = await Event.find({ userId: req.user.id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(LIST_LIMIT);
    res.json(events);
  } catch (err) {
    next(err);
  }
};
