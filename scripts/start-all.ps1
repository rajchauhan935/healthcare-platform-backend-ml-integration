$ErrorActionPreference = "Stop"

$root = Split-Path $PSScriptRoot -Parent

$services = @(
    @{
        Name = "Core Backend"
        Directory = "$root\services\core-backend\apps\backend"
        Command = "npm start"
        Port = 3000
    },
    @{
        Name = "Booking Backend"
        Directory = "$root\services\booking-backend"
        Command = "npm start"
        Port = 4001
    },
    @{
        Name = "Homecare Backend"
        Directory = "$root\services\homecare-backend"
        Command = "npm start"
        Port = 4000
    },
    @{
        Name = "Recommendation Service"
        Directory = "$root\services\recommendation-service\services\recommendation"
        Command = "python -m uvicorn api:app --host 127.0.0.1 --port 8001"
        Port = 8001
    },
    @{
        Name = "ETA Service"
        Directory = "$root\services\eta-service"
        Command = "python -m uvicorn api.main:app --host 127.0.0.1 --port 8002"
        Port = 8002
    },
    @{
        Name = "Integration Gateway"
        Directory = "$root\integration\gateway"
        Command = "node server.js"
        Port = 5000
    }
)

foreach ($service in $services) {
    if (-not (Test-Path -LiteralPath $service.Directory -PathType Container)) {
        throw "Missing service directory: $($service.Directory)"
    }

    $listener = Get-NetTCPConnection -LocalPort $service.Port -State Listen -ErrorAction SilentlyContinue

    if ($listener) {
        throw "Port $($service.Port) is already occupied. Nothing started."
    }
}

foreach ($service in $services) {
    $command = "Set-Location -LiteralPath '$($service.Directory)'; $($service.Command)"

    Start-Process powershell.exe -ArgumentList @(
        "-NoExit",
        "-Command",
        $command
    )

    Write-Host "START REQUESTED: $($service.Name) on port $($service.Port)" -ForegroundColor Green

    Start-Sleep -Seconds 2
}

Write-Host "`nAll six startup commands have been launched."
Write-Host "Check service health before considering startup successful."
