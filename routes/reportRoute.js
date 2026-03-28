const express = require("express");
const mongoose = require("mongoose");
const charityModel = require("../models/charityModel");
const drawModel = require("../models/drawModel");
const reportModel = require("../models/reportModel");
const userModel = require("../models/userModel");

const reportRoute = express.Router();

const SUBSCRIPTION_PLAN_VALUES = {
  Monthly: 2000,
  Quarterly: 5500,
  Annual: 20000,
};

function getPlanValue(plan = "") {
  return SUBSCRIPTION_PLAN_VALUES[plan] || SUBSCRIPTION_PLAN_VALUES.Monthly;
}

function roundCurrency(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function toSafeNumber(value) {
  return Number(value) || 0;
}

function toSafeArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildCharityContributionTotals(users = [], charities = []) {
  const charityMap = new Map(
    toSafeArray(charities).map((charity) => [
      String(charity._id),
      {
        charityId: charity._id,
        charityName: charity.name,
        supporterCount: 0,
        projectedContribution: 0,
        directDonationTotal: 0,
        overallContribution: 0,
      },
    ])
  );

  toSafeArray(users).forEach((user) => {
    const contribution = user.contribution || {};
    const charityId = contribution.charityId ? String(contribution.charityId) : "unassigned";
    const charityName = contribution.charityName || "Unassigned";
    const projectedContribution =
      getPlanValue(user.subscriptionPlan) *
      (Math.max(10, toSafeNumber(contribution.contributionPercentage) || 10) / 100);
    const directDonationTotal = Math.max(0, toSafeNumber(contribution.independentDonationAmount));

    if (!charityMap.has(charityId)) {
      charityMap.set(charityId, {
        charityId: contribution.charityId || null,
        charityName,
        supporterCount: 0,
        projectedContribution: 0,
        directDonationTotal: 0,
        overallContribution: 0,
      });
    }

    const entry = charityMap.get(charityId);
    entry.supporterCount += 1;
    entry.projectedContribution += projectedContribution;
    entry.directDonationTotal += directDonationTotal;
    entry.overallContribution += projectedContribution + directDonationTotal;
  });

  return [...charityMap.values()]
    .map((entry) => ({
      ...entry,
      projectedContribution: roundCurrency(entry.projectedContribution),
      directDonationTotal: roundCurrency(entry.directDonationTotal),
      overallContribution: roundCurrency(entry.overallContribution),
    }))
    .sort((first, second) => second.overallContribution - first.overallContribution);
}

function buildDrawStatistics(draws = []) {
  const safeDraws = toSafeArray(draws);
  const publishedDraws = safeDraws.filter((draw) => draw?.status === "published");
  const simulatedDraws = safeDraws.filter((draw) => draw?.status === "simulated");
  const draftDraws = safeDraws.filter((draw) => draw?.status === "draft");
  const totalParticipants = safeDraws.reduce(
    (sum, draw) => sum + toSafeNumber(draw?.participantCount),
    0
  );
  const totalWinnerCount = safeDraws.reduce(
    (sum, draw) =>
      sum +
      toSafeArray(draw?.winners).reduce(
        (winnerSum, bucket) => winnerSum + toSafeNumber(bucket?.winners),
        0
      ),
    0
  );
  const jackpotValues = safeDraws.map((draw) => toSafeNumber(draw?.jackpotAmount));
  const totalJackpot = jackpotValues.reduce((sum, amount) => sum + amount, 0);
  const highestJackpot = jackpotValues.length ? Math.max(...jackpotValues) : 0;
  const latestDraw = [...safeDraws].sort((first, second) =>
    String(second.drawMonth || "").localeCompare(String(first.drawMonth || ""))
  )[0];

  return {
    publishedDraws: publishedDraws.length,
    simulatedDraws: simulatedDraws.length,
    draftDraws: draftDraws.length,
    totalParticipants,
    totalWinnerCount,
    averageJackpot: safeDraws.length ? roundCurrency(totalJackpot / safeDraws.length) : 0,
    highestJackpot,
    latestDrawMonth: latestDraw?.drawMonth || "",
  };
}

reportRoute.get("/analytics", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ msg: "Database is not connected" });
    }

    const [users, charities, draws] = await Promise.all([
      userModel.find().lean(),
      charityModel.find().lean(),
      drawModel.find().lean(),
    ]);

    const charityContributionTotals = buildCharityContributionTotals(users, charities);
    const drawStatistics = buildDrawStatistics(draws);
    const totalPrizePool = roundCurrency(
      toSafeArray(draws).reduce((sum, draw) => sum + toSafeNumber(draw?.jackpotAmount), 0)
    );
    const totalCharityContribution = roundCurrency(
      charityContributionTotals.reduce(
        (sum, charity) => sum + toSafeNumber(charity?.overallContribution),
        0
      )
    );

    const reportPayload = {
      reportKey: "reports-analytics",
      generatedAt: new Date(),
      overview: {
        totalUsers: users.length,
        totalPrizePool,
        totalCharityContribution,
        totalDraws: draws.length,
      },
      charityContributionTotals,
      drawStatistics,
    };

    try {
      await reportModel.findOneAndUpdate(
        { reportKey: reportPayload.reportKey },
        reportPayload,
        {
          upsert: true,
          returnDocument: "after",
          setDefaultsOnInsert: true,
          runValidators: true,
        }
      );
    } catch (snapshotError) {
      console.error("Failed to persist analytics snapshot:", snapshotError.message);
    }

    res.json({
      msg: "Success",
      value: reportPayload,
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

module.exports = reportRoute;
