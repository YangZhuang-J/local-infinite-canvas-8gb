#!/bin/bash
# 启动 ComfyUI（本机 8GB 适配版）
#
# 特点：
#   - 自动识别挂载前缀：WSL 的 /mnt/d、Git Bash(MSYS) 的 /d 都能用
#   - 模型/输入/输出统一落 D 盘，C 盘只留程序本体；HF/Torch 缓存也指到 D 盘
#
# 用法：
#   bash scripts/start_comfy.sh            # 启动
#   bash scripts/start_comfy.sh --print    # 只打印解析结果，不启动（排查路径用）
#
# 按你的机器可能要改的只有 COMFY_DIR 一处。
# WSL 用户如果 $HOME 不是 Windows 用户目录，先设置：
#   export WINHOME=/mnt/c/Users/<你的Windows用户名>

COMFY_DIR="/d/LenovoSoftstore/comfyui/ComfyUI/ComfyUI"        # ComfyUI 安装目录（含 .venv）
TOOLKIT_YAML_NAME="inst-1794729840796.yaml"                   # Comfy Desktop 的模型路径配置
MODEL_YAML_REL="AppData/Roaming/Comfy Desktop/instance-model-paths"
SHARED_REL="AppData/Local/Comfy-Desktop/ComfyUI-Shared"       # input/output 所在

pick() {  # pick <盘符> -> 返回可用挂载前缀
  for p in "/mnt/$1" "/$1"; do
    [ -d "$p" ] && { echo "$p"; return 0; }
  done
  return 1
}

# /d/a/b 或 /mnt/d/a/b -> D:\a\b（纯 bash 实现，避开 sed 转义坑）
winpath() {
  local p="$1"
  p="${p#/mnt/}"
  p="${p#/}"
  p="${p:0:1}:${p:1}"
  p="${p//\//\\}"
  echo "$p"
}

DROOT=$(pick d) || { echo "[ERR] 找不到 D 盘 (/mnt/d 或 /d)"; exit 1; }
WINHOME="${WINHOME:-$HOME}"   # Windows 用户目录（AppData 的父目录）

COMFY_DIR="${COMFY_DIR/#\/d/$DROOT}"
TOOLKIT="$WINHOME/$MODEL_YAML_REL/$TOOLKIT_YAML_NAME"
IN_DIR="$WINHOME/$SHARED_REL/input"
OUT_DIR="$WINHOME/$SHARED_REL/output"
LOG="$COMFY_DIR/comfy_run.log"

if [ "$1" = "--print" ]; then
  echo "DROOT   = $DROOT"
  echo "WINHOME = $WINHOME"
  echo "COMFY   = $COMFY_DIR"
  echo "TOOLKIT = $(winpath "$TOOLKIT")"
  echo "INPUT   = $(winpath "$IN_DIR")"
  echo "OUTPUT  = $(winpath "$OUT_DIR")"
  [ -d "$COMFY_DIR" ] && echo "状态    = 目录存在 OK" || echo "状态    = 目录不存在 FAIL"
  exit 0
fi

[ -d "$COMFY_DIR" ] || { echo "[ERR] ComfyUI 目录不存在: $COMFY_DIR"; exit 1; }
[ -f "$TOOLKIT" ]   || echo "[WARN] 模型路径配置不存在: $TOOLKIT（ComfyUI 会用默认路径启动）"

export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8
export TQDM_DISABLE=1
export HF_HOME="$DROOT/Cache/hf"
export HF_HUB_CACHE="$DROOT/Cache/hf/hub"
export TORCH_HOME="$DROOT/Cache/torch"

cd "$COMFY_DIR" || exit 1

exec "$COMFY_DIR/.venv/Scripts/python.exe" -s main.py \
  --port 8188 --listen 127.0.0.1 \
  --extra-model-paths-config "$(winpath "$TOOLKIT")" \
  --input-directory "$(winpath "$IN_DIR")" \
  --output-directory "$(winpath "$OUT_DIR")" \
  >> "$LOG" 2>&1
