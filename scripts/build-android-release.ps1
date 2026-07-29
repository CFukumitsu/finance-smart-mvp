$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$jdkPath = Join-Path $projectRoot ".android-tools\jdk"
$androidSdkPath = Join-Path $projectRoot ".android-tools\sdk"
$gradleHomePath = Join-Path $projectRoot ".android-tools\gradle-home"
$signingDirectory = Join-Path $projectRoot ".android-tools\signing"
$signingPropertiesPath = Join-Path $signingDirectory "release.properties"
$gradleWrapper = Join-Path $projectRoot "android\gradlew.bat"
$androidProject = Join-Path $projectRoot "android"
$apkPath = Join-Path $projectRoot "android\app\build\outputs\apk\release\app-release.apk"
$bundlePath = Join-Path $projectRoot "android\app\build\outputs\bundle\release\app-release.aab"

if (-not (Test-Path (Join-Path $jdkPath "bin\java.exe"))) {
  throw "JDK local não encontrado em $jdkPath"
}

if (-not (Test-Path (Join-Path $androidSdkPath "platforms\android-36"))) {
  throw "Android SDK/API 36 não encontrado em $androidSdkPath"
}

if (-not (Test-Path $signingPropertiesPath)) {
  throw "Configuração de assinatura não encontrada em $signingPropertiesPath"
}

$signing = ConvertFrom-StringData (Get-Content -Raw $signingPropertiesPath)
$requiredKeys = @("storeFile", "storePassword", "keyAlias", "keyPassword")
foreach ($key in $requiredKeys) {
  if ([string]::IsNullOrWhiteSpace($signing[$key])) {
    throw "Propriedade de assinatura ausente: $key"
  }
}

$keystorePath = Join-Path $signingDirectory $signing.storeFile
if (-not (Test-Path $keystorePath)) {
  throw "Chave de assinatura não encontrada em $keystorePath"
}

$env:JAVA_HOME = $jdkPath
$env:ANDROID_HOME = $androidSdkPath
$env:GRADLE_USER_HOME = $gradleHomePath
$env:FINANCE_SMART_STORE_FILE = $keystorePath
$env:FINANCE_SMART_STORE_PASSWORD = $signing.storePassword
$env:FINANCE_SMART_KEY_ALIAS = $signing.keyAlias
$env:FINANCE_SMART_KEY_PASSWORD = $signing.keyPassword

& $gradleWrapper -p $androidProject assembleRelease bundleRelease --console=plain
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Output "APK release gerado em: $apkPath"
Write-Output "AAB release gerado em: $bundlePath"
