param(
  [Parameter(Mandatory = $true)][Alias("LocalDatabaseUrl")][string]$DatabaseUrl,
  [Parameter(Mandatory = $true)][Guid]$OwnerId,
  [Parameter(Mandatory = $true)][Guid]$AccountId,
  [Parameter(Mandatory = $true)][Guid]$WalletId,
  [Parameter(Mandatory = $true)][Guid]$CompetenceId,
  [Parameter(Mandatory = $true)][Guid]$IntegrationGroupId,
  [ValidateSet("deposit", "withdrawal")][string]$OperationType = "deposit"
)

$ErrorActionPreference = "Stop"
$uri = [Uri]$DatabaseUrl
if ($uri.Scheme -notin @("postgresql", "postgres") -or $uri.Host -ne "127.0.0.1" -or $uri.Port -ne 54322) {
  throw "Este runner aceita somente PostgreSQL local em 127.0.0.1:54322."
}
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  throw "psql não encontrado. Instale o cliente PostgreSQL antes do teste local."
}

$testDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("bankroll-concurrency-" + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $testDirectory | Out-Null
$newLine = [Environment]::NewLine
$dollar = '$'
$owner = $OwnerId.ToString()
$account = $AccountId.ToString()
$wallet = $WalletId.ToString()
$competence = $CompetenceId.ToString()
$group = $IntegrationGroupId.ToString()
$claims = "select set_config('request.jwt.claim.sub','$owner',true); set local role authenticated;"
$createFunction = if ($OperationType -eq "deposit") { "public.create_bankroll_finance_deposit" } else { "public.create_bankroll_finance_withdrawal" }

function Invoke-PsqlCheck {
  param([string]$Name, [string]$Sql)
  $file = Join-Path $testDirectory "$Name-check.sql"
  $out = Join-Path $testDirectory "$Name-check.log"
  $err = Join-Path $testDirectory "$Name-check.err.log"
  Set-Content -LiteralPath $file -Value ("\set ON_ERROR_STOP on" + $newLine + $Sql) -Encoding utf8
  $process = Start-Process psql -ArgumentList @($DatabaseUrl, "-X", "-f", $file) -RedirectStandardOutput $out -RedirectStandardError $err -PassThru -WindowStyle Hidden
  if (-not $process.WaitForExit(15000)) {
    $process.Kill()
    throw "Timeout ao validar o estado final de $Name."
  }
  if ($process.ExitCode -ne 0) {
    throw "Estado final inválido em $Name. Consulte $out e $err."
  }
}

function Get-PsqlScalar {
  param([string]$Name, [string]$Sql)
  $file = Join-Path $testDirectory "$Name-scalar.sql"
  $out = Join-Path $testDirectory "$Name-scalar.log"
  $err = Join-Path $testDirectory "$Name-scalar.err.log"
  Set-Content -LiteralPath $file -Value ("\pset tuples_only on" + $newLine + "\pset format unaligned" + $newLine + $Sql) -Encoding utf8
  $process = Start-Process psql -ArgumentList @($DatabaseUrl, "-X", "-f", $file) -RedirectStandardOutput $out -RedirectStandardError $err -PassThru -WindowStyle Hidden
  if (-not $process.WaitForExit(5000)) {
    $process.Kill()
    throw "Timeout ao inspecionar locks de $Name."
  }
  if ($process.ExitCode -ne 0) {
    throw "Falha ao inspecionar locks de $Name. Consulte $err."
  }
  return (Get-Content -LiteralPath $out -Raw).Trim()
}

function Assert-MainIntegrationState {
  param([string]$Name)
  $validation = "do $dollar$dollar begin if (select count(*) from public.bankroll_finance_links where integration_group_id='$group') <> 1 or (select count(*) from public.transactions where bankroll_integration_group_id='$group') <> 1 or (select count(*) from public.bankroll_transactions where bankroll_integration_group_id='$group') <> 1 or (select count(*) from public.bankroll_finance_links link join public.transactions finance on finance.id=link.finance_transaction_id join public.bankroll_transactions movement on movement.id=link.bankroll_transaction_id where link.integration_group_id='$group' and link.owner_id='$owner' and link.operation_type='$OperationType' and finance.account_id='$account' and finance.competence_id='$competence' and finance.due_date=current_date and finance.value=10 and movement.wallet_id='$wallet' and movement.amount=10 and movement.notes is null) <> 1 then raise exception 'Fixture ou estado parcial na integração $group'; end if; end $dollar$dollar;"
  Invoke-PsqlCheck $Name $validation
}

function Invoke-BlockingRace {
  param(
    [string]$Name,
    [string]$SessionAOperation,
    [string]$SessionBOperation,
    [string]$FinalValidation
  )

  $aFile = Join-Path $testDirectory "$Name-a.sql"
  $bFile = Join-Path $testDirectory "$Name-b.sql"
  $aOut = Join-Path $testDirectory "$Name-a.log"
  $bOut = Join-Path $testDirectory "$Name-b.log"
  $aErr = Join-Path $testDirectory "$Name-a.err.log"
  $bErr = Join-Path $testDirectory "$Name-b.err.log"
  $applicationA = "bankroll-race-$Name-a"
  $applicationB = "bankroll-race-$Name-b"
  $settingsA = "set application_name='$applicationA'; set statement_timeout='12s'; set deadlock_timeout='300ms';"
  $settingsB = "set application_name='$applicationB'; set statement_timeout='12s'; set deadlock_timeout='300ms';"
  $sessionA = "\set ON_ERROR_STOP on" + $newLine + "begin; $settingsA $claims $SessionAOperation select pg_sleep(2); rollback;"
  $sessionB = "\set ON_ERROR_STOP on" + $newLine + "begin; $settingsB $claims $SessionBOperation rollback;"
  Set-Content -LiteralPath $aFile -Value $sessionA -Encoding utf8
  Set-Content -LiteralPath $bFile -Value $sessionB -Encoding utf8

  $firstStart = [DateTimeOffset]::UtcNow
  $first = Start-Process psql -ArgumentList @($DatabaseUrl, "-X", "-f", $aFile) -RedirectStandardOutput $aOut -RedirectStandardError $aErr -PassThru -WindowStyle Hidden
  $markerDeadline = [DateTimeOffset]::UtcNow.AddSeconds(6)
  $lockConfirmed = $false
  while ([DateTimeOffset]::UtcNow -lt $markerDeadline) {
    if ($first.HasExited) {
      throw "A primeira sessão falhou antes de adquirir o lock em $Name. Consulte $aErr."
    }
    $holding = Get-PsqlScalar "$Name-lock-probe" "select count(*) from pg_stat_activity where application_name='$applicationA' and state='active' and query like '%pg_sleep%';"
    if ($holding -eq "1") {
      $lockConfirmed = $true
      break
    }
    Start-Sleep -Milliseconds 50
  }
  if (-not $lockConfirmed) {
    if (-not $first.HasExited) { $first.Kill() }
    throw "A primeira sessão não confirmou o lock em $Name."
  }

  $secondStart = [DateTimeOffset]::UtcNow
  $second = Start-Process psql -ArgumentList @($DatabaseUrl, "-X", "-f", $bFile) -RedirectStandardOutput $bOut -RedirectStandardError $bErr -PassThru -WindowStyle Hidden
  $sameLockObserved = $false
  $waitDeadline = [DateTimeOffset]::UtcNow.AddSeconds(3)
  while ([DateTimeOffset]::UtcNow -lt $waitDeadline -and -not $second.HasExited) {
    $lockSql = "select count(*) from pg_locks waiting join pg_stat_activity waiter on waiter.pid=waiting.pid join pg_locks holder on holder.granted and holder.pid<>waiting.pid and holder.locktype=waiting.locktype and (holder.database,holder.relation,holder.page,holder.tuple,holder.virtualxid,holder.transactionid,holder.classid,holder.objid,holder.objsubid) is not distinct from (waiting.database,waiting.relation,waiting.page,waiting.tuple,waiting.virtualxid,waiting.transactionid,waiting.classid,waiting.objid,waiting.objsubid) join pg_stat_activity owner_session on owner_session.pid=holder.pid where not waiting.granted and waiter.application_name='$applicationB' and owner_session.application_name='$applicationA';"
    $matchingLocks = Get-PsqlScalar "$Name-wait-probe" $lockSql
    if ([int]$matchingLocks -gt 0) {
      $sameLockObserved = $true
      break
    }
    Start-Sleep -Milliseconds 50
  }
  if (-not $sameLockObserved) {
    if (-not $second.HasExited) { $second.Kill() }
    if (-not $first.HasExited) { $first.Kill() }
    throw "$Name não comprovou que a segunda sessão aguardou um lock da primeira."
  }
  if (-not $second.WaitForExit(15000)) {
    $second.Kill()
    if (-not $first.HasExited) { $first.Kill() }
    throw "Timeout: a segunda sessão não concluiu em $Name."
  }
  $secondEnd = [DateTimeOffset]::UtcNow
  if (-not $first.WaitForExit(15000)) {
    $first.Kill()
    throw "Timeout: a primeira sessão não concluiu em $Name."
  }
  $firstEnd = [DateTimeOffset]::UtcNow

  $combinedErrors = (Get-Content -LiteralPath $aErr -Raw -ErrorAction SilentlyContinue) + (Get-Content -LiteralPath $bErr -Raw -ErrorAction SilentlyContinue)
  if ($first.ExitCode -ne 0 -or $second.ExitCode -ne 0) {
    throw "Falha SQL em $Name. Consulte os logs em $testDirectory."
  }
  if ($combinedErrors -match "deadlock detected|statement timeout|lock timeout") {
    throw "Deadlock ou timeout detectado em $Name."
  }

  $secondElapsed = ($secondEnd - $secondStart).TotalMilliseconds
  if ($secondElapsed -lt 1400) {
    throw "$Name não comprovou espera real: segunda sessão concluiu em $([Math]::Round($secondElapsed)) ms."
  }
  if ($FinalValidation) { Invoke-PsqlCheck $Name $FinalValidation }
  Assert-MainIntegrationState $Name
  Write-Host ("OK: {0}; A {1:o}..{2:o}; B {3:o}..{4:o}; espera B={5} ms" -f $Name,$firstStart,$firstEnd,$secondStart,$secondEnd,[Math]::Round($secondElapsed))
}

$depositGroupA = [Guid]::NewGuid().ToString()
$depositGroupB = [Guid]::NewGuid().ToString()
$withdrawalGroupA = [Guid]::NewGuid().ToString()
$withdrawalGroupB = [Guid]::NewGuid().ToString()
$idempotentGroup = [Guid]::NewGuid().ToString()

try {
  Assert-MainIntegrationState "fixture-inicial"

  $noDeposits = "do $dollar$dollar begin if exists(select 1 from public.bankroll_finance_links where integration_group_id in ('$depositGroupA','$depositGroupB')) then raise exception 'Depósito parcial após rollback'; end if; end $dollar$dollar;"
  Invoke-BlockingRace "deposito-mesma-conta" "select * from public.create_bankroll_finance_deposit('$account','$wallet',current_date,1,null,'$depositGroupA');" "select * from public.create_bankroll_finance_deposit('$account','$wallet',current_date,1,null,'$depositGroupB');" $noDeposits

  $noWithdrawals = "do $dollar$dollar begin if exists(select 1 from public.bankroll_finance_links where integration_group_id in ('$withdrawalGroupA','$withdrawalGroupB')) then raise exception 'Saque parcial após rollback'; end if; end $dollar$dollar;"
  Invoke-BlockingRace "saque-mesma-carteira" "select * from public.create_bankroll_finance_withdrawal('$account','$wallet',current_date,1,null,'$withdrawalGroupA');" "select * from public.create_bankroll_finance_withdrawal('$account','$wallet',current_date,1,null,'$withdrawalGroupB');" $noWithdrawals

  $noIdempotent = "do $dollar$dollar begin if exists(select 1 from public.bankroll_finance_links where integration_group_id='$idempotentGroup') then raise exception 'Criação idempotente persistiu apesar do rollback'; end if; end $dollar$dollar;"
  Invoke-BlockingRace "criacao-idempotente-concorrente" "select * from $createFunction('$account','$wallet',current_date,10,null,'$idempotentGroup');" "select * from $createFunction('$account','$wallet',current_date,10,null,'$idempotentGroup');" $noIdempotent

  Invoke-BlockingRace "criacao-idempotente-vs-atualizacao" "select * from public.update_bankroll_finance_operation('$group','$account','$wallet',current_date,10,null);" "select * from $createFunction('$account','$wallet',current_date,10,null,'$group');" ""
  Invoke-BlockingRace "criacao-idempotente-vs-exclusao" "select * from public.delete_bankroll_finance_operation('$group');" "select * from $createFunction('$account','$wallet',current_date,10,null,'$group');" ""
} finally {
  $resolvedTemporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  $resolvedTestDirectory = [System.IO.Path]::GetFullPath($testDirectory)
  if ($resolvedTestDirectory.StartsWith($resolvedTemporaryRoot) -and ([System.IO.Path]::GetFileName($resolvedTestDirectory)).StartsWith("bankroll-concurrency-")) {
    Remove-Item -LiteralPath $resolvedTestDirectory -Recurse -Force -ErrorAction SilentlyContinue
  }
}
