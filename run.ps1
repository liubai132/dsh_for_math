# 启动数学工坊：http://127.0.0.1:8899
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$env:PYTHONIOENCODING = 'utf-8'

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host '没找到 python，请先安装 Python 3.10+' -ForegroundColor Red
    exit 1
}

python -c "import fastapi, sympy, mpmath" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host '缺少依赖，先运行：pip install -r requirements.txt' -ForegroundColor Yellow
    exit 1
}

$port = if ($env:MATH_PORT) { $env:MATH_PORT } else { '8899' }
Write-Host "数学工坊正在启动 → http://127.0.0.1:$port" -ForegroundColor Green
python -m app.server
