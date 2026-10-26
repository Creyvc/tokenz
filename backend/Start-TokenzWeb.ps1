$ErrorActionPreference = 'Stop'
# Starts the Tokenz website with the engine behind it: http://127.0.0.1:8000/compare.html
Set-Location -LiteralPath $PSScriptRoot
$projectPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $projectPython)) {
    throw 'Create the virtual environment and install dependencies using README.md first.'
}
& $projectPython web_api.py
