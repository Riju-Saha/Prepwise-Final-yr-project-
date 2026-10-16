
const fs = require("fs");
const path = require("path");
const db = require("../config/db");

function getUserId(req) {
    return req.session.user.id;
}

async function getPreferences(userId) {
    const [rows] = await db.execute(
        `SELECT active_resume_id, active_job_description_id
         FROM user_document_preferences
         WHERE user_id = ?`,
        [userId]
    );

    return rows[0] || {
        active_resume_id: null,
        active_job_description_id: null
    };
}

async function savePreference(userId, column, documentId) {
    const allowedColumns = [
        "active_resume_id",
        "active_job_description_id"
    ];

    if (!allowedColumns.includes(column)) {
        throw new Error("Invalid document preference.");
    }

    const preferences = await getPreferences(userId);

    if (!preferences.active_resume_id &&
        !preferences.active_job_description_id) {
        await db.execute(
            `INSERT INTO user_document_preferences
             (user_id, ${column})
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE ${column} = VALUES(${column})`,
            [userId, documentId]
        );
    } else {
        await db.execute(
            `INSERT INTO user_document_preferences (user_id, ${column})
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE ${column} = VALUES(${column})`,
            [userId, documentId]
        );
    }
}

async function listDocuments(req, res) {
    try {
        const userId = getUserId(req);

        const [resumes] = await db.execute(
            `SELECT id, original_name, file_size, mime_type, created_at
             FROM resumes
             WHERE user_id = ?
             ORDER BY created_at DESC`,
            [userId]
        );

        const [jobDescriptions] = await db.execute(
            `SELECT id, title, company, description, created_at
             FROM job_descriptions
             WHERE user_id = ?
             ORDER BY created_at DESC`,
            [userId]
        );

        let preferences = await getPreferences(userId);

        // Choose the newest available document automatically on first use.
        if (!preferences.active_resume_id && resumes.length > 0) {
            await savePreference(userId, "active_resume_id", resumes[0].id);
            preferences = await getPreferences(userId);
        }

        if (!preferences.active_job_description_id &&
            jobDescriptions.length > 0) {
            await savePreference(
                userId,
                "active_job_description_id",
                jobDescriptions[0].id
            );
            preferences = await getPreferences(userId);
        }

        // Clear preferences that refer to documents no longer owned/available.
        const resumeIds = new Set(resumes.map((item) => Number(item.id)));
        const jobIds = new Set(
            jobDescriptions.map((item) => Number(item.id))
        );

        if (
            preferences.active_resume_id &&
            !resumeIds.has(Number(preferences.active_resume_id))
        ) {
            await db.execute(
                `UPDATE user_document_preferences
                 SET active_resume_id = NULL WHERE user_id = ?`,
                [userId]
            );
            preferences.active_resume_id = null;
        }

        if (
            preferences.active_job_description_id &&
            !jobIds.has(Number(preferences.active_job_description_id))
        ) {
            await db.execute(
                `UPDATE user_document_preferences
                 SET active_job_description_id = NULL WHERE user_id = ?`,
                [userId]
            );
            preferences.active_job_description_id = null;
        }

        res.json({
            resumes,
            jobDescriptions,
            activeResumeId: preferences.active_resume_id,
            activeJobDescriptionId:
                preferences.active_job_description_id
        });
    } catch (error) {
        console.error("List documents error:", error);
        res.status(500).json({
            message: "Could not load your documents."
        });
    }
}

async function uploadResume(req, res) {
    if (!req.file) {
        return res.status(400).json({
            message: "Please choose a resume file."
        });
    }

    try {
        const userId = getUserId(req);

        const [result] = await db.execute(
            `INSERT INTO resumes
             (user_id, original_name, stored_name, mime_type, file_size)
             VALUES (?, ?, ?, ?, ?)`,
            [
                userId,
                req.file.originalname,
                req.file.filename,
                req.file.mimetype,
                req.file.size
            ]
        );

        const preferences = await getPreferences(userId);

        if (!preferences.active_resume_id) {
            await savePreference(
                userId,
                "active_resume_id",
                result.insertId
            );
        }

        res.status(201).json({
            message: "Resume uploaded successfully.",
            resume: {
                id: result.insertId,
                original_name: req.file.originalname,
                file_size: req.file.size
            }
        });
    } catch (error) {
        fs.unlink(req.file.path, () => {});
        console.error("Resume upload error:", error);

        res.status(500).json({
            message: "Could not save your resume."
        });
    }
}

