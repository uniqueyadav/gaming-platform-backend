const express = require("express");
const mongoose = require("mongoose");
const charityModel = require("../models/charityModel");

const charityRoute = express.Router();

function slugify(value = "") {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeArray(values) {
  if (Array.isArray(values)) {
    return values
      .map((value) => String(value || "").trim())
      .filter(Boolean);
  }

  return String(values || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeEvents(events = []) {
  if (!Array.isArray(events)) {
    return [];
  }

  return events
    .map((event) => ({
      title: String(event.title || "").trim(),
      eventDate: event.eventDate ? new Date(event.eventDate) : null,
      location: String(event.location || "").trim(),
      description: String(event.description || "").trim(),
    }))
    .filter(
      (event) =>
        event.title || event.eventDate || event.location || event.description
    );
}

function normalizePayload(body = {}) {
  const name = String(body.name || "").trim();
  const slug = slugify(body.slug || name);

  return {
    name,
    slug,
    category: String(body.category || "Community").trim(),
    shortDescription: String(body.shortDescription || "").trim(),
    description: String(body.description || "").trim(),
    impactSummary: String(body.impactSummary || "").trim(),
    website: String(body.website || "").trim(),
    contactEmail: String(body.contactEmail || "").trim().toLowerCase(),
    location: String(body.location || "").trim(),
    tags: normalizeArray(body.tags),
    images: normalizeArray(body.images),
    media: normalizeArray(body.media),
    upcomingEvents: normalizeEvents(body.upcomingEvents),
    status: body.status === "inactive" ? "inactive" : "active",
    isFeatured: Boolean(body.isFeatured),
  };
}

async function applyFeaturedRule(payload, excludeId = null) {
  if (!payload.isFeatured) {
    return;
  }

  const query = excludeId ? { _id: { $ne: excludeId } } : {};
  await charityModel.updateMany(query, { $set: { isFeatured: false } });
}

charityRoute.get("/", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ msg: "Database is not connected" });
    }

    const search = String(req.query.search || "").trim();
    const category = String(req.query.category || "").trim();
    const status = String(req.query.status || "").trim();
    const featured = req.query.featured;

    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { shortDescription: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { tags: { $elemMatch: { $regex: search, $options: "i" } } },
      ];
    }

    if (category) {
      query.category = category;
    }

    if (status) {
      query.status = status;
    }

    if (featured === "true") {
      query.isFeatured = true;
    }

    const charities = await charityModel
      .find(query)
      .sort({ isFeatured: -1, createdAt: -1 })
      .lean();

    const categories = await charityModel.distinct("category");

    res.json({
      msg: "Success",
      value: charities,
      meta: {
        categories: categories.filter(Boolean).sort(),
      },
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

charityRoute.get("/featured/spotlight", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ msg: "Database is not connected" });
    }

    const featuredCharity =
      (await charityModel.findOne({ isFeatured: true, status: "active" }).lean()) ||
      (await charityModel.findOne({ status: "active" }).sort({ createdAt: -1 }).lean());

    res.json({ msg: "Success", value: featuredCharity });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

charityRoute.get("/:id", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ msg: "Database is not connected" });
    }

    const query = mongoose.Types.ObjectId.isValid(req.params.id)
      ? { $or: [{ _id: req.params.id }, { slug: req.params.id }] }
      : { slug: req.params.id };
    const charity = await charityModel.findOne(query).lean();

    if (!charity) {
      return res.status(404).json({ msg: "Charity not found" });
    }

    res.json({ msg: "Success", value: charity });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

charityRoute.post("/", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ msg: "Database is not connected" });
    }

    const payload = normalizePayload(req.body);

    if (!payload.name || !payload.description) {
      return res
        .status(400)
        .json({ msg: "Charity name and description are required" });
    }

    const duplicate = await charityModel.findOne({
      $or: [{ name: payload.name }, { slug: payload.slug }],
    });

    if (duplicate) {
      return res.status(400).json({ msg: "Charity already exists" });
    }

    await applyFeaturedRule(payload);
    const charity = await charityModel.create(payload);

    res.status(201).json({ msg: "Success", value: charity });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

charityRoute.put("/:id", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ msg: "Database is not connected" });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ msg: "Invalid charity id" });
    }

    const payload = normalizePayload(req.body);

    if (!payload.name || !payload.description) {
      return res
        .status(400)
        .json({ msg: "Charity name and description are required" });
    }

    const duplicate = await charityModel.findOne({
      slug: payload.slug,
      _id: { $ne: req.params.id },
    });

    if (duplicate) {
      return res.status(400).json({ msg: "Slug already in use" });
    }

    await applyFeaturedRule(payload, req.params.id);

    const charity = await charityModel.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    if (!charity) {
      return res.status(404).json({ msg: "Charity not found" });
    }

    res.json({ msg: "Success", value: charity });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

charityRoute.delete("/:id", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ msg: "Database is not connected" });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ msg: "Invalid charity id" });
    }

    const charity = await charityModel.findByIdAndDelete(req.params.id);

    if (!charity) {
      return res.status(404).json({ msg: "Charity not found" });
    }

    if (charity.isFeatured) {
      const fallback = await charityModel.findOne({ status: "active" }).sort({
        createdAt: -1,
      });

      if (fallback) {
        fallback.isFeatured = true;
        await fallback.save();
      }
    }

    res.json({ msg: "Success", value: charity });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

module.exports = charityRoute;
