@echo off
rem 本地 8GB 适配版启动入口
rem UPDATE_IGNORE=1 / UPDATE_ENABLED=0：屏蔽升级提示与自动更新（本机已定制 GGUF 工作流）
set UPDATE_IGNORE=1
set UPDATE_ENABLED=0
cd /d "%~dp0"
"%~dp0node\node.exe" launcher\start.mjs %*
