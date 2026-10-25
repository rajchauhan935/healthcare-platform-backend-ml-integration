
const BASE_URL = 'http://localhost:4000/api/ambulances';

// Use an ops/admin JWT from your login API.
// Set this in your terminal before running the simulator.
const TOKEN = process.env.GPS_SIMULATOR_TOKEN;

const ambulances = [
  {
    id: 'AMB-001',
    lat: 26.7606,
    lng: 83.3732,
  },
  {
    id: 'AMB-006',
    lat: 26.7600,
    lng: 83.3700,
  },
];

function randomOffset() {
  // Small movement, roughly a few to tens of metres.
  return (Math.random() - 0.5) * 0.0005;
}

async function updateLocation(ambulance) {
  const lat = ambulance.lat + randomOffset();
  const lng = ambulance.lng + randomOffset();

  try {
    const response = await fetch(
      `${BASE_URL}/${ambulance.id}/location`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({ lat, lng }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error(
        `${ambulance.id}: HTTP ${response.status}`,
        result
      );
      return;
    }

    // Keep the new coordinates for the next simulated movement.
    ambulance.lat = lat;
    ambulance.lng = lng;

    console.log(
      `${ambulance.id}: location updated`,
      `lat=${lat.toFixed(6)}`,
      `lng=${lng.toFixed(6)}`
    );
  } catch (error) {
    console.error(
      `${ambulance.id}: request failed`,
      error.message
    );
  }
}

async function runSimulation() {
  if (!TOKEN) {
    console.error(
      'Missing GPS_SIMULATOR_TOKEN. Set an ops/admin JWT first.'
    );
    process.exitCode = 1;
    return;
  }

  console.log('GPS simulator started. Press Ctrl+C to stop.');

  // Send the first updates immediately.
  await Promise.all(ambulances.map(updateLocation));

  // Then update every 5 seconds.
  setInterval(() => {
    Promise.all(ambulances.map(updateLocation));
  }, 5000);
}

runSimulation();
