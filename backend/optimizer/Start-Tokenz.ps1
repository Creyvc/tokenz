$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
# Inside the Tokenz backend this shares ..\.venv with TokenSaver; a .venv of its own still works.
$runtime = Join-Path $PSScriptRoot '..\.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $runtime)) {
    $runtime = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
}
if (-not (Test-Path -LiteralPath $runtime)) {
    Write-Error 'Run the setup commands in README.md first to create .venv.'
}
& $runtime -m streamlit run dashboard/streamlit_app.py --server.address 127.0.0.1 --server.port 8501 --server.headless true --browser.gatherUsageStats false
