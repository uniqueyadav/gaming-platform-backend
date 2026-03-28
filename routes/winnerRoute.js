const express = require("express");
const mongoose = require("mongoose");
const winnerModel = require("../models/winnerModel");
const { syncWinnersFromPublishedDraws } = require("../utils/winnerSync");

const winnerRoute = express.Router();

function ensureDbConnected(res) {
  if (mongoose.connection.readyState !== 1) {
    res.status(503).json({ msg: "Database is not connected" });
    return false;
  }

  return true;
}

winnerRoute.get("/", async (req, res) => {
  try {
    if (!ensureDbConnected(res)) {
      return;
    }

    await syncWinnersFromPublishedDraws();

    const search = String(req.query.search || "").trim();
    const eligibilityStatus = String(req.query.eligibilityStatus || "").trim();
    const payoutStatus = String(req.query.payoutStatus || "").trim();
    const drawMonth = String(req.query.drawMonth || "").trim();

    const query = {};

    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    if (eligibilityStatus) {
      query.eligibilityStatus = eligibilityStatus;
    }

    if (payoutStatus) {
      query.payoutStatus = payoutStatus;
    }

    if (drawMonth) {
      query.drawMonth = drawMonth;
    }

    const winners = await winnerModel
      .find(query)
      .populate({
        path: "userId",
        select: "fullName email golfScores handicap membershipLevel subscriptionPlan",
      })
      .sort({ drawMonth: -1, matchCount: -1, createdAt: -1 })
      .lean();

    const drawMonths = await winnerModel.distinct("drawMonth");

    const summary = {
      total: winners.length,
      pendingReview: winners.filter((winner) => winner.eligibilityStatus === "pending").length,
      approved: winners.filter((winner) => winner.eligibilityStatus === "approved").length,
      paid: winners.filter((winner) => winner.payoutStatus === "paid").length,
    };

    res.json({
      msg: "Success",
      value: winners,
      meta: {
        drawMonths: drawMonths.filter(Boolean).sort().reverse(),
        summary,
      },
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

winnerRoute.patch("/:id/submission", async (req, res) => {
  try {
    if (!ensureDbConnected(res)) {
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ msg: "Invalid winner id" });
    }

    const proofScreenshotUrl = String(req.body.proofScreenshotUrl || "").trim();
    const submissionNotes = String(req.body.submissionNotes || "").trim();

    if (!proofScreenshotUrl) {
      return res.status(400).json({ msg: "Proof screenshot URL is required" });
    }

    const winner = await winnerModel.findByIdAndUpdate(
      req.params.id,
      {
        proofScreenshotUrl,
        submissionNotes,
        submissionStatus: "submitted",
        submittedAt: new Date(),
        eligibilityStatus: "pending",
        reviewNotes: "",
        reviewedAt: null,
      },
      {
        returnDocument: "after",
        runValidators: true,
      }
    );

    if (!winner) {
      return res.status(404).json({ msg: "Winner record not found" });
    }

    res.json({ msg: "Success", value: winner });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

winnerRoute.patch("/:id/review", async (req, res) => {
  try {
    if (!ensureDbConnected(res)) {
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ msg: "Invalid winner id" });
    }

    const eligibilityStatus = String(req.body.eligibilityStatus || "").trim();
    const reviewNotes = String(req.body.reviewNotes || "").trim();

    if (!["approved", "rejected"].includes(eligibilityStatus)) {
      return res.status(400).json({ msg: "Eligibility status must be approved or rejected" });
    }

    const winner = await winnerModel.findById(req.params.id);
    if (!winner) {
      return res.status(404).json({ msg: "Winner record not found" });
    }

    if (winner.submissionStatus !== "submitted" || !winner.proofScreenshotUrl) {
      return res.status(400).json({ msg: "Proof submission is required before review" });
    }

    winner.eligibilityStatus = eligibilityStatus;
    winner.reviewNotes = reviewNotes;
    winner.reviewedAt = new Date();

    if (eligibilityStatus === "rejected") {
      winner.payoutStatus = "pending";
      winner.paidAt = null;
    }

    await winner.save();

    res.json({ msg: "Success", value: winner });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

winnerRoute.patch("/:id/payout", async (req, res) => {
  try {
    if (!ensureDbConnected(res)) {
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ msg: "Invalid winner id" });
    }

    const payoutStatus = String(req.body.payoutStatus || "").trim();

    if (!["pending", "paid"].includes(payoutStatus)) {
      return res.status(400).json({ msg: "Payout status must be pending or paid" });
    }

    const winner = await winnerModel.findById(req.params.id);
    if (!winner) {
      return res.status(404).json({ msg: "Winner record not found" });
    }

    if (winner.eligibilityStatus !== "approved" && payoutStatus === "paid") {
      return res.status(400).json({ msg: "Only approved winners can be marked as paid" });
    }

    winner.payoutStatus = payoutStatus;
    winner.paidAt = payoutStatus === "paid" ? new Date() : null;
    await winner.save();

    res.json({ msg: "Success", value: winner });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

module.exports = winnerRoute;
