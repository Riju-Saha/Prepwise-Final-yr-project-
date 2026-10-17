from typing import List
from pydantic import BaseModel, Field


class RequirementMatch(BaseModel):
    requirement: str
    status: str
    evidence: List[str] = Field(default_factory=list)
    match_method: str