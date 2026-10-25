# Ujala integration staging package

This is a staging package, NOT a completed merge of teammates' GitHub repositories. No production readiness is claimed. Synthetic demo data must not be used for real emergency dispatch.

## Modules
- `backend/`: reserve for Karthik's Node/Express/PostgreSQL repository, which must be cloned or supplied before code-level integration.
- `services/eta/`: reserve for Shreya's ETA repository; use its `feature/eta-baseline` branch as inspected, and verify current API contract before wiring.
- `services/recommendation/`: uploaded FastAPI rule-based recommendation module, with the CSV under `data/` (supported by rules.py).
- Existing user backend and ML analytics: bring into a separate branch, never merge unrelated original local Git history.

## Local recommendation API (PowerShell)
```
cd services/recommendation
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn api:app --host 127.0.0.1 --port 8001
```
Open http://127.0.0.1:8001/docs. Port 8001 avoids conflict with the ETA API on 8000.

## Proposed service contracts
- Recommendation: POST http://127.0.0.1:8001/recommend with emergencyType, patientLat, patientLng, ambulances[], hospitals[]; returns ambulanceType, hospitalCategory, topHospitals[], reason. Backend supplies current resource candidates from its data layer; do not trust synthetic JSON as real availability.
- ETA: POST http://127.0.0.1:8000/eta with fromLat/fromLng/toLat/toLng/hour/ambulanceType. The inspected ETA README specifies BLS only. Do not send ICU/ALS without confirmed support.
- Node backend: add separate RECOMMENDATION_API_URL and ETA_API_URL in .env.example; preserve timeout, response validation, safe manual-triage fallback. Do not activate live calls until contracts/tests align.

## Checks completed here
- Python syntax compilation passed for api.py, rules.py, recommender.py.
- Four uploaded JSON files parsed.
- FastAPI TestClient: GET /health returned 200. All five sample scenarios returned expected HTTP statuses (200/200/200/422/422). These checks do not establish complete response equivalence, backend integration, production security, or real-world clinical validity.

## Outstanding
1. Obtain exact current backend and ETA repository source snapshots, including current branch/commit.
2. Map backend route/service files and DB tables to recommendation input fields.
3. Resolve ETA BLS-only vs backend ICU/ALS type mismatch.
4. Confirm backend's existing root src vs user's apps/backend responsibilities; preserve both until decided.
5. Add contract, error, timeout, and end-to-end tests. Never commit secrets or private .env files.
