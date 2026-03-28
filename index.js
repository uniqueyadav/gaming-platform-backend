require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const adminRoute = require("./routes/adminRoute");
const charityRoute = require("./routes/charityRoute");
const drawRoute = require("./routes/drawRoute");
const reportRoute = require("./routes/reportRoute");
const userRoute = require("./routes/userRoute");
const winnerRoute = require("./routes/winnerRoute");

const app = express();

const PORT = process.env.PORT || 8000;
const isProduction = process.env.NODE_ENV === "production";
const MONGO_URL = isProduction ?
    process.env.MONGO_URL_PROD || process.env.MONGO_URL :
    process.env.MONGO_URL_LOCAL || process.env.MONGO_URL;

const allowedOrigins = [
    process.env.CLIENT_URL,
    process.env.CLIENT_URL_2,
    "https://goltcharityplatform.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
].filter(Boolean);
app.use(cors({
    origin: "https://goltcharityplatform.vercel.app", // Aapka frontend URL
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));
app.use(express.json());

app.use(
    cors({
        origin: function(origin, callback) {
            // allows requests with no origin (like mobile apps or curl)
            if (!origin) return callback(null, true);

            if (allowedOrigins.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                callback(new Error("CORS policy block: This origin is not allowed"));
            }
        },
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true,
    })
);

app.get("/", (req, res) => {
    res.send("golf charity subscription platform Backend Running 🚀");
});

app.use("/api/admin", adminRoute);
app.use("/api/charities", charityRoute);
app.use("/api/draws", drawRoute);
app.use("/api/reports", reportRoute);
app.use("/api/users", userRoute);
app.use("/api/winners", winnerRoute);

mongoose
    .connect(MONGO_URL)
    .then(() => console.log("MongoDB Connected Successfully 👍"))
    .catch((err) => console.log("MongoDB Connection Error ❌", err));

app.listen(PORT, () => {
    console.log(`Server Running on Port: ${PORT} 🚀`);
});