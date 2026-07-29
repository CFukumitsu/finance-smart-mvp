$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$jdkPath = Join-Path $projectRoot ".android-tools\jdk"
$androidSdkPath = Join-Path $projectRoot ".android-tools\sdk"
$gradleHomePath = Join-Path $projectRoot ".android-tools\gradle-home"
$gradleWrapper = Join-Path $projectRoot "android\gradlew.bat"
$apkPath = Join-Path $projectRoot "android\app\build\outputs\apk\debug\app-debug.apk"

if (-not (Test-Path (Join-Path $jdkPath "bin\java.exe"))) {
  throw "JDK local não encontrado em $jdkPath"
}

if (-not (Test-Path (Join-Path $androidSdkPath "platforms\android-36"))) {
  throw "Android SDK/API 36 não encontrado em $androidSdkPath"
}

$env:JAVA_HOME = $jdkPath
$env:ANDROID_HOME = $androidSdkPath
$env:GRADLE_USER_HOME = $gradleHomePath

& $gradleWrapper -p (Join-Path $projectRoot "android") assembleDebug --console=plain
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Output "APK gerado em: $apkPath"
