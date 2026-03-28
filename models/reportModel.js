const mongoose = require("mongoose");

const charityContributionSnapshotSchema = new mongoose.Schema(
  {
    charityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "charity",
      default: null,
    },
    charityName: {
      type: String,
      trim: true,
      default: "Unassigned",
    },
    supporterCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    projectedContribution: {
      type: Number,
      default: 0,
      min: 0,
    },
    directDonationTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    overallContribution: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const reportSchema = new mongoose.Schema(
  {
    reportKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
    overview: {
      totalUsers: {
        type: Number,
        default: 0,
      },
      totalPrizePool: {
        type: Number,
        default: 0,
      },
      totalCharityContribution: {
        type: Number,
        default: 0,
      },
      totalDraws: {
        type: Number,
        default: 0,
      },
    },
    charityContributionTotals: {
      type: [charityContributionSnapshotSchema],
      default: [],
    },
    drawStatistics: {
      publishedDraws: {
        type: Number,
        default: 0,
      },
      simulatedDraws: {
        type: Number,
        default: 0,
      },
      draftDraws: {
        type: Number,
        default: 0,
      },
      totalParticipants: {
        type: Number,
        default: 0,
      },
      totalWinnerCount: {
        type: Number,
        default: 0,
      },
      averageJackpot: {
        type: Number,
        default: 0,
      },
      highestJackpot: {
        type: Number,
        default: 0,
      },
      latestDrawMonth: {
        type: String,
        default: "",
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("report", reportSchema);
