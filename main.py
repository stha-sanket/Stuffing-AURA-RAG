import re
import math
import json
from pathlib import Path
from collections import Counter
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DATA_DIR = Path(__file__).parent / "Data"

# ── Keyword map ───────────────────────────────────────────────────────────────
KEYWORD_MAP = {
    # AboutUs
    "about":            ["AboutUs"],
    "sunway":           ["AboutUs"],
    "college":          ["AboutUs"],
    "history":          ["AboutUs"],
    "kathmandu":        ["AboutUs"],
    "affiliated":       ["AboutUs"],
    "established":      ["AboutUs"],
    "location":         ["AboutUs"],
    "vision":           ["AboutUs"],
    "mission":          ["AboutUs"],
    "accreditation":    ["AboutUs"],
    # Courses
    "course":           ["Courses"],
    "courses":          ["Courses"],
    "program":          ["Courses"],
    "programmes":       ["Courses"],
    "bsc":              ["Courses"],
    "bba":              ["Courses"],
    "msc":              ["Courses"],
    "bachelor":         ["Courses"],
    "master":           ["Courses"],
    "degree":           ["Courses"],
    "semester":         ["Courses"],
    "faculty":          ["Courses"],
    "it":               ["Courses"],
    "computing":        ["Courses"],
    "business":         ["Courses", "AboutUs"],
    "engineering":      ["Courses"],
    "duration":         ["Courses"],
    # Eligibility
    "eligibility":      ["EligibilityCriteria"],
    "eligible":         ["EligibilityCriteria"],
    "criteria":         ["EligibilityCriteria"],
    "requirement":      ["EligibilityCriteria"],
    "qualify":          ["EligibilityCriteria"],
    "gpa":              ["EligibilityCriteria"],
    "grade":            ["EligibilityCriteria"],
    "percentage":       ["EligibilityCriteria"],
    "marks":            ["EligibilityCriteria"],
    "entrance":         ["EligibilityCriteria"],
    "minimum":          ["EligibilityCriteria"],
    "+2":               ["EligibilityCriteria"],
    "slc":              ["EligibilityCriteria"],
    "see":              ["EligibilityCriteria"],
    # Documents
    "document":         ["DocumentRequired"],
    "documents":        ["DocumentRequired"],
    "required":         ["DocumentRequired"],
    "submit":           ["DocumentRequired"],
    "citizenship":      ["DocumentRequired"],
    "passport":         ["DocumentRequired"],
    "certificate":      ["DocumentRequired"],
    "transcript":       ["DocumentRequired"],
    "photo":            ["DocumentRequired"],
    "application":      ["DocumentRequired", "EligibilityCriteria"],
    "admission":        ["DocumentRequired", "EligibilityCriteria"],
    # BODS
    "bods":             ["AboutUs"],
    "board":            ["AboutUs"],
    "director":         ["AboutUs"],
    "governance":       ["AboutUs"],
    "management":       ["AboutUs"],
    "chairman":         ["AboutUs"],
    "trustee":          ["AboutUs"],
    "staff":            ["AboutUs"],
    "team":             ["AboutUs"],
    "who":              ["AboutUs"],
    "person":           ["AboutUs"],
    "head":             ["AboutUs"],
    "executive":        ["AboutUs"],
    "officer":          ["AboutUs"],

    # RAIN
    "rain":             ["rain"],
    "incubation":       ["rain"],
    "incubator":        ["rain"],
    "startup":          ["rain"],
    "entrepreneurship": ["rain"],
    "innovation":       ["rain"],
    "venture":          ["rain"],
    "research":         ["rain"],
    "launchpad":        ["rain"],
    "pitch":            ["rain"],
    "cohort":           ["rain"],
    "funding":          ["rain"],
}

# ── Basic patterns ────────────────────────────────────────────────────────────
BASIC_PATTERNS = [
    (r"\b(hi|hello|hey|good morning|good afternoon|good evening)\b",
     "Hello! Welcome to Sunway College Kathmandu assistant. How can I help you today?"),
    (r"\b(bye|goodbye|see you|take care)\b",
     "Goodbye! Feel free to come back if you have more questions about Sunway College."),
    (r"\b(thank you|thanks|thank u|thx)\b",
     "You're welcome! Is there anything else you'd like to know about Sunway College?"),
    (r"\b(who are you|what are you)\b",
     "I'm the Sunway College Kathmandu AI assistant. I can help you with courses, admissions, eligibility, required documents, and more."),
    (r"\b(what can you (do|help)|what do you (do|know))\b",
     "I can answer questions about Sunway's courses, admission requirements, eligibility criteria, required documents, RAIN incubation center, and general college info."),
    (r"^(ok|okay|alright|got it|understood|sure|noted|cool)\.?$",
     "Got it! Let me know if you have any other questions."),
]

# ── KB Index: precomputed once at startup ─────────────────────────────────────
def preprocess(text: str) -> list:
    return re.findall(r'\w+', text.lower())


class KBIndex:
    """Chunks + TF-IDF data computed once. Retrieval is just a dot product."""
    def __init__(self, chunks: list):
        self.chunks     = chunks
        self.N          = len(chunks)
        self.doc_words  = [preprocess(c["content"]) for c in chunks]
        self.doc_counts = [Counter(w) for w in self.doc_words]
        self.doc_lens   = [len(w) or 1 for w in self.doc_words]
        # Document frequency
        df = Counter()
        for words in self.doc_words:
            for w in set(words):
                df[w] += 1
        # IDF precomputed for every vocab word
        self.idf = {
            w: math.log((self.N + 1) / (freq + 1)) + 1
            for w, freq in df.items()
        }


