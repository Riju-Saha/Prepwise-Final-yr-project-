import json
import os
import re

from dotenv import load_dotenv
from groq import Groq

from src.models.candidate import CandidateProfile
from src.models.job import JobProfile
from src.models.ats import (
    ATSAnalysis,
    ATSRecommendation,
    RequirementMatch,
    EvidenceItem,
)


class ATSAgent:

    def __init__(self):
        load_dotenv()

        api_key = os.getenv("GROQ_API_KEY")

        if not api_key:
            raise ValueError(
                "GROQ_API_KEY not found in .env"
            )

        self.client = Groq(api_key=api_key)

        self.model = "openai/gpt-oss-120b"

    # =========================================================
    # 1. TEXT NORMALIZATION
    # =========================================================

    def _normalize(self, text: str) -> str:

        if not text:
            return ""

        text = str(text).lower().strip()

        text = re.sub(
            r"[^a-z0-9+#.\- ]",
            " ",
            text,
        )

        text = re.sub(
            r"\s+",
            " ",
            text,
        )

        return text.strip()

    # =========================================================
    # 2. BUILD COMPLETE CANDIDATE EVIDENCE
    # =========================================================

    def _build_candidate_evidence(
        self,
        candidate: CandidateProfile,
    ):

        evidence = []

        # -----------------------------------------------------
        # Summary
        # -----------------------------------------------------

        if candidate.summary:
            evidence.append(
                {
                    "text": candidate.summary,
                    "source": "summary",
                }
            )

        # -----------------------------------------------------
        # Skills
        # -----------------------------------------------------

        skill_groups = [
            (
                candidate.technical_skills,
                "technical_skills",
            ),
            (
                candidate.programming_languages,
                "programming_languages",
            ),
            (
                candidate.tools_and_technologies,
                "tools_and_technologies",
            ),
            (
                candidate.soft_skills,
                "soft_skills",
            ),
        ]

        for skills, source in skill_groups:

            for skill in skills:

                if skill:
                    evidence.append(
                        {
                            "text": skill,
                            "source": source,
                        }
                    )

        # -----------------------------------------------------
        # Education
        # -----------------------------------------------------

        for education in candidate.education:

            education_fields = [
                education.degree,
                education.institution,
                education.field_of_study,
                education.start_year,
                education.end_year,
                education.grade,
                education.overall_gpa,
            ]

            for value in education_fields:

                if value:
                    evidence.append(
                        {
                            "text": value,
                            "source": "education",
                        }
                    )

        # -----------------------------------------------------
        # Employment Experience
        # -----------------------------------------------------

        for experience in candidate.experience:

            experience_fields = [
                experience.job_title,
                experience.company,
                experience.start_date,
                experience.end_date,
            ]

            for value in experience_fields:

                if value:
                    evidence.append(
                        {
                            "text": value,
                            "source": "experience",
                        }
                    )

            for responsibility in (
                experience.responsibilities
            ):

                if responsibility:
                    evidence.append(
                        {
                            "text": responsibility,
                            "source": "experience",
                        }
                    )

            for achievement in (
                experience.achievements
            ):

                if achievement:
                    evidence.append(
                        {
                            "text": achievement,
                            "source": "experience",
                        }
                    )

        # -----------------------------------------------------
        # Functional Experience
        # -----------------------------------------------------

        for functional in (
            candidate.functional_experience
        ):

            if functional.category:
                evidence.append(
                    {
                        "text": functional.category,
                        "source": "functional_experience",
                    }
                )

            for responsibility in (
                functional.responsibilities
            ):

                if responsibility:
                    evidence.append(
                        {
                            "text": responsibility,
                            "source": "functional_experience",
                        }
                    )

        # -----------------------------------------------------
        # Projects
        # -----------------------------------------------------

        for project in candidate.projects:

            if project.title:
                evidence.append(
                    {
                        "text": project.title,
                        "source": "project",
                    }
                )

            if project.description:
                evidence.append(
                    {
                        "text": project.description,
                        "source": "project",
                    }
                )

            for technology in project.technologies:

                if technology:
                    evidence.append(
                        {
                            "text": technology,
                            "source": "project",
                        }
                    )

            for achievement in project.achievements:

                if achievement:
                    evidence.append(
                        {
                            "text": achievement,
                            "source": "project",
                        }
                    )

        # -----------------------------------------------------
        # Certifications
        # -----------------------------------------------------

        for certification in (
            candidate.certifications
        ):

            fields = [
                certification.name,
                certification.issuing_organization,
                certification.year,
            ]

            for value in fields:

                if value:
                    evidence.append(
                        {
                            "text": value,
                            "source": "certification",
                        }
                    )

        # -----------------------------------------------------
        # Achievements
        # -----------------------------------------------------

        for achievement in candidate.achievements:

            if achievement:
                evidence.append(
                    {
                        "text": achievement,
                        "source": "achievement",
                    }
                )

        return evidence

    # =========================================================
    # 3. BASIC SKILL MATCHING
    # =========================================================

    def _skill_match(
        self,
        candidate_skills,
        job_skills,
    ):

        candidate_normalized = []

        for skill in candidate_skills:

            if not skill:
                continue

            candidate_normalized.append(
                {
                    "original": skill,
                    "normalized": self._normalize(
                        skill
                    ),
                }
            )

        matched = []
        missing = []

        for job_skill in job_skills:

            normalized_job = self._normalize(
                job_skill
            )

            if not normalized_job:
                continue

            found = False

            for candidate_skill in (
                candidate_normalized
            ):

                normalized_candidate = (
                    candidate_skill["normalized"]
                )

                if not normalized_candidate:
                    continue

                if (
                    normalized_job
                    == normalized_candidate
                ):
                    found = True
                    break

                if (
                    normalized_job
                    in normalized_candidate
                ):
                    found = True
                    break

                if (
                    normalized_candidate
                    in normalized_job
                ):
                    found = True
                    break

            if found:
                matched.append(job_skill)
            else:
                missing.append(job_skill)

        return matched, missing

    # =========================================================
    # 4. SEMANTIC REQUIREMENT MATCHING
    # =========================================================

    def _semantic_requirement_matching(
        self,
        requirements,
        candidate_evidence,
    ):

        if not requirements:
            return []

        system_prompt = """
You are an evidence-matching component of an ATS system.

Compare each job requirement against the candidate evidence.

For every requirement choose exactly one:

MATCH
PARTIAL
MISSING

MATCH:
Use MATCH only when the candidate evidence directly and clearly
demonstrates the requirement as stated.

PARTIAL:
Use PARTIAL when the evidence is related or strongly suggests
the requirement, but does not fully demonstrate the requirement.
When uncertain between MATCH and PARTIAL, choose PARTIAL.

MISSING:
There is no meaningful supporting evidence.

STRICT RULES:

1. Use ONLY supplied candidate evidence.
2. Never invent experience.
3. Never invent skills.
4. Never infer a skill only from a job title.
5. Semantically equivalent evidence is allowed.
6. Preserve the candidate's original evidence text.
7. MATCH and PARTIAL must contain supporting evidence.
8. MISSING must contain an empty evidence list.
9. Return exactly one result per requirement.
10. Return valid JSON only.
"""

        user_prompt = f"""
JOB REQUIREMENTS:

{json.dumps(
    requirements,
    indent=2,
    ensure_ascii=False,
)}

CANDIDATE EVIDENCE:

{json.dumps(
    candidate_evidence,
    indent=2,
    ensure_ascii=False,
)}

Return:

{{
    "matches": [
        {{
            "requirement": "",
            "status": "MATCH",
            "evidence": [],
            "match_method": "semantic"
        }}
    ]
}}
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
            response_format={
                "type": "json_object"
            },
        )

        result = json.loads(
            response.choices[0].message.content
        )

        raw_matches = result.get(
            "matches",
            [],
        )

        valid_statuses = {
            "MATCH",
            "PARTIAL",
            "MISSING",
        }

        requirement_map = {
            self._normalize(req): req
            for req in requirements
        }

        cleaned = []
        seen = set()

        for item in raw_matches:

            if not isinstance(item, dict):
                continue

            requirement = item.get(
                "requirement"
            )

            if not requirement:
                continue

            normalized = self._normalize(
                requirement
            )

            if normalized not in requirement_map:
                continue

            if normalized in seen:
                continue

            status = str(
                item.get(
                    "status",
                    "MISSING",
                )
            ).upper()

            if status not in valid_statuses:
                status = "MISSING"

            evidence = item.get(
                "evidence",
                [],
            )

            if not isinstance(
                evidence,
                list,
            ):
                evidence = []

            if status == "MISSING":
                evidence = []

            cleaned.append(
                {
                    "requirement":
                        requirement_map[
                            normalized
                        ],
                    "status": status,
                    "evidence": evidence,
                    "match_method": "semantic",
                }
            )

            seen.add(normalized)

        # -----------------------------------------------------
        # Ensure no requirement disappears
        # -----------------------------------------------------

        for requirement in requirements:

            normalized = self._normalize(
                requirement
            )

            if normalized not in seen:

                cleaned.append(
                    {
                        "requirement": requirement,
                        "status": "MISSING",
                        "evidence": [],
                        "match_method": "semantic",
                    }
                )

        return cleaned

    # =========================================================
    # 5. REQUIREMENT STATUS SAFETY CHECK
    # =========================================================

    def _apply_requirement_status_safety(self, analysis):
        """Keep broad semantic matches conservative."""

        conservative_requirements = {
            "strong communication",
            "communication skills",
            "strong organizational skills",
            "organizational skills",
            "organizational ability",
        }

        for item in analysis:
            normalized = self._normalize(item.requirement)

            if normalized in conservative_requirements and item.status == "MATCH":
                evidence_text = " ".join(
                    evidence.text.lower()
                    for evidence in item.evidence
                    if evidence.text
                )

                direct_terms = (
                    "communication skills",
                    "strong communication",
                    "communicated with",
                    "communicated directly",
                    "presented",
                    "negotiated",
                    "conducted meetings",
                    "client communication",
                )

                if not any(term in evidence_text for term in direct_terms):
                    item.status = "PARTIAL"

        return analysis


    # =========================================================
    # 5B. REQUIREMENT SCORE
    # =========================================================

    def _calculate_requirement_percentage(
        self,
        analysis,
    ):

        if not analysis:
            return 100.0

        total_score = 0.0

        for item in analysis:

            if item.status == "MATCH":
                total_score += 1.0

            elif item.status == "PARTIAL":
                total_score += 0.5

        return round(
            (
                total_score
                / len(analysis)
            ) * 100,
            2,
        )

    # =========================================================
    # 6. CANDIDATE SEARCH TEXT
    # =========================================================

    def _build_candidate_text(
        self,
        candidate_evidence,
    ):

        texts = []

        for item in candidate_evidence:

            text = item.get("text")

            if text:
                texts.append(
                    str(text)
                )

        return self._normalize(
            " ".join(texts)
        )

    # =========================================================
    # 7. KEYWORD MATCHING
    # =========================================================

    def _keyword_match(
        self,
        candidate_text,
        keywords,
    ):

        matched = []
        missing = []

        for keyword in keywords:

            normalized = self._normalize(
                keyword
            )

            if not normalized:
                continue

            if normalized in candidate_text:
                matched.append(keyword)
            else:
                missing.append(keyword)

        return matched, missing

    # =========================================================
    # 8. QUALITATIVE ANALYSIS
    # =========================================================

    def _qualitative_analysis(
        self,
        candidate,
        job,
        candidate_evidence,
        required_analysis,
        preferred_analysis,
    ):

        system_prompt = """
