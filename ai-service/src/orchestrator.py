import json

from src.tools.resume_parser import extract_resume_text
from src.agents.resume_agent import ResumeIntelligenceAgent
from src.agents.jd_agent import JobDescriptionAgent
from src.agents.ats_agent import ATSAgent


class PlacementPipeline:

    def __init__(self):
        self.resume_agent = ResumeIntelligenceAgent()
        self.jd_agent = JobDescriptionAgent()
        self.ats_agent = ATSAgent()

    def run(
        self,
        resume_path: str,
        job_description_path: str,
    ):

        # =========================================
        # 1. Extract Resume
        # =========================================

        print("\n[1/4] Extracting resume...")

        resume_text = extract_resume_text(resume_path)

        print("Resume extracted successfully.")

        # =========================================
        # 2. Resume Agent
        # =========================================

        print("\n[2/4] Running Resume Agent...")

        candidate_profile = self.resume_agent.analyze(
            resume_text
        )

        print("Candidate profile generated.")

        # =========================================
        # 3. JD Agent
        # =========================================

        print("\n[3/4] Running Job Description Agent...")

        with open(
            job_description_path,
            "r",
            encoding="utf-8",
        ) as file:

            job_description = file.read()

        job_profile = self.jd_agent.analyze(
            job_description
        )

        print("Job profile generated.")

        # =========================================
        # 4. ATS Agent
        # =========================================

        print("\n[4/4] Running ATS Agent...")

        ats_analysis = self.ats_agent.analyze(
            candidate=candidate_profile,
            job=job_profile,
        )

        print("ATS analysis generated.")

        # =========================================
        # Save intermediate results
        # =========================================

        with open(
            "data/processed/candidate_profile.json",
            "w",
            encoding="utf-8",
        ) as file:

            json.dump(
                candidate_profile.model_dump(),
                file,
                indent=4,
                ensure_ascii=False,
            )

        with open(
            "data/processed/job_profile.json",
            "w",
            encoding="utf-8",
        ) as file:

            json.dump(
                job_profile.model_dump(),
                file,
                indent=4,
                ensure_ascii=False,
            )

        with open(
            "data/processed/ats_analysis.json",
            "w",
            encoding="utf-8",
        ) as file:

            json.dump(
                ats_analysis.model_dump(),
                file,
                indent=4,
                ensure_ascii=False,
            )

        # =========================================
        # Return complete pipeline result
        # =========================================

        return {
            "candidate_profile": candidate_profile,
            "job_profile": job_profile,
            "ats_analysis": ats_analysis,
        }