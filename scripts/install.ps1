<#
    AXE CAPITAL — instalador para Windows
    =====================================
    Baixa a branch do projeto, instala dependências, compila e cria os atalhos.

    Uso (PowerShell ou CMD com powershell -c):

      $b='arena/8d46e70a-axecapital'; iex "& { $(irm https://raw.githubusercontent.com/muriloramosoficial/axecapital/$b/scripts/install.ps1) } -Branch $b"

    Nada é mesclado na main: tudo vem da branch informada.
#>

[CmdletBinding()]
param(
    [string]$Branch = 'arena/8d46e70a-axecapital',
    [string]$Repo = 'https://github.com/muriloramosoficial/axecapital.git',
    [string]$InstallDir = "$env:USERPROFILE\AxeCapital",
    [switch]$SkipBridge,
    [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Say($msg, $color = 'Gray') { Write-Host "  $msg" -ForegroundColor $color }
function Step($msg) { Write-Host "`n▸ $msg" -ForegroundColor Cyan }
function Ok($msg) { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  ! $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "`n  ✕ $msg" -ForegroundColor Red; exit 1 }

Write-Host @"

   ╔══════════════════════════════════════════════════════════════╗
   ║   A X E   C A P I T A L                                      ║
   ║   Autonomous Forex Trading Office  ·  MetaTrader 5 + AI      ║
   ╚══════════════════════════════════════════════════════════════╝
"@ -ForegroundColor DarkCyan
Say "branch : $Branch" DarkGray
Say "destino: $InstallDir" DarkGray

function Have($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('Path', 'User')
}

function Ensure-Tool($cmd, $wingetId, $label) {
    if (Have $cmd) { Ok "$label já instalado"; return }
    if (-not (Have 'winget')) { Fail "$label não encontrado e o winget não está disponível. Instale $label manualmente e rode de novo." }
    Say "instalando $label via winget (pode demorar um pouco)…"
    winget install --id $wingetId --silent --accept-package-agreements --accept-source-agreements --disable-interactivity | Out-Null
    Refresh-Path
    if (-not (Have $cmd)) { Fail "$label foi instalado mas não está no PATH. Feche e reabra o terminal e rode o comando novamente." }
    Ok "$label instalado"
}

# ─────────────────────────────────────────────────────── pré-requisitos ──
Step 'Verificando pré-requisitos'
Ensure-Tool 'git'  'Git.Git'            'Git'
Ensure-Tool 'node' 'OpenJS.NodeJS.LTS'  'Node.js'
if (-not (Have 'npm')) { Refresh-Path }
if (-not (Have 'npm')) { Fail 'npm não encontrado no PATH.' }
Ok "node $(node -v) · npm $(npm -v)"

# ───────────────────────────────────────────────────────── código fonte ──
Step 'Baixando o código da branch'
if (Test-Path (Join-Path $InstallDir '.git')) {
    Push-Location $InstallDir
    git remote set-url origin $Repo | Out-Null
    git fetch origin $Branch --depth 1 2>&1 | Out-Null
    git checkout -B axecapital-local "origin/$Branch" 2>&1 | Out-Null
    git reset --hard "origin/$Branch" 2>&1 | Out-Null
    Pop-Location
    Ok 'repositório atualizado'
} else {
    if (Test-Path $InstallDir) {
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        Warn "pasta já existe, movendo para $InstallDir.bak-$stamp"
        Move-Item $InstallDir "$InstallDir.bak-$stamp"
    }
    git clone --branch $Branch --single-branch --depth 1 $Repo $InstallDir 2>&1 | Out-Null
    if (-not (Test-Path $InstallDir)) { Fail "falha ao clonar $Repo (branch $Branch). Se o repositório for privado, rode 'gh auth login' ou configure o Git Credential Manager antes." }
    Ok 'repositório clonado'
}

Set-Location $InstallDir

# ────────────────────────────────────────────────────────── dependências ──
Step 'Instalando dependências (engine + interface)'
npm install --prefix backend  --no-audit --no-fund --loglevel=error
npm install --prefix frontend --no-audit --no-fund --loglevel=error
Ok 'pacotes npm instalados'

Step 'Compilando para produção'
npm run build --prefix backend  --loglevel=error
npm run build --prefix frontend --loglevel=error
Ok 'build concluído (um único processo serve interface + engine)'

# ─────────────────────────────────────────────────── ponte MetaTrader 5 ──
if (-not $SkipBridge) {
    Step 'Ponte MetaTrader 5 (conta já logada)'
    $py = $null
    foreach ($c in @('py', 'python')) { if (Have $c) { $py = $c; break } }
    if (-not $py) {
        Warn 'Python não encontrado — instalando via winget…'
        if (Have 'winget') {
            winget install --id Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements --disable-interactivity | Out-Null
            Refresh-Path
            foreach ($c in @('py', 'python')) { if (Have $c) { $py = $c; break } }
        }
    }
    if ($py) {
        & $py -m pip install --quiet --upgrade pip | Out-Null
        & $py -m pip install --quiet -r (Join-Path $InstallDir 'mt5-bridge\requirements.txt')
        Ok 'ponte MT5 pronta (ela usa a conta que já está logada no terminal)'
    } else {
        Warn 'sem Python: a ponte MT5 não será iniciada. O escritório roda normalmente em modo SIMULATION.'
    }
}

# ──────────────────────────────────────────────────────────── atalhos ────
Step 'Criando atalhos'
$launcher = Join-Path $InstallDir 'Start-AxeCapital.cmd'
@"
@echo off
title Axe Capital - Autonomous Forex Desk
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" %*
"@ | Set-Content -Path $launcher -Encoding ASCII

$desktop = [Environment]::GetFolderPath('Desktop')
$shortcut = Join-Path $desktop 'Axe Capital.lnk'
try {
    $ws = New-Object -ComObject WScript.Shell
    $lnk = $ws.CreateShortcut($shortcut)
    $lnk.TargetPath = $launcher
    $lnk.WorkingDirectory = $InstallDir
    $lnk.IconLocation = "$env:SystemRoot\System32\SHELL32.dll,13"
    $lnk.Description = 'Axe Capital — escritório de trading autônomo'
    $lnk.Save()
    Ok "atalho criado na área de trabalho"
} catch { Warn 'não foi possível criar o atalho na área de trabalho' }

Write-Host "`n══════════════════════════════════════════════════════════════" -ForegroundColor DarkCyan
Ok 'Instalação concluída'
Say "pasta      : $InstallDir" DarkGray
Say "iniciar    : duplo clique em 'Axe Capital' (área de trabalho) ou $launcher" DarkGray
Say "navegador  : http://localhost:8787" DarkGray
Say "ponte MT5  : http://127.0.0.1:8788  (abra o MetaTrader 5 e faça login antes)" DarkGray
Say "IA local   : ⚙ Setup → AI provider → LM Studio (http://127.0.0.1:1234/v1) ou provider personalizado" DarkGray
Write-Host "══════════════════════════════════════════════════════════════`n" -ForegroundColor DarkCyan

if (-not $NoLaunch) {
    Step 'Iniciando o escritório…'
    Start-Process -FilePath $launcher -WorkingDirectory $InstallDir
}
