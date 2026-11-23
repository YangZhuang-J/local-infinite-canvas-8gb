@echo off
REM ============================================================
REM  ComfyUI 启动脚本（Windows 直启版，不依赖 WSL）
REM
REM  为什么要有这个文件：
REM    用 `wsl.exe bash start_comfy.sh` 启动时，ComfyUI 的父进程
REM    挂在 WSL 上，WSL 会话一断（或 distro 空闲回收），ComfyUI
REM    会跟着消失，画布就显示「ComfyUI 离线」。
REM    直接调 .venv 里的 Windows python.exe 可以彻底避开这个坑。
REM
REM  用法：双击，或注册成计划任务 / 开机自启
REM  需要改的：COMFY_DIR（你的 ComfyUI 安装目录）
REM ============================================================
setlocal

set "COMFY_DIR=D:\LenovoSoftstore\comfyui\ComfyUI\ComfyUI"
set "TOOLKIT=%USERPROFILE%\AppData\Roaming\Comfy Desktop\instance-model-paths\inst-1794729840796.yaml"
set "SHARED=%LOCALAPPDATA%\Comfy-Desktop\ComfyUI-Shared"

REM 缓存全部落 D 盘，C 盘只留程序本体
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
set TQDM_DISABLE=1
set HF_HOME=D:\Cache\hf
set HF_HUB_CACHE=D:\Cache\hf\hub
set TORCH_HOME=D:\Cache\torch

cd /d "%COMFY_DIR%"
if not exist ".venv\Scripts\python.exe" (
  echo [ERR] 找不到 %COMFY_DIR%\.venv\Scripts\python.exe
  echo       请先按 README 完成 ComfyUI 与本项目环境安装
  exit /b 1
)

".venv\Scripts\python.exe" -s main.py --port 8188 --listen 127.0.0.1 ^
  --extra-model-paths-config "%TOOLKIT%" ^
  --input-directory "%SHARED%\input" ^
  --output-directory "%SHARED%\output" >> "%COMFY_DIR%\comfy_run.log" 2>&1
