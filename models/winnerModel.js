const mongoose = require("mongoose");

const winnerSchema = new mongoose.Schema(
  {
    drawId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "draw",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    drawMonth: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    drawType: {
      type: String,
      trim: true,
      default: "5-number-match",
    },
    matchCount: {
      type: Number,
      required: true,
      min: 3,
      max: 5,
    },
    fullName: {
      type: String,
      trim: true,
      default: "",
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    ticketNumbers: {
      type: [Number],
      default: [],
    },
    winningNumbers: {
      type: [Number],
      default: [],
    },
    payoutAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    proofScreenshotUrl: {
      type: String,
      trim: true,
      default: "",
    },
    submissionNotes: {
      type: String,
      trim: true,
      default: "",
    },
    submissionStatus: {
      type: String,
      enum: ["not-submitted", "submitted"],
      default: "not-submitted",
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    eligibilityStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    reviewNotes: {
      type: String,
      trim: true,
      default: "",
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    payoutStatus: {
      type: String,
      enum: ["pending", "paid"],
      default: "pending",
    },
    paidAt: {
      type: Date,
      default: null,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

winnerSchema.index({ drawId: 1, userId: 1, matchCount: 1 }, { unique: true });

module.exports = mongoose.model("winner", winnerSchema);
