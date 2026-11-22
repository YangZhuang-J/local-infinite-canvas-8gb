#!/usr/bin/env python3
"""把 MOSS / Z-Image / Krea2 / Qwen2.1 的工作流主模型切到本地 GGUF 文件。"""
import json, os, shutil, urllib.request

WF='/mnt/d/Apps/Local-Infinite-Canvas/comfyui-gateway/workflows'
OI=json.load(urllib.request.build_opener(urllib.request.ProxyHandler({}))
             .open("http://127.0.0.1:8188/object_info",timeout=180))
GGUF_OPTS=OI['UnetLoaderGGUF']['input']['required']['unet_name'][0]

# 原 unet_name 关键字 -> 目标 GGUF
MAP=[
 (['moss_image_sft'],        'MOSS-Image-SFT-Q4_K_M.gguf'),
 (['z_image_turbo'],         'z-image-turbo-Q4_K_M.gguf'),
 (['krea2_turbo'],           'krea2_turbo-Q3_K_M.gguf'),
 (['qwen_image_2.1_turbo'],  'qwen-image-2.1-turbo-Q4_K_M.gguf'),
]
changed=[]; skipped=[]
for name in sorted(os.listdir(WF)):
    if not name.endswith('.json') or name in ('registry.json','workflow-baseline.json'): continue
    p=os.path.join(WF,name)
    try: d=json.load(open(p,encoding='utf-8'))
    except Exception: continue
    if not isinstance(d,dict): continue
    hit=False
    for nid,node in d.items():
        if not isinstance(node,dict) or node.get('class_type')!='UNETLoader': continue
        cur=str((node.get('inputs') or {}).get('unet_name','')).lower()
        for keys,target in MAP:
            if not any(k in cur for k in keys): continue
            if target not in GGUF_OPTS:
                skipped.append((name,target)); break
            node['class_type']='UnetLoaderGGUF'
            node['inputs']={'unet_name':target}
            hit=True
            break
    if hit:
        bak=p+'.orig'
        if not os.path.exists(bak): shutil.copyfile(p,bak)
        json.dump(d,open(p,'w',encoding='utf-8'),ensure_ascii=False,indent=1)
        changed.append(name)
print(f"已适配 {len(changed)} 个工作流:")
for n in changed: print("   ", n)
for n,t in skipped: print(f"  ⚠️ {n}: {t} 不在 GGUF 列表")