You are a strict ATS recommendation assistant.

Determine:

1. education_match
2. experience_match
3. recommendations

STRICT RULES:

- Never invent candidate information.
- Never invent experience.
- Never invent achievements.
- Never invent percentages.
- Never invent metrics.
- Never invent certifications.
- Never invent job titles.
- Never invent technologies.
- Never invent responsibilities.
- Use only supplied evidence.
- Do not calculate ATS score.
- Do not change MATCH/PARTIAL/MISSING results.

Recommendations must help the candidate improve
their resume honestly.

If a missing keyword exists, suggest accurate wording
only when the supplied resume evidence supports it.

NEVER tell the candidate to add, claim, or use a job title
that they did not actually hold. For a missing job-title
keyword, recommend describing supported responsibilities
instead of claiming the title.

NEVER create a numerical achievement, percentage, metric,
certification, technology, responsibility, or outcome that
does not exist in the resume.

Only recommend listing a certification if the candidate
actually holds it.

Return valid JSON only.
"""

        user_prompt = f"""
CANDIDATE PROFILE:

{candidate.model_dump_json(
    indent=2
)}

JOB PROFILE:

{job.model_dump_json(
    indent=2
)}

REQUIRED REQUIREMENTS:

{json.dumps(
    [
        item.model_dump()
        for item in required_analysis
    ],
    indent=2,
    ensure_ascii=False,
)}

