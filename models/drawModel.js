const mongoose = require("mongoose");

const winnerBucketSchema = new mongoose.Schema(
  {
    matchCount: {
      type: Number,
      required: true,
    },
    winners: {
      type: Number,
      default: 0,
      min: 0,
    },
    userIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "user",
      default: [],
    },
  },
  { _id: false }
);

const simulationSchema = new mongoose.Schema(
  {
    requestedRuns: {
      type: Number,
      default: 1,
      min: 1,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
    numbers: {
      type: [Number],
      default: [],
    },
    distribution: {
      type: Object,
      default: {},
    },
    previewWinners: {
      type: [winnerBucketSchema],
      default: [],
    },
    topTrendingNumbers: {
      type: [Number],
      default: [],
    },
  },
  { _id: false }
);

const drawSchema = new mongoose.Schema(
  {
    drawMonth: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    cadence: {
      type: String,
      default: "monthly",
      trim: true,
    },
    drawType: {
      type: String,
      enum: ["5-number-match", "4-number-match", "3-number-match"],
      default: "5-number-match",
    },
    logicType: {
      type: String,
      enum: ["random", "algorithmic"],
      default: "random",
    },
    status: {
      type: String,
      enum: ["draft", "simulated", "published"],
      default: "draft",
    },
    scheduledFor: {
      type: Date,
      required: true,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    numbers: {
      type: [Number],
      default: [],
    },
    numberRange: {
      min: {
        type: Number,
        default: 1,
      },
      max: {
        type: Number,
        default: 99,
      },
    },
    jackpotBase: {
      type: Number,
      default: 100000,
      min: 0,
    },
    jackpotAmount: {
      type: Number,
      default: 100000,
      min: 0,
    },
    rolloverAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastSimulation: {
      type: simulationSchema,
      default: null,
    },
    winners: {
      type: [winnerBucketSchema],
      default: [],
    },
    participantCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("draw", drawSchema);
