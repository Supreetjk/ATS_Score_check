"""
Resume ATS Score Checker — backend API

Takes two inputs (resume + job description) and returns a structured ATS
match report: score, matched keywords, missing keywords, and suggestions.

This is a cleaned-up / productionized version of the logic in
Resume_Ats.ipynb. Fixes vs. the notebook:
  - The API key is read from an environment variable, never hardcoded.
  - ChatPromptTemplate is built correctly with ("system", ...) / ("human", ...)
    tuples instead of one malformed string blob.
  - The model is asked to return strict JSON so the frontend can render a
    real score gauge + keyword chips instead of parsing markdown.
  - PDF text is extracted directly from the uploaded file (no need to save
    a local resume.pdf first).
"""

import json
import os
import re
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel
from pypdf import PdfReader
import io

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

app = FastAPI(title="Resume ATS Score Checker")

# Allow the frontend (served from a different origin/port, or opened as a
# local file) to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

parser = StrOutputParser()

ats_check_prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You are an ATS (Applicant Tracking System) resume scanner. "
            "Compare the given resume against the given job description. "
            "Score how well the resume matches the job description from 0-100. "
            "Identify important keywords/skills from the job description that ARE "
            "present in the resume (matched_keywords), and important keywords/skills "
            "from the job description that are MISSING from the resume "
            "(missing_keywords). Then give 3-6 concrete, actionable suggestions to "
            "improve the resume for this job description. "
            "Respond with ONLY valid JSON, no markdown fences, no extra commentary, "
            "matching exactly this schema: "
            '{{"score": <integer 0-100>, '
            '"summary": "<one or two sentence overview>", '
            '"matched_keywords": ["..."], '
            '"missing_keywords": ["..."], '
            '"suggestions": ["..."]}}',
        ),
        (
            "human",
            "resume:\n{resume}\n\njob description:\n{job_description}",
        ),
    ]
)


def get_llm() -> ChatGoogleGenerativeAI:
    if not GOOGLE_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="GOOGLE_API_KEY is not set on the server. Copy .env.example to "
            ".env and add your key.",
        )
    return ChatGoogleGenerativeAI(model="gemini-3.6-flash", api_key=GOOGLE_API_KEY)


def extract_pdf_text(file_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(file_bytes))
    pages = [page.extract_text() or "" for page in reader.pages]
    text = "\n".join(pages).strip()
    if not text:
        raise HTTPException(
            status_code=400,
            detail="Couldn't extract any text from that PDF. Is it a scanned image?",
        )
    return text


def parse_llm_json(raw: str) -> dict:
    # Strip ```json ... ``` fences if the model added them anyway.
    cleaned = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Last resort: grab the outermost {...} block.
        match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise HTTPException(
            status_code=502, detail="The model didn't return valid JSON. Try again."
        )


class AnalyzeResponse(BaseModel):
    score: int
    summary: str
    matched_keywords: List[str]
    missing_keywords: List[str]
    suggestions: List[str]


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(
    job_description: str = Form(...),
    resume_file: Optional[UploadFile] = File(None),
    resume_text: Optional[str] = Form(None),
):
    if not job_description or not job_description.strip():
        raise HTTPException(status_code=400, detail="Job description is required.")

    if resume_file is not None:
        file_bytes = await resume_file.read()
        if resume_file.filename.lower().endswith(".pdf"):
            resume = extract_pdf_text(file_bytes)
        else:
            resume = file_bytes.decode("utf-8", errors="ignore")
    elif resume_text and resume_text.strip():
        resume = resume_text
    else:
        raise HTTPException(
            status_code=400, detail="Provide a resume file or pasted resume text."
        )

    llm = get_llm()
    ats_chain = ats_check_prompt | llm | parser

    try:
        raw_result = ats_chain.invoke(
            {"resume": resume, "job_description": job_description}
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Model call failed: {exc}")

    data = parse_llm_json(raw_result)

    # Defensive normalization in case the model omits a field.
    data.setdefault("score", 0)
    data.setdefault("summary", "")
    data.setdefault("matched_keywords", [])
    data.setdefault("missing_keywords", [])
    data.setdefault("suggestions", [])
    data["score"] = max(0, min(100, int(data["score"])))

    return data


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
