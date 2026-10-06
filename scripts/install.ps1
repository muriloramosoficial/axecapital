<#
    AXE CAPITAL — instalador / atualizador para Windows
    ===================================================
    Mesmo comando serve para INSTALAR e para ATUALIZAR:

      irm https://raw.githubusercontent.com/muriloramosoficial/axecapital/refs/heads/arena/8d46e70a-axecapital/scripts/install.ps1 | iex

    * na primeira vez instala tudo;
    * nas próximas, verifica se existe atualização na branch e só baixa o que mudou;
    * NUNCA apaga as suas configurações locais (data\config.json e .env), que ainda
      são copiadas para data\backups antes de qualquer atualização.
#>

[CmdletBinding()]
param(
    [string]$Branch = 'arena/8d46e70a-axecapital',
    [string]$Repo = 'https://github.com/muriloramosoficial/axecapital.git',
    [string]$InstallDir = "$env:USERPROFILE\AxeCapital",
    [switch]$SkipBridge,
    [switch]$NoLaunch,
    [switch]$Force,
    [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
# PowerShell 7.3+ pode transformar stderr de programas nativos em erro terminante.
# O git escreve progresso no stderr o tempo todo, então desligamos esse comportamento.
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -Scope Global -ErrorAction SilentlyContinue) {
    $global:PSNativeCommandUseErrorActionPreference = $false
}

# Em máquinas com ExecutionPolicy AllSigned/Restricted o PowerShell se recusa a
# carregar npm.ps1 (que vem sem assinatura digital). Liberamos só para ESTE
# processo — nada é alterado permanentemente na máquina — e, mesmo assim, todas
# as chamadas de npm são feitas via cmd.exe (npm.cmd), que não passa por policy.
try { Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force -ErrorAction Stop } catch { }

# ── log e pausa: nada de janela fechando antes de você ler o erro ────────
$script:LogFile = Join-Path $env:TEMP ('axecapital-install-{0}.log' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
try { Start-Transcript -Path $script:LogFile -Force | Out-Null; $script:Logging = $true } catch { $script:Logging = $false }

function Stop-Log { if ($script:Logging) { try { Stop-Transcript | Out-Null } catch { } ; $script:Logging = $false } }
function Hold {
    if ($env:AXE_NOPAUSE -eq '1') { return }
    Write-Host ''
    Write-Host '  ──────────────────────────────────────────────────────────────' -ForegroundColor DarkGray
    Write-Host "  log completo: $script:LogFile" -ForegroundColor DarkGray
    try { Read-Host '  Pressione ENTER para fechar esta janela' | Out-Null } catch { Start-Sleep -Seconds 60 }
}

function Say($msg, $color = 'Gray') { Write-Host "  $msg" -ForegroundColor $color }
function Step($msg) { Write-Host "`n▸ $msg" -ForegroundColor Cyan }
function Ok($msg) { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  ! $msg" -ForegroundColor Yellow }
function Fail($msg) {
    Write-Host "`n  ✕ $msg" -ForegroundColor Red
    Stop-Log
    Hold
    exit 1
}
function Have($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

# qualquer erro não previsto cai aqui: mostra a mensagem, o local e espera você ler
trap {
    Write-Host "`n  ✕ erro inesperado: $($_.Exception.Message)" -ForegroundColor Red
    $pos = $_.InvocationInfo.PositionMessage
    if ($pos) { Write-Host "$pos" -ForegroundColor DarkGray }
    Stop-Log
    Hold
    exit 1
}

$script:CmdExe = Join-Path $env:SystemRoot 'System32\cmd.exe'
if (-not (Test-Path $script:CmdExe)) { $script:CmdExe = 'cmd.exe' }

# npm 12 (Node 26) rejeita qualquer política de allow-scripts que chegue pelo
# AMBIENTE (npm_config_allow_scripts), mesmo que ela tenha vindo do .npmrc do
# usuário — é o bug npm/cli#9783/#9968, que derruba o install com EALLOWSCRIPTS.
# Então limpamos essas variáveis antes de qualquer chamada de npm.
function Clear-NpmEnv {
    foreach ($e in Get-ChildItem Env: ) {
        if ($e.Name -like 'npm_config_allow*') {
            Remove-Item -Path ('Env:' + $e.Name) -ErrorAction SilentlyContinue
        }
    }
}
Clear-NpmEnv

# npm SEMPRE através do cmd.exe → usa npm.cmd e nunca npm.ps1.
# Funções sem bloco param() para que tokens como --prefix caiam todos em $args.
function Npm {
    Clear-NpmEnv
    & $script:CmdExe '/d' '/c' 'npm' @args
    if ($LASTEXITCODE -ne 0) { Fail "falha ao executar: npm $($args -join ' ')  (código $LASTEXITCODE)" }
}
function NpmOut {
    Clear-NpmEnv
    return (& $script:CmdExe '/d' '/c' 'npm' @args 2>$null | Select-Object -First 1)
}
# install tolerante: se o npm 12 bloquear scripts de pós-instalação, repete sem eles
function NpmInstall($prefix) {
    Clear-NpmEnv
    & $script:CmdExe '/d' '/c' 'npm' 'install' '--prefix' $prefix '--no-audit' '--no-fund' '--loglevel=error'
    if ($LASTEXITCODE -eq 0) { return }
    Warn "npm install falhou em $prefix (código $LASTEXITCODE) — tentando de novo sem os scripts de pós-instalação…"
    Clear-NpmEnv
    & $script:CmdExe '/d' '/c' 'npm' 'install' '--prefix' $prefix '--no-audit' '--no-fund' '--loglevel=error' '--ignore-scripts'
    if ($LASTEXITCODE -ne 0) {
        Fail "não consegui instalar as dependências de $prefix (código $LASTEXITCODE).`n     Veja o log do npm em %LOCALAPPDATA%\npm-cache\_logs e me mande as últimas linhas."
    }
    Ok "dependências de $prefix instaladas (sem scripts de pós-instalação)"
}
function Have-Npm {
    if (NpmOut '-v') { return $true }
    return $false
}

# git SEMPRE através do cmd.exe com 2>&1 feito DENTRO do cmd: assim o progresso
# que o git manda para o stderr nunca chega ao PowerShell como NativeCommandError.
function Git {
    $parts = foreach ($a in $args) { if ("$a" -match '[\s&|<>^]') { '"' + "$a" + '"' } else { "$a" } }
    $line = 'git ' + ($parts -join ' ') + ' 2>&1'
    $out = & $script:CmdExe '/d' '/c' $line
    $script:GitExit = $LASTEXITCODE
    return $out
}
# devolve só a primeira linha útil (para rev-parse e afins)
function GitLine {
    $out = Git @args
    if ($script:GitExit -ne 0) { return $null }
    $first = @($out | Where-Object { "$_".Trim() }) | Select-Object -First 1
    if ($null -eq $first) { return $null }
    return "$first".Trim()
}
# roda um programa nativo pelo cmd.exe e devolve a saída (stderr incluso).
function Run {
    $parts = foreach ($a in $args) { if ("$a" -match '[\s&|<>^]') { '"' + "$a" + '"' } else { "$a" } }
    $line = ($parts -join ' ') + ' 2>&1'
    $out = & $script:CmdExe '/d' '/c' $line
    $script:RunExit = $LASTEXITCODE
    return $out
}
function Short($sha) { if ($sha -and $sha.Length -ge 7) { return $sha.Substring(0, 7) } return "$sha" }

Write-Host @"

   ╔══════════════════════════════════════════════════════════════╗
   ║   A X E   C A P I T A L                                      ║
   ║   Autonomous Forex Trading Office  ·  MetaTrader 5 + AI      ║
   ╚══════════════════════════════════════════════════════════════╝
"@ -ForegroundColor DarkCyan
Say "branch : $Branch" DarkGray
Say "destino: $InstallDir" DarkGray

function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('Path', 'User')
}

function Ensure-Tool($cmd, $wingetId, $label) {
    if (Have $cmd) { Ok "$label ok"; return }
    if (-not (Have 'winget')) { Fail "$label não encontrado e o winget não está disponível. Instale $label manualmente e rode de novo." }
    Say "instalando $label via winget (pode demorar um pouco)…"
    Run winget install --id $wingetId --silent --accept-package-agreements --accept-source-agreements --disable-interactivity | Out-Null
    Refresh-Path
    if (-not (Have $cmd)) { Fail "$label foi instalado mas não está no PATH. Feche e reabra o terminal e rode o comando novamente." }
    Ok "$label instalado"
}

function Backup-UserConfig($dir) {
    $saved = @()
    foreach ($rel in @('data\config.json', '.env', 'backend\.env')) {
        $src = Join-Path $dir $rel
        if (Test-Path $src) {
            $backupDir = Join-Path $dir 'data\backups'
            New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
            $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
            $leaf = (Split-Path $rel -Leaf)
            Copy-Item $src (Join-Path $backupDir "$leaf.$stamp.bak") -Force
            $saved += $rel
        }
    }
    return $saved
}

# ─────────────────────────────────────────────────────── pré-requisitos ──
Step 'Verificando pré-requisitos'
Ensure-Tool 'git'  'Git.Git'            'Git'
Ensure-Tool 'node' 'OpenJS.NodeJS.LTS'  'Node.js'
if (-not (Have-Npm)) { Refresh-Path }
$npmVersion = NpmOut '-v'
if (-not $npmVersion) { Fail 'npm não encontrado no PATH. Feche e reabra o terminal (ou reinstale o Node.js LTS) e rode de novo.' }
Ok "node $(node -v) · npm $npmVersion"

# ───────────────────────────────────── código fonte (instalar/atualizar) ──
$isUpdate = Test-Path (Join-Path $InstallDir '.git')
$codeChanged = $true
$changedFiles = @()

if ($isUpdate) {
    Step 'Procurando atualizações na branch'
    Push-Location $InstallDir
    Git remote set-url origin $Repo | Out-Null
    $fetchOut = Git fetch origin $Branch --depth 1
    if ($script:GitExit -ne 0) {
        $detail = ($fetchOut | Select-Object -Last 6) -join [Environment]::NewLine
        Pop-Location
        Warn 'o git não conseguiu falar com o GitHub:'
        Say $detail DarkGray
        Fail "falha ao baixar a branch $Branch. Confira a internet/proxy e rode o comando de novo."
    }
    $localSha  = GitLine rev-parse HEAD
    $remoteSha = GitLine rev-parse FETCH_HEAD
    if (-not $remoteSha) {
        Pop-Location
        Fail "o git não devolveu o commit remoto da branch $Branch. Rode de novo ou apague a pasta $InstallDir para reinstalar do zero."
    }

    if ($localSha -eq $remoteSha -and -not $Force) {
        Ok "já está na última versão ($(Short $localSha))"
        $codeChanged = $false
    } else {
        if ($CheckOnly) {
            Warn "existe atualização disponível: $(Short $localSha) → $(Short $remoteSha)"
            Pop-Location
            exit 0
        }
        Say "atualizando $(Short $localSha) → $(Short $remoteSha)" DarkGray
        $changedFiles = @(Git diff --name-only HEAD FETCH_HEAD)

        $kept = Backup-UserConfig $InstallDir
        if ($kept.Count) { Ok "configurações preservadas: $($kept -join ', ') (cópia em data\backups)" }

        # descarta apenas alterações de arquivos versionados; data\ e .env são
        # ignorados pelo git e continuam intactos
        Git reset --hard FETCH_HEAD | Out-Null
        if ($script:GitExit -ne 0) { Pop-Location; Fail 'não consegui aplicar a atualização (git reset). Feche o escritório se ele estiver rodando e tente de novo.' }
        Ok 'código atualizado'
    }
    Pop-Location
} else {
    Step 'Baixando o código da branch'
    if (Test-Path $InstallDir) {
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        Warn "pasta já existe sem repositório git, movendo para $InstallDir.bak-$stamp"
        Move-Item $InstallDir "$InstallDir.bak-$stamp"
    }
    $cloneOut = Git clone --branch $Branch --single-branch --depth 1 $Repo $InstallDir
    if ($script:GitExit -ne 0) { Say (($cloneOut | Select-Object -Last 6) -join [Environment]::NewLine) DarkGray }
    if (-not (Test-Path $InstallDir)) { Fail "falha ao clonar $Repo (branch $Branch). Se o repositório for privado, faça login no Git Credential Manager ou rode 'gh auth login' antes." }
    Ok 'repositório clonado'
}

Set-Location $InstallDir

# ─────────────────────────────────────── dependências (só quando precisa) ──
$needBackendDeps  = $Force -or -not (Test-Path 'backend\node_modules')  -or ($changedFiles -match '^backend/package(-lock)?\.json$')
$needFrontendDeps = $Force -or -not (Test-Path 'frontend\node_modules') -or ($changedFiles -match '^frontend/package(-lock)?\.json$')
$needBuild        = $Force -or $codeChanged -or -not (Test-Path 'backend\dist\server.js') -or -not (Test-Path 'frontend\dist\index.html')

if ($needBackendDeps -or $needFrontendDeps) {
    Step 'Instalando dependências'
    if ($needBackendDeps)  { NpmInstall 'backend' }
    if ($needFrontendDeps) { NpmInstall 'frontend' }
    Ok 'pacotes npm em dia'
} else {
    Ok 'dependências já instaladas'
}

if ($needBuild) {
    Step 'Compilando'
    Npm run build --prefix backend  --loglevel=error
    Npm run build --prefix frontend --loglevel=error
    Ok 'build concluído'
} else {
    Ok 'build já está atualizado'
}

# ─────────────────────────────────────────────────── ponte MetaTrader 5 ──
if (-not $SkipBridge) {
    Step 'Ponte MetaTrader 5 (usa a conta já logada no terminal)'
    $py = $null
    foreach ($c in @('py', 'python')) { if (Have $c) { $py = $c; break } }
    if (-not $py -and (Have 'winget')) {
        Say 'instalando Python via winget…'
        Run winget install --id Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements --disable-interactivity | Out-Null
        Refresh-Path
        foreach ($c in @('py', 'python')) { if (Have $c) { $py = $c; break } }
    }
    if ($py) {
        $needPy = $Force -or -not $isUpdate -or ($changedFiles -match '^mt5-bridge/')
        if ($needPy) {
            Run $py -m pip install --quiet --upgrade pip | Out-Null
            $pipOut = Run $py -m pip install --quiet -r (Join-Path $InstallDir 'mt5-bridge\requirements.txt')
            if ($script:RunExit -ne 0) {
                Warn 'não consegui instalar as dependências Python da ponte MT5:'
                Say ($pipOut | Select-Object -Last 6 | Out-String).Trim() DarkGray
                Say 'o escritório continua funcionando em SIMULAÇÃO; rode o instalador de novo depois.' DarkGray
            }
        }
        Ok 'ponte MT5 pronta'
    } else {
        Warn 'sem Python: a ponte MT5 não será iniciada. O escritório roda normalmente em modo SIMULATION.'
    }
}

# ──────────────────────────────────────────────────────────── atalhos ────
Step 'Atalhos'
$launcher = Join-Path $InstallDir 'Start-AxeCapital.cmd'
@"
@echo off
title Axe Capital - Autonomous Forex Desk
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" %*
echo.
echo (janela mantida aberta para voce ler as mensagens acima)
pause
"@ | Set-Content -Path $launcher -Encoding ASCII

$updater = Join-Path $InstallDir 'Update-AxeCapital.cmd'
@"
@echo off
title Axe Capital - Update
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/muriloramosoficial/axecapital/refs/heads/$Branch/scripts/install.ps1 | iex"
pause
"@ | Set-Content -Path $updater -Encoding ASCII

$desktop = [Environment]::GetFolderPath('Desktop')

# .bat clicável direto na área de trabalho (não depende de atalho .lnk)
try {
    $deskBat = Join-Path $desktop 'Axe Capital.bat'
@"
@echo off
title Axe Capital - Autonomous Forex Desk
cd /d "$InstallDir"
if not exist "$InstallDir\scripts\start.ps1" (
    echo Instalacao nao encontrada em $InstallDir
    echo Rode novamente o comando de instalacao.
    pause
    exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "$InstallDir\scripts\start.ps1" %*
echo.
echo (janela mantida aberta para voce ler as mensagens acima)
echo logs em: $InstallDir\data\logs
pause
"@ | Set-Content -Path $deskBat -Encoding ASCII
    Ok "arquivo clicavel criado: $deskBat"
} catch { Warn 'não foi possível criar o .bat na área de trabalho' }

# .bat de atualização, também na área de trabalho
try {
    $deskUpd = Join-Path $desktop 'Axe Capital - Atualizar.bat'
@"
@echo off
title Axe Capital - Atualizar
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/muriloramosoficial/axecapital/refs/heads/$Branch/scripts/install.ps1 | iex"
pause
"@ | Set-Content -Path $deskUpd -Encoding ASCII
    Ok 'atualizador na área de trabalho ok'
} catch { Warn 'não foi possível criar o atualizador na área de trabalho' }

try {
    $ws = New-Object -ComObject WScript.Shell
    $lnk = $ws.CreateShortcut((Join-Path $desktop 'Axe Capital.lnk'))
    $lnk.TargetPath = $launcher
    $lnk.WorkingDirectory = $InstallDir
    $lnk.IconLocation = "$env:SystemRoot\System32\SHELL32.dll,13"
    $lnk.Description = 'Axe Capital — escritório de trading autônomo'
    $lnk.Save()
    Ok 'atalho na área de trabalho ok'
} catch { Warn 'não foi possível criar o atalho na área de trabalho' }

$cfg = Join-Path $InstallDir 'data\config.json'
Write-Host "`n══════════════════════════════════════════════════════════════" -ForegroundColor DarkCyan
Ok $(if ($isUpdate) { if ($codeChanged) { 'Atualização concluída' } else { 'Nada a atualizar — tudo pronto' } } else { 'Instalação concluída' })
Say "pasta        : $InstallDir" DarkGray
Say "suas configs : $cfg $(if (Test-Path $cfg) { '(preservado)' } else { '(criado no primeiro uso)' })" DarkGray
Say "iniciar      : 2 cliques em 'Axe Capital.bat' na área de trabalho (ou $launcher)" DarkGray
Say "atualizar    : Update-AxeCapital.cmd (ou rode este mesmo comando de novo)" DarkGray
Say "navegador    : http://localhost:8787" DarkGray
Say "ponte MT5    : http://127.0.0.1:8788  (abra o MetaTrader 5 e faça login antes)" DarkGray
Say "IA local     : ⚙ Setup → AI provider → LM Studio (http://127.0.0.1:1234/v1) ou custom" DarkGray
Write-Host "══════════════════════════════════════════════════════════════`n" -ForegroundColor DarkCyan

Say "log desta instalação: $script:LogFile" DarkGray
Stop-Log

if (-not $NoLaunch) {
    Step 'Iniciando o escritório…'
    Start-Process -FilePath $launcher -WorkingDirectory $InstallDir
}
