$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) {
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.10+ is required.' }
}
$pythonExe = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
& $pythonExe -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw 'pip setup failed.' }
& $pythonExe -m pip install 'torch==2.6.0' --index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple
if ($LASTEXITCODE -ne 0) { throw 'PyTorch installation failed.' }
& $pythonExe -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
& $pythonExe scripts/download_beard.py
if ($LASTEXITCODE -ne 0) { throw 'Model download failed. Run install.ps1 again to retry.' }
Write-Host 'Ready. Run start.cmd and open http://127.0.0.1:8011'
