# Finance Smart para Android

Projeto Android do Finance Smart gerado como Trusted Web Activity (TWA).

## Configuração

- Site: `https://cfukumitsu.vercel.app`
- Application ID: `com.fktsystem.financesmart`
- Versão inicial: `1.0.0` (`versionCode 1`)
- Compile SDK: 36
- Target SDK: 36
- Geolocalização: delegada para a aplicação web

## Pré-requisitos locais

- JDK 17
- Android SDK/API 36
- Android SDK Build Tools

O Android Studio instala e gerencia esses componentes.

## APK de desenvolvimento

Na raiz do repositório:

```powershell
npm run android:build:debug
```

O APK será criado em:

```text
app/build/outputs/apk/debug/app-debug.apk
```

## Publicação

Antes da publicação na Play Store:

1. Criar e guardar com segurança a chave de assinatura definitiva.
2. Gerar um Android App Bundle assinado (`.aab`).
3. Obter o fingerprint SHA-256 da chave usada pela Play Store.
4. Publicar o fingerprint em `/.well-known/assetlinks.json`.
5. Validar a associação entre o domínio e o aplicativo.

Sem o `assetlinks.json`, o Android abre o site como Custom Tab com a barra
do navegador, em vez de uma TWA em tela cheia.

Com a chave local de upload configurada, gere os artefatos release com:

```powershell
npm run android:build:release
```
