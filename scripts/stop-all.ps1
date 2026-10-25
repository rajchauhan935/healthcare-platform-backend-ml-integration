$ErrorActionPreference = "Stop"

$services = @(
    @{ Name = "Integration Gateway"; Port = 5000; Exe = "node.exe"; Pattern = "server.js"; Directory = "integration\gateway" },
    @{ Name = "Core Backend"; Port = 3000; Exe = "node.exe"; Pattern = "src/server.js"; Directory = "services\core-backend\apps\backend" },
    @{ Name = "Booking Backend"; Port = 4001; Exe = "node.exe"; Pattern = "src/server.js"; Directory = "services\booking-backend" },
    @{ Name = "Homecare Backend"; Port = 4000; Exe = "node.exe"; Pattern = "src/server.js"; Directory = "services\homecare-backend" },
    @{ Name = "Recommendation"; Port = 8001; Exe = "python.exe"; Pattern = "uvicorn api:app"; Directory = "services\recommendation-service\services\recommendation" },
    @{ Name = "ETA"; Port = 8002; Exe = "python.exe"; Pattern = "uvicorn api.main:app"; Directory = "services\eta-service" }
)

$root = Split-Path $PSScriptRoot -Parent
$targets = @()

foreach ($service in $services) {
    $listeners = @(Get-NetTCPConnection -LocalPort $service.Port -State Listen -ErrorAction SilentlyContinue)

    if ($listeners.Count -ne 1) {
        throw "Expected exactly one listener on port $($service.Port). Nothing stopped."
    }

    $targetPid = $listeners[0].OwningProcess
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $targetPid"

    if (-not $processInfo) {
        throw "Cannot inspect process on port $($service.Port). Nothing stopped."
    }

    $exe = Split-Path $processInfo.ExecutablePath -Leaf

    if ($exe -ne $service.Exe) {
        throw "Unexpected executable on port $($service.Port). Nothing stopped."
    }

    if ($processInfo.CommandLine -notlike "*$($service.Pattern)*") {
        throw "Unexpected startup command on port $($service.Port). Nothing stopped."
    }

    $expectedDirectory = Join-Path $root $service.Directory

    if (-not (Test-Path -LiteralPath $expectedDirectory -PathType Container)) {
        throw "Expected project directory missing. Nothing stopped."
    }

    $targets += [PSCustomObject]@{
        Name = $service.Name
        Port = $service.Port
        ProcessId = $targetPid
        CreationDate = $processInfo.CreationDate
    }
}

Write-Host "`nVerified listening processes:" -ForegroundColor Cyan

$targets | Format-Table Name, Port, ProcessId -AutoSize

Write-Host "`nWARNING: This will stop the six verified service processes." -ForegroundColor Yellow

$confirmation = Read-Host "Type STOP to continue"

if ($confirmation -cne "STOP") {
    Write-Host "Cancelled. No processes stopped." -ForegroundColor Yellow
    return
}

foreach ($target in $targets) {
    $current = Get-CimInstance Win32_Process -Filter "ProcessId = $($target.ProcessId)"

    if (-not $current -or $current.CreationDate -ne $target.CreationDate) {
        throw "Process identity changed. Shutdown stopped."
    }

    $listener = @(
        Get-NetTCPConnection -LocalPort $target.Port -State Listen -ErrorAction SilentlyContinue |
            Where-Object { $_.OwningProcess -eq $target.ProcessId }
    )

    if ($listener.Count -ne 1) {
        throw "Port ownership changed. Shutdown stopped."
    }

    Stop-Process -Id $target.ProcessId -ErrorAction Stop

    Write-Host "STOP REQUESTED: $($target.Name)" -ForegroundColor Green
}

Write-Host "`nShutdown requests completed. Verify the ports are closed." -ForegroundColor Green
