#!/usr/bin/env python
"""本地 TTS：文字 -> 语音（edge-tts 微软神经语音）

用法: tts_edge.py <text> <voice> <rate> <out_path>

voice 接受三种写法：
  1) OpenAI 风格别名（画布音色下拉里的 13 个）：alloy/ash/ballad/coral/echo/fable/
     nova/onyx/sage/shimmer/verse/marin/cedar，另加 female/male 两个便民别名
  2) edge-tts 原生音色名，如 zh-CN-YunjianNeural
  3) 其它任意值 → 兜底到 DEFAULT_VOICE（不再因“音色不认识”直接 500）

设计原则：中文漫剧优先。所以 13 个别名全部映射到中文 neural 音色，
而不是 edge-tts 的英文音色（配音要中文，英文音色念中文会很怪）。
"""
import asyncio
import os
import sys

DEFAULT_VOICE = "zh-CN-YunjianNeural"  # 兜底：浑厚男声（猪八戒这类角色常用）

# ---- 画布音色（OpenAI 13 个）→ 中文 edge-tts 音色
#      edge-tts 的 zh-CN 只有 8 个：Xiaoxiao / Xiaoyi / Yunjian / Yunxi /
#      Yunxia / Yunyang + 两个方言（liaoning-Xiaobei / shaanxi-Xiaoni）
ALIASES = {
    # 女声
    "alloy":   "zh-CN-XiaoxiaoNeural",   # 中性/温和
    "nova":    "zh-CN-XiaoxiaoNeural",   # 温暖女声
    "shimmer": "zh-CN-XiaoyiNeural",     # 活泼年轻女声
    "coral":   "zh-CN-XiaoxiaoNeural",   # 亲切女声
    "sage":    "zh-CN-XiaoyiNeural",     # 知性女声
    # 男声
    "echo":    "zh-CN-YunyangNeural",    # 播音腔
    "onyx":    "zh-CN-YunjianNeural",    # 浑厚
    "fable":   "zh-CN-YunjianNeural",    # 浑厚（叙事）
    "ash":     "zh-CN-YunxiNeural",      # 年轻男声
    "verse":   "zh-CN-YunyangNeural",    # 诗歌/抒情
    "marin":   "zh-CN-XiaoxiaoNeural",   # 柔和
    "cedar":   "zh-CN-YunxiNeural",      # 沉稳年轻男声
    "ballad":  "zh-CN-YunyangNeural",    # 叙事/吟诵感（Yunye 不在 edge 列表，故用播音腔）
    # 便民别名
    "female":  "zh-CN-XiaoxiaoNeural",
    "male":    "zh-CN-YunxiNeural",
}

# 已是 edge-tts 原生音色名的前缀（含方言，如 zh-CN-liaoning-XiaobeiNeural）
NATIVE_PREFIXES = ("zh-", "en-", "ja-", "ko-", "yue-", "cmn-", "wuu-")


def resolve_voice(raw):
    """返回 (实际使用的音色, 是否发生了兜底)"""
    value = (raw or "").strip()
    if not value:
        return DEFAULT_VOICE, True
    lower = value.lower()
    if lower in ALIASES:
        return ALIASES[lower], False
    if "-" in value and lower.startswith(NATIVE_PREFIXES):
        return value, False
    return DEFAULT_VOICE, True


async def synthesize(text, voice, rate, out):
    import edge_tts

    await edge_tts.Communicate(text, voice, rate=rate).save(out)
    return os.path.exists(out) and os.path.getsize(out) >= 512


def decode_text_arg(raw):
    """台词优先走 base64（--b64:xxx）：Windows 命令行会把中文变成 U+FFFD，
    直接当 argv 传会让 TTS 念乱码甚至返回空音频。兼容旧的裸文本参数。"""
    value = raw or ""
    if value.startswith("--b64:"):
        import base64
        return base64.b64decode(value[6:]).decode("utf-8", "replace")
    return value


async def main():
    try:
        import json as _json, pathlib as _pl
        _log = _pl.Path(__file__).resolve().parent.parent / "data" / "tts_argv.log"
        _log.parent.mkdir(parents=True, exist_ok=True)
        if _log.exists() and _log.stat().st_size > 200 * 1024:
            _log.write_text("", encoding="utf-8")
        with _log.open("a", encoding="utf-8") as _fh:
            _fh.write(_json.dumps({"argv": sys.argv[1:4], "fsenc": sys.getfilesystemencoding()}, ensure_ascii=False) + chr(10))
    except Exception:
        pass
    text = decode_text_arg(sys.argv[1] if len(sys.argv) > 1 else "")
    raw_voice = sys.argv[2] if len(sys.argv) > 2 else ""
    rate = (sys.argv[3] if len(sys.argv) > 3 else "" or "+0%").strip()
    out = sys.argv[4]

    if not rate.startswith(("+", "-")):
        numeric = rate.replace(".", "", 1).replace("-", "", 1).isdigit()
        rate = f"{float(rate):+.0%}" if numeric else "+0%"

    voice, fellback = resolve_voice(raw_voice)
    if fellback and (raw_voice or "").strip():
        print(f"[tts] 未知音色 {raw_voice!r}，回落到 {voice}", file=sys.stderr)

    # edge-tts 走微软云：偶发 NoAudioReceived / 连接重置 / 音色被服务端拒绝，都要重试
    last_error = None
    candidates = [voice]
    if DEFAULT_VOICE not in candidates:
        candidates.append(DEFAULT_VOICE)  # 原生音色被拒时再退一层

    for candidate in candidates:
        for attempt in range(1, 5):
            try:
                if os.path.exists(out):
                    os.remove(out)
                if await synthesize(text, candidate, rate, out):
                    if candidate != voice:
                        print(f"[tts] 音色 {voice} 被服务端拒绝，改用 {candidate}", file=sys.stderr)
                    return
                last_error = "输出为空"
            except Exception as exc:  # noqa: BLE001
                last_error = f"{type(exc).__name__}: {exc}"
                if "Invalid voice" in str(exc):
                    break  # 换下一个候选音色，不再重复试
            # 退避：微软侧限流时给足恢复时间（1s / 2.5s / 5s / 8s）
            await asyncio.sleep((1.0, 2.5, 5.0, 8.0)[min(attempt - 1, 3)])

    raise SystemExit(f"TTS 失败: {last_error}")


asyncio.run(main())
