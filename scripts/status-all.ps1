$ErrorActionPreference = "Stop"

$services = @(
    @{ Name = "Core Backend"; Port = 3000; Path = "/" },
    @{ Name = "Booking Backend"; Port = 4001; Path = "/api/health" },
    @{ Name = "Homecare Backend"; Port = 4000; Path = "/api/health" },
    @{ Name = "Recommendation"; Port = 8001; Path = "/health" },
    @{ Name = "ETA"; Port = 8002; Path = "/health" },
    @{ Name = "Integration Gateway"; Port = 5000; Path = "/health" }
)

$failed = 0

foreach ($service in $services) {
    $url = "http://127.0.0.1:$($service.Port)$($service.Path)"

    try {
        $response = Invoke-WebRequest `
            -Uri $url `
            -TimeoutSec 5 `
            -UseBasicParsing

        if ($response.StatusCode -eq 200) {
            Write-Host "PASS $($service.Name) : HTTP 200" -ForegroundColor Green
        }
        else {
            $failed++
            Write-Host "FAIL $($service.Name) : HTTP $($response.StatusCode)" -ForegroundColor Red
        }
    }
    catch {
        $failed++
        Write-Host "FAIL $($service.Name) : Health request unsuccessful" -ForegroundColor Red
    }
}

if ($failed -gt 0) {
    throw "$failed service health check(s) failed."
}

Write-Host "`nALL SIX SERVICE HEALTH CHECKS PASSED" -ForegroundColor Green
