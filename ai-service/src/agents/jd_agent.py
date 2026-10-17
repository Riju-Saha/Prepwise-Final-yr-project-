import json
import os

from dotenv import load_dotenv
from groq import Groq

from src.models.job import JobProfile


class JobDescriptionAgent:

    def __init__(self):
        load_dotenv()

        api_key = os.getenv("GROQ_API_KEY")

        if not api_key:
            raise ValueError("GROQ_API_KEY not found in .env")

        self.client = Groq(api_key=api_key)

        self.model = "openai/gpt-oss-120b"

    def analyze(self, job_description: str) -> JobProfile:

        system_prompt = """
You are a Job Description Intelligence Agent for a campus placement
preparation system.

Your task is to extract structured information from a job description.

IMPORTANT RULES:

1. Extract only information explicitly present in the job description.
2. Never invent information.
3. Return only valid JSON.
4. Use exactly the requested field names.
5. If information is missing, return null or [].
6. Separate required skills from preferred skills when the wording
   indicates a difference.
7. Do not treat every keyword as a required skill.
8. Extract responsibilities separately from skills.
9. Extract programming languages separately.
10. Extract tools and technologies separately.
11. Preserve the meaning of the original job description.

Required skills are skills explicitly described as required, mandatory,
essential, must-have, or equivalent.

Preferred skills are skills explicitly described as preferred, desirable,
nice-to-have, bonus, plus, or equivalent.

If the job description does not clearly distinguish required and preferred
skills, use the available wording and do not invent a priority.

Return only JSON.
"""

        user_prompt = f"""
Analyze the following job description.

Return exactly this JSON structure:

{{
    "job_title": null,
    "company": null,

    "required_skills": [],

    "preferred_skills": [],

    "programming_languages": [],

    "tools_and_technologies": [],

    "responsibilities": [],

    "experience_requirements": [],

    "education_requirements": [],

    "keywords": []
}}

JOB DESCRIPTION:

{job_description}
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

        parsed_output = json.loads(raw_output)

        return JobProfile.model_validate(parsed_output)