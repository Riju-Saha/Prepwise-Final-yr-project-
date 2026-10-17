from typing import List, Optional, Annotated
from pydantic import BaseModel, BeforeValidator, Field


def convert_to_string(value):
    if value is None:
        return None
    return str(value)


FlexibleString = Annotated[str, BeforeValidator(convert_to_string)]


class Education(BaseModel):
    degree: Optional[FlexibleString] = None
    institution: Optional[FlexibleString] = None
    field_of_study: Optional[FlexibleString] = None
    start_year: Optional[FlexibleString] = None
    end_year: Optional[FlexibleString] = None
    grade: Optional[FlexibleString] = None
    overall_gpa: Optional[FlexibleString] = None


class Experience(BaseModel):
    job_title: Optional[str] = None
    company: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    responsibilities: List[str] = Field(default_factory=list)
    achievements: List[str] = Field(default_factory=list)


class FunctionalExperience(BaseModel):
    category: str
    responsibilities: List[str] = Field(default_factory=list)


class Project(BaseModel):
    title: str
    description: Optional[str] = None
    technologies: List[str] = Field(default_factory=list)
    achievements: List[str] = Field(default_factory=list)


class Certification(BaseModel):
    name: str
    issuing_organization: Optional[str] = None
    year: Optional[str] = None


class CandidateProfile(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    summary: Optional[str] = None

    education: List[Education] = Field(default_factory=list)

    experience: List[Experience] = Field(default_factory=list)

    functional_experience: List[FunctionalExperience] = Field(
        default_factory=list
    )

    projects: List[Project] = Field(default_factory=list)

    certifications: List[Certification] = Field(default_factory=list)

    technical_skills: List[str] = Field(default_factory=list)
    soft_skills: List[str] = Field(default_factory=list)
    programming_languages: List[str] = Field(default_factory=list)
    tools_and_technologies: List[str] = Field(default_factory=list)

    achievements: List[str] = Field(default_factory=list)