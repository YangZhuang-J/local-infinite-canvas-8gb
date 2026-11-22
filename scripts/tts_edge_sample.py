import asyncio, edge_tts, os
TEXT = "你终于来了。这座城，已经等了你三百年。"
OUT = r"D:\LenovoSoftstore\ComfyUI-Shared\input"
voices = {
 "edge_xiaoxiao.wav": ("zh-CN-XiaoxiaoNeural", "-5%", "+0Hz"),
 "edge_yunxi.wav":    ("zh-CN-YunxiNeural",    "-5%", "+0Hz"),
 "edge_xiaoyi.wav":   ("zh-CN-XiaoyiNeural",   "-8%", "+0Hz"),
}
async def main():
    for fn,(v,rate,pitch) in voices.items():
        c = edge_tts.Communicate(TEXT, v, rate=rate, pitch=pitch)
        await c.save(os.path.join(OUT, fn))
        p=os.path.join(OUT,fn)
        print(f"  {fn:<22} {v:<24} {os.path.getsize(p)/1024:7.1f} KB")
asyncio.run(main())
