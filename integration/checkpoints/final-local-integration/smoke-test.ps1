$ErrorActionPreference = "Stop"

$base = "http://127.0.0.1:5000"

function Assert-Status {
    param(
        [string]$Path,
        [string]$Expected,
        [string]$Authorization = ""
    )

    $argsList = @(
        "-sS", "-o", "NUL",
        "-w", "%{http_code}",
        "--max-time", "10"
    )

    if ($Authorization) {
        $argsList += @("-H", "Authorization: $Authorization")
    }

    $argsList += "$base$Path"

    $status = & curl.exe @argsList

    if ($LASTEXITCODE -ne 0 -or $status -ne $Expected) {
        throw "$Path expected $Expected; received $status"
    }

    Write-Host "PASS $Path : HTTP $status" -ForegroundColor Green
}

Write-Host "`n===== INTEGRATION SMOKE TEST =====" -ForegroundColor Cyan

Assert-Status "/health" "200"
Assert-Status "/api/integration/kartik/health" "200"

$protected = @(
    "/api/core/auth/me",
    "/api/bookings",
    "/api/homecare/session/me",
    "/api/homecare/home/summary"
)

foreach ($path in $protected) {
    Assert-Status $path "401"
    Assert-Status $path "401" "Bearer deliberately-invalid-test-token"
}

$health = Invoke-RestMethod "$base/services/health" -TimeoutSec 15

if (-not $health.allHealthy -or @($health.services).Count -ne 5) {
    throw "Five-service health verification failed."
}

Write-Host "PASS all five backend health checks" -ForegroundColor Green

$recommendBody = @{
    emergencyType = "general"
    patientLat = 26.9124
    patientLng = 75.7873
    ambulances = @()
    hospitals = @()
} | ConvertTo-Json -Depth 10 -Compress

$etaBody = @{
    fromLat = 28.6139
    fromLng = 77.2090
    toLat = 28.5355
    toLng = 77.3910
    hour = 14
    ambulanceType = "BLS"
} | ConvertTo-Json -Compress

$tests = @(
    @{
        Name = "Ujala recommendation"
        Direct = "http://127.0.0.1:8001/recommend"
        Gateway = "$base/api/recommendation"
        Body = $recommendBody
    },
    @{
        Name = "Shreya ETA"
        Direct = "http://127.0.0.1:8002/eta"
        Gateway = "$base/api/eta"
        Body = $etaBody
    }
)

foreach ($test in $tests) {
    $direct = Invoke-RestMethod `
        -Uri $test.Direct `
        -Method Post `
        -ContentType "application/json" `
        -Body $test.Body `
        -TimeoutSec 10

    $gateway = Invoke-RestMethod `
        -Uri $test.Gateway `
        -Method Post `
        -ContentType "application/json" `
        -Body $test.Body `
        -TimeoutSec 10

    $a = $direct | ConvertTo-Json -Depth 20 -Compress
    $b = $gateway | ConvertTo-Json -Depth 20 -Compress

    if ($a -ne $b) {
        throw "$($test.Name): direct/gateway mismatch."
    }

    Write-Host "PASS $($test.Name): exact JSON match" -ForegroundColor Green
}

Write-Host "`nALL INTEGRATION SMOKE TESTS PASSED" -ForegroundColor Green

