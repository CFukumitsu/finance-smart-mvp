param(
  [string]$DatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$expectedHost = "127.0.0.1"
$expectedPort = 54322
$localContainer = "supabase_db_finance-smart-mvp"
$failedStage = $null
$failedCode = 1
$temporaryDirectory = $null
$fixtureCreated = $false
$useDockerPsql = $false
$originalPath = $env:PATH

function Stop-BankrollTests {
  param([string]$Stage, [int]$ExitCode)
  Write-Host "BANKROLL TESTS: FAIL" -ForegroundColor Red
  Write-Host "Etapa: $Stage" -ForegroundColor Red
  Write-Host "Exit code: $ExitCode" -ForegroundColor Red
  exit 1
}

try {
  $databaseUri = [Uri]$DatabaseUrl
} catch {
  Stop-BankrollTests "Validação da URL local" 1
}

if (
  $databaseUri.Scheme -notin @("postgresql", "postgres") -or
  $databaseUri.Host -ne $expectedHost -or
  $databaseUri.Port -ne $expectedPort
) {
  Stop-BankrollTests "Conexão recusada: use somente 127.0.0.1:54322" 1
}

$psqlCommand = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlCommand) {
  $dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $dockerCommand) {
    Stop-BankrollTests "psql e Docker não encontrados" 1
  }

  $containerState = & $dockerCommand.Source inspect -f "{{.State.Running}}" $localContainer 2>$null
  if ($LASTEXITCODE -ne 0 -or $containerState.Trim() -ne "true") {
    Stop-BankrollTests "Container local não está em execução: $localContainer" 1
  }
  $useDockerPsql = $true
}

$phase1File = Join-Path $PSScriptRoot "bankroll_poker_phase_1_test.sql"
$integrationFile = Join-Path $PSScriptRoot "bankroll_finance_integration_test.sql"
$concurrencyFile = Join-Path $PSScriptRoot "bankroll_finance_concurrency_test.ps1"

foreach ($requiredFile in @($phase1File, $integrationFile, $concurrencyFile)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    Stop-BankrollTests "Arquivo não encontrado: $requiredFile" 1
  }
}

function Invoke-PsqlFile {
  param([string]$File)
  if ($useDockerPsql) {
    [System.IO.File]::ReadAllText($File, [System.Text.Encoding]::UTF8) |
      & $dockerCommand.Source exec -i $localContainer psql -U postgres -d postgres -v ON_ERROR_STOP=1
  } else {
    & $psqlCommand.Source $DatabaseUrl -v ON_ERROR_STOP=1 -f $File
  }
  $script:lastPsqlExitCode = $LASTEXITCODE
}

function Invoke-PsqlScalar {
  param([string]$Sql)
  if ($useDockerPsql) {
    $script:lastPsqlScalarOutput = & $dockerCommand.Source exec -i $localContainer `
      psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc $Sql
  } else {
    $script:lastPsqlScalarOutput = & $psqlCommand.Source $DatabaseUrl `
      -v ON_ERROR_STOP=1 -Atc $Sql
  }
  $script:lastPsqlExitCode = $LASTEXITCODE
}

function Invoke-SqlSuite {
  param([string]$File, [string]$Stage)
  Invoke-PsqlFile $File
  $code = $script:lastPsqlExitCode
  if ($code -ne 0) {
    $script:failedStage = "$Stage - $File"
    $script:failedCode = $code
    throw "SQL_TEST_FAILED"
  }
}

$ownerId = [Guid]::NewGuid().ToString()
$accountId = [Guid]::NewGuid().ToString()
$walletId = [Guid]::NewGuid().ToString()
$groupId = [Guid]::NewGuid().ToString()
$competenceId = $null

try {
  Write-Host "[1/3] Fase 1" -ForegroundColor Cyan
  Invoke-SqlSuite $phase1File "[1/3] Fase 1"

  Write-Host "[2/3] Integracao Finance <-> Bankroll" -ForegroundColor Cyan
  Invoke-SqlSuite $integrationFile "[2/3] Integracao Finance <-> Bankroll"

  Write-Host "[3/3] Concorrência" -ForegroundColor Cyan
  $temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("bankroll-suite-" + [Guid]::NewGuid())
  New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
  $setupFile = Join-Path $temporaryDirectory "setup.sql"
  $cleanupFile = Join-Path $temporaryDirectory "cleanup.sql"

  $setupSql = @"
\set ON_ERROR_STOP on
begin;
insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000', '$ownerId',
  'authenticated', 'authenticated', '$ownerId@bankroll.local', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);
