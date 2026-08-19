# Scanline — Resume ATS Score Checker

# Live demo : https://ats-score-check-mocha.vercel.app/

A small full-stack app built from `Resume_Ats.ipynb`: paste/upload a resume
and a job description, get back an ATS match score, matched/missing
keywords, and concrete suggestions.

```
resume-ats-checker/
├── backend/
│   ├── main.py            FastAPI app (the notebook logic, cleaned up)
│   ├── requirements.txt
│   └── .env.example       copy to .env and add your key
└── frontend/
    ├── index.html
    ├── style.css
    └── script.js
```

## What changed vs. the notebook

- **No hardcoded API key.** `main.py` reads `GOOGLE_API_KEY` from the
  environment via `.env` — never commit a real key.
- **Fixed the prompt template.** The notebook's `ChatPromptTemplate` was one
  malformed string; it's now proper `("system", …)` / `("human", …)` tuples.
- **Structured JSON output**, not markdown, so the frontend can render a real
  score gauge and keyword chips: `{score, summary, matched_keywords,
  missing_keywords, suggestions}`.
- **Direct PDF upload.** The API extracts text from the uploaded PDF in
  memory — no need to save a local `resume.pdf` first. Pasting resume text
  is also supported.

## 1. Backend setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# edit .env and set GOOGLE_API_KEY to a real key from
# https://aistudio.google.com/apikey

uvicorn main:app --reload --port 8000
```

The API is now running at `http://localhost:8000`. Check `http://localhost:8000/api/health`.

## 2. Frontend setup

No build step — it's plain HTML/CSS/JS. Easiest way to run it:

```bash
cd frontend
python -m http.server 5500
```

Then open `http://localhost:5500` in your browser.

(Opening `index.html` directly by double-clicking also works in most
browsers, since the frontend only talks to the backend over `fetch`.)

If your backend runs somewhere other than `http://localhost:8000`, set it
before `script.js` loads, e.g. add this above the `<script src="script.js">`
tag in `index.html`:

```html
<script>window.ATS_API_BASE = "https://your-backend-url";</script>
```

## API

`POST /api/analyze` — multipart form:
- `job_description` (string, required)
- `resume_file` (PDF file) **or** `resume_text` (string) — one required

Response:
```json
{
  "score": 72,
  "summary": "Strong Python/ML foundation but missing key DS tooling.",
  "matched_keywords": ["Python", "Machine Learning", "SQL"],
  "missing_keywords": ["TensorFlow", "A/B Testing", "Docker"],
  "suggestions": ["Add a deep learning framework...", "..."]
}
```

## Notes

- The model name in the notebook (`gemini-3.5-flash`) doesn't correspond to
  a real Gemini model; `main.py` uses `gemini-2.5-flash` instead. Swap it in
  `backend/main.py` for whichever Gemini model your API key has access to.
- This is a local dev setup (CORS is wide open, `.env` is git-ignored by
  convention — add a `.gitignore` if you push this to a repo).
