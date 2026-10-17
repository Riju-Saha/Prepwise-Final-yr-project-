import json
import os

from dotenv import load_dotenv
from groq import Groq

from src.models.candidate import CandidateProfile


load_dotenv()


class ResumeIntelligenceAgent:
    """
    Agent responsible for understanding a resume
    and converting it into a structured candidate profile.
    """

    def __init__(self):
        api_key = os.getenv("GROQ_API_KEY")

        if not api_key:
            raise ValueError("GROQ_API_KEY is not set in .env")

        self.client = Groq(api_key=api_key)

        self.model = "openai/gpt-oss-120b"

    def analyze(self, resume_text: str) -> CandidateProfile:

        system_prompt = """
You are a Resume Intelligence Agent for a campus placement preparation system.

Your task is to extract structured information from a resume accurately.

IMPORTANT RULES:

1. Extract only information explicitly present in the resume.
2. NEVER invent missing information.
3. NEVER infer relationships that are not explicitly stated.
4. Preserve the meaning of the original resume.
5. Return ONLY valid JSON.
6. Use the exact field names provided in the schema.
7. If a section does not exist, return an empty list [].
8. Do NOT return empty objects such as {} for missing sections.
9. Keep dates, years, GPA and grades as strings.
10. Separate employment history from functional/skill-based experience sections.
11. If a resume contains a functional experience section whose bullets
    cannot be safely mapped to a specific employer/job, preserve those
    bullets under functional_experience instead of assigning them to a job.
12. Do not guess which company or job a functional experience bullet belongs to.

EXTRACTION RULES:

Education:
- Extract degree.
- Extract institution.
- Extract field of study.
- Extract start year if explicitly available.
- Extract end year if explicitly available.
- Extract grade/GPA if explicitly available.

Employment History:
- Extract job title.
- Extract company.
- Extract start date.
- Extract end date.
- Extract responsibilities only when they are explicitly associated
  with that particular employment entry.

Functional Experience:
- Preserve section names such as:
  "Adult Care Experience",
  "Childcare Experience",
  "Technical Experience",
  "Leadership Experience", etc.
- Put the bullet points under the appropriate category.
- Do NOT assign these bullets to an employer unless the resume explicitly
  makes that connection.

Projects:
- Only extract actual projects explicitly mentioned in the resume.
- If no project section or project is present, return [].

Certifications:
- Only extract certifications explicitly mentioned.
- If none are present, return [].

Skills:
- Extract programming languages separately.
- Extract tools and technologies separately.
- Extract soft skills separately.
- Do not invent skills from job titles.

Achievements:
- Extract explicit achievements, honors, awards, lists, etc.

The final output must follow the exact JSON structure requested by the user.
"""


        user_prompt = f"""
Analyze the following resume and return structured JSON.

Return EXACTLY this structure:

{{
    "name": null,
    "email": null,
    "phone": null,
    "summary": null,

    "education": [],

    "experience": [],

    "functional_experience": [],

    "projects": [],

    "certifications": [],

    "technical_skills": [],

    "soft_skills": [],

    "programming_languages": [],

    "tools_and_technologies": [],

    "achievements": []
}}

For education objects use:

{{
    "degree": null,
    "institution": null,
    "field_of_study": null,
    "start_year": null,
    "end_year": null,
    "grade": null,
    "overall_gpa": null
}}

For employment experience objects use:

{{
    "job_title": null,
    "company": null,
    "start_date": null,
    "end_date": null,
    "responsibilities": [],
    "achievements": []
}}

For functional experience objects use:

{{
    "category": "",
    "responsibilities": []
}}

For project objects use:

{{
    "title": "",
    "description": null,
    "technologies": [],
    "achievements": []
}}

For certification objects use:

{{
    "name": "",
    "issuing_organization": null,
    "year": null
}}

IMPORTANT:

- If projects are absent, return:
  "projects": []

- If certifications are absent, return:
  "certifications": []

- If programming languages are absent, return:
  "programming_languages": []

- If tools are absent, return:
  "tools_and_technologies": []

- If soft skills are absent, return:
  "soft_skills": []

- Do NOT create empty project or certification objects.

- Do NOT assign functional experience bullets to a specific job
  unless the resume explicitly connects them.

- Preserve functional experience categories exactly or as close as possible.

RESUME:

{resume_text}
"""

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": system_prompt,
                },
                {
                    "role": "user",
                    "content": user_prompt,
                },
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )

        raw_output = response.choices[0].message.content

        if not raw_output:
            raise ValueError("The model returned an empty response.")

        try:
            parsed_output = json.loads(raw_output)
        except json.JSONDecodeError as error:
            raise ValueError(
                f"Model did not return valid JSON.\n\n"
                f"Model output:\n{raw_output}"
            ) from error

        return CandidateProfile.model_validate(parsed_output)