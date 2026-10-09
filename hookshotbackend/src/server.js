require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { connectDB } = require("./config/db");

const PORT = process.env.PORT || 5001;
const app = express();

app.use(
  cors({
    origin: (process.env.CLIENT_ORIGIN || "http://localhost:5173")
      .split(",")
      .map((s) => s.trim()),
    credentials: true,
  }),
);
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api", require("./routes"));

// Unknown route — keep it JSON so the frontend never parses an HTML error page.
app.use((req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.path}` }));

// Central error handler. Keeps stack traces out of responses.
app.use((err, _req, res, _next) => {
  console.error("[error]", err);

  // body-parser tags a body it refused to read — err.type is "entity.parse.failed"
  // for malformed JSON and "entity.too.large" for an oversized payload. Both
  // already carry the right status (400 / 413), but they fell through to the
  // generic message below, which tells the caller to retry something that can
  // never succeed. Echo a fixed string for those; never err.message itself, which
  // can carry internals.
  const unreadableBody = typeof err.type === "string" && err.type.startsWith("entity.");

  res.status(err.status || 500).json({
    error: unreadableBody
      ? "Request body could not be read. Send valid JSON within the size limit."
      : "Something went wrong. Try again.",
  });
});

// Express 4 does not catch a rejected promise from an async route handler. Every
// controller here wraps its awaits in try/catch, so in principle nothing escapes —
// but if one ever does, Node terminates the process by default, which turns a
// single bad request into a dead server. This is a backstop, not a fix: it turns
// that failure into a log line instead of an outage.
process.on("unhandledRejection", (err) => console.error("[unhandled]", err));

async function start() {
  try {
    await connectDB();
  } catch (err) {
    // Loud, immediate failure — never serve requests with no database behind them.
    console.error(`[fatal] could not connect to MongoDB: ${err.message}`);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`[api] Hookshot API listening on http://localhost:${PORT}`);
    console.log(`[api] CORS origin: ${process.env.CLIENT_ORIGIN || "http://localhost:5173"}`);
  });
}

start();

module.exports = app;