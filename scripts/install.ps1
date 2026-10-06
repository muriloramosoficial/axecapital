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

# Em máquinas com ExecutionPolicy AllSigned/Restricted o PowerShell se recusa a
# carregar npm.ps1 (que vem sem assinatura digital). Liberamos só para ESTE
# processo — nada é alterado permanentemente na máquina — e, mesmo assim, todas
# as chamadas de npm são feitas via cmd.exe (npm.cmd), que não passa por policy.
try { Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force -ErrorAction Stop } catch { }

function Say($msg, $color = 'Gray') { Write-Host "  $msg" -ForegroundColor $color }
function Step($msg) { Write-Host "`n▸ $msg" -ForegroundColor Cyan }
function Ok($msg) { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  ! $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "`n  ✕ $msg" -ForegroundColor Red; exit 1 }
function Have($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

$script:CmdExe = Join-Path $env:SystemRoot 'System32\cmd.exe'
if (-not (Test-Path $script:CmdExe)) { $script:CmdExe = 'cmd.exe' }

# npm SEMPRE através do cmd.exe → usa npm.cmd e nunca npm.ps1.
# Funções sem bloco param() para que tokens como --prefix caiam todos em $args.
function Npm {
    & $script:CmdExe '/d' '/c' 'npm' @args
    if ($LASTEXITCODE -ne 0) { Fail "falha ao executar: npm $($args -join ' ')  (código $LASTEXITCODE)" }
}
function NpmOut {
    return (& $script:CmdExe '/d' '/c' 'npm' @args 2>$null | Select-Object -First 1)
}
function Have-Npm {
    if (NpmOut '-v') { return $true }
    return $false
}

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
    winget install --id $wingetId --silent --accept-package-agreements --accept-source-agreements --disable-interactivity | Out-Null
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
    git remote set-url origin $Repo | Out-Null
    git fetch origin $Branch --depth 1 2>&1 | Out-Null
    $localSha  = (git rev-parse HEAD 2>$null)
    $remoteSha = (git rev-parse FETCH_HEAD 2>$null)

    if ($localSha -eq $remoteSha -and -not $Force) {
        Ok "já está na última versão ($($localSha.Substring(0,7)))"
        $codeChanged = $false
    } else {
        if ($CheckOnly) {
            Warn "existe atualização disponível: $($localSha.Substring(0,7)) → $($remoteSha.Substring(0,7))"
            Pop-Location
            exit 0
        }
        Say "atualizando $($localSha.Substring(0,7)) → $($remoteSha.Substring(0,7))" DarkGray
        $changedFiles = @(git diff --name-only HEAD FETCH_HEAD 2>$null)

        $kept = Backup-UserConfig $InstallDir
        if ($kept.Count) { Ok "configurações preservadas: $($kept -join ', ') (cópia em data\backups)" }

        # descarta apenas alterações de arquivos versionados; data\ e .env são
        # ignorados pelo git e continuam intactos
        git reset --hard FETCH_HEAD 2>&1 | Out-Null
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
    git clone --branch $Branch --single-branch --depth 1 $Repo $InstallDir 2>&1 | Out-Null
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
    if ($needBackendDeps)  { Npm install --prefix backend  --no-audit --no-fund --loglevel=error }
    if ($needFrontendDeps) { Npm install --prefix frontend --no-audit --no-fund --loglevel=error }
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
        winget install --id Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements --disable-interactivity | Out-Null
        Refresh-Path
        foreach ($c in @('py', 'python')) { if (Have $c) { $py = $c; break } }
    }
    if ($py) {
        $needPy = $Force -or -not $isUpdate -or ($changedFiles -match '^mt5-bridge/')
        if ($needPy) {
            & $py -m pip install --quiet --upgrade pip 2>&1 | Out-Null
            & $py -m pip install --quiet -r (Join-Path $InstallDir 'mt5-bridge\requirements.txt')
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
"@ | Set-Content -Path $launcher -Encoding ASCII

$updater = Join-Path $InstallDir 'Update-AxeCapital.cmd'
@"
@echo off
title Axe Capital - Update
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/muriloramosoficial/axecapital/refs/heads/$Branch/scripts/install.ps1 | iex"
pause
"@ | Set-Content -Path $updater -Encoding ASCII

$desktop = [Environment]::GetFolderPath('Desktop')
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
Say "iniciar      : atalho 'Axe Capital' ou $launcher" DarkGray
Say "atualizar    : Update-AxeCapital.cmd (ou rode este mesmo comando de novo)" DarkGray
Say "navegador    : http://localhost:8787" DarkGray
Say "ponte MT5    : http://127.0.0.1:8788  (abra o MetaTrader 5 e faça login antes)" DarkGray
Say "IA local     : ⚙ Setup → AI provider → LM Studio (http://127.0.0.1:1234/v1) ou custom" DarkGray
Write-Host "══════════════════════════════════════════════════════════════`n" -ForegroundColor DarkCyan

if (-not $NoLaunch) {
    Step 'Iniciando o escritório…'
    Start-Process -FilePath $launcher -WorkingDirectory $InstallDir
}
