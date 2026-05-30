# Brand Engine

A PoC tool for querying brand guidelines and checking creative work against them using AI. Ask questions about the brand, or upload a design image to get a compliance verdict.

**Tech stack:** SvelteKit · Tailwind CSS · Vercel AI SDK · Anthropic Claude · TypeScript

---

## What it does

- **Ask questions** — type any brand-related question and get a sourced, confidence-rated answer backed by the brand documents
- **Check designs** — upload an image (logo, banner, social post, etc.) to get a structured compliance review: visual integrity checks, brand guideline compliance, and a Pass/Fail verdict
- **Stretch detection** — combines client-side pixel analysis (mathematically detects distortion by measuring the logo's bounding box aspect ratio) with Claude Opus visual review and canonical reference image comparison
- **Cited answers** — every response references the exact source documents used
- **Markdown formatting** — responses render bold, lists, and emphasis correctly

---

## Project structure

```
src/
  lib/
    brand-documents/        # Brand guideline files (MD + PDF-extracted MD)
    brand-assets/
      references.json       # Auto-generated: canonical reference images as base64
    server/
      ai.ts                 # Prompt construction, Claude API calls
      loadDocuments.ts      # Loads all .md files via Vite import.meta.glob
      loadReferenceImages.ts # Loads reference images from references.json
      retrieveDocuments.ts  # RAG seam — currently returns all docs (swap for embeddings later)
    analyzeImage.ts         # Client-side pixel analysis (Canvas API, no AI)
  routes/
    +page.svelte            # Single-page UI
    api/chat/+server.ts     # POST endpoint — streams Claude response

scripts/
  preprocess-pdfs.ts        # Extracts text and reference images from PDF brand books
```

---

## Setup

### 1. Install dependencies

```sh
yarn install
```

### 2. Add brand documents

Place brand guideline files in `src/lib/brand-documents/`. Supported formats:

- **Markdown (`.md`)** — loaded directly at build time
- **PDF (`.pdf`)** — image-based PDFs (e.g. exported slide decks) must be preprocessed first (see below)

### 3. Preprocess PDFs

Most brand books are exported as image-based PDFs with no text layer. The preprocess script converts each PDF into two things:

1. A `<name>-extracted.md` file — Claude reads the PDF pages as images and extracts all brand information (colours with hex codes, typography, logo rules, prohibited uses, etc.) into a structured markdown file
2. `references.json` — four key pages (primary logo, symbol logo, colour palette, logo backgrounds) are extracted as JPEG images and base64-encoded into a JSON file used for visual compliance checking

```sh
# First time (or when the PDF changes)
yarn preprocess

# Force re-extraction even if output files already exist
yarn preprocess:force
```

**Requirements:**
- `ANTHROPIC_API_KEY` must be set in your environment (the script calls Claude vision)
- `pdftoppm` must be installed (`brew install poppler` on macOS)

**What gets created:**

```
src/lib/brand-documents/
  Aagee Brand Guideline-extracted.md   ← full text extraction of the PDF
src/lib/brand-assets/
  references.json                       ← base64-encoded reference images
```

The extracted `.md` file is committed to git and deployed to Vercel — it's what Claude reads when answering questions. The source PDF is gitignored (too large for GitHub's 100 MB limit).

`references.json` is also committed — it contains ~1.6 MB of base64-encoded reference images baked into the server bundle at build time, used for visual distortion detection.

### 4. Environment variables

```sh
cp .env.local.example .env.local   # or create manually
```

`.env.local`:
```
ANTHROPIC_API_KEY=sk-ant-...
```

### 5. Run

```sh
yarn dev
```

---

## Adding new brand documents

### Markdown files

Drop a `.md` file into `src/lib/brand-documents/`. It's picked up automatically on next build — no other changes needed.

### PDF brand books

1. Copy the PDF into `src/lib/brand-documents/`
2. Run `yarn preprocess`
3. Commit the generated `<name>-extracted.md` file
4. If the PDF contains the brand's primary logo, update `REFERENCE_PAGES` in `scripts/preprocess-pdfs.ts` to point to the correct page numbers for logo and colour pages, then run `yarn preprocess:force` to regenerate `references.json`

The PDF itself should **not** be committed (add to `.gitignore` — it's already covered by `src/lib/brand-documents/*.pdf`).

---

## Deploying to Vercel

1. Push to GitHub
2. Import the repo at [vercel.com/new](https://vercel.com/new)
3. Set the `ANTHROPIC_API_KEY` environment variable in Vercel project settings
4. Deploy — build command `yarn build`, framework preset SvelteKit (auto-detected)

Brand documents and reference images are bundled into the serverless function at build time via Vite's `import.meta.glob` and JSON import, so no filesystem access is needed at runtime.

---

## Architecture notes

### RAG seam

`src/lib/server/retrieveDocuments.ts` is a deliberate abstraction layer. It currently returns all brand documents on every request. To add proper retrieval (keyword search, embeddings, pgvector, Pinecone, etc.), replace only this file — the API route and AI layer stay unchanged.

### Image review pipeline

When an image is uploaded:

1. **Client-side pixel analysis** (`analyzeImage.ts`) — Canvas API finds the bounding box of Lime-coloured pixels (`#DDFB66`), computes the logo's aspect ratio. Ratios outside the expected 3.2–3.8:1 range are flagged as distortion with a `⚠️ PIXEL ANALYSIS FLAG` note. This is deterministic and runs before any AI call.

2. **Reference image comparison** — four canonical reference images (extracted from the brand PDF during preprocessing) are sent alongside the submitted image. Claude compares the submitted logo directly against the approved version.

3. **Structured visual checks** — Claude Opus follows a forced-choice format (CHECK 1–5) covering counter shapes, A-symbol proportions, wordmark aspect ratio, rotation, and colour. Any FAIL in the checks, or any pixel analysis flag, forces a Fail verdict.

### Models used

- **Text Q&A:** `claude-sonnet-4-6` (fast, cost-efficient)
- **Image review:** `claude-opus-4-5` (better visual geometry reasoning for distortion detection)