_kb_index: KBIndex | None = None


def build_index() -> KBIndex:
    global _kb_index
    if _kb_index:
        return _kb_index

    chunks = []
    if DATA_DIR.exists():
        for filepath in DATA_DIR.rglob("*.md"):
            try:
                content = filepath.read_text(encoding="utf-8")
            except Exception:
                continue

            current_header  = ""
            current_section = ""

            for line in content.splitlines():
                if re.match(r'^#{1,6}\s', line):
                    if current_section.strip():
                        chunks.append({
                            "source":  filepath.stem,
                            "header":  current_header,
                            "content": f"{current_header}\n{current_section}".strip()
                        })
                    current_header  = line.lstrip("#").strip()
                    current_section = ""
                else:
                    current_section += line + "\n"

            if current_section.strip():
                chunks.append({
                    "source":  filepath.stem,
                    "header":  current_header,
                    "content": f"{current_header}\n{current_section}".strip()
                })

    _kb_index = KBIndex(chunks)
    return _kb_index


# ── Retrieval ─────────────────────────────────────────────────────────────────
def retrieve_relevant_context(query: str, index: KBIndex, top_n: int = 3) -> tuple:
    if not index.chunks:
        return "No knowledge base available.", []

    q_lower     = query.lower()
    query_words = preprocess(query)

    # Keyword map boost — O(keywords), not O(chunks)
    source_boost: dict = {}
    for phrase, sources in KEYWORD_MAP.items():
        if phrase in q_lower:
            for s in sources:
                source_boost[s] = source_boost.get(s, 0) + 15

    # Score using precomputed counters + IDF — no recomputation
    scored = []
    for i, chunk in enumerate(index.chunks):
        cnt   = index.doc_counts[i]
        lenth = index.doc_lens[i]
        score = sum((cnt[qw] / lenth) * index.idf.get(qw, 0) for qw in query_words)
        score += source_boost.get(chunk["source"], 0)
        scored.append((score, chunk))

    scored.sort(key=lambda x: x[0], reverse=True)

    selected = [c for score, c in scored[:top_n] if score > 0]
    if not selected:
        selected = [c for _, c in scored[:top_n]]

    context_str = "\n\n".join(
        f"=== {c['source']} › {c['header']} ===\n{c['content']}"
        for c in selected
    )
    sources = list(dict.fromkeys(c["source"] for c in selected))
    return context_str, sources


# ── Models ────────────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str
    history: list = []
    model:   str  = "gemma4:e2b"


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/api/models")
async def get_models():
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res    = await client.get("http://localhost:11434/api/tags")
            models = [m["name"] for m in res.json().get("models", [])]
            return {"models": models}
    except Exception:
        return {"models": ["gemma4:e2b", "gemma2:2b"]}


@app.post("/api/reload")
async def reload_index():
    """Hit this after editing any .md file — no server restart needed."""
    global _kb_index
    _kb_index = None
    idx = build_index()
    return {"status": "reloaded", "chunks": len(idx.chunks)}


@app.post("/chat")
async def chat(req: ChatRequest):
    # Basic pattern — no model call needed
    q_lower = req.message.lower().strip()
    for pattern, reply in BASIC_PATTERNS:
        if re.search(pattern, q_lower):
            async def quick_reply():
                yield f"__METADATA__:{json.dumps({'sources': []})}\n"
                yield reply
            return StreamingResponse(quick_reply(), media_type="text/plain")

    index = build_index()
    context_str, sources = retrieve_relevant_context(req.message, index)

    system = f"""You are a helpful AI assistant for Sunway College Kathmandu.

RULES:
- Answer only what is asked. Be concise (3-5 sentences max).
- Use only the provided context. If the answer is not in the context, say so clearly.
- Do not invent facts, fees, dates, or names.
- No filler phrases like "Great question!" or "Certainly!".

CONTEXT:
{context_str}"""

    messages = [{"role": "system", "content": system}]
    messages.extend(req.history)
    messages.append({"role": "user", "content": req.message})

    async def generate_chunks():
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                async with client.stream("POST", "http://localhost:11434/api/chat", json={
                    "model":    req.model,
                    "messages": messages,
                    "stream":   True,
                    "think":    False,
                    "options": {
                        "num_predict": 300,
                        "temperature": 0.1,
                        "top_k":       20,
                        "top_p":       0.8,
                        "num_ctx":     4096,
                    }
                }) as r:
                    async for line in r.aiter_lines():
                        if line:
                            try:
                                content = json.loads(line).get("message", {}).get("content", "")
                                if content:
                                    yield content
                            except Exception:
                                pass
        except httpx.ConnectError:
            yield "Error: Cannot connect to Ollama. Make sure 'ollama serve' is running."
        except Exception as e:
            yield f"Error: {str(e)}"

    async def stream_filter(generator):
        full = ""
        async for chunk in generator:
            full += chunk
        full = re.sub(r'<think>.*?</think>', '', full, flags=re.DOTALL).strip()
        yield full

    async def streaming_response():
        yield f"__METADATA__:{json.dumps({'sources': [{'label': s} for s in sources]})}\n"
        async for chunk in stream_filter(generate_chunks()):
            yield chunk

    return StreamingResponse(streaming_response(), media_type="text/plain")


@app.get("/", response_class=HTMLResponse)
async def index_page():
    html_path = Path(__file__).parent / "index.html"
    if html_path.exists():
        return HTMLResponse(content=html_path.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>index.html not found</h1>", status_code=404)