const express = require("express");
const mongoose = require("mongoose");
const adminModel = require("../models/adminModel");

const adminRoute = express.Router();

function normalizeAdminCredentials(email, password) {
  return {
    email: email?.trim().toLowerCase(),
    password: password?.trim(),
  };
}

adminRoute.get("/", (req, res) => {
  res.send("Hello Admin Route");
});

adminRoute.post("/login", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ msg: "Database is not connected" });
    }

    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ msg: "Email and password are required" });
    }

    const normalized = normalizeAdminCredentials(email, password);
    email = normalized.email;
    password = normalized.password;

    const admin = await adminModel.findOne({ email }).lean();

    if (!admin) {
      return res.status(404).json({ msg: "Admin account not found" });
    }

    if (admin.password !== password) {
      return res.status(401).json({ msg: "Invalid credentials" });
    }
    return res.json({
      msg: "Success",
      value: {
        id: admin._id,
        email: admin.email,
      },
    });
  } catch (error) {
    return res.status(500).json({ msg: error.message });
  }
});

module.exports = adminRoute;
