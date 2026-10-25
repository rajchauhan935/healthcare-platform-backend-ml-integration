# 5-minute demo script: ETA service

> Say this first: **all data and model results are fake (synthetic). ETAs are estimates, not
> guaranteed arrival times. Not for real dispatch.**

## Before the demo (2 minutes of setup)

* Terminal 1 and Terminal 2 open in the project folder, both with `(.venv)` showing.
* Terminal 1 ready to run: `uvicorn api.main:app --host 127.0.0.1 --port 8000`
* Optional: `notebooks/eta_baseline_and_models.ipynb` open as a backup if the server fails.

## Timeline

| Time | What to do | What to say |
|---|---|---|
| 0:00 to 0:30 | Show `README.md` top | "This service estimates ambulance travel time (BLS only). Request: fromLat, fromLng, toLat, toLng, hour, ambulanceType. Response: etaMinutes and distanceKm. Everything is built on fake data." |
| 0:30 to 1:30 | Terminal 2: `python -c "from ml.eta.eta import predict_eta; print(predict_eta(28.6139,77.2090,28.5355,77.3910,14,'BLS'))"` | "First a simple formula baseline: distance divided by 40 km/h, or 25 km/h in peak hours. Result: 29.69 minutes for 19.8 km. The speeds are accepted assumptions, not measurements." |
| 1:30 to 2:30 | Open `data/baseline_metrics.json`, then `data/model_comparison.json` | "On 1000 invented trips the baseline is off by 11.22 minutes on average. Linear Regression is off by 9.80, a gain of 1.42 minutes. But it is worse in peak hours, 12.77 against 12.11. This is only how they do on invented data." |
| 2:30 to 3:30 | Terminal 1: start the server. Terminal 2: run the two requests below | "The API uses the model when it can. The `X-ETA-Source` header says whether the model or the baseline answered. Bad input gets a 422 that never repeats what was sent." |
| 3:30 to 4:15 | Terminal 2: `pytest tests\test_api.py -q -k "missing_model or damaged or failing"` | "If the model file is missing, damaged, or fails during a request, the baseline answers instead and the API still returns 200. These tests break the model on purpose to prove it." |
| 4:15 to 5:00 | Terminal 2: `pytest -q`, then open `docs/limitations_and_blockers.md` | "598 tests pass. Open points: the jump of 11 to 16 minutes where the model hands over to the baseline above about 22 km, and the peak-hour result." |

Stop the server with Ctrl+C when you are done.

## Requests for the live part (Terminal 2, venv active)

Good request (expect `200 model {"etaMinutes":44.11,"distanceKm":19.8}`):

```
python -c "import httpx;r=httpx.post('http://127.0.0.1:8000/eta',json={'fromLat':28.6139,'fromLng':77.2090,'toLat':28.5355,'toLng':77.3910,'hour':14,'ambulanceType':'BLS'});print(r.status_code,r.headers.get('x-eta-source'),r.text)"
```

Bad request, hour sent as text (expect a 422 that does not repeat the value):

```
python -c "import httpx;r=httpx.post('http://127.0.0.1:8000/eta',json={'fromLat':28.6139,'fromLng':77.2090,'toLat':28.5355,'toLng':77.3910,'hour':'8','ambulanceType':'BLS'});print(r.status_code,r.text)"
```

Very long trip, about 50 km (expect `200 baseline {"etaMinutes":74.47,"distanceKm":49.65}`, because it is outside the trained range):

```
python -c "import httpx;r=httpx.post('http://127.0.0.1:8000/eta',json={'fromLat':28.6139,'fromLng':77.2090,'toLat':28.9,'toLng':77.6,'hour':14,'ambulanceType':'BLS'});print(r.status_code,r.headers.get('x-eta-source'),r.text)"
```

The third request was run on 13 Oct 2026 and returned
`200 baseline {"etaMinutes":74.47,"distanceKm":49.65}`.

## Likely questions

* **"Is the model accurate?"** On fake data it beats the baseline by about 1.4 minutes overall.
  That says nothing about real roads. Real trip data is needed.
* **"Why does the answer change suddenly above 22 km?"** The model was trained up to 21.99 km, so
  longer trips use the baseline, which is lower on this data. This is listed as a decision for the
  lead.
* **"What if the model file is broken?"** The service logs an ERROR and keeps answering with the
  baseline. `GET /health` shows `modelLoaded: false`.
* **"Why is `hour` strict?"** `8.0` or `"8"` is rejected so wrong data from the caller is noticed
  instead of silently converted. Naga confirmed an integer `hour` (reported by Shreya).

## If something goes wrong

* Server will not start: check that `(.venv)` shows and that `python -m pip show uvicorn` works.
* Port 8000 busy: use `--port 8001` and change the port in the requests.
* Anything else: open the notebook and run all cells. It shows the same results without a server.