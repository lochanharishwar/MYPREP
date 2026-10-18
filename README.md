# InkWise — Gemma 4 AI Math Notebook

> **Think on paper. Learn with intelligence.**
> Built natively for **Google DeepMind Gemma 4** with deterministic **SymPy** verification.

---

## 🌟 Overview

**InkWise** is a digital mathematics workspace inspired by natural pen-and-paper problem solving. Learners write equations with a mouse, trackpad, or pressure-aware stylus; the application understands the work, helps with calculations, catches algebraic missteps, plots functions, and answers questions contextually without continuous interruption.

### Key Capabilities
- **Gemma 4-Native AI Gateway**: Multi-model routing across local Ollama (`gemma4:e4b`, `gemma4:e2b`, `gemma4:12b`, `gemma4:26b`), hosted Google Gemma 4 (`gemma-4-26b-a4b-it`, `gemma-4-31b-it`), and offline synthetic test mode.
- **Symbolic Truth via SymPy**: Every algebraically testable claim (derivatives, integrals, step transitions, domain exclusions) is independently checked by SymPy before Gemma explains it.
- **Natural Vector Canvas**: Smooth handwriting with Catmull-Rom interpolation, pressure sensitivity, multi-layer rendering (grid, lined, dotted, graph paper), whole-stroke & area erasers, undo/redo, and lasso selection.
- **In-Canvas AI Cards**: One-click "Add to Canvas" places draggable, reversible annotations directly beside the student's handwritten work.
- **Interactive Graphing Object**: Safe mathematical expression parsing, root finding, extrema detection, and embeddable whiteboard graph cards.
- **PDF & Worksheet Import**: Annotate worksheets, circle problem questions, and request context-aware hints.
- **Push-to-Talk Voice & Intent Gate**: Conservative decision gate (`IGNORE`, `SHOW_SUBTLE_SUGGESTION`, `ASK_CLARIFYING_QUESTION`, `ANSWER`) with full student consent.
- **Zero Docker Windows Localhost**: Runs cleanly on Windows terminal with SQLite and local Python.

---

## 🚀 Quick Start (Windows Localhost)

### 1. Prerequisites
- **Node.js**: v18+ (tested on v24.14)
- **Python**: 3.11 or 3.12 with `sympy`, `fastapi`, and `uvicorn`
- **Ollama** (optional for local inference): [Download Ollama for Windows](https://ollama.com/download)

### 2. Install & Initialize
```powershell
# In d:\ANTIGRAVITY\KROWDKRAFT
npm install

# Initialize local SQLite database
npx prisma db push
```

### 3. Run System Diagnostics
```powershell
npm run doctor
```
This validates your Node version, Python, SymPy, Prisma SQLite, and Gemma 4 setup.

### 4. Run Golden Math Fixture Suite
```powershell
npm run test:math
```
Verifies Scenario A ($f(x) = 6x^2 \to 12x$), Scenario B (catch mistake $d/dx[x^3] \neq 2x^2$), Scenario C (roots of $x^2 - 4x + 3$), and domain exclusions.

---

## 🧠 Gemma 4 Model Setup

### Option A: Local Inference via Ollama (Default MVP)
1. Install Ollama and pull your chosen Gemma 4 model:
   ```powershell
   ollama pull gemma4:e4b
   # Or lightweight for lower-spec hardware:
   ollama pull gemma4:e2b
   ```
2. Set in `.env`:
   ```ini
   GEMMA_BACKEND=ollama
   GEMMA_OLLAMA_MODEL=gemma4:e4b
   GEMMA_OLLAMA_BASE_URL=http://127.0.0.1:11434
   ```

### Option B: Hosted Gemma 4 via Google Gemini API
1. Obtain an API key from Google AI Studio.
2. Set in `.env`:
   ```ini
   GEMMA_BACKEND=google-gemma-api
   GEMMA_GOOGLE_MODEL=gemma-4-26b-a4b-it
   GEMINI_API_KEY=your_key_here
   ```
*(Note: Uses the Google Gemini API transport to run Google DeepMind's official Gemma 4 models).*

### Option C: Offline Synthetic Dev Mode
If neither Ollama nor an API key is available, set:
```ini
GEMMA_BACKEND=mock
```
InkWise will operate with an honest synthetic development mock returning valid Gemma 4 JSON schemas and SymPy-verified results.

---

## ⚡ Running the Application

### Terminal 1: Start Next.js App
```powershell
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

### Terminal 2 (Optional): Start FastAPI SymPy Service
```powershell
python services/math/main.py
```
*Note: If the Python service is not started, InkWise automatically falls back to its built-in TypeScript symbolic algebra engine.*

---

## 📐 Supported Demonstration Scenarios

1. **Scenario A (Derivative Correction)**: Write $f(x) = 6x^2$, select with box tool, click *Explain*, and receive verified $f'(x) = 12x$ with SymPy badge.
2. **Scenario B (Mistake Detection)**: Write $\frac{d}{dx}[x^3] = 2x^2$, click *Check Steps*, and see the earliest invalid algebraic step flagged ($3x^2 \neq 2x^2$).
3. **Scenario C (Graph Exploration)**: Click *Graph*, type $x^2 - 4x + 3$, view interactive roots at $x=1$ and $x=3$, and insert the card onto the whiteboard.
4. **Scenario D (Worksheet Annotation)**: Click *Worksheet*, upload a problem sheet, write annotations over a question, and request Socratic hints.
5. **Scenario E (Push-to-Talk Voice)**: Hold the microphone button, ask *"Can you explain this derivative?"*, and watch the intent classifier route the request.
