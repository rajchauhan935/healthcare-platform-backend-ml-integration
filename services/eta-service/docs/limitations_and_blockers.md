# Remaining limitations and blockers

> ETAs are **estimates**, not guaranteed arrival times. Every model result here comes from
> **fake (synthetic) data** and is not a validation against real traffic. This service is not
> for real emergency dispatch.

## Blockers

None. The mentor told Shreya (reported by Shreya, 16 to 17 Oct 2026) not to wait for the lead's
repository and to create her own repository instead.

Confirmed with Naga (reported by Shreya on 12 Oct 2026; the reply itself is not stored in this
repository): identical points return `0.0` / `0.0`, `ambulanceType` must be exactly `"BLS"`, and
`hour` must be a JSON integer.

## Limitations

### Data and assumptions
* **Everything is invented.** The dataset, its detours, speeds, traffic and noise are made-up
  values (`docs/dataset.md`). Results say how the rules behave in that invented world only.
* **Baseline speeds (25 km/h peak, 40 km/h off-peak) and peak hours (8 to 10, 17 to 20) were
  accepted by the mentor but are not measured data.** The dataset uses the same rush hours as the
  baseline, which flatters the baseline's hour assumption.
* **Only ambulance type `BLS` exists.** Anything else is rejected.

### Model results (synthetic validation, 200 trips, seed 42)
| | All hours | Peak hours (62 trips) | Off-peak (138 trips) |
|---|---|---|---|
| Formula baseline MAE | 11.22 min | 12.11 min | 10.82 min |
| Linear Regression MAE (served) | 9.80 min | 12.77 min | 8.47 min |
| Random Forest MAE (comparison) | 9.99 min | 13.17 min | 8.56 min |

* Overall, Linear Regression is better than the baseline by 1.42 minutes (95% bootstrap interval
  0.43 to 2.37). **In peak hours it is worse** than the baseline in this sample (12.77 against
  12.11). Whether that peak difference is real was not tested.
* The baseline is too low on average by 8.30 minutes, because the invented world has detours.
* None of this shows real-world accuracy.

### Behaviour at the edges
* **The model only answers inside the distance range it was trained on, about 0.52 to 21.99 km.**
  Shorter and longer trips, and identical start and end points, are answered by the baseline.
* **There is a jump where the model hands over to the baseline at the long end.** At 21.99 km the
  model says 48.83 minutes off-peak and the baseline says 32.99 (15.8 minutes lower); at peak the
  figures are 63.97 and 52.78 (11.2 minutes lower). A trip a little longer than 22 km therefore
  gets a noticeably smaller ETA than one a little shorter. At the short end the two differ by
  less than 2 minutes. **Decision needed from the lead:** keep it, retrain on a wider range, or
  adjust the baseline.
* Very short peak-hour trips can make the model predict a negative time. Those use the baseline.

### Engineering
* **Pickle files.** The model is loaded with `joblib`. Only load model files you created. The
  SHA-256 check catches accidental damage, not a deliberately crafted file.
* **scikit-learn must be exactly 1.9.1** for the saved model to load. Otherwise the service logs
  an ERROR and uses the baseline. Retrain with `python -m ml.eta.model` after changing versions.
* **Tested on Windows with Python 3.13.7 only.** Other systems and Python versions were not tried.
* **No load or speed testing, no authentication, no rate limiting.** The server is meant to be
  bound to `127.0.0.1` only.
* **Test client warning.** pytest shows a harmless Starlette notice that `httpx` is deprecated for
  its test client in favour of `httpx2`. Decide with the lead whether to switch.
* **The Node side is not tested.** No test calls the service from the Node.js backend.