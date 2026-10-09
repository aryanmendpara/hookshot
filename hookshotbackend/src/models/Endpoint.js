const mongoose = require("mongoose");

const endpointSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      // Every read and write scopes on this field, so it is the one index that
      // isn't optional — a collection scan here would be a cross-tenant data leak.
      index: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// Serves the list query exactly: filter by userId, sort by createdAt. Mongo can
// walk this index in order and stop, instead of sorting every matching doc.
endpointSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Endpoint", endpointSchema);