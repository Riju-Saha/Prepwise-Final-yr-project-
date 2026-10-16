const express = require("express");

const { requireAuth } = require("../middleware/auth");
const upload = require("../middleware/upload");

const {
    listDocuments,
    uploadResume,
    selectResume,
    viewResume,
    downloadResume,
    deleteResume,
    createJobDescription,
    selectJobDescription,
    viewJobDescription,
    downloadJobDescription,
    deleteJobDescription
} = require("../controllers/documentController");

const router = express.Router();

router.use(requireAuth);

router.get("/", listDocuments);

// Resume actions
router.post("/resumes", upload.single("resume"), uploadResume);
router.get("/resumes/:id/view", viewResume);
router.get("/resumes/:id/download", downloadResume);
router.patch("/resumes/:id/select", selectResume);
router.delete("/resumes/:id", deleteResume);

// Job description actions
router.post("/job-descriptions", createJobDescription);
router.get("/job-descriptions/:id/view", viewJobDescription);
router.get("/job-descriptions/:id/download", downloadJobDescription);
router.patch("/job-descriptions/:id/select", selectJobDescription);
router.delete("/job-descriptions/:id", deleteJobDescription);

module.exports = router;