const mongoose = require("mongoose");

const golfScoreSchema = new mongoose.Schema(
  {
    courseName: {
      type: String,
      trim: true,
      default: "",
    },
    score: {
      type: Number,
      default: 0,
      min: 0,
    },
    playedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const contributionSchema = new mongoose.Schema(
  {
    charityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "charity",
      default: null,
    },
    charityName: {
      type: String,
      trim: true,
      default: "",
    },
    contributionPercentage: {
      type: Number,
      default: 10,
      min: 10,
    },
    independentDonationAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    contributionNotes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    membershipLevel: {
      type: String,
      trim: true,
      default: "Standard",
    },
    handicap: {
      type: Number,
      default: 0,
      min: 0,
    },
    subscriptionPlan: {
      type: String,
      trim: true,
      default: "Monthly",
    },
    subscriptionStatus: {
      type: String,
      enum: ["active", "paused", "expired", "cancelled"],
      default: "active",
    },
    subscriptionEndDate: {
      type: Date,
      default: null,
    },
    golfScores: {
      type: [golfScoreSchema],
      default: [],
    },
    contribution: {
      type: contributionSchema,
      default: () => ({
        charityId: null,
        charityName: "",
        contributionPercentage: 10,
        independentDonationAmount: 0,
        contributionNotes: "",
      }),
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("user", userSchema);
