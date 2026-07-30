param(
  [string]$ResultsDir = "results",
  [switch]$SkipFailureScenario
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path $ResultsDir)) {
  New-Item -ItemType Directory -Path $ResultsDir | Out-Null
}

$phases = @(
  @{ Name = "baseline"; VU = 10; Duration = "5m" },
  @{ Name = "ramp"; VU = 20; Duration = "5m" },
  @{ Name = "sustained"; VU = 30; Duration = "10m" },
  @{ Name = "spike"; VU = 50; Duration = "2m" }
)

$patterns = @(
  @{ Pattern = "api"; Script = "load-tests/api-direct-k6.js" },
  @{ Pattern = "projection"; Script = "load-tests/event-projection-k6.js" },
  @{ Pattern = "batch"; Script = "load-tests/batch-replication-k6.js" }
)

foreach ($phase in $phases) {
  foreach ($pattern in $patterns) {
    $outputFile = Join-Path $ResultsDir ("{0}-{1}.json" -f $pattern.Pattern, $phase.Name)
    Write-Host "Running $($pattern.Pattern) $($phase.Name) -> $outputFile"
    & k6 run $pattern.Script -e "K6_VU=$($phase.VU)" -e "K6_DURATION=$($phase.Duration)" --out "json=$outputFile"
    if ($LASTEXITCODE -ne 0) {
      throw "k6 run failed for $($pattern.Pattern) $($phase.Name)"
    }
  }
}

if (-not $SkipFailureScenario) {
  $failureOutput = Join-Path $ResultsDir "api-failure-before.json"
  Write-Host "Running api failure scenario -> $failureOutput"

  $failureJob = Start-Job -ScriptBlock {
    param($ProjectRoot)

    $ErrorActionPreference = "Continue"
    Set-Location $ProjectRoot

    try {
      Start-Sleep -Seconds 30
      docker-compose stop client-service 2>&1 | Out-Host

      Start-Sleep -Seconds 120
    }
    finally {
      docker-compose start client-service 2>&1 | Out-Host
    }
  } -ArgumentList $root

  # Failure scenario is expected to violate thresholds while a dependency is down.
  & k6 run "load-tests/api-direct-k6.js" -e "K6_VU=20" -e "K6_DURATION=5m" --no-thresholds --out "json=$failureOutput"
  $k6ExitCode = $LASTEXITCODE

  Wait-Job -Job $failureJob | Out-Null
  Receive-Job -Job $failureJob | Out-Host
  $jobState = $failureJob.State
  Remove-Job -Job $failureJob | Out-Null

  if ($k6ExitCode -ne 0 -or $jobState -ne "Completed") {
    throw "k6 failure scenario run failed"
  }
}

Write-Host "Exporting normalized analysis artifacts"
npm run results:export -- --results-dir $ResultsDir

Write-Host "Experiment phases completed."