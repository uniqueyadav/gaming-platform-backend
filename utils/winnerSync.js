const drawModel = require("../models/drawModel");
const userModel = require("../models/userModel");
const winnerModel = require("../models/winnerModel");

const PRIZE_SHARE_BY_MATCH = {
  5: 0.6,
  4: 0.25,
  3: 0.15,
};

function clampNumber(value) {
  const parsed = Number(value) || 0;
  return Math.max(1, Math.min(99, Math.round(parsed)));
}

function hashSeed(text = "") {
  return text.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function uniqueNumbers(values = [], limit = 5) {
  const result = [];

  for (const value of values) {
    const normalized = clampNumber(value);
    if (!result.includes(normalized)) {
      result.push(normalized);
    }

    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

function buildUserTicket(user) {
  const scoreValues = (user.golfScores || [])
    .map((entry) => Number(entry.score) || 0)
    .filter((score) => score > 0);

  const averageScore = scoreValues.length
    ? Math.round(scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length)
    : 0;
  const bestScore = scoreValues.length ? Math.min(...scoreValues) : 0;
  const worstScore = scoreValues.length ? Math.max(...scoreValues) : 0;
  const scoreSpread = worstScore - bestScore;
  const stabilityScore = averageScore - (Number(user.handicap) || 0);
  const fallbackSeed = hashSeed(`${user.email || ""}${user.fullName || ""}`);

  const candidateNumbers = [
    ...scoreValues,
    user.handicap,
    averageScore,
    bestScore,
    worstScore,
    scoreSpread,
    stabilityScore,
    fallbackSeed,
    fallbackSeed % 83,
    fallbackSeed % 67,
  ];

  const ticket = uniqueNumbers(candidateNumbers, 5);

  while (ticket.length < 5) {
    const nextValue = clampNumber(fallbackSeed + ticket.length * 11);
    if (!ticket.includes(nextValue)) {
      ticket.push(nextValue);
    }
  }

  return ticket;
}

function calculatePayoutAmount(draw, matchCount, winnerCount) {
  const jackpotAmount = Number(draw?.jackpotAmount) || 0;
  const share = PRIZE_SHARE_BY_MATCH[matchCount] || 0;
  const safeWinnerCount = Math.max(1, Number(winnerCount) || 1);

  return Math.round(((jackpotAmount * share) / safeWinnerCount) * 100) / 100;
}

async function syncWinnersFromPublishedDraws() {
  const publishedDraws = await drawModel
    .find({ status: "published", "winners.0": { $exists: true } })
    .lean();

  const winnerUserIds = [
    ...new Set(
      publishedDraws.flatMap((draw) =>
        (draw.winners || []).flatMap((bucket) =>
          (bucket.userIds || []).map((userId) => String(userId))
        )
      )
    ),
  ];

  const users = await userModel.find({ _id: { $in: winnerUserIds } }).lean();
  const userMap = new Map(users.map((user) => [String(user._id), user]));

  for (const draw of publishedDraws) {
    for (const bucket of draw.winners || []) {
      const matchCount = Number(bucket.matchCount) || 0;
      const winnerCount = (bucket.userIds || []).length;

      for (const userId of bucket.userIds || []) {
        const user = userMap.get(String(userId));
        if (!user) {
          continue;
        }

        await winnerModel.updateOne(
          {
            drawId: draw._id,
            userId,
            matchCount,
          },
          {
            $set: {
              drawMonth: draw.drawMonth,
              drawType: draw.drawType,
              fullName: user.fullName || "",
              email: user.email || "",
              ticketNumbers: buildUserTicket(user),
              winningNumbers: draw.numbers || [],
              payoutAmount: calculatePayoutAmount(draw, matchCount, winnerCount),
              publishedAt: draw.publishedAt || null,
            },
            $setOnInsert: {
              proofScreenshotUrl: "",
              submissionNotes: "",
              submissionStatus: "not-submitted",
              submittedAt: null,
              eligibilityStatus: "pending",
              reviewNotes: "",
              reviewedAt: null,
              payoutStatus: "pending",
              paidAt: null,
            },
          },
          {
            upsert: true,
          }
        );
      }
    }
  }
}

module.exports = {
  syncWinnersFromPublishedDraws,
};
