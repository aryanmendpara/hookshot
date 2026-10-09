const mongoose = require("mongoose");
const { generateApiKey } = require("../utils/apiKey");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      // Keeps the hash out of every query that doesn't ask for it by name. The
      // one caller that legitimately needs it (login) uses .select("+password").
      select: false,
    },
    apiKey: {
      type: String,
      unique: true,
      // KNOWN LIMITATION, accepted for this assignment's scope: the key is stored
      // in PLAINTEXT, unlike the bcrypt-hashed password above. A read of the users
      // collection discloses every webhook key. Hashing it is not a drop-in change,
      // because the Settings page has a Reveal control that shows the key back —
      // fix that by showing the key once at generation time and storing only its
      // hash thereafter.
      select: false,
    },
    apiKeyCreatedAt: { type: Date },
  },
  { timestamps: true },
);

// Every user gets a webhook key on creation. A pre-validate hook (rather than a
// default) means the value is present even when the caller doesn't supply one,
// and the unique index backs the collision case.
userSchema.pre("validate", function assignApiKey(next) {
  if (!this.apiKey) {
    this.apiKey = generateApiKey();
    this.apiKeyCreatedAt = new Date();
  }
  next();
});

userSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.password;
    delete ret.apiKey;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);