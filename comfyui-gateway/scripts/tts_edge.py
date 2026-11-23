#!/usr/bin/env python
"""本地 TTS：文字 -> 语音（edge-tts 神经语音）
用法: tts_edge.py <text> <voice> <rate> <out_path>
voice 支持 edge 音色名，或 OpenAI 风格别名（alloy/nova/echo/onyx/shimmer）。
"""
import asyncio, os, sys

ALIASES = {
    "alloy":   "zh-CN-YunxiNeural",
    "echo":    "zh-CN-YunyangNeural",
    "fable":   "zh-CN-YunjianNeural",
    "onyx":    "zh-CN-YunjianNeural",
    "nova":    "zh-CN-XiaoxiaoNeural",
    "shimmer": "zh-CN-XiaoyiNeural",
    "female":  "zh-CN-XiaoxiaoNeural",
    "male":    "zh-CN-YunxiNeural",
}

async def main():
    import edge_tts
    text = sys.argv[1]
    voice = (sys.argv[2] or "zh-CN-XiaoxiaoNeural").strip()
    rate  = (sys.argv[3] or "+0%").strip()
    out   = sys.argv[4]
    voice = ALIASES.get(voice.lower(), voice)
    if not rate.startswith(("+", "-")):
        rate = f"{float(rate):+.0%}" if rate.replace('.','',1).replace('-','',1).isdigit() else "+0%"

    # edge-tts 走微软云，偶发 NoAudioReceived / 连接重置；重试几次更稳
    last = None
    for attempt in range(1, 4):
        try:
            if os.path.exists(out):
                os.remove(out)
            await edge_tts.Communicate(text, voice, rate=rate).save(out)
            if os.path.exists(out) and os.path.getsize(out) >= 512:
                return
            last = "TTS 输出为空"
        except Exception as exc:  # noqa: BLE001
            last = f"{type(exc).__name__}: {exc}"
        await asyncio.sleep(0.8 * attempt)
    raise SystemExit(f"TTS 失败（重试 3 次）: {last}")

asyncio.run(main())
