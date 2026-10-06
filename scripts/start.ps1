<#
    Axe Capital — inicializador local (Windows)
    Sobe a ponte do MetaTrader 5 (se o Python estiver disponível) e o engine,
    que também serve a interface compilada em http://localhost:8787
#>

[CmdletBinding()]
param(
    [int]$Port = 8787,
    [int]$BridgePort = 8788,
    [switch]$NoBridge,
    [switch]$NoBrowser,
    [switch]$Dev
)

$ErrorActionPreference = 'Continue'
try { Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force -ErrorAction Stop } catch { }

$script:CmdExe = Join-Path $env:SystemRoot 'System32\cmd.exe'
if (-not (Test-Path $script:CmdExe)) { $script:CmdExe = 'cmd.exe' }
# npm via cmd.exe: evita o bloqueio de npm.ps1 em máquinas com ExecutionPolicy restrita
function Npm { & $script:CmdExe '/d' '/c' 'npm' @args }
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# ── log + pausa: se algo quebrar, a janela NÃO fecha antes de você ler ───
$logDir = Join-Path $root 'data\logs'
try { New-Item -ItemType Directory -Force -Path $logDir | Out-Null } catch { }
$script:LogFile = Join-Path $logDir ('start-{0}.log' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
try { Start-Transcript -Path $script:LogFile -Force | Out-Null; $script:Logging = $true } catch { $script:Logging = $false }
function Stop-Log { if ($script:Logging) { try { Stop-Transcript | Out-Null } catch { } ; $script:Logging = $false } }
function Hold($msg) {
    if ($env:AXE_NOPAUSE -eq '1') { return }
    if ($msg) { Write-Host "`n  ✕ $msg" -ForegroundColor Red }
    Write-Host "  log: $script:LogFile" -ForegroundColor DarkGray
    try { Read-Host '  Pressione ENTER para fechar esta janela' | Out-Null } catch { Start-Sleep -Seconds 60 }
}
trap {
    Write-Host "`n  ✕ erro: $($_.Exception.Message)" -ForegroundColor Red
    $pos = $_.InvocationInfo.PositionMessage
    if ($pos) { Write-Host "$pos" -ForegroundColor DarkGray }
    Stop-Log
    Hold
    exit 1
}

function Have($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Listening($p) {
    try { return [bool](Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue) }
    catch { return $false }
}

Write-Host "`n  AXE CAPITAL — autonomous forex desk" -ForegroundColor Cyan
Write-Host "  root: $root" -ForegroundColor DarkGray
if (-not (Have 'node')) {
    Stop-Log
    Hold 'Node.js não encontrado no PATH. Feche e reabra o terminal ou rode o instalador de novo.'
    exit 1
}
Write-Host "  node: $(node -v)   log: $script:LogFile`n" -ForegroundColor DarkGray

# ── ponte MetaTrader 5 (usa a conta JÁ logada no terminal) ───────────────
if (-not $NoBridge) {
    if (Listening $BridgePort) {
        Write-Host "  ✓ ponte MT5 já rodando em :$BridgePort" -ForegroundColor Green
    } else {
        $py = $null
        foreach ($c in @('py', 'python')) { if (Have $c) { $py = $c; break } }
        if ($py) {
            Write-Host "  ▸ iniciando ponte MetaTrader 5 em :$BridgePort" -ForegroundColor Cyan
            $env:MT5_BRIDGE_PORT = "$BridgePort"
            Start-Process -WindowStyle Minimized -FilePath $py `
                -ArgumentList @((Join-Path $root 'mt5-bridge\bridge.py')) -WorkingDirectory $root
            Start-Sleep -Seconds 2
        } else {
            Write-Host "  ! Python ausente — rodando apenas em modo SIMULATION" -ForegroundColor Yellow
        }
    }
}

# ── engine + interface ───────────────────────────────────────────────────
$env:PORT = "$Port"
$env:MT5_BRIDGE_URL = "http://127.0.0.1:$BridgePort"

if ($Dev) {
    Write-Host "  ▸ modo desenvolvimento (vite + tsx watch)" -ForegroundColor Cyan
    if (-not $NoBrowser) { Start-Process 'http://localhost:5173' }
    Npm run dev
    Stop-Log
    Hold
    return
}

if (-not (Test-Path (Join-Path $root 'backend\dist\server.js'))) {
    Write-Host "  ▸ build ausente, compilando…" -ForegroundColor Cyan
    Npm run build --prefix backend  --loglevel=error
    if ($LASTEXITCODE -ne 0) { Stop-Log; Hold "falha ao compilar o backend (código $LASTEXITCODE)"; exit 1 }
    Npm run build --prefix frontend --loglevel=error
    if ($LASTEXITCODE -ne 0) { Stop-Log; Hold "falha ao compilar a interface (código $LASTEXITCODE)"; exit 1 }
}
if (-not (Test-Path (Join-Path $root 'backend\dist\server.js'))) {
    Stop-Log
    Hold "não encontrei backend\dist\server.js — rode o instalador de novo (Axe Capital - Atualizar.bat)"
    exit 1
}

if (-not $NoBrowser) {
    Start-Job -ScriptBlock {
        param($p)
        for ($i = 0; $i -lt 40; $i++) {
            try { Invoke-WebRequest "http://localhost:$p/api/health" -UseBasicParsing -TimeoutSec 1 | Out-Null; break }
            catch { Start-Sleep -Milliseconds 500 }
        }
        Start-Process "http://localhost:$p"
    } -ArgumentList $Port | Out-Null
}

Write-Host "  ▸ engine em http://localhost:$Port   (Ctrl+C encerra)`n" -ForegroundColor Cyan
node (Join-Path $root 'backend\dist\server.js')
$code = $LASTEXITCODE
Stop-Log
if ($code -ne 0) { Hold "o engine encerrou com erro (código $code)" } else { Hold }