async function selectResume(req, res) {
    try {
        const userId = getUserId(req);
        const resumeId = Number(req.params.id);

        if (!Number.isInteger(resumeId) || resumeId <= 0) {
            return res.status(400).json({ message: "Invalid resume ID." });
        }

        const [rows] = await db.execute(
            "SELECT id FROM resumes WHERE id = ? AND user_id = ?",
            [resumeId, userId]
        );

        if (!rows.length) {
            return res.status(404).json({ message: "Resume not found." });
        }

        await savePreference(userId, "active_resume_id", resumeId);

        res.json({ message: "Active resume updated.", activeResumeId: resumeId });
    } catch (error) {
        console.error("Select resume error:", error);
        res.status(500).json({ message: "Could not select this resume." });
    }
}

async function viewResume(req, res) {
    try {
        const [rows] = await db.execute(
            `SELECT original_name, stored_name, mime_type
             FROM resumes WHERE id = ? AND user_id = ?`,
            [req.params.id, getUserId(req)]
        );

        if (!rows.length) {
            return res.status(404).json({ message: "Resume not found." });
        }

        const resume = rows[0];
        const filePath = path.join(__dirname, "..", "uploads", resume.stored_name);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                message: "The resume file is missing from the server."
            });
        }

        const extension = path.extname(resume.original_name).toLowerCase();
        const supportedInlineTypes = {
            ".pdf": "application/pdf",
            ".txt": "text/plain; charset=utf-8"
        };

        if (!supportedInlineTypes[extension]) {
            return res.status(415).json({
                message: "Browser preview supports PDF and TXT files. Download this DOCX resume to view it."
            });
        }

        res.setHeader("Content-Type", supportedInlineTypes[extension]);
        res.setHeader(
            "Content-Disposition",
            `inline; filename*=UTF-8''${encodeURIComponent(resume.original_name)}`
        );
        res.setHeader("X-Content-Type-Options", "nosniff");

        return res.sendFile(filePath);
    } catch (error) {
        console.error("Resume view error:", error);
        res.status(500).json({ message: "Could not open the resume." });
    }
}

async function downloadResume(req, res) {
    try {
        const [rows] = await db.execute(
            `SELECT original_name, stored_name
             FROM resumes WHERE id = ? AND user_id = ?`,
            [req.params.id, getUserId(req)]
        );

        if (!rows.length) {
            return res.status(404).json({ message: "Resume not found." });
        }

        const filePath = path.join(__dirname, "..", "uploads", rows[0].stored_name);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                message: "The resume file is missing from the server."
            });
        }

        return res.download(filePath, rows[0].original_name);
    } catch (error) {
        console.error("Resume download error:", error);
        res.status(500).json({ message: "Could not download the resume." });
    }
}

async function deleteResume(req, res) {
    try {
        const userId = getUserId(req);
        const resumeId = Number(req.params.id);

        const [rows] = await db.execute(
            `SELECT stored_name FROM resumes WHERE id = ? AND user_id = ?`,
            [resumeId, userId]
        );

        if (!rows.length) {
            return res.status(404).json({ message: "Resume not found." });
        }

        // Delete the database record first. If a foreign-key constraint
        // prevents deletion, the catch block reports the failure.
        await db.execute(
            "DELETE FROM resumes WHERE id = ? AND user_id = ?",
            [resumeId, userId]
        );

        await db.execute(
            `UPDATE user_document_preferences
             SET active_resume_id = NULL
             WHERE user_id = ? AND active_resume_id = ?`,
            [userId, resumeId]
        );

        const filePath = path.join(__dirname, "..", "uploads", rows[0].stored_name);

        if (fs.existsSync(filePath)) {
            fs.unlink(filePath, (error) => {
                if (error) console.error("Resume file cleanup error:", error);
            });
        }

        res.json({ message: "Resume deleted successfully." });
    } catch (error) {
        console.error("Delete resume error:", error);
        res.status(500).json({
            message: "Could not delete this resume. It may be linked to an existing analysis."
        });
    }
}