insert into public.accounts(
  id, owner_id, name, type, currency, current_balance, active
) values ('$accountId', '$ownerId', 'Fixture concorrência', 'Conta', 'BRL', 1000, true);
insert into public.bankroll_wallets(
  id, owner_id, name, wallet_type, currency, initial_balance, active
) values ('$walletId', '$ownerId', 'Fixture concorrência', 'online', 'BRL', 500, true);
select set_config('request.jwt.claim.sub', '$ownerId', true);
set local role authenticated;
select * from public.create_bankroll_finance_deposit(
  '$accountId', '$walletId', current_date, 10, null, '$groupId'
);
commit;
"@
  Set-Content -LiteralPath $setupFile -Value $setupSql -Encoding utf8
  Invoke-PsqlFile $setupFile
  $setupCode = $script:lastPsqlExitCode
  if ($setupCode -ne 0) {
    $failedStage = "[3/3] Concorrência - criação da fixture"
    $failedCode = $setupCode
    throw "CONCURRENCY_FIXTURE_FAILED"
  }
  $fixtureCreated = $true

  Invoke-PsqlScalar "select competence_id from public.transactions where bankroll_integration_group_id = '$groupId'"
  $competenceOutput = $script:lastPsqlScalarOutput
  $competenceCode = $script:lastPsqlExitCode
  $competenceId = ($competenceOutput | Select-Object -First 1).Trim()
  if ($competenceCode -ne 0 -or -not $competenceId) {
    $failedStage = "[3/3] Concorrência - leitura da fixture"
    $failedCode = if ($competenceCode -ne 0) { $competenceCode } else { 1 }
    throw "CONCURRENCY_FIXTURE_READ_FAILED"
  }

  if ($useDockerPsql) {
    $proxyScript = Join-Path $temporaryDirectory "psql-docker-proxy.ps1"
    $proxyCommand = Join-Path $temporaryDirectory "psql.cmd"
    $proxyCommandContent = '@echo off' + [Environment]::NewLine + 'exit /b 1'
    $proxyScriptContent = @'
param(
  [Parameter(Mandatory = $true)][string]$SqlFile,
  [Parameter(Mandatory = $true)][string]$ExitCodeFile
)
$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::ReadAllText($SqlFile, [System.Text.Encoding]::UTF8) |
  & docker exec -i supabase_db_finance-smart-mvp psql -q -U postgres -d postgres -v ON_ERROR_STOP=1
$code = $LASTEXITCODE
Set-Content -LiteralPath $ExitCodeFile -Value $code -Encoding ascii
exit $code
'@
    Set-Content -LiteralPath $proxyScript -Value $proxyScriptContent -Encoding utf8
    Set-Content -LiteralPath $proxyCommand -Value $proxyCommandContent -Encoding ascii
    $env:PATH = "$temporaryDirectory;$env:PATH"

    $adaptedConcurrencyFile = Join-Path $temporaryDirectory "bankroll_finance_concurrency_test.ps1"
    $concurrencySource = [System.IO.File]::ReadAllText(
      $concurrencyFile,
      [System.Text.Encoding]::UTF8
    )
    $adaptedConcurrencySource = $concurrencySource
    foreach ($inputVariable in @('file', 'aFile', 'bFile')) {
      $nativePsqlStart = 'Start-Process psql -ArgumentList @($DatabaseUrl, "-X", "-f", $' + $inputVariable + ') -RedirectStandardOutput'
      $dockerPsqlStart = 'Start-Process powershell.exe -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "' + $proxyScript + '", "-SqlFile", $' + $inputVariable + ', "-ExitCodeFile", ($' + $inputVariable + ' + ".exit")) -RedirectStandardOutput'
      $adaptedConcurrencySource = $adaptedConcurrencySource.Replace(
        $nativePsqlStart,
        $dockerPsqlStart
      )
    }
    $adaptedConcurrencySource = $adaptedConcurrencySource.Replace(
      '$process.ExitCode',
      '[int](Get-Content -LiteralPath ($file + ".exit") -Raw)'
    )
    $adaptedConcurrencySource = $adaptedConcurrencySource.Replace(
      '$first.ExitCode',
      '[int](Get-Content -LiteralPath ($aFile + ".exit") -Raw)'
    )
    $adaptedConcurrencySource = $adaptedConcurrencySource.Replace(
      '$second.ExitCode',
      '[int](Get-Content -LiteralPath ($bFile + ".exit") -Raw)'
    )
    $adaptedConcurrencySource = $adaptedConcurrencySource.Replace(
      'select pg_sleep(2)',
      'select pg_sleep(25)'
    )
    $adaptedConcurrencySource = $adaptedConcurrencySource.Replace(
      'AddSeconds(6)',
      'AddSeconds(30)'
    )
    $adaptedConcurrencySource = $adaptedConcurrencySource.Replace(
      'AddSeconds(3)',
      'AddSeconds(20)'
    )
    $adaptedConcurrencySource = $adaptedConcurrencySource.Replace(
      "statement_timeout='12s'",
      "statement_timeout='40s'"
    )
    $adaptedConcurrencySource = $adaptedConcurrencySource.Replace(
      'WaitForExit(15000)',
      'WaitForExit(50000)'
    )
    $adaptedConcurrencySource = $adaptedConcurrencySource.Replace(
      'WaitForExit(5000)',
      'WaitForExit(15000)'
    )
    if ($adaptedConcurrencySource -eq $concurrencySource) {
      throw "Nao foi possivel adaptar o runner de concorrencia para o psql do Docker."
    }
    [System.IO.File]::WriteAllText(
      $adaptedConcurrencyFile,
      $adaptedConcurrencySource,
      [System.Text.UTF8Encoding]::new($true)
    )
    $concurrencyExecutionFile = $adaptedConcurrencyFile
  } else {
    $concurrencyExecutionFile = $concurrencyFile
  }

  & powershell -ExecutionPolicy Bypass -File $concurrencyExecutionFile `
    -DatabaseUrl $DatabaseUrl `
    -OwnerId $ownerId `
    -AccountId $accountId `
    -WalletId $walletId `
    -CompetenceId $competenceId `
    -IntegrationGroupId $groupId `
    -OperationType deposit
  $concurrencyCode = $LASTEXITCODE
  if ($concurrencyCode -ne 0) {
    $failedStage = "[3/3] Concorrência - $concurrencyFile"
    $failedCode = $concurrencyCode
    throw "CONCURRENCY_TEST_FAILED"
  }
} catch {
  if (-not $failedStage) {
    $failedStage = "Execução inesperada: $($_.Exception.Message)"
    $failedCode = 1
  }
} finally {
  if ($fixtureCreated -and $cleanupFile) {
    $cleanupSql = @"
\set ON_ERROR_STOP on
begin;
delete from public.bankroll_finance_links where integration_group_id = '$groupId';
delete from public.bankroll_transactions where bankroll_integration_group_id = '$groupId';
delete from public.transactions where bankroll_integration_group_id = '$groupId';
delete from public.bankroll_wallets where id = '$walletId';
delete from public.accounts where id = '$accountId';
delete from public.competences where owner_id = '$ownerId';
delete from public.profiles where id = '$ownerId';
delete from auth.users where id = '$ownerId';
commit;
"@
    Set-Content -LiteralPath $cleanupFile -Value $cleanupSql -Encoding utf8
    Invoke-PsqlFile $cleanupFile
    $cleanupCode = $script:lastPsqlExitCode
    if ($cleanupCode -ne 0 -and -not $failedStage) {
      $failedStage = "[3/3] Concorrência - limpeza da fixture"
      $failedCode = $cleanupCode
    }
  }

  if ($temporaryDirectory) {
    $env:PATH = $originalPath
    $temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    $resolvedTemporaryDirectory = [System.IO.Path]::GetFullPath($temporaryDirectory)
    if (
      $resolvedTemporaryDirectory.StartsWith($temporaryRoot) -and
      ([System.IO.Path]::GetFileName($resolvedTemporaryDirectory)).StartsWith("bankroll-suite-")
    ) {
      Remove-Item -LiteralPath $resolvedTemporaryDirectory -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

if ($failedStage) {
  Stop-BankrollTests $failedStage $failedCode
}

Write-Host "BANKROLL TESTS: PASS" -ForegroundColor Green
exit 0
