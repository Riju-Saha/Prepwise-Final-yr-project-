
import io
import logging
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pypdf import PdfReader
from docx import Document

from src.agents.resume_agent import ResumeIntelligenceAgent
from src.agents.jd_agent import JobDescriptionAgent
from src.agents.ats_agent import ATSAgent

# Load the AI service's own .env file.
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("prepwise-ai")

app = FastAPI(
    title="PrepWise AI Service",
    version="1.0.0",
)


def extract_resume_text(filename: str, content: bytes) -> str:
    """Extract text from a PDF, DOCX, or TXT resume."""
    extension = Path(filename).suffix.lower()

    try:
        if extension == ".pdf":
            reader = PdfReader(io.BytesIO(content))
            text = "\n".join(
                page.extract_text() or ""
                for page in reader.pages
            )

        elif extension == ".docx":
            document = Document(io.BytesIO(content))
            paragraphs = [
                paragraph.text.strip()
                for paragraph in document.paragraphs
                if paragraph.text.strip()
            ]
            text = "\n".join(paragraphs)

        elif extension == ".txt":
            text = content.decode("utf-8-sig")

        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported resume format. Use PDF, DOCX, or TXT.",
            )

    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Resume text extraction failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=400,
            detail="Could not read the resume. Please check the file format.",
        ) from exc

    if not text.strip():
        raise HTTPException(
            status_code=400,
            detail=(
                "No readable text was found in the resume. "
                "If it is a scanned PDF, use a text-based PDF or DOCX."
            ),
        )

    return text.strip()


@app.get("/health")
def health():
    return {"status": "ok", "service": "PrepWise AI"}


@app.post("/analyze")
def analyze_resume(
    resume: UploadFile = File(...),
    job_description: str = Form(...),
):
    """Run the existing resume, job-description, and ATS agents."""
    filename = resume.filename or "resume.pdf"
    extension = Path(filename).suffix.lower()

    if extension not in {".pdf", ".docx", ".txt"}:
        raise HTTPException(
            status_code=400,
            detail="Only PDF, DOCX, and TXT resumes are supported.",
        )

    if not job_description.strip():
        raise HTTPException(
            status_code=400,
            detail="Job description cannot be empty.",
        )

    try:
        resume_bytes = resume.file.read()

        if not resume_bytes:
            raise HTTPException(
                status_code=400,
                detail="The uploaded resume is empty.",
            )

        if len(resume_bytes) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail="Resume must be 10 MB or smaller.",
            )

        resume_text = extract_resume_text(filename, resume_bytes)

        # Use the existing agents; no sample files or shared JSON files.
        resume_agent = ResumeIntelligenceAgent()
        jd_agent = JobDescriptionAgent()
        ats_agent = ATSAgent()

        candidate_profile = resume_agent.analyze(resume_text)
        job_profile = jd_agent.analyze(job_description.strip())
        ats_analysis = ats_agent.analyze(
            candidate=candidate_profile,
            job=job_profile,
        )

        return {
            "candidate_profile": candidate_profile.model_dump(),
            "job_profile": job_profile.model_dump(),
            "ats_analysis": ats_analysis.model_dump(),
        }

    except HTTPException:
        raise
    except ValueError as exc:
        logger.error("AI configuration or validation error: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="AI service configuration or validation failed. Check its local setup.",
        ) from exc
    except Exception as exc:
        # Keep API keys, provider responses, and internal details out of responses.
        logger.exception("Resume analysis failed")
        raise HTTPException(
            status_code=502,
            detail="Analysis failed. Check the AI service logs and try again.",
        ) from exc
    finally:
        resume.file.close()