async function createJobDescription(req, res) {
    try {
        const userId = getUserId(req);
        const { title, company, description } = req.body;

        if (!title || !description) {
            return res.status(400).json({
                message: "Job title and description are required."
            });
        }

        const cleanTitle = String(title).trim();
        const cleanDescription = String(description).trim();
        const cleanCompany = company ? String(company).trim() : null;

        if (!cleanTitle || !cleanDescription) {
            return res.status(400).json({
                message: "Job title and description cannot be empty."
            });
        }

        const [result] = await db.execute(
            `INSERT INTO job_descriptions
             (user_id, title, company, description)
             VALUES (?, ?, ?, ?)`,
            [userId, cleanTitle, cleanCompany || null, cleanDescription]
        );

        const preferences = await getPreferences(userId);

        if (!preferences.active_job_description_id) {
            await savePreference(
                userId,
                "active_job_description_id",
                result.insertId
            );
        }

        res.status(201).json({
            message: "Job description saved successfully.",
            id: result.insertId
        });
    } catch (error) {
        console.error("Save job description error:", error);
        res.status(500).json({
            message: "Could not save the job description."
        });
    }
}

async function selectJobDescription(req, res) {
    try {
        const userId = getUserId(req);
        const jobId = Number(req.params.id);

        if (!Number.isInteger(jobId) || jobId <= 0) {
            return res.status(400).json({
                message: "Invalid job description ID."
            });
        }

        const [rows] = await db.execute(
            "SELECT id FROM job_descriptions WHERE id = ? AND user_id = ?",
            [jobId, userId]
        );

        if (!rows.length) {
            return res.status(404).json({
                message: "Job description not found."
            });
        }

        await savePreference(
            userId,
            "active_job_description_id",
            jobId
        );

        res.json({
            message: "Active job description updated.",
            activeJobDescriptionId: jobId
        });
    } catch (error) {
        console.error("Select job description error:", error);
        res.status(500).json({
            message: "Could not select this job description."
        });
    }
}

async function viewJobDescription(req, res) {
    try {
        const [rows] = await db.execute(
            `SELECT id, title, company, description, created_at
             FROM job_descriptions
             WHERE id = ? AND user_id = ?`,
            [req.params.id, getUserId(req)]
        );

        if (!rows.length) {
            return res.status(404).json({
                message: "Job description not found."
            });
        }

        res.json({ jobDescription: rows[0] });
    } catch (error) {
        console.error("View job description error:", error);
        res.status(500).json({
            message: "Could not open the job description."
        });
    }
}

async function downloadJobDescription(req, res) {
    try {
        const [rows] = await db.execute(
            `SELECT title, company, description
             FROM job_descriptions
             WHERE id = ? AND user_id = ?`,
            [req.params.id, getUserId(req)]
        );

        if (!rows.length) {
            return res.status(404).json({
                message: "Job description not found."
            });
        }

        const job = rows[0];
        const content = [
            `Job title: ${job.title}`,
            `Company: ${job.company || "Not specified"}`,
            "",
            job.description
        ].join("\n");

        const safeTitle = job.title
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
            .slice(0, 100) || "job-description";

        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${safeTitle}.txt"`
        );

        res.send(content);
    } catch (error) {
        console.error("Job description download error:", error);
        res.status(500).json({
            message: "Could not download the job description."
        });
    }
}

async function deleteJobDescription(req, res) {
    try {
        const userId = getUserId(req);
        const jobId = Number(req.params.id);

        const [result] = await db.execute(
            "DELETE FROM job_descriptions WHERE id = ? AND user_id = ?",
            [jobId, userId]
        );

        if (!result.affectedRows) {
            return res.status(404).json({
                message: "Job description not found."
            });
        }

        await db.execute(
            `UPDATE user_document_preferences
             SET active_job_description_id = NULL
             WHERE user_id = ? AND active_job_description_id = ?`,
            [userId, jobId]
        );

        res.json({ message: "Job description deleted successfully." });
    } catch (error) {
        console.error("Delete job description error:", error);
        res.status(500).json({
            message: "Could not delete this job description. It may be linked to an existing analysis."
        });
    }
}

module.exports = {
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
};
