# ==============================================================================
# AI-Driven Digital Twin for Smart Factory Operations
# Git Repository Initialization & GitHub Push Automation Script
# ==============================================================================

param(
    [string]$GitHubUsername = "gsparsh580-coder",
    [string]$RepoName = "smart-factory-digital-twin"
)

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "   AI-DRIVEN SMART FACTORY DIGITAL TWIN: GITHUB DEPLOYMENT SETUP" -ForegroundColor Yellow
Write-Host "==========================================================================" -ForegroundColor Cyan

$TargetDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $TargetDir

Write-Host "`n[1/5] Checking Git Status in $TargetDir..." -ForegroundColor Green
if (-not (Test-Path ".git")) {
    Write-Host "      Initializing new standalone Git repository..." -ForegroundColor Yellow
    git init
} else {
    Write-Host "      Existing Git repository detected." -ForegroundColor Green
}

Write-Host "`n[2/5] Staging project files..." -ForegroundColor Green
git add .

Write-Host "`n[3/5] Creating initial commit..." -ForegroundColor Green
git commit -m "feat: AI-driven Digital Twin for Smart Factory Operations (ESP32 IoT, HiveMQ MQTT, Node-RED, Web Control Deck)"

Write-Host "`n[4/5] Setting main branch & remote origin..." -ForegroundColor Green
git branch -M main

$RemoteUrl = "https://github.com/$GitHubUsername/$RepoName.git"
$ExistingRemote = git remote get-url origin 2>$null

if ($null -eq $ExistingRemote -or $ExistingRemote -eq "") {
    Write-Host "      Adding remote origin: $RemoteUrl" -ForegroundColor Yellow
    git remote add origin $RemoteUrl
} else {
    Write-Host "      Updating remote origin to: $RemoteUrl" -ForegroundColor Yellow
    git remote set-url origin $RemoteUrl
}

Write-Host "`n[5/5] Ready to push to GitHub!" -ForegroundColor Green
Write-Host "--------------------------------------------------------------------------"
Write-Host "To push your code now, ensure you have created the empty repository on GitHub:" -ForegroundColor White
Write-Host "   👉 URL: https://github.com/new (Name: $RepoName, Public)" -ForegroundColor Cyan
Write-Host "`nThen execute:" -ForegroundColor White
Write-Host "   git push -u origin main" -ForegroundColor Yellow
Write-Host "--------------------------------------------------------------------------"

Write-Host "`n🌐 DIRECT ACCESS DASHBOARD LINK (Once GitHub Pages is enabled):" -ForegroundColor Magenta
Write-Host "   👉 https://$GitHubUsername.github.io/$RepoName/" -ForegroundColor Cyan
Write-Host "`nTo enable GitHub Pages in 1-click:" -ForegroundColor White
Write-Host "   1. Go to your repo: https://github.com/$GitHubUsername/$RepoName/settings/pages" -ForegroundColor Gray
Write-Host "   2. Under 'Build and deployment' -> 'Source': Select 'GitHub Actions' (or Deploy from branch -> main / root)" -ForegroundColor Gray
Write-Host "   3. Your live interactive control dashboard is immediately accessible from anywhere!" -ForegroundColor Green
Write-Host "==========================================================================`n"
