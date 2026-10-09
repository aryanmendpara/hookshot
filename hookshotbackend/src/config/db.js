const mongoose = require("mongoose");

// Fail fast on a missing secret: signing with "undefined" would produce tokens
// that verify against a guessable string.
function assertEnv() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set — copy .env.example to .env");
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not set — copy .env.example to .env");
}

async function connectDB() {
  assertEnv();

  // serverSelectionTimeoutMS so a bad Atlas IP allowlist fails in ~10s instead
  // of hanging for the default 30s.
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  const { host, name, port } = mongoose.connection;
  // The exact string is a checklist item for the demo, so keep it verbatim.
  console.log(`[db] DATABASE CONNECTED — mongodb://${host}:${port}/${name}`);

  // Best-effort index build. The unique index on email backs our 409, so we want
  // it created before the first signup, but a warning beats refusing to boot on
  // a user without index-creation rights.
  try {
    await mongoose.connection.syncIndexes();
    console.log("[db] indexes synced (users.email, endpoints.userId+createdAt, events.userId+createdAt+_id, events.userId+idempotencyKey UNIQUE)");
  } catch (err) {
    console.warn(`[db] index sync failed: ${err.message}`);
  }

  return mongoose.connection;
}

module.exports = { connectDB };