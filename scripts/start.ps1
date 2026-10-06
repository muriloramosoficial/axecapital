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

function Have($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Listening($p) {
    try { return [bool](Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue) }
    catch { return $false }
}

Write-Host "`n  AXE CAPITAL — autonomous forex desk" -ForegroundColor Cyan
Write-Host "  root: $root`n" -ForegroundColor DarkGray

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
    return
}

if (-not (Test-Path (Join-Path $root 'backend\dist\server.js'))) {
    Write-Host "  ▸ build ausente, compilando…" -ForegroundColor Cyan
    Npm run build --prefix backend  --loglevel=error
    Npm run build --prefix frontend --loglevel=error
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
