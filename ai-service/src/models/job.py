from typing import List, Optional
from pydantic import BaseModel, Field


class JobProfile(BaseModel):
    job_title: Optional[str] = None
    company: Optional[str] = None

    required_skills: List[str] = Field(default_factory=list)
    preferred_skills: List[str] = Field(default_factory=list)

    programming_languages: List[str] = Field(default_factory=list)
    tools_and_technologies: List[str] = Field(default_factory=list)

    responsibilities: List[str] = Field(default_factory=list)

    experience_requirements: List[str] = Field(default_factory=list)
    education_requirements: List[str] = Field(default_factory=list)

    keywords: List[str] = Field(default_factory=list)