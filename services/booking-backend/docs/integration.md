# BE-10: AI Service Integration

## 1. Overview

The booking API integrates with external AI services for ambulance recommendation and ETA estimation. A booking must still be created if an AI service fails or times out.

**Current mode:** Mock (`AI_MODE=mock`)

## 2. Environment Configuration

Configure these variables in the backend environment:

```env
AI_MODE=mock
RECOMMEND_URL=http://localhost:8001
ETA_URL=http://localhost:8002
```

The URLs above are examples for local development. Replace them with the actual service URLs supplied by the AI team before enabling live mode.

- `AI_MODE=mock`: Uses local mock implementations.
- `AI_MODE=live`: Sends requests to the configured AI services.
- Each individual AI request has a 3-second timeout.
- Booking enrichment has an overall 4-second budget.

Do not commit API keys or other secrets to Git.

## 3. Ambulance Recommendation API

**Endpoint:** `POST {RECOMMEND_URL}/recommend`

### Request

```json
{
  "emergencyType": "cardiac",
  "patientLat": 26.75,
  "patientLng": 83.38,
  "ambulances": [
    {
      "id": "AMB-014",
      "type": "ICU",
      "lat": 26.76,
      "lng": 83.37
    }
  ],
  "hospitals": [
    {
      "id": "HOS-007",
      "category": "cardiac",
      "icuBedsFree": 4,
      "pmjayEmpanelled": true,
      "lat": 26.76,
      "lng": 83.37
    }
  ]
}
```

### Expected response

```json
{
  "ambulanceType": "ICU",
  "ambulanceId": "AMB-014",
  "hospitalCategory": "cardiac",
  "topHospitals": ["HOS-007"],
  "reason": "Nearest suitable ambulance and hospital"
}
```

The backend validates the recommendation and checks that the recommended ambulance belongs to the candidate list before assignment.

## 4. ETA API

**Endpoint:** `POST {ETA_URL}/eta`

### Request

```json
{
  "fromLat": 26.76,
  "fromLng": 83.37,
  "toLat": 26.75,
  "toLng": 83.38,
  "hour": 14,
  "ambulanceType": "ICU"
}
```

`hour` is expressed in Indian Standard Time (IST), using the 24-hour clock.

### Expected response

```json
{
  "etaMinutes": 8,
  "distanceKm": 4.2
}
```

Both response fields must be finite numbers. `etaMinutes` must be between 0 and 1440, and `distanceKm` must be non-negative.

## 5. Failure and Fallback Behavior

The booking API returns HTTP `201 Created` when a booking is successfully created, even if AI enrichment fails.

- Recommendation failure, timeout, HTTP error, or invalid response: use the backend fallback selection logic.
- ETA failure or timeout: estimate ETA using Haversine distance and an assumed speed of 30 km/h.
- No suitable available ambulance: retain the booking and return a clear fallback reason.
- A recommended ambulance must be a valid candidate and must still be available before assignment.
- Fallback events are logged with the booking ID.
- Internal AI service errors are not returned directly to the client.

## 6. Data Privacy

The AI services receive emergency type, coordinates, ambulance details, and hospital details required for recommendations. Patient names, email addresses, and other personal identifiers must not be included in AI requests.

## 7. Verification Before Live Mode

Before setting `AI_MODE=live`:

1. Obtain the actual recommendation and ETA service URLs from the AI team.
2. Confirm the endpoint paths and JSON contracts.
3. Verify successful responses from both services.
4. Test timeout, HTTP error, and malformed-response handling.
5. Confirm that invalid or unavailable ambulance IDs are rejected.
6. Run the backend test suite.
7. Record the verified service URLs and any agreed contract changes.

**Status:** Mock integration and fallback tests are passing. Live-service integration remains pending until the AI services are available and verified.