$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$runtime = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $runtime)) {
    Write-Error 'Run the setup commands in README.md first to create .venv.'
}
& $runtime -m streamlit run dashboard/streamlit_app.py --server.address 127.0.0.1 --server.port 8501 --server.headless true --browser.gatherUsageStats false
