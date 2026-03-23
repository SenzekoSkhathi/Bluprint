# Bluprint Backend

Python backend for handbook-grounded academic advising with a multi-agent pipeline.

## What this backend does

- Ingests handbook files from AWS S3.
- Prioritizes science handbooks for higher retrieval weighting.
- Uses Gemini models for extraction, summarization, and response generation.
- Runs a multi-agent orchestration flow so each step is isolated and testable.

## Task Roadmap

1. Foundation and orchestration skeleton (this step)
2. AWS handbook ingestion agent (S3 listing and fetch)
3. PDF parsing/chunking agent with science-specific tagging
4. Gemini enrichment + embedding/index persistence
5. Retrieval and advisor answer API
6. Observability, tests, and deployment hardening

## Environment Variables

Use your existing `.env` and ensure these are present:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `AWS_S3_HANDBOOK_BUCKET`
- `AWS_S3_HANDBOOK_PREFIX` (optional)
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (optional, default configured in code)
- `GEMINI_EMBEDDING_MODEL` (optional, default `text-embedding-004`)
- `EMBEDDING_BATCH_SIZE` (optional, default `32`)
- `SCIENCE_HANDBOOK_KEYWORDS` (comma-separated, optional)
- `BACKEND_DATA_DIR` (optional, default `./data`)
- `MAX_HANDBOOK_BYTES` (optional, max file size guard)
- `CHUNK_SIZE_CHARS` (optional, default `1200`)
- `CHUNK_OVERLAP_CHARS` (optional, default `180`)
- `FRONTEND_ALLOWED_ORIGINS` (optional, comma-separated CORS allowlist, default `*`)
- `AUTH_SHARED_PASSWORD` (required for login endpoint, shared student password in current implementation)

## Current Task Status

- Task 1 complete: backend scaffold and agent orchestration skeleton
- Task 2 complete: S3 file download, PDF/text parsing, chunking, and persisted chunk artifacts
- Task 3 complete: Gemini embeddings and persisted vector index artifacts
- Task 4 complete: retrieval and grounded advisor APIs over science index artifacts

## Task 2 Output Artifacts

Each science pipeline run now writes:

- `data/raw/<run_id>/...` downloaded handbook source files
- `data/chunks/<run_id>.jsonl` parsed chunk records for retrieval/indexing
- `data/chunks/<run_id>.manifest.json` summary metadata for the run
- `data/index/<run_id>.jsonl` vector index entries with Gemini embeddings
- `data/index/<run_id>.manifest.json` index metadata and vector dimensions

## Run locally

```bash
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
```

If you are launching from the workspace root instead of `Backend/`, use:

```bash
python -m uvicorn --app-dir Backend main:app --reload --port 8000
```

Then open `http://localhost:8000/docs`.

To connect the Expo frontend, set `EXPO_PUBLIC_BACKEND_URL` in the app environment when the default local URL is not reachable from the device. Examples:

- Web: `EXPO_PUBLIC_BACKEND_URL=http://localhost:8000`
- Android emulator: `EXPO_PUBLIC_BACKEND_URL=http://10.0.2.2:8000`
- Physical device: `EXPO_PUBLIC_BACKEND_URL=http://<your-lan-ip>:8000`

## Task 4 API Endpoints

- `POST /auth/login`
  : Body `{ "student_number": "XYZABC123", "password": "..." }`

- `POST /retrieval/science/query`
  : Body `{ "query": "...", "top_k": 5, "run_id": "optional" }`

- `POST /advisor/science/ask`
  : Body `{ "query": "...", "top_k": 5, "run_id": "optional" }`

If `run_id` is omitted, the backend automatically uses the latest index manifest in `data/index`.
