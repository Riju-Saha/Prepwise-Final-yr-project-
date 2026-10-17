from typing import List, Optional

from pydantic import BaseModel, Field


class EvidenceItem(BaseModel):
    text: str
    source: str


class RequirementMatch(BaseModel):
    requirement: str
    status: str
    evidence: List[EvidenceItem] = Field(
        default_factory=list
    )
    match_method: str


class ATSRecommendation(BaseModel):
    type: str
    priority: str
    message: str


class ATSAnalysis(BaseModel):
    overall_score: float = 0.0

    required_skill_match_percentage: float = 0.0

    preferred_skill_match_percentage: float = 0.0

    matched_required_skills: List[str] = Field(
        default_factory=list
    )

    partial_required_skills: List[str] = Field(
        default_factory=list
    )

    missing_required_skills: List[str] = Field(
        default_factory=list
    )

    matched_preferred_skills: List[str] = Field(
        default_factory=list
    )

    partial_preferred_skills: List[str] = Field(
        default_factory=list
    )

    missing_preferred_skills: List[str] = Field(
        default_factory=list
    )

    required_requirement_analysis: List[RequirementMatch] = Field(
        default_factory=list
    )

    preferred_requirement_analysis: List[RequirementMatch] = Field(
        default_factory=list
    )

    education_match: Optional[bool] = None

    experience_match: Optional[bool] = None

    matched_keywords: List[str] = Field(
        default_factory=list
    )

    missing_keywords: List[str] = Field(
        default_factory=list
    )

    recommendations: List[ATSRecommendation] = Field(
        default_factory=list
    )