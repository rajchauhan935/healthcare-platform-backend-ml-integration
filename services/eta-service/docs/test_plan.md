# Test plan: ETA service (AI-04, AI-05, AI-06)

> ETAs are **estimates**, not guaranteed arrival times. The model was trained on **fake
> (synthetic) data**, so none of these tests say anything about real-world accuracy. This
> service is not for real emergency dispatch.

## How to run

From the project folder, with the virtual environment active (`(.venv)` in the prompt):

```
python -m ml.eta.synthetic     # only if data/synthetic_trips.csv is missing
python -m ml.eta.evaluate      # only if data/baseline_metrics.json is missing
python -m ml.eta.model         # only if models/ is missing
pytest -q
```

A few tests read the committed files in `data/` and `models/`, so those must exist.
`tests/test_api.py` needs `fastapi` and `httpx` (see `requirements-dev.txt`).

## Latest results (run by Shreya on her Windows machine, 12 Oct 2026)

| Command | Result |
|---|---|
| `pytest tests\test_estimator.py -q` | 61 passed |
| `pytest -q` (all tests) | 584 passed, 1 warning |
| Manual live check (cases L1 and L2 below) | matched the expected output |

The one warning is a Starlette notice that `httpx` is deprecated for its test client in favour
of `httpx2`. It does not affect results. No test failed. These numbers come from a real run,
not from this document: the guard test (`tests/test_test_plan.py`) only checks that every test
named below still exists, it does not re-check results.

## How cases are written

Every case has an ID, what it checks, the input and the expected result, and the exact test
that covers it (`file::test_name`). Some tests run many inputs (for example one test checks
25 bad request values), so 584 tests cover far more than the cases listed here. The cases
below are the important ones, grouped by purpose. Case IDs starting with `L` are manual live
checks without an automated test.

## A. Baseline function (`predict_eta`, AI-04)

| ID | Type | What it checks | Input and expected result | Test |
|---|---|---|---|---|
| F1 | valid | Off-peak ETA equals the hand calculation | distance / 40 km/h x 60 | `tests/test_eta.py::test_off_peak_eta_matches_hand_calculation` |
| F2 | valid | Peak ETA equals the hand calculation | distance / 25 km/h x 60 | `tests/test_eta.py::test_peak_eta_matches_hand_calculation` |
| F3 | valid | Peak is slower than off-peak for the same trip | same trip at hour 9 and hour 14: peak ETA is larger | `tests/test_eta.py::test_peak_is_slower_than_off_peak_for_the_same_trip` |
| F4 | edge | Identical start and end points | ETA 0.0 and distance 0.0 | `tests/test_eta.py::test_identical_coordinates_give_zero_eta_and_zero_distance` |
| F5 | contract | Result has exactly the agreed fields | keys are `etaMinutes` and `distanceKm` only | `tests/test_eta.py::test_result_has_exactly_the_contract_keys` |
| F6 | contract | Valid results are non-negative with 2 decimals | all samples: value >= 0, rounded to 2 decimals | `tests/test_eta.py::test_values_are_non_negative_floats_with_two_decimals` |
| F7 | valid | Distance formula against a known value | one degree of latitude is about 111.2 km | `tests/test_eta.py::test_one_degree_of_latitude` |
| F8 | invalid | Latitude outside -90 to 90, wrong type, NaN | rejected with a clear error | `tests/test_eta.py::test_bad_latitude_is_rejected` |
| F9 | invalid | Hour not a whole number 0 to 23 | `8.0`, `"8"`, `True`, 24, -1 all rejected | `tests/test_eta.py::test_bad_hour_is_rejected` |
| F10 | invalid | Ambulance type other than exact `BLS` | `"bls"`, `"ALS"`, `None` rejected | `tests/test_eta.py::test_bad_ambulance_type_is_rejected` |
| F11 | safety | Error text never repeats the submitted value | the bad value does not appear in the message | `tests/test_eta.py::test_error_message_does_not_echo_the_submitted_value` |

## B. Learned model (`ml/eta/model.py`, AI-06)

| ID | Type | What it checks | Input and expected result | Test |
|---|---|---|---|---|
| M1 | contract | Model output has the agreed fields and valid values | `etaMinutes` and `distanceKm`, finite, >= 0 | `tests/test_model.py::test_prediction_has_the_contract_keys_and_valid_values` |
| M2 | valid | A 10 km trip gets a sensible estimate | a plausible number of minutes, not zero or huge | `tests/test_model.py::test_a_ten_kilometre_trip_gets_a_sensible_estimate` |
| M3 | fallback | A bad model output is never returned | negative or non-finite prediction raises an error | `tests/test_model.py::test_an_invalid_model_output_raises_instead_of_being_returned` |
| M4 | safety | A damaged model file is detected | changed file bytes fail the checksum check | `tests/test_model.py::test_a_changed_model_file_is_detected_by_its_checksum` |
| M5 | leakage | Columns the API never receives cannot affect the features | changing traffic or road type leaves features unchanged | `tests/test_model.py::test_columns_the_api_does_not_receive_cannot_change_the_features` |
| M6 | reproducible | Training twice gives the same model | same data and seed give identical coefficients | `tests/test_model.py::test_training_is_reproducible` |

## C. Model with baseline fallback (`ml/eta/estimator.py`, AI-06)

| ID | Type | What it checks | Input and expected result | Test |
|---|---|---|---|---|
| E1 | valid | A normal trip is answered by the model | 19.8 km trip, 14:00: source `model` | `tests/test_estimator.py::test_normal_trip_uses_the_model` |
| E2 | fallback | Trip shorter than the training data | about 0.1 km: baseline answers | `tests/test_estimator.py::test_trip_shorter_than_training_data_uses_the_baseline` |
| E3 | fallback | Trip longer than the training data | about 50 km: baseline answers | `tests/test_estimator.py::test_trip_longer_than_training_data_uses_the_baseline` |
| E4 | fallback | Model files missing at startup | ERROR logged once, baseline answers | `tests/test_estimator.py::test_missing_model_files_log_an_error_and_serve_the_baseline` |
| E5 | fallback | Model file damaged at startup | ERROR logged, baseline answers | `tests/test_estimator.py::test_damaged_model_file_logs_an_error_and_serves_the_baseline` |
| E6 | fallback | Model raises or returns a bad number during a request | `ValueError`, negative, NaN, infinity: baseline answers, warning logged | `tests/test_estimator.py::test_model_failure_or_invalid_prediction_uses_the_baseline` |
| E7 | safety | Unrelated bugs are not hidden by the fallback | a `RuntimeError` inside the model still raises | `tests/test_estimator.py::test_unrelated_errors_are_not_hidden_by_the_fallback` |
| E8 | safety | Logs never contain coordinates | no coordinate text in any log line | `tests/test_estimator.py::test_fallback_logs_do_not_contain_coordinates` |

## D. HTTP API (`POST /eta`, `GET /health`, AI-06)

| ID | Type | What it checks | Input and expected result | Test |
|---|---|---|---|---|
| A1 | valid | A valid request returns the agreed shape | 200, body has `etaMinutes` and `distanceKm` only | `tests/test_api.py::test_valid_request_returns_200_with_the_two_contract_fields` |
| A2 | valid | The optional source header is set | `X-ETA-Source: model` for a normal trip | `tests/test_api.py::test_normal_request_is_answered_by_the_model` |
| A3 | valid | Extra request fields are ignored | same answer with or without extra fields | `tests/test_api.py::test_extra_fields_are_ignored` |
| A4 | invalid | Each missing field gives 422 | one test run per field, the field is named | `tests/test_api.py::test_each_missing_field_gives_422_naming_that_field` |
| A5 | invalid | Wrong types and out-of-range values | 25 bad values (strings, booleans, `8.0`, huge number, ...): 422 | `tests/test_api.py::test_bad_values_give_422_naming_the_field` |
| A6 | safety | 422 never echoes what was sent | secret marker text is absent, no `input` key | `tests/test_api.py::test_422_never_echoes_the_submitted_values` |
| A7 | invalid | NaN and infinity in JSON | 422 | `tests/test_api.py::test_nan_and_infinity_are_rejected` |
| A8 | invalid | Broken or wrong-shaped bodies | empty, not JSON, list, string, null: 422, no echo | `tests/test_api.py::test_broken_or_wrong_shaped_bodies_give_422_without_echo` |
| A9 | invalid | Which error is reported first | bad `fromLat` and bad `hour`: `fromLat` is reported | `tests/test_api.py::test_first_error_follows_the_contract_order` |
| A10 | edge | Identical start and end points | 200, `0.0` and `0.0`, header `baseline` | `tests/test_api.py::test_identical_points_return_zero_from_the_baseline` |
| A11 | fallback | Distance outside the trained range | 200, header `baseline`, same numbers as `predict_eta` | `tests/test_api.py::test_distance_outside_the_trained_range_uses_the_baseline` |
| A12 | fallback | Service started without model files | 200 from the baseline, `/health` says `modelLoaded: false` | `tests/test_api.py::test_missing_model_files_serve_the_baseline` |
| A13 | fallback | Service started with a damaged model file | 200 from the baseline | `tests/test_api.py::test_damaged_model_file_serves_the_baseline` |
| A14 | fallback | Model fails during a request | raising model, negative and NaN output: 200 from the baseline | `tests/test_api.py::test_model_failing_during_a_request_serves_the_baseline` |
| A15 | safety | An unexpected bug does not leak details | 500, response has no internal text or coordinates | `tests/test_api.py::test_an_unexpected_bug_gives_500_without_leaking_details` |
| A16 | valid | Health check | 200, `{"status": "ok", "modelLoaded": true}` | `tests/test_api.py::test_health_reports_the_model_is_loaded` |
| A17 | invalid | Wrong HTTP method | `GET /eta` gives 405 | `tests/test_api.py::test_get_on_eta_is_not_allowed` |

## E. Manual live checks (real server, run once by Shreya)

Start the server in one terminal: `uvicorn api.main:app --host 127.0.0.1 --port 8000`.
In a second terminal (venv active) send these requests with Python and `httpx`.

| ID | Type | Request | Expected | Actual (12 Oct 2026) |
|---|---|---|---|---|
| L1 | valid | `fromLat` 28.6139, `fromLng` 77.2090, `toLat` 28.5355, `toLng` 77.3910, `hour` 14, `ambulanceType` "BLS" | 200, header `model`, `{"etaMinutes":44.11,"distanceKm":19.8}` | `200 model {"etaMinutes":44.11,"distanceKm":19.8}` |
| L2 | invalid | same request with `hour` set to the string `"8"` | 422, no echo of the value | `422 {"detail":[{"loc":["body","hour"],"msg":"hour must be a whole number (integer).","type":"value_error"}]}` |

## What is NOT tested

* **Real-world accuracy.** The data is invented, so no test shows the ETAs match real roads.
  The model is only compared with the baseline on that fake data.
* **Load and speed.** No test sends many requests at once or measures response time.
* **The Node/Naga side.** No test calls this service from the Node.js backend. Shreya reports
  that Naga said yes to the three open points (identical points return `0.0`, `ambulanceType`
  must be exactly `"BLS"`, `hour` must be an integer); the reply itself is not stored in this
  repository.
* **Other operating systems and Python versions.** Everything was run on Windows with
  Python 3.13.7 only. The saved model requires scikit-learn 1.9.1 exactly.
* **Security hardening.** Model files are loaded with `joblib` (a pickle format), so only load
  files you created. There is no authentication or rate limiting.
* **Mutation-checked only in part.** Key tests were proven able to fail by breaking the code
  on purpose in earlier phases and for `estimator.py`. This was not done for every test.