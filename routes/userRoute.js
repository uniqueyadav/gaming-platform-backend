const express = require("express");
const mongoose = require("mongoose");
const userModel = require("../models/userModel");
const charityModel = require("../models/charityModel");

const userRoute = express.Router();

function normalizeScores(scores = []) {
  if (!Array.isArray(scores)) {
    return [];
  }

  return scores
    .map((score) => ({
      courseName: (score.courseName || "").trim(),
      score: Number(score.score) || 0,
      playedAt: score.playedAt ? new Date(score.playedAt) : new Date(),
    }))
    .filter((score) => score.courseName || score.score);
}

function normalizePayload(body) {
  return {
    fullName: (body.fullName || "").trim(),
    email: (body.email || "").trim().toLowerCase(),
    phone: (body.phone || "").trim(),
    membershipLevel: (body.membershipLevel || "Standard").trim(),
    handicap: Number(body.handicap) || 0,
    subscriptionPlan: (body.subscriptionPlan || "Monthly").trim(),
    subscriptionStatus: body.subscriptionStatus || "active",
    subscriptionEndDate: body.subscriptionEndDate || null,
    golfScores: normalizeScores(body.golfScores),
    contribution: {
      charityId: body.contribution?.charityId || null,
      charityName: (body.contribution?.charityName || "").trim(),
      contributionPercentage: Math.max(
        10,
        Number(body.contribution?.contributionPercentage) || 10
      ),
      independentDonationAmount: Math.max(
        0,
        Number(body.contribution?.independentDonationAmount) || 0
      ),
      contributionNotes: (body.contribution?.contributionNotes || "").trim(),
    },
  };
}

userRoute.get("/", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ msg: "Database is not connected" });
    }

    const users = await userModel.find().sort({ createdAt: -1 }).lean();
    res.json({ msg: "Success", value: users });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

userRoute.get("/:id", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ msg: "Database is not connected" });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ msg: "Invalid user id" });
    }

    const user = await userModel.findById(req.params.id).lean();

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    res.json({ msg: "Success", value: user });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

userRoute.post("/", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ msg: "Database is not connected" });
    }

    const payload = normalizePayload(req.body);

    if (!payload.fullName || !payload.email) {
      return res.status(400).json({ msg: "Full name and email are required" });
    }

    const existingUser = await userModel.findOne({ email: payload.email });
    if (existingUser) {
      return res.status(400).json({ msg: "User with this email already exists" });
    }

    if (payload.contribution.charityId) {
      const charity = await charityModel.findById(payload.contribution.charityId);
      if (!charity) {
        return res.status(400).json({ msg: "Selected charity not found" });
      }

      payload.contribution.charityName = charity.name;
    }

    const user = await userModel.create(payload);
    res.status(201).json({ msg: "Success", value: user });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

userRoute.put("/:id", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ msg: "Database is not connected" });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ msg: "Invalid user id" });
    }

    const payload = normalizePayload(req.body);

    if (!payload.fullName || !payload.email) {
      return res.status(400).json({ msg: "Full name and email are required" });
    }

    const duplicate = await userModel.findOne({
      email: payload.email,
      _id: { $ne: req.params.id },
    });

    if (duplicate) {
      return res.status(400).json({ msg: "Email already used by another user" });
    }

    if (payload.contribution.charityId) {
      const charity = await charityModel.findById(payload.contribution.charityId);
      if (!charity) {
        return res.status(400).json({ msg: "Selected charity not found" });
      }

      payload.contribution.charityName = charity.name;
    }

    const user = await userModel.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    res.json({ msg: "Success", value: user });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

module.exports = userRoute;
