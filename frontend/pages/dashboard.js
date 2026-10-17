
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { API_URL, apiRequest } from "../config/api";
import ThemeToggle from "../components/ThemeToggle";

function formatBytes(bytes) {
    if (!bytes) return "0 KB";

    if (bytes < 1024 * 1024) {
        return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date) {
    if (!date) return "";

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
        return "";
    }

    return parsedDate.toLocaleDateString();
}

export default function Dashboard() {
    const router = useRouter();

    const [user, setUser] = useState(null);
    const [resumes, setResumes] = useState([]);
    const [jobs, setJobs] = useState([]);

    const [activeResumeId, setActiveResumeId] = useState(null);
    const [activeJobId, setActiveJobId] = useState(null);

    const [resumeFile, setResumeFile] = useState(null);
    const [title, setTitle] = useState("");
    const [company, setCompany] = useState("");
    const [description, setDescription] = useState("");

    const [preview, setPreview] = useState(null);

    const [analysisHistory, setAnalysisHistory] = useState([]);
    const [currentAnalysis, setCurrentAnalysis] = useState(null);
    const [analysisBusy, setAnalysisBusy] = useState(false);

    const [busy, setBusy] = useState(false);
    const [actionId, setActionId] = useState(null);
    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");

    async function loadDashboard() {
        try {
            const auth = await apiRequest("/auth/me");

            if (!auth.user) {
                await router.replace("/");
                return;
            }

            setUser(auth.user);

            const data = await apiRequest("/documents");

            setResumes(data.resumes || []);
            setJobs(data.jobDescriptions || []);

            setActiveResumeId(data.activeResumeId ?? null);
            setActiveJobId(data.activeJobDescriptionId ?? null);
            await loadAnalysisHistory();
        } catch (err) {
            setError(err.message || "Could not load your dashboard.");
        }
    }


    async function loadAnalysisHistory() {
        try {
            const data = await apiRequest("/analyses");
            setAnalysisHistory(data.analyses || []);
        } catch (err) {
            console.error("Could not load analysis history:", err.message);
        }
    }


    useEffect(() => {
        loadDashboard();
    }, []);

    useEffect(() => {
        return () => {
            if (preview?.url) {
                URL.revokeObjectURL(preview.url);
            }
        };
    }, [preview]);

    useEffect(() => {
        async function verifySession() {
            try {
                const response = await fetch(`${API_URL}/auth/me`, {
                    method: "GET",
                    credentials: "include",
                    cache: "no-store"
                });

                if (!response.ok) {
                    throw new Error("Session expired");
                }

                const data = await response.json();

                if (!data.user) {
                    router.replace("/");
                }
            } catch (error) {
                router.replace("/");
            }
        }

        // Recheck authentication when returning to a cached page.
        window.addEventListener("pageshow", verifySession);

        return () => {
            window.removeEventListener("pageshow", verifySession);
        };
    }, [router]);

    async function handleResumeUpload(event) {
        event.preventDefault();

        if (!resumeFile) {
            setError("Please choose a resume file.");
            return;
        }

        setBusy(true);
        setError("");
        setNotice("");

        try {
            const formData = new FormData();
            formData.append("resume", resumeFile);

            await apiRequest("/documents/resumes", {
                method: "POST",
                body: formData
            });

            setResumeFile(null);
            event.target.reset();

            setNotice("Resume uploaded successfully.");
            await loadDashboard();
        } catch (err) {
            setError(err.message || "Resume upload failed.");
        } finally {
            setBusy(false);
        }
    }

    async function handleJobSave(event) {
        event.preventDefault();

        setBusy(true);
        setError("");
        setNotice("");

        try {
            await apiRequest("/documents/job-descriptions", {
                method: "POST",
                body: JSON.stringify({
                    title,
                    company,
                    description
                })
            });

            setTitle("");
            setCompany("");
            setDescription("");

            setNotice("Job description saved successfully.");
            await loadDashboard();
        } catch (err) {
            setError(err.message || "Could not save the job description.");
        } finally {
            setBusy(false);
        }
    }

    async function handleSelectResume(id) {
        setError("");
        setNotice("");
        setActionId(`resume-${id}`);

        try {
            await apiRequest(`/documents/resumes/${id}/select`, {
                method: "PATCH"
            });

            setActiveResumeId(id);
            setNotice("Active resume updated.");
        } catch (err) {
            setError(err.message || "Could not select this resume.");
        } finally {
            setActionId(null);
        }
    }

    async function handleSelectJob(id) {
        setError("");
        setNotice("");
        setActionId(`job-${id}`);

        try {
            await apiRequest(`/documents/job-descriptions/${id}/select`, {
                method: "PATCH"
            });

            setActiveJobId(id);
            setNotice("Active job description updated.");
        } catch (err) {
            setError(err.message || "Could not select this job description.");
        } finally {
            setActionId(null);
        }
    }


    async function handleAnalyze() {
        if (!activeResumeId || !activeJobId) {
            setError("Please select both a resume and a job description.");
            return;
        }

        setAnalysisBusy(true);
        setError("");
        setNotice("");
        setCurrentAnalysis(null);

        try {
            const data = await apiRequest("/analyses", {
                method: "POST",
                body: JSON.stringify({
                    resumeId: activeResumeId,
                    jobDescriptionId: activeJobId
                })
            });

            setCurrentAnalysis(data);
            setNotice("Resume analysis completed and saved successfully.");

            await loadAnalysisHistory();
        } catch (err) {
            setError(err.message || "Resume analysis failed.");
        } finally {
            setAnalysisBusy(false);
        }
    }

    async function handleOpenAnalysis(id) {
        setError("");
        setNotice("");
        setActionId(`analysis-${id}`);

        try {
            const data = await apiRequest(`/analyses/${id}`);
            setCurrentAnalysis(data);
            document.getElementById("analysis-report")?.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        } catch (err) {
            setError(err.message || "Could not open this analysis report.");
        } finally {
            setActionId(null);
        }
    }


    async function handleDownload(id, filename) {
        setError("");
        setActionId(`download-resume-${id}`);

        try {
            const response = await fetch(
                `${API_URL}/documents/resumes/${id}/download`,
                { credentials: "include" }
            );

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));

                throw new Error(data.message || "Resume download failed.");
            }

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = objectUrl;
            link.download = filename || "resume";
            document.body.appendChild(link);
            link.click();
            link.remove();

            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        } catch (err) {
            setError(err.message || "Could not download the resume.");
        } finally {
            setActionId(null);
        }
    }

    async function handleDownloadJob(job) {
        setError("");
        setActionId(`download-job-${job.id}`);

        try {
            const response = await fetch(
                `${API_URL}/documents/job-descriptions/${job.id}/download`,
                { credentials: "include" }
            );

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));

                throw new Error(
                    data.message || "Job description download failed."
                );
            }

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = objectUrl;
            link.download = `${(job.title || "job-description")
                .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
                .slice(0, 100)}.txt`;

            document.body.appendChild(link);
            link.click();
            link.remove();

            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        } catch (err) {
            setError(err.message || "Could not download the job description.");
        } finally {
            setActionId(null);
        }
    }


    async function handleViewResume(resume) {
        setError("");

        // Open the tab immediately so browser popup blockers don't block it.
        const newTab = window.open("about:blank", "_blank");

        if (!newTab) {
            setError("Your browser blocked the new tab. Allow pop-ups and try again.");
            return;
        }

        newTab.opener = null;
        newTab.document.title = "Opening resume...";

        try {
            const response = await fetch(
                `${API_URL}/documents/resumes/${resume.id}/view`,
                { credentials: "include" }
            );

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.message || "Could not open the resume.");
            }

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);

            // Replace the temporary tab with the resume.
            newTab.location.href = objectUrl;

            // Keep the object URL alive while the PDF or text is displayed.
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
        } catch (err) {
            newTab.close();
            setError(err.message || "Could not open the resume.");
        }
    }


    function handleViewJob(job) {
        setPreview({
            type: "job",
            data: job
        });
    }

    function closePreview() {
        setPreview((current) => {
            if (current?.url) {
                URL.revokeObjectURL(current.url);
            }

            return null;
        });
    }

    async function handleDeleteResume(resume) {
        const confirmed = window.confirm(
            `Are you sure you want to permanently delete "${resume.original_name}"?`
        );

        if (!confirmed) return;

        setError("");
        setNotice("");
        setActionId(`delete-resume-${resume.id}`);

        try {
            const result = await apiRequest(
                `/documents/resumes/${resume.id}`,
                { method: "DELETE" }
            );

            if (Number(activeResumeId) === Number(resume.id)) {
                setActiveResumeId(null);
            }

            if (
                preview?.type === "resume" &&
                preview.name === resume.original_name
            ) {
                closePreview();
            }

            setNotice(result.message || "Resume deleted successfully.");
            await loadDashboard();
        } catch (err) {
            setError(err.message || "Could not delete this resume.");
        } finally {
            setActionId(null);
        }
    }

    async function handleDeleteJob(job) {
        const confirmed = window.confirm(
            `Are you sure you want to permanently delete "${job.title}"?`
        );

        if (!confirmed) return;

        setError("");
        setNotice("");
        setActionId(`delete-job-${job.id}`);

        try {
            const result = await apiRequest(
                `/documents/job-descriptions/${job.id}`,
                { method: "DELETE" }
            );

            if (Number(activeJobId) === Number(job.id)) {
                setActiveJobId(null);
            }

            if (
                preview?.type === "job" &&
                Number(preview.data.id) === Number(job.id)
            ) {
                closePreview();
            }

            setNotice(result.message || "Job description deleted successfully.");
            await loadDashboard();
        } catch (err) {
            setError(err.message || "Could not delete this job description.");
        } finally {
            setActionId(null);
        }
    }

    async function handleLogout() {
        try {
            await apiRequest("/auth/logout", {
                method: "POST"
            });
        } catch (err) {
            console.error("Logout error:", err);
        }

        await router.push("/");
    }

    const activeResume = resumes.find(
        (resume) => Number(resume.id) === Number(activeResumeId)
    );

    const activeJob = jobs.find(
        (job) => Number(job.id) === Number(activeJobId)
    );

    return (
        <main className="dashboard-page">
            <aside className="sidebar">
                <a className="brand" href="/">
                    PrepWise<span>.</span>
                </a>

                <div className="side-label">WORKSPACE</div>

                <a className="side-link active" href="#overview">
                    ▦ <span>Overview</span>
                </a>

                <a className="side-link" href="#resumes">
                    ▤ <span>My resumes</span>
                </a>

                <a className="side-link" href="#jobs">
                    ▧ <span>Job descriptions</span>
                </a>

                <div className="sidebar-bottom">
                    <div className="avatar">
                        {user?.name?.[0]?.toUpperCase() || "P"}
                    </div>

                    <div className="user-meta">
                        <b>{user?.name || "Loading..."}</b>
                        <small>{user?.email || ""}</small>
                    </div>

                    <button
                        type="button"
                        title="Log out"
                        className="logout-btn"
                        onClick={handleLogout}
                    >
                        ↗
                    </button>
                </div>
            </aside>

            <section className="workspace">
                <header className="workspace-header">
                    <div>
                        <p className="eyebrow">YOUR WORKSPACE</p>

                        <h1>
                            Good to see you
                            {user?.name
                                ? `, ${user.name.split(" ")[0]}`
                                : ""}.
                        </h1>

                        <p className="muted">
                            Manage your resumes and target the right roles.
                        </p>
                    </div>

                    <div className="header-actions">
                        <ThemeToggle />

                        <button
                            type="button"
                            className="outline-btn"
                            onClick={handleLogout}
                        >
                            Log out
                        </button>
                    </div>
                </header>

                {notice && (
                    <div className="notice" role="status">
                        {notice}
                    </div>
                )}

                {error && (
                    <div className="error-banner" role="alert">
                        {error}
                    </div>
                )}

                <div id="overview" className="stats-grid">
                    <div className="stat-card">
                        <span className="stat-symbol purple">▤</span>
                        <p>Saved resumes</p>
                        <strong>{resumes.length}</strong>
                        <small>PDF, DOCX, or TXT</small>
                    </div>

                    <div className="stat-card">
                        <span className="stat-symbol blue">▧</span>
                        <p>Job descriptions</p>
                        <strong>{jobs.length}</strong>
                        <small>Roles you are targeting</small>
                    </div>


                    <div className="stat-card">
                        <span className="stat-symbol green">✦</span>
                        <p>Analysis reports</p>
                        <strong>{analysisHistory.length}</strong>
                        <small>Saved ATS reports</small>
                    </div>

                </div>

                <section className="panel selection-panel">
                    <div className="panel-heading">
                        <div>
                            <h2>Your selected documents</h2>
                            <p>
                                These selections will be used for your next
                                resume analysis.
                            </p>
                        </div>
                    </div>

                    <div className="section-grid">
                        <div className="selected-document">
                            <small>ACTIVE RESUME</small>
                            <b>
                                {activeResume?.original_name ||
                                    "No resume selected"}
                            </b>
                            <p>
                                {activeResume
                                    ? `Uploaded ${formatDate(activeResume.created_at)}`
                                    : "Upload a resume and select it below."}
                            </p>
                        </div>

                        <div className="selected-document">
                            <small>ACTIVE JOB DESCRIPTION</small>
                            <b>{activeJob?.title || "No job selected"}</b>
                            <p>
                                {activeJob
                                    ? activeJob.company ||
                                    "Company not specified"
                                    : "Save a job description and select it below."}
                            </p>
                        </div>
                    </div>


                    <div className="analysis-action">
                        <p className="dashboard-footnote">
                            Analyze your selected resume against your selected job description.
                        </p>

                        <button
                            type="button"
                            className="primary-btn"
                            onClick={handleAnalyze}
                            disabled={
                                analysisBusy ||
                                !activeResume ||
                                !activeJob
                            }
                        >
                            {analysisBusy ? "Analyzing resume..." : "✦ Analyze Resume"}
                        </button>

                        {(!activeResume || !activeJob) && (
                            <small>
                                Select both a resume and a job description to continue.
                            </small>
                        )}
                    </div>

                </section>

                <div className="section-grid">
                    {/* RESUMES */}
                    <section id="resumes" className="panel">
                        <div className="panel-heading">
                            <div>
                                <h2>Your resumes</h2>
                                <p>
                                    Keep multiple versions and choose which
                                    one to use.
                                </p>
                            </div>

                            <span className="panel-count">
                                {resumes.length}
                            </span>
                        </div>

                        <form
                            className="upload-area"
                            onSubmit={handleResumeUpload}
                        >
                            <div className="upload-icon">↑</div>

                            <b>Upload a resume</b>

                            <p>
                                PDF, DOCX, or TXT · Maximum 10 MB
                            </p>

                            <input
                                type="file"
                                accept=".pdf,.docx,.txt"
                                required
                                onChange={(event) =>
                                    setResumeFile(
                                        event.target.files?.[0] || null
                                    )
                                }
                            />

                            {resumeFile && (
                                <small className="selected-file">
                                    {resumeFile.name}
                                </small>
                            )}

                            <button
                                className="primary-btn"
                                type="submit"
                                disabled={busy}
                            >
                                {busy ? "Uploading..." : "Upload resume"}
                            </button>
                        </form>

                        <div className="document-list">
                            {resumes.length === 0 ? (
                                <p className="empty-state">
                                    No resumes uploaded yet.
                                </p>
                            ) : (
                                resumes.map((resume) => {
                                    const isActive =
                                        Number(activeResumeId) ===
                                        Number(resume.id);

                                    return (
                                        <article
                                            className="job-item managed-item"
                                            key={resume.id}
                                        >
                                            <div className="managed-item-title">
                                                <div className="file-badge">
                                                    CV
                                                </div>

                                                <div className="document-info">
                                                    <b>{resume.original_name}</b>

                                                    <small>
                                                        {formatBytes(resume.file_size)}
                                                        {" · "}
                                                        {formatDate(resume.created_at)}
                                                    </small>
                                                </div>
                                            </div>

                                            {isActive && (
                                                <span className="active-document-label">
                                                    ✓ Active resume
                                                </span>
                                            )}

                                            <div className="document-actions">
                                                <button
                                                    type="button"
                                                    className="small-action-btn"
                                                    disabled={
                                                        isActive ||
                                                        actionId ===
                                                        `resume-${resume.id}`
                                                    }
                                                    onClick={() =>
                                                        handleSelectResume(resume.id)
                                                    }
                                                >
                                                    {isActive
                                                        ? "Selected"
                                                        : "Use this"}
                                                </button>

                                                <button
                                                    type="button"
                                                    className="small-action-btn"
                                                    disabled={
                                                        actionId ===
                                                        `view-resume-${resume.id}`
                                                    }
                                                    onClick={() =>
                                                        handleViewResume(resume)
                                                    }
                                                >
                                                    {actionId ===
                                                        `view-resume-${resume.id}`
                                                        ? "Opening..."
                                                        : "View"}
                                                </button>

                                                <button
                                                    type="button"
                                                    className="small-action-btn"
                                                    disabled={
                                                        actionId ===
                                                        `download-resume-${resume.id}`
                                                    }
                                                    onClick={() =>
                                                        handleDownload(
                                                            resume.id,
                                                            resume.original_name
                                                        )
                                                    }
                                                >
                                                    Download
                                                </button>

                                                <button
                                                    type="button"
                                                    className="small-action-btn delete-action"
                                                    disabled={
                                                        actionId ===
                                                        `delete-resume-${resume.id}`
                                                    }
                                                    onClick={() =>
                                                        handleDeleteResume(resume)
                                                    }
                                                >
                                                    {actionId ===
                                                        `delete-resume-${resume.id}`
                                                        ? "Deleting..."
                                                        : "Delete"}
                                                </button>
                                            </div>
                                        </article>
                                    );
                                })
                            )}
                        </div>
                    </section>

                    {/* JOB DESCRIPTIONS */}
                    <section id="jobs" className="panel">
                        <div className="panel-heading">
                            <div>
                                <h2>Job descriptions</h2>
                                <p>
                                    Save different roles and choose a target
                                    job.
                                </p>
                            </div>

                            <span className="panel-count">
                                {jobs.length}
                            </span>
                        </div>

                        <form
                            className="job-form"
                            onSubmit={handleJobSave}
                        >
                            <label>
                                Job title

                                <input
                                    value={title}
                                    onChange={(event) =>
                                        setTitle(event.target.value)
                                    }
                                    placeholder="e.g. Software Engineer"
                                    required
                                />
                            </label>

                            <label>
                                Company{" "}
                                <span className="optional">
                                    (optional)
                                </span>

                                <input
                                    value={company}
                                    onChange={(event) =>
                                        setCompany(event.target.value)
                                    }
                                    placeholder="e.g. Infosys"
                                />
                            </label>

                            <label>
                                Job description

                                <textarea
                                    value={description}
                                    onChange={(event) =>
                                        setDescription(event.target.value)
                                    }
                                    rows={5}
                                    placeholder="Paste the job responsibilities and requirements..."
                                    required
                                />
                            </label>

                            <button
                                className="primary-btn"
                                type="submit"
                                disabled={busy}
                            >
                                {busy
                                    ? "Saving..."
                                    : "Save job description"}

                                <span>→</span>
                            </button>
                        </form>

                        <div className="document-list">
                            {jobs.length === 0 ? (
                                <p className="empty-state">
                                    No job descriptions saved yet.
                                </p>
                            ) : (
                                jobs.map((job) => {
                                    const isActive =
                                        Number(activeJobId) ===
                                        Number(job.id);

                                    return (
                                        <article
                                            className="job-item managed-item"
                                            key={job.id}
                                        >
                                            <b>{job.title}</b>

                                            <small>
                                                {job.company ||
                                                    "Company not specified"}
                                                {" · "}
                                                {formatDate(job.created_at)}
                                            </small>

                                            {isActive && (
                                                <span className="active-document-label">
                                                    ✓ Active job description
                                                </span>
                                            )}

                                            <p className="job-description-snippet">
                                                {job.description.length > 180
                                                    ? `${job.description.slice(0, 180)}…`
                                                    : job.description}
                                            </p>

                                            <div className="document-actions">
                                                <button
                                                    type="button"
                                                    className="small-action-btn"
                                                    disabled={
                                                        isActive ||
                                                        actionId ===
                                                        `job-${job.id}`
                                                    }
                                                    onClick={() =>
                                                        handleSelectJob(job.id)
                                                    }
                                                >
                                                    {isActive
                                                        ? "Selected"
                                                        : "Use this"}
                                                </button>

                                                <button
                                                    type="button"
                                                    className="small-action-btn"
                                                    onClick={() =>
                                                        handleViewJob(job)
                                                    }
                                                >
                                                    View
                                                </button>

                                                <button
                                                    type="button"
                                                    className="small-action-btn"
                                                    disabled={
                                                        actionId ===
                                                        `download-job-${job.id}`
                                                    }
                                                    onClick={() =>
                                                        handleDownloadJob(job)
                                                    }
                                                >
                                                    Download
                                                </button>

                                                <button
                                                    type="button"
                                                    className="small-action-btn delete-action"
                                                    disabled={
                                                        actionId ===
                                                        `delete-job-${job.id}`
                                                    }
                                                    onClick={() =>
                                                        handleDeleteJob(job)
                                                    }
                                                >
                                                    {actionId ===
                                                        `delete-job-${job.id}`
                                                        ? "Deleting..."
                                                        : "Delete"}
                                                </button>
                                            </div>
                                        </article>
                                    );
                                })
                            )}
                        </div>
                    </section>
                </div>

                {/* CURRENT ATS REPORT */}
                {currentAnalysis && (
                    <section id="analysis-report" className="panel analysis-panel">
                        <div className="panel-heading">
                            <div>
                                <p className="eyebrow">AI-POWERED RESUME REVIEW</p>
                                <h2>ATS Analysis Report</h2>
                                <p>
                                    {currentAnalysis.resume_name || "Selected resume"}
                                    {" · "}
                                    {currentAnalysis.job_title || "Selected job"}
                                </p>
                            </div>

                            <button
                                type="button"
                                className="small-action-btn"
                                onClick={() => setCurrentAnalysis(null)}
                            >
                                Close report
                            </button>
                        </div>

                        {(() => {
                            const report = currentAnalysis.result?.ats_analysis || {};
                            const score = Number(
                                currentAnalysis.match_score ?? report.overall_score ?? 0
                            );

                            return (
                                <>
                                    <div className="analysis-score">
                                        <div>
                                            <small>OVERALL MATCH SCORE</small>
                                            <strong>{score.toFixed(1)}%</strong>
                                            <p>Resume-to-job compatibility</p>
                                        </div>
                                    </div>

                                    <div className="section-grid analysis-metrics">
                                        <div className="selected-document">
                                            <small>REQUIRED SKILL MATCH</small>
                                            <b>
                                                {Number(
                                                    report.required_skill_match_percentage || 0
                                                ).toFixed(1)}%
                                            </b>
                                        </div>

                                        <div className="selected-document">
                                            <small>PREFERRED SKILL MATCH</small>
                                            <b>
                                                {Number(
                                                    report.preferred_skill_match_percentage || 0
                                                ).toFixed(1)}%
                                            </b>
                                        </div>
                                    </div>

                                    <div className="section-grid analysis-details">
                                        <div>
                                            <h3>Matched required skills</h3>
                                            {report.matched_required_skills?.length ? (
                                                <ul className="analysis-skill-list">
                                                    {report.matched_required_skills.map(
                                                        (skill, index) => (
                                                            <li key={`${skill}-${index}`}>
                                                                ✓ {skill}
                                                            </li>
                                                        )
                                                    )}
                                                </ul>
                                            ) : (
                                                <p className="muted">No matched skills listed.</p>
                                            )}
                                        </div>

                                        <div>
                                            <h3>Missing required skills</h3>
                                            {report.missing_required_skills?.length ? (
                                                <ul className="analysis-skill-list">
                                                    {report.missing_required_skills.map(
                                                        (skill, index) => (
                                                            <li key={`${skill}-${index}`}>
                                                                • {skill}
                                                            </li>
                                                        )
                                                    )}
                                                </ul>
                                            ) : (
                                                <p className="muted">
                                                    No missing required skills identified.
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {report.partial_required_skills?.length > 0 && (
                                        <div className="analysis-subsection">
                                            <h3>Partially matched skills</h3>
                                            <ul className="analysis-skill-list">
                                                {report.partial_required_skills.map(
                                                    (skill, index) => (
                                                        <li key={`${skill}-${index}`}>
                                                            ◐ {skill}
                                                        </li>
                                                    )
                                                )}
                                            </ul>
                                        </div>
                                    )}

                                    <div className="analysis-subsection">
                                        <h3>AI recommendations</h3>

                                        {report.recommendations?.length ? (
                                            report.recommendations.map((item, index) => (
                                                <article
                                                    className="analysis-recommendation"
                                                    key={index}
                                                >
                                                    <b>
                                                        {item.priority
                                                            ? `${item.priority.toUpperCase()} PRIORITY`
                                                            : "RECOMMENDATION"}
                                                    </b>
                                                    <p>{item.message || String(item)}</p>
                                                </article>
                                            ))
                                        ) : (
                                            <p className="muted">
                                                No recommendations were returned.
                                            </p>
                                        )}
                                    </div>

                                    {report.matched_preferred_skills?.length > 0 && (
                                        <div className="analysis-subsection">
                                            <h3>Matched preferred skills</h3>
                                            <ul className="analysis-skill-list">
                                                {report.matched_preferred_skills.map(
                                                    (skill, index) => (
                                                        <li key={`${skill}-${index}`}>
                                                            ✓ {skill}
                                                        </li>
                                                    )
                                                )}
                                            </ul>
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                    </section>
                )}

                {/* SAVED ANALYSIS HISTORY */}
                <section className="panel analysis-panel">
                    <div className="panel-heading">
                        <div>
                            <h2>Analysis history</h2>
                            <p>Reopen reports from your previous resume analyses.</p>
                        </div>

                        <span className="panel-count">{analysisHistory.length}</span>
                    </div>

                    {analysisHistory.length === 0 ? (
                        <p className="empty-state">
                            No saved reports yet. Select your documents and run your first analysis.
                        </p>
                    ) : (
                        <div className="document-list">
                            {analysisHistory.map((item) => (
                                <article className="job-item managed-item" key={item.id}>
                                    <div className="managed-item-title">
                                        <div className="file-badge">AI</div>

                                        <div className="document-info">
                                            <b>{item.job_title || "Job analysis"}</b>
                                            <small>
                                                {item.resume_name || "Resume"}
                                                {" · "}
                                                {formatDate(item.created_at)}
                                            </small>
                                        </div>
                                    </div>

                                    <div className="analysis-history-score">
                                        {Number(item.match_score || 0).toFixed(1)}%
                                    </div>

                                    <p className="job-description-snippet">
                                        {item.company || "Company not specified"}
                                    </p>

                                    <button
                                        type="button"
                                        className="small-action-btn"
                                        disabled={actionId === `analysis-${item.id}`}
                                        onClick={() => handleOpenAnalysis(item.id)}
                                    >
                                        {actionId === `analysis-${item.id}`
                                            ? "Opening..."
                                            : "View report"}
                                    </button>
                                </article>
                            ))}
                        </div>
                    )}
                </section>


                <p className="dashboard-footnote">
                    PrepWise · Resume management and job targeting workspace.
                </p>
            </section>

            {/* DOCUMENT PREVIEW MODAL */}
            {preview && (
                <div
                    className="preview-backdrop"
                    onClick={(event) => {
                        if (event.target === event.currentTarget) {
                            closePreview();
                        }
                    }}
                >
                    <section
                        className="preview-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-label={
                            preview.type === "job"
                                ? "Job description preview"
                                : "Resume preview"
                        }
                    >
                        <div className="preview-header">
                            <div>
                                <b>
                                    {preview.type === "job"
                                        ? preview.data.title
                                        : preview.name}
                                </b>

                                {preview.type === "job" && (
                                    <p>
                                        {preview.data.company ||
                                            "Company not specified"}
                                    </p>
                                )}
                            </div>

                            <button
                                type="button"
                                className="small-action-btn"
                                onClick={closePreview}
                            >
                                Close ✕
                            </button>
                        </div>

                        {preview.type === "job" ? (
                            <div className="job-preview-content">
                                <h3>Job description</h3>
                                <p>{preview.data.description}</p>
                            </div>
                        ) : (
                            <iframe
                                className="resume-preview-frame"
                                src={preview.url}
                                title={`Preview of ${preview.name}`}
                            />
                        )}
                    </section>
                </div>
            )}
        </main>
    );
}
