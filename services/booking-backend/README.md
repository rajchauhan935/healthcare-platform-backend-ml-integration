@'
# Health Platform Backend

Backend for an Emergency and Home Healthcare Platform.

## Tech Stack
- Node.js and Express
- PostgreSQL
- Jest and Supertest
- AI recommendation and ETA integration

## Setup
1. Install dependencies: `npm install`
2. Configure your local environment using `.env.example`.
3. Run database migrations and seeds according to the project setup.
4. Start the server using `npm start`.

## Tests
Run: `npx jest --runInBand --detectOpenHandles`

Latest result: 9 test suites passed, 45 tests passed.

## BE-10 AI Integration
Mock recommendation, ETA estimation, response validation, timeout handling, and fallback behavior are implemented.

Live AI integration is pending confirmation of the ML service endpoints.

See `docs/integration.md` for details.
'@ | Set-Content README.md