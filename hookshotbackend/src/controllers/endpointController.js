const mongoose = require("mongoose");
const Endpoint = require("../models/Endpoint");
const { invalidateEndpoints } = require("../utils/endpoints");

// A webhook target has to be an absolute http(s) URL — the delivery worker will
// fetch it verbatim. Anything else ("notaurl", "ftp://x", "javascript:alert(1)")
// can never succeed, so reject it at the edge rather than at delivery time.
const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

const notFound = { error: "Endpoint not found." };

function checkUrl(url) {
  if (typeof url !== "string" || !URL_RE.test(url.trim())) {
    return "url must be a valid http:// or https:// URL.";
  }
  return null;
}

// ObjectId cast throws on a malformed id, and a 500 for a typo'd path param is
// worse than a 404. Turn it into the same answer as a genuinely missing document.
function validId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

exports.create = async (req, res, next) => {
  const { url } = req.body ?? {};

  const problem = checkUrl(url);
  if (problem) return res.status(400).json({ error: problem });

  try {
    // userId comes from the verified token, never from the request body — a
    // client must not be able to create an endpoint inside someone else's account.
    const endpoint = await Endpoint.create({ url: url.trim(), userId: req.user.id });

    // Drop the cached active-endpoint list. A brand new endpoint is active, so
    // the next event must fan out to it.
    invalidateEndpoints(req.user.id);

    res.status(201).json(endpoint);
  } catch (err) {
    next(err);
  }
};

exports.list = async (req, res, next) => {
  try {
    // Ownership is part of the query, not a filter applied afterwards. Newest
    // first so the list order is stable for the UI and for CSV exports.
    const endpoints = await Endpoint.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(endpoints);
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  const { url, active } = req.body ?? {};

  // Re-validate on update for the same reason as create: a stored URL is always
  // something the delivery worker will try to fetch.
  if (url !== undefined) {
    const problem = checkUrl(url);
    if (problem) return res.status(400).json({ error: problem });
  }

  if (active !== undefined && typeof active !== "boolean") {
    return res.status(400).json({ error: "active must be true or false." });
  }

  if (url === undefined && active === undefined) {
    return res.status(400).json({ error: "Provide url or active to update." });
  }

  const patch = {};
  if (url !== undefined) patch.url = url.trim();
  if (active !== undefined) patch.active = active;

  if (!validId(req.params.id)) return res.status(404).json(notFound);

  try {
    // One query, ownership-scoped. Fetching by _id and checking userId afterwards
    // would be two round-trips and — worse — an easy place to forget the check.
    // A non-owner's id simply doesn't match, so 404 is the honest answer: it
    // says nothing about whether the document exists.
    const endpoint = await Endpoint.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      patch,
      { new: true, runValidators: true },
    );
    if (!endpoint) return res.status(404).json(notFound);

    // A patch can flip `active`, which changes who receives the next event.
    invalidateEndpoints(req.user.id);

    res.json(endpoint);
  } catch (err) {
    next(err);
  }
};

exports.destroy = async (req, res, next) => {
  if (!validId(req.params.id)) return res.status(404).json(notFound);

  try {
    // Same scope as update — the delete filter carries the ownership check.
    const endpoint = await Endpoint.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!endpoint) return res.status(404).json(notFound);

    // Deleting a still-active endpoint must remove it from the next fan-out.
    invalidateEndpoints(req.user.id);

    res.json({ ok: true, id: endpoint._id });
  } catch (err) {
    next(err);
  }
};