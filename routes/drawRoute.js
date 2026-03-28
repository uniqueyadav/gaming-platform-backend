const express = require("express");
const mongoose = require("mongoose");
const drawModel = require("../models/drawModel");
const userModel = require("../models/userModel");
const { syncWinnersFromPublishedDraws } = require("../utils/winnerSync");

const drawRoute = express.Router();

const DRAW_TYPES = {
  "5-number-match": 5,
  "4-number-match": 4,
  "3-number-match": 3,
};

const NUMBER_RANGE = { min: 1, max: 99 };
const BASE_JACKPOT = 100000;

function formatDrawMonth(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function getScheduledDate(drawMonth) {
  return new Date(`${drawMonth}-01T00:00:00.000Z`);
}

function clampNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return NUMBER_RANGE.min;
  }

  return Math.max(
    NUMBER_RANGE.min,
    Math.min(NUMBER_RANGE.max, Math.round(parsed))
  );
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

function hashSeed(text = "") {
  return text.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
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

  const ticket = uniqueNumbers(candidateNumbers, DRAW_TYPES["5-number-match"]);

  while (ticket.length < DRAW_TYPES["5-number-match"]) {
    const nextValue = clampNumber(fallbackSeed + ticket.length * 11);
    if (!ticket.includes(nextValue)) {
      ticket.push(nextValue);
    }
  }

  return ticket;
}

function buildRawScoreFrequency(users = []) {
  const frequency = new Map();

  (Array.isArray(users) ? users : []).forEach((user) => {
    (user.golfScores || []).forEach((entry) => {
      const score = Number(entry.score) || 0;
      if (score > 0) {
        const normalized = clampNumber(score);
        frequency.set(normalized, (frequency.get(normalized) || 0) + 1);
      }
    });
  });

  return frequency;
}

function generateRandomNumbers(size) {
  const values = [];
  while (values.length < size) {
    const candidate =
      Math.floor(Math.random() * (NUMBER_RANGE.max - NUMBER_RANGE.min + 1)) +
      NUMBER_RANGE.min;

    if (!values.includes(candidate)) {
      values.push(candidate);
    }
  }

  return values.sort((a, b) => a - b);
}

function generateAlgorithmicNumbers(users, size) {
  const frequency = [...buildRawScoreFrequency(users).entries()].sort((a, b) => {
    if (b[1] === a[1]) {
      return a[0] - b[0];
    }

    return b[1] - a[1];
  });

  const numbers = [];
  const mostFrequent = frequency.slice(0, Math.min(3, frequency.length)).map(([score]) => score);
  const leastFrequent = [...frequency]
    .reverse()
    .slice(0, Math.min(2, frequency.length))
    .map(([score]) => score);

  [...mostFrequent, ...leastFrequent].forEach((score) => {
    if (!numbers.includes(score) && numbers.length < size) {
      numbers.push(score);
    }
  });

  const ticketPool = users.flatMap((user) => buildUserTicket(user));
  for (const score of ticketPool) {
    if (!numbers.includes(score) && numbers.length < size) {
      numbers.push(score);
    }
  }

  while (numbers.length < size) {
    const seed = frequency.length ? frequency[numbers.length % frequency.length][0] : 12;
    const candidate = clampNumber(seed + numbers.length * 9);
    if (!numbers.includes(candidate)) {
      numbers.push(candidate);
    }
  }

  return numbers.sort((a, b) => a - b);
}

function evaluateWinners(users, numbers) {
  const numberSet = new Set(numbers);
  const winnersByMatch = {
    5: [],
    4: [],
    3: [],
  };

  users.forEach((user) => {
    const ticket = buildUserTicket(user);
    const matches = ticket.filter((value) => numberSet.has(value)).length;

    if (matches >= 5) {
      winnersByMatch[5].push(user._id);
    } else if (matches === 4) {
      winnersByMatch[4].push(user._id);
    } else if (matches === 3) {
      winnersByMatch[3].push(user._id);
    }
  });

  return [5, 4, 3].map((matchCount) => ({
    matchCount,
    winners: winnersByMatch[matchCount].length,
    userIds: winnersByMatch[matchCount],
  }));
}

function summarizeDistribution(runs) {
  const distribution = { fiveMatch: 0, fourMatch: 0, threeMatch: 0 };

  runs.forEach((run) => {
    const fiveMatchBucket = run.previewWinners.find((bucket) => bucket.matchCount === 5);
    const fourMatchBucket = run.previewWinners.find((bucket) => bucket.matchCount === 4);
    const threeMatchBucket = run.previewWinners.find((bucket) => bucket.matchCount === 3);

    if (fiveMatchBucket?.winners) {
      distribution.fiveMatch += 1;
    }
    if (fourMatchBucket?.winners) {
      distribution.fourMatch += 1;
    }
    if (threeMatchBucket?.winners) {
      distribution.threeMatch += 1;
    }
  });

  return distribution;
}

function buildSimulation(users, logicType, requestedRuns, drawType) {
  const size = DRAW_TYPES[drawType] || DRAW_TYPES["5-number-match"];
  const runs = [];
  const trendingCounts = new Map();

  for (let index = 0; index < requestedRuns; index += 1) {
    const numbers =
      logicType === "algorithmic"
        ? generateAlgorithmicNumbers(users, size)
        : generateRandomNumbers(size);
    const previewWinners = evaluateWinners(users, numbers);

    numbers.forEach((number) => {
      trendingCounts.set(number, (trendingCounts.get(number) || 0) + 1);
    });

    runs.push({
      numbers,
      previewWinners,
    });
  }

  const primaryRun = runs[0] || {
    numbers: [],
    previewWinners: [],
  };

  const topTrendingNumbers = [...trendingCounts.entries()]
    .sort((a, b) => {
      if (b[1] === a[1]) {
        return a[0] - b[0];
      }

      return b[1] - a[1];
    })
    .slice(0, size)
    .map(([number]) => number);

  return {
    requestedRuns,
    generatedAt: new Date(),
    numbers: primaryRun.numbers,
    previewWinners: primaryRun.previewWinners,
    distribution: summarizeDistribution(runs),
    topTrendingNumbers,
  };
}

async function getPreviousPublishedDraw(drawMonth) {
  return drawModel
    .findOne({
      drawMonth: { $lt: drawMonth },
      status: "published",
    })
    .sort({ drawMonth: -1 });
}

async function ensureCurrentDraw(drawMonth = formatDrawMonth()) {
  let draw = await drawModel.findOne({ drawMonth });
  if (draw) {
    return draw;
  }

  const previousDraw = await getPreviousPublishedDraw(drawMonth);
  const rolloverCarry =
    previousDraw && !previousDraw.winners.find((bucket) => bucket.matchCount === 5)?.winners
      ? previousDraw.jackpotAmount
      : 0;

  draw = await drawModel.create({
    drawMonth,
    scheduledFor: getScheduledDate(drawMonth),
    drawType: "5-number-match",
    logicType: "random",
    jackpotBase: BASE_JACKPOT,
    jackpotAmount: BASE_JACKPOT + rolloverCarry,
    rolloverAmount: rolloverCarry,
    numberRange: NUMBER_RANGE,
  });

  return draw;
}

function serializeDraw(draw) {
  if (!draw) {
    return null;
  }

  return {
    _id: draw._id,
    drawMonth: draw.drawMonth,
    cadence: draw.cadence,
    drawType: draw.drawType,
    logicType: draw.logicType,
    status: draw.status,
    scheduledFor: draw.scheduledFor,
    publishedAt: draw.publishedAt,
    numbers: draw.numbers,
    jackpotBase: draw.jackpotBase,
    jackpotAmount: draw.jackpotAmount,
    rolloverAmount: draw.rolloverAmount,
    lastSimulation: draw.lastSimulation,
    winners: draw.winners,
    participantCount: draw.participantCount,
    notes: draw.notes,
  };
}

drawRoute.get("/", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ msg: "Database is not connected" });
    }

    const drawMonth = req.query.drawMonth || formatDrawMonth();
    const [currentDraw, history, users] = await Promise.all([
      ensureCurrentDraw(drawMonth),
      drawModel.find().sort({ drawMonth: -1 }).limit(6).lean(),
      userModel.find().lean(),
    ]);

    const tickets = users.map((user) => ({
      userId: user._id,
      fullName: user.fullName,
      ticketNumbers: buildUserTicket(user),
    }));

    res.json({
      msg: "Success",
      value: {
        currentDraw: serializeDraw(currentDraw),
        history: history.map(serializeDraw),
        tickets,
        metrics: {
          totalParticipants: users.length,
          publishedDraws: history.filter((draw) => draw.status === "published").length,
          algorithmReady: users.some((user) => (user.golfScores || []).length > 0),
          nextScheduledDate: currentDraw.scheduledFor,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

drawRoute.post("/simulate", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ msg: "Database is not connected" });
    }

    const drawMonth = req.body.drawMonth || formatDrawMonth();
    const requestedRuns = Math.min(Math.max(Number(req.body.requestedRuns) || 1, 1), 24);
    const draw = await ensureCurrentDraw(drawMonth);
    const users = await userModel.find();

    const logicType = req.body.logicType || draw.logicType || "random";
    const drawType = req.body.drawType || draw.drawType || "5-number-match";
    const simulation = buildSimulation(users, logicType, requestedRuns, drawType);

    draw.logicType = logicType;
    draw.drawType = drawType;
    draw.lastSimulation = simulation;
    draw.status = "simulated";
    draw.participantCount = users.length;
    draw.notes = req.body.notes || draw.notes;
    await draw.save();

    res.json({
      msg: "Success",
      value: {
        currentDraw: serializeDraw(draw),
        ticketPreview: users.slice(0, 5).map((user) => ({
          fullName: user.fullName,
          numbers: buildUserTicket(user),
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

drawRoute.post("/publish", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ msg: "Database is not connected" });
    }

    const drawMonth = req.body.drawMonth || formatDrawMonth();
    const draw = await ensureCurrentDraw(drawMonth);
    const users = await userModel.find();

    const drawType = req.body.drawType || draw.drawType || "5-number-match";
    const logicType = req.body.logicType || draw.logicType || "random";
    const simulation =
      req.body.useSimulation !== false && draw.lastSimulation
        ? draw.lastSimulation
        : buildSimulation(users, logicType, 1, drawType);

    const numbers = simulation.numbers || [];
    const winners = evaluateWinners(users, numbers);
    const fiveMatchBucket = winners.find((bucket) => bucket.matchCount === 5);
    const jackpotAmount = draw.jackpotBase + (draw.rolloverAmount || 0);
    const nextRollover = fiveMatchBucket?.winners ? 0 : jackpotAmount;

    draw.logicType = logicType;
    draw.drawType = drawType;
    draw.numbers = numbers;
    draw.status = "published";
    draw.publishedAt = new Date();
    draw.participantCount = users.length;
    draw.winners = winners;
    draw.jackpotAmount = jackpotAmount;
    draw.notes = req.body.notes || draw.notes;
    await draw.save();
    await syncWinnersFromPublishedDraws();

    const nextMonth = new Date(`${drawMonth}-01T00:00:00.000Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const nextDrawMonth = formatDrawMonth(nextMonth);
    const existingNextDraw = await drawModel.findOne({ drawMonth: nextDrawMonth });

    if (!existingNextDraw) {
      await drawModel.create({
        drawMonth: nextDrawMonth,
        scheduledFor: getScheduledDate(nextDrawMonth),
        drawType: "5-number-match",
        logicType: "random",
        jackpotBase: BASE_JACKPOT,
        jackpotAmount: BASE_JACKPOT + nextRollover,
        rolloverAmount: nextRollover,
        numberRange: NUMBER_RANGE,
        status: "draft",
      });
    }

    res.json({
      msg: "Success",
      value: {
        currentDraw: serializeDraw(draw),
        announcement: fiveMatchBucket?.winners
          ? "5-number match winner found. Jackpot reset for next month."
          : "No 5-number match winner. Jackpot rolled over to next month.",
      },
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

module.exports = drawRoute;
