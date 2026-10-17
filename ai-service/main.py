from src.orchestrator import PlacementPipeline


RESUME_PATH = "data/raw/sample_resume.pdf"
JOB_DESCRIPTION_PATH = "data/raw/sample_jd.txt"


pipeline = PlacementPipeline()


result = pipeline.run(
    resume_path=RESUME_PATH,
    job_description_path=JOB_DESCRIPTION_PATH,
)


candidate_profile = result["candidate_profile"]
job_profile = result["job_profile"]
ats_analysis = result["ats_analysis"]


print("\n" + "=" * 60)
print("FINAL ATS RESULT")
print("=" * 60)

print(
    ats_analysis.model_dump_json(indent=2)
)