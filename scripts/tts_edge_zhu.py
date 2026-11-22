import asyncio, edge_tts, os
TEXT = "你终于来了。这座城，已经等了你三百年。"
OUT = r"D:\LenovoSoftstore\ComfyUI-Shared\input"
jobs = {
 "tts_zhu_yunxi.wav":  ("zh-CN-YunxiNeural",  "-10%", "-15Hz"),   # 年轻男声，略低沉
 "tts_zhu_yunjian.wav":("zh-CN-YunjianNeural","-8%",  "-25Hz"),   # 浑厚男声，适合猪妖
 "tts_zhu_yunyang.wav":("zh-CN-YunyangNeural","-12%", "-20Hz"),   # 播音腔
}
async def main():
    for fn,(v,rate,pitch) in jobs.items():
        await edge_tts.Communicate(TEXT, v, rate=rate, pitch=pitch).save(os.path.join(OUT,fn))
        p=os.path.join(OUT,fn)
        print(f"  {fn:<24} {v:<22} {os.path.getsize(p)/1024:6.1f} KB")
asyncio.run(main())
