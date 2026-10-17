
const path = require("path");
const fs = require("fs/promises");

const db = require("../config/db");

const AI_SERVICE_URL =
    process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";

function getUserId(req) {
    return req.session.user.id;
}

function getSkillList(analysis, field) {
    const skills = analysis?.[field];
    return Array.isArray(skills) ? skills : [];
}

function cleanSkillName(skill) {
    if (typeof skill === "string") {
        return skill.trim().slice(0, 150);
    }

    if (skill && typeof skill === "object") {
        return String(skill.skill || skill.name || skill.requirement || "")
            .trim()
            .slice(0, 150);
    }

    return "";
}

async function createAnalysis(req, res) {
    try {
        const userId = getUserId(req);
        const resumeId = Number(req.body.resumeId);
        const jobDescriptionId = Number(req.body.jobDescriptionId);

        if (
            !Number.isSafeInteger(resumeId) ||
            resumeId <= 0 ||
            !Number.isSafeInteger(jobDescriptionId) ||
            jobDescriptionId <= 0
        ) {
            return res.status(400).json({
                message: "Please select a valid resume and job description."
            });
        }

        // Verify that the resume belongs to the logged-in user.
        const [resumes] = await db.execute(
            `SELECT id, original_name, stored_name, mime_type
             FROM resumes
             WHERE id = ? AND user_id = ?
             LIMIT 1`,
            [resumeId, userId]
        );

        if (!resumes.length) {
            return res.status(404).json({
                message: "Resume not found."
            });
        }

        // Verify that the job description belongs to the logged-in user.
        const [jobs] = await db.execute(
            `SELECT id, title, company, description
             FROM job_descriptions
             WHERE id = ? AND user_id = ?
             LIMIT 1`,
            [jobDescriptionId, userId]
        );

        if (!jobs.length) {
            return res.status(404).json({
                message: "Job description not found."
            });
        }

        const resume = resumes[0];
        const job = jobs[0];

        const resumePath = path.join(
            __dirname,
            "..",
            "uploads",
            resume.stored_name
        );

        let resumeBuffer;

        try {
            resumeBuffer = await fs.readFile(resumePath);
        } catch (error) {
            console.error("Resume file could not be read:", error.code);
            return res.status(404).json({
                message: "The stored resume file could not be found."
            });
        }

        if (resumeBuffer.length > 10 * 1024 * 1024) {
            return res.status(400).json({
                message: "Resume must be 10 MB or smaller."
            });
        }

        // Send the resume and job description to the Python AI service.
        const form = new FormData();

        form.append(
            "resume",
            new Blob([resumeBuffer], {
                type: resume.mime_type || "application/pdf"
            }),
            resume.original_name
        );

        form.append("job_description", job.description);

        let aiResponse;

        try {
            aiResponse = await fetch(`${AI_SERVICE_URL}/analyze`, {
                method: "POST",
                body: form,
                signal: AbortSignal.timeout(180000)
            });
        } catch (error) {
            console.error("AI service request failed:", error.name);

            return res.status(502).json({
                message:
                    error.name === "TimeoutError"
                        ? "Analysis took too long. Please try again."
                        : "Could not connect to the AI service. Make sure it is running."
            });
        }

        const aiData = await aiResponse.json().catch(() => null);

        if (!aiResponse.ok) {
            console.error("AI service returned status:", aiResponse.status);

            return res.status(502).json({
                message:
                    aiData?.detail ||
                    "The AI service could not analyze this resume."
            });
        }

        if (
            !aiData?.candidate_profile ||
            !aiData?.job_profile ||
            !aiData?.ats_analysis
        ) {
            return res.status(502).json({
                message: "The AI service returned an incomplete analysis."
            });
        }

        const analysis = aiData.ats_analysis;
        const score = Number(analysis.overall_score);

        if (!Number.isFinite(score) || score < 0 || score > 100) {
            return res.status(502).json({
                message: "The AI service returned an invalid match score."
            });
        }

        const summary =
            `Overall match score: ${score}%. ` +
            `Required skill match: ${Number(analysis.required_skill_match_percentage) || 0}%. ` +
            `Preferred skill match: ${Number(analysis.preferred_skill_match_percentage) || 0}%.`;

        // Save the report and its skill lists together.
        const connection = await db.getConnection();

        let analysisId;

        try {
            await connection.beginTransaction();

            const [result] = await connection.execute(
                `INSERT INTO analyses
                    (user_id, resume_id, job_description_id,
                     match_score, summary, result_json)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    resumeId,
                    jobDescriptionId,
                    score,
                    summary,
                    JSON.stringify(aiData)
                ]
            );

            analysisId = result.insertId;

            const skillRows = [];

            for (const skill of getSkillList(
                analysis,
                "matched_required_skills"
            )) {
                const name = cleanSkillName(skill);
                if (name) skillRows.push([analysisId, name, "matched"]);
            }

            for (const skill of getSkillList(
                analysis,
                "matched_preferred_skills"
            )) {
                const name = cleanSkillName(skill);
                if (name) skillRows.push([analysisId, name, "matched"]);
            }

            for (const skill of getSkillList(
                analysis,
                "missing_required_skills"
            )) {
                const name = cleanSkillName(skill);
                if (name) skillRows.push([analysisId, name, "missing"]);
            }

            for (const skill of getSkillList(
                analysis,
                "missing_preferred_skills"
            )) {
                const name = cleanSkillName(skill);
                if (name) skillRows.push([analysisId, name, "missing"]);
            }

            for (const recommendation of getSkillList(
                analysis,
                "recommendations"
            )) {
                const name =
                    typeof recommendation === "string"
                        ? recommendation
                        : recommendation?.message;

                const cleaned = String(name || "").trim().slice(0, 150);

                if (cleaned) {
                    skillRows.push([
                        analysisId,
                        cleaned,
                        "recommended"
                    ]);
                }
            }

            if (skillRows.length) {
                await connection.query(
                    `INSERT INTO analysis_skills
                        (analysis_id, skill_name, skill_type)
                     VALUES ?`,
                    [skillRows]
                );
            }

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

        return res.status(201).json({
            id: analysisId,
            match_score: score,
            summary,
            result: aiData,
            created_at: new Date().toISOString(),
            resume_name: resume.original_name,
            job_title: job.title,
            company: job.company
        });
    } catch (error) {
        console.error("Create analysis failed:", error.message);

        if (!res.headersSent) {
            return res.status(500).json({
                message: "Could not save the analysis. Please try again."
            });
        }
    }
}

async function getAnalysisHistory(req, res) {
    try {
        const userId = getUserId(req);

        const [rows] = await db.execute(
            `SELECT
                a.id,
                a.match_score,
                a.summary,
                a.created_at,
                r.original_name AS resume_name,
                j.title AS job_title,
                j.company
             FROM analyses a
             INNER JOIN resumes r ON r.id = a.resume_id
             INNER JOIN job_descriptions j
                ON j.id = a.job_description_id
             WHERE a.user_id = ?
             ORDER BY a.created_at DESC, a.id DESC`,
            [userId]
        );

        return res.json({ analyses: rows });
    } catch (error) {
        console.error("Analysis history failed:", error.message);

        return res.status(500).json({
            message: "Could not load analysis history."
        });
    }
}

async function getAnalysisById(req, res) {
    try {
        const userId = getUserId(req);
        const analysisId = Number(req.params.id);

        if (!Number.isSafeInteger(analysisId) || analysisId <= 0) {
            return res.status(400).json({
                message: "Invalid analysis ID."
            });
        }

        const [rows] = await db.execute(
            `SELECT
                a.id,
                a.match_score,
                a.summary,
                a.result_json,
                a.created_at,
                r.original_name AS resume_name,
                j.title AS job_title,
                j.company
             FROM analyses a
             INNER JOIN resumes r ON r.id = a.resume_id
             INNER JOIN job_descriptions j
                ON j.id = a.job_description_id
             WHERE a.id = ? AND a.user_id = ?
             LIMIT 1`,
            [analysisId, userId]
        );

        if (!rows.length) {
            return res.status(404).json({
                message: "Analysis not found."
            });
        }

        const row = rows[0];
        let result;

        try {
            result = JSON.parse(row.result_json);
        } catch {
            return res.status(500).json({
                message: "The saved analysis report could not be read."
            });
        }

        return res.json({
            id: row.id,
            match_score: row.match_score,
            summary: row.summary,
            result,
            created_at: row.created_at,
            resume_name: row.resume_name,
            job_title: row.job_title,
            company: row.company
        });
    } catch (error) {
        console.error("Load analysis failed:", error.message);

        return res.status(500).json({
            message: "Could not load the analysis report."
        });
    }
}

module.exports = {
    createAnalysis,
    getAnalysisHistory,
    getAnalysisById
};
