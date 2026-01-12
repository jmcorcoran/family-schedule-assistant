# Test Runner Script for Family Schedule Assistant (PowerShell)
# Usage: .\run-tests.ps1 [unit|e2e|all]

param(
    [string]$TestType = "all"
)

Write-Host "🧪 Family Schedule Assistant - Test Runner`n" -ForegroundColor Blue

# Check if Deno is installed
if (!(Get-Command deno -ErrorAction SilentlyContinue)) {
    Write-Host "⚠️  Deno is not installed. Please install from: https://deno.land/#installation" -ForegroundColor Yellow
    exit 1
}

# Load environment variables from .env if it exists
if (Test-Path .env) {
    Write-Host "📝 Loading environment variables from .env" -ForegroundColor Blue
    Get-Content .env | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.+)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            Set-Item -Path "env:$name" -Value $value
        }
    }
    $env:SUPABASE_URL = $env:VITE_SUPABASE_URL
    $env:SUPABASE_ANON_KEY = $env:VITE_SUPABASE_ANON_KEY
}

function Run-UnitTests {
    Write-Host "`nRunning Unit Tests...`n" -ForegroundColor Blue
    deno test --allow-env --allow-net supabase/functions/process-message/index.test.ts
}

function Run-E2ETests {
    Write-Host "`nRunning E2E Tests...`n" -ForegroundColor Blue

    if ([string]::IsNullOrEmpty($env:SUPABASE_URL) -or [string]::IsNullOrEmpty($env:SUPABASE_ANON_KEY)) {
        Write-Host "⚠️  Warning: SUPABASE_URL or SUPABASE_ANON_KEY not set" -ForegroundColor Yellow
        Write-Host "   E2E tests may fail. Set these environment variables or add them to .env"
    }

    deno test --allow-env --allow-net tests/e2e.test.ts
}

switch ($TestType.ToLower()) {
    "unit" {
        Run-UnitTests
    }
    "e2e" {
        Run-E2ETests
    }
    "all" {
        Run-UnitTests
        Run-E2ETests
    }
    default {
        Write-Host "Usage: .\run-tests.ps1 [unit|e2e|all]" -ForegroundColor Yellow
        Write-Host "  unit - Run unit tests only"
        Write-Host "  e2e  - Run end-to-end tests only"
        Write-Host "  all  - Run all tests (default)"
        exit 1
    }
}

Write-Host "`n✅ All tests completed!`n" -ForegroundColor Green
