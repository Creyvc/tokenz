$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$projectPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
$preparedPython = Join-Path $PSScriptRoot '..\..\work\.venv\Scripts\python.exe'
if (Test-Path -LiteralPath $projectPython) {
    $runtimePython = $projectPython
} elseif (Test-Path -LiteralPath $preparedPython) {
    $runtimePython = $preparedPython
} else {
    throw 'Create the virtual environment and install dependencies using README.md first.'
}
& $runtimePython -m streamlit run app.py --server.address 127.0.0.1 --browser.gatherUsageStats false
