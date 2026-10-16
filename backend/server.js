
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const session = require("express-session");

const db = require("./config/db");

const authRoutes = require("./routes/auth");
const documentRoutes = require("./routes/documents");

const app = express();
const PORT = Number(process.env.PORT || 5000);

app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true
}));

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    name: "prepwise.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false
        // No global maxAge:
        // login chooses browser-session or 30-day persistence.
    }
}));

app.get("/api/health", async (req, res) => {
    try {
        await db.query("SELECT 1");

        res.json({
            status: "ok",
            app: "PrepWise",
            database: "connected"
        });
    } catch (error) {
        console.error("Database health check failed:", error.message);

        res.status(500).json({
            status: "error",
            app: "PrepWise",
            database: "disconnected"
        });
    }
});

app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);

app.use((error, req, res, next) => {
    console.error("API error:", error.message || error);

    if (res.headersSent) {
        return next(error);
    }

    if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
            message: "File size must be 10 MB or less."
        });
    }

    return res.status(400).json({
        message: error.message || "The request could not be completed."
    });
});

app.listen(PORT, () => {
    console.log(`PrepWise API running at http://localhost:${PORT}`);
});
