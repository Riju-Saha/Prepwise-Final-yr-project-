
const express = require("express");

const { requireAuth } = require("../middleware/auth");

const {
    createAnalysis,
    getAnalysisHistory,
    getAnalysisById
} = require("../controllers/analysisController");

const router = express.Router();

// Every analysis endpoint requires an authenticated user.
router.use(requireAuth);

// Create and save a new resume analysis.
router.post("/", createAnalysis);

// Retrieve the logged-in user's analysis history.
router.get("/", getAnalysisHistory);

// Retrieve one saved analysis report.
router.get("/:id", getAnalysisById);

module.exports = router;
