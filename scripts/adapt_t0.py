#!/usr/bin/env python3
"""T0：把 3 个 H3 视频工作流文件适配到 8GB / GGUF 环境。

覆盖 7 个画布条目：
  h3-ref2va-drama.json     -> video-h3-ref2va-novdn / t2v-novdn / frames-novdn
  h3-ref2va-drama-vdn.json -> video-h3-ref2va / t2v / frames      （VDN 改为 SelfLift）
  h3-character-swap-vdn.json -> video-h3-character-swap           （VDN 改为 SelfLift + 保留换角 LoRA）

统一改造：
  CLIPLoader(int8 27GB)          -> CLIPLoaderGGUF(Q4_K_M 13.57GB)
  UNETLoader(Singularity 21GB)   -> UnetLoaderGGUF(Ref2VA Q3 8.29GB)
  MiniMaxH3TRTVAELoader(engine)  -> VAELoader(video vae int8 2.61GB)
  TESpeed / SagePatch / SolAttn / PreviewOverride / VDN / ChunkFF -> 删除
  latent upscaler fp16           -> 本机 bf16
  LoRA 768p                      -> 本机 fl2v_turbo_8step_v1.0
"""
import json, os, shutil, urllib.request

GATEWAY = '/mnt/d/Apps/Local-Infinite-Canvas/comfyui-gateway'
WF = f'{GATEWAY}/workflows'
BASE = '/mnt/d/tmp/wf/selflift_8gb.json'   # 已验证可跑的自建图
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
OI = json.load(OPENER.open("http://127.0.0.1:8188/object_info", timeout=180))

DEFAULT_PROMPT = ("integrated_multimodal_description: A cinematic shot of the character from Image 1, "
                  "restrained natural performance, shallow depth of field, film grain, coherent lighting.\n\n"
                  "overall_soundscape: Quiet ambient room tone, subtle cloth movement, no voice.\n\n"
                  "non_diegetic_music: Sparse solo dizi, slow and breathy, no percussion, no electric guitar.")

def build_base():
    """以已验证的自建图为模板，去掉硬编码参考图与提示词。"""
    g = json.load(open(BASE, encoding='utf-8'))
    g.pop('90', None)                       # 去掉 LoadImage(char_ref.png)，参考图改由画布注入
    for k in [k for k in g['76']['inputs'] if k.startswith('ref_images')]:
        g['76']['inputs'].pop(k)
    g['76']['inputs']['prompt'] = DEFAULT_PROMPT
    g['76']['inputs']['task_type'] = 'Ref2VA'
    return g

def validate(wf, tag):
    problems = []
    for nid, n in wf.items():
        ct = n['class_type']
        if ct not in OI:
            problems.append(f'[{nid}] 节点不存在 {ct}'); continue
        spec = OI[ct].get('input') or {}
        req = spec.get('required') or {}
        opt = spec.get('optional') or {}
        hid = spec.get('hidden') or {}
        for key, val in req.items():
            if key not in n['inputs']:
                problems.append(f'[{nid}] {ct} 缺必填 {key}'); continue
            if isinstance(val[0], list) and isinstance(n['inputs'][key], str) and n['inputs'][key] not in val[0]:
                problems.append(f'[{nid}] {ct}.{key} 枚举不合法')
        for key in n['inputs']:
            if key in req or key in opt or key in hid or '.' in key:
                continue
            problems.append(f'[{nid}] {ct} 多余输入 {key}')
    print(f"  {tag}: {'✅ 校验通过' if not problems else '❌ ' + str(len(problems)) + ' 个问题'}")
    for p in problems[:6]:
        print('      ' + p)
    return not problems

def write(name, wf):
    path = f'{WF}/{name}'
    bak = f'{path}.orig'
    if not os.path.exists(bak) and os.path.exists(path):
        shutil.copyfile(path, bak)
    json.dump(wf, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return path

base = build_base()

# ---- 1. novdn 原文件 ----
w1 = json.loads(json.dumps(base))
p1 = write('h3-ref2va-drama.json', w1)
ok1 = validate(w1, 'h3-ref2va-drama.json (novdn ×3)')

# ---- 2. vdn 文件：整份换成 SelfLift 链路 ----
w2 = json.loads(json.dumps(base))
p2 = write('h3-ref2va-drama-vdn.json', w2)
ok2 = validate(w2, 'h3-ref2va-drama-vdn.json (VDN ×3 → SelfLift)')

# ---- 3. character-swap：SelfLift 链路 + 保留换角 LoRA ----
w3 = json.loads(json.dumps(base))
w3['120'] = {
    "class_type": "LoraLoaderModelOnly",
    "inputs": {"model": ["4", 0],
               "lora_name": "h3_character_swap_v1.5.safetensors",
               "strength_model": 1},
    "_meta": {"title": "Character Swap 1.5"},
}
# 原链路 4 -> 5，改为 4 -> 120 -> 5
w3['5']['inputs']['model'] = ["120", 0]
p3 = write('h3-character-swap-vdn.json', w3)
ok3 = validate(w3, 'h3-character-swap-vdn.json (换角 ×1)')

print(f"\n已写入: {p1}\n        {p2}\n        {p3}")
print("（原文件已备份为 *.orig）")