PREFERRED REQUIREMENTS:

{json.dumps(
    [
        item.model_dump()
        for item in preferred_analysis
    ],
    indent=2,
    ensure_ascii=False,
)}

CANDIDATE EVIDENCE:

{json.dumps(
    candidate_evidence,
    indent=2,
    ensure_ascii=False,
)}

Return exactly:

{{
    "education_match": null,
    "experience_match": null,
    "recommendations": [
        {{
            "type": "keyword",
            "priority": "high",
            "message": ""
        }}
    ]
}}

Allowed recommendation types:

keyword
evidence
format
skill_gap

Allowed priorities:

high
medium
low
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
            response_format={
                "type": "json_object"
            },
        )

        result = json.loads(
            response.choices[0].message.content
        )

        education_match = result.get(
            "education_match"
        )

        experience_match = result.get(
            "experience_match"
        )

        raw_recommendations = result.get(
            "recommendations",
            [],
        )

        if not isinstance(
            raw_recommendations,
            list,
        ):
            raw_recommendations = []

        recommendations = []

        valid_types = {
            "keyword",
            "evidence",
            "format",
            "skill_gap",
        }

        valid_priorities = {
            "high",
            "medium",
            "low",
        }

        for item in raw_recommendations:

            if not isinstance(item, dict):
                continue

            recommendation_type = item.get(
                "type",
                "evidence",
            )

            priority = item.get(
                "priority",
                "medium",
            )

            message = item.get(
                "message",
                "",
            )

            if (
                recommendation_type
                not in valid_types
            ):
                recommendation_type = "evidence"

            if (
                priority
                not in valid_priorities
            ):
                priority = "medium"

            if not isinstance(
                message,
                str,
            ):
                continue

            if not message.strip():
                continue

            recommendations.append(
                ATSRecommendation(
                    type=recommendation_type,
                    priority=priority,
                    message=message.strip(),
                )
            )

        safe_recommendations = []

        for recommendation in recommendations:
            message_lower = recommendation.message.lower()

            if (
                recommendation.type == "keyword"
                and "program coordinator" in message_lower
                and (
                    "add the keyword" in message_lower
                    or "add the title" in message_lower
                    or "use the title" in message_lower
                    or "claim the title" in message_lower
                )
            ):
                recommendation = ATSRecommendation(
                    type="evidence",
                    priority=recommendation.priority,
                    message=(
                        "If accurate, describe your existing coordination "
                        "responsibilities using wording supported by your "
                        "resume rather than claiming the job title "
                        "\"Program Coordinator\"."
                    ),
                )

            safe_recommendations.append(recommendation)

        return (
            education_match,
            experience_match,
            safe_recommendations,
        )

    # =========================================================
    # 9. MAIN ATS ANALYSIS
    # =========================================================

    def analyze(
        self,
        candidate: CandidateProfile,
        job: JobProfile,
    ) -> ATSAnalysis:

        # -----------------------------------------------------
        # Candidate evidence
        # -----------------------------------------------------

        candidate_evidence = (
            self._build_candidate_evidence(
                candidate
            )
        )

        candidate_text = (
            self._build_candidate_text(
                candidate_evidence
            )
        )

        # -----------------------------------------------------
        # Candidate skills
        # -----------------------------------------------------

        candidate_skills = (
            candidate.technical_skills
            + candidate.programming_languages
            + candidate.tools_and_technologies
            + candidate.soft_skills
        )

        # =====================================================
        # REQUIRED REQUIREMENTS
        # =====================================================

        required_raw = (
            self._semantic_requirement_matching(
                job.required_skills,
                candidate_evidence,
            )
        )

        required_analysis = []

        for item in required_raw:

            evidence_items = []

            for evidence in item.get("evidence", []):

                if isinstance(evidence, dict):
                    evidence_items.append(
                        EvidenceItem(
                            text=str(
                                evidence.get("text", "")
                            ),
                            source=str(
                                evidence.get(
                                    "source",
                                    "unknown",
                                )
                            ),
                        )
                    )
                else:
                    evidence_items.append(
                        EvidenceItem(
                            text=str(evidence),
                            source="unknown",
                        )
                    )

            required_analysis.append(
                RequirementMatch(
                    requirement=item["requirement"],
                    status=item["status"],
                    evidence=evidence_items,
                    match_method=item.get(
                        "match_method",
                        "semantic",
                    ),
                )
            )

        required_analysis = self._apply_requirement_status_safety(
            required_analysis
        )

        # =====================================================
        # PREFERRED REQUIREMENTS
        # =====================================================

        preferred_raw = (
            self._semantic_requirement_matching(
                job.preferred_skills,
                candidate_evidence,
            )
        )

        preferred_analysis = []

        for item in preferred_raw:

            evidence_items = []

            for evidence in item.get("evidence", []):

                if isinstance(evidence, dict):
                    evidence_items.append(
                        EvidenceItem(
                            text=str(
                                evidence.get("text", "")
                            ),
                            source=str(
                                evidence.get(
                                    "source",
                                    "unknown",
                                )
                            ),
                        )
                    )
                else:
                    evidence_items.append(
                        EvidenceItem(
                            text=str(evidence),
                            source="unknown",
                        )
                    )

            preferred_analysis.append(
                RequirementMatch(
                    requirement=item["requirement"],
                    status=item["status"],
                    evidence=evidence_items,
                    match_method=item.get(
                        "match_method",
                        "semantic",
                    ),
                )
            )

        preferred_analysis = self._apply_requirement_status_safety(
            preferred_analysis
        )

        # =====================================================
        # REQUIREMENT PERCENTAGES
        # =====================================================

        required_percentage = (
            self._calculate_requirement_percentage(
                required_analysis
            )
        )

        preferred_percentage = (
            self._calculate_requirement_percentage(
                preferred_analysis
            )
        )

        # =====================================================
        # REQUIRED STATUS LISTS
        # =====================================================

        matched_required = [
            item.requirement
            for item in required_analysis
            if item.status == "MATCH"
        ]

        partial_required = [
            item.requirement
            for item in required_analysis
            if item.status == "PARTIAL"
        ]

        missing_required = [
            item.requirement
            for item in required_analysis
            if item.status == "MISSING"
        ]

        # =====================================================
        # PREFERRED STATUS LISTS
        # =====================================================

        matched_preferred = [
            item.requirement
            for item in preferred_analysis
            if item.status == "MATCH"
        ]

        partial_preferred = [
            item.requirement
            for item in preferred_analysis
            if item.status == "PARTIAL"
        ]

        missing_preferred = [
            item.requirement
            for item in preferred_analysis
            if item.status == "MISSING"
        ]

        # =====================================================
        # PROGRAMMING LANGUAGES
        # =====================================================

        (
            matched_languages,
            missing_languages,
        ) = self._skill_match(
            candidate.programming_languages,
            job.programming_languages,
        )

        # =====================================================
        # TECHNOLOGIES
        # =====================================================

        (
            matched_technologies,
            missing_technologies,
        ) = self._skill_match(
            candidate.tools_and_technologies,
            job.tools_and_technologies,
        )

        # =====================================================
        # KEYWORDS
        # =====================================================

        (
            matched_keywords,
            missing_keywords,
        ) = self._keyword_match(
            candidate_text,
            job.keywords,
        )

        # =====================================================
        # QUALITATIVE ANALYSIS
        # =====================================================

        (
            education_match,
            experience_match,
            recommendations,
        ) = self._qualitative_analysis(
            candidate=candidate,
            job=job,
            candidate_evidence=candidate_evidence,
            required_analysis=required_analysis,
            preferred_analysis=preferred_analysis,
        )

        # =====================================================
        # NORMALIZE EDUCATION / EXPERIENCE MATCH VALUES
        # =====================================================

        def _normalize_boolean_match(value):
            if isinstance(value, bool):
                return value

            if value is None:
                return None

            normalized = str(value).strip().upper()

            if normalized in {"TRUE", "MATCH", "YES"}:
                return True

            if normalized in {"FALSE", "MISSING", "NO"}:
                return False

            if normalized in {"PARTIAL", "UNKNOWN", "UNCERTAIN"}:
                return None

            return None

        education_match = _normalize_boolean_match(
            education_match
        )
        experience_match = _normalize_boolean_match(
            experience_match
        )

        # =====================================================
        # EDUCATION SCORE
        # =====================================================

        education_score = (
            100
            if education_match is True
            else 0
            if education_match is False
            else 50
        )

        # =====================================================
        # EXPERIENCE SCORE
        # =====================================================

        experience_score = (
            100
            if experience_match is True
            else 0
            if experience_match is False
            else 50
        )

        # =====================================================
        # OVERALL SCORE
        # =====================================================

        overall_score = round(
            (
                required_percentage * 0.60
                + preferred_percentage * 0.20
                + education_score * 0.10
                + experience_score * 0.10
            ),
            2,
        )

        # =====================================================
        # FINAL RESULT
        # =====================================================

        return ATSAnalysis(

            overall_score=overall_score,

            required_skill_match_percentage=(
                required_percentage
            ),

            preferred_skill_match_percentage=(
                preferred_percentage
            ),

            matched_required_skills=(
                matched_required
            ),

            partial_required_skills=(
                partial_required
            ),

            missing_required_skills=(
                missing_required
            ),

            matched_preferred_skills=(
                matched_preferred
            ),

            partial_preferred_skills=(
                partial_preferred
            ),

            missing_preferred_skills=(
                missing_preferred
            ),

            required_requirement_analysis=(
                required_analysis
            ),

            preferred_requirement_analysis=(
                preferred_analysis
            ),

            education_match=(
                education_match
            ),

            experience_match=(
                experience_match
            ),

            matched_keywords=(
                matched_keywords
            ),

            missing_keywords=(
                missing_keywords
            ),

            recommendations=(
                recommendations
            ),
        )