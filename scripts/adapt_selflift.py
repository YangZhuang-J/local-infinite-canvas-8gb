#!/usr/bin/env python3
"""把 gateway 的 h3-ref2va-drama（SelfLift 双采）适配到本机 8GB / GGUF 环境。

替换要点：
  CLIPLoader(int8 27GB)      -> CLIPLoaderGGUF(qwen3vl Q4_K_M 13.6GB)
  UNETLoader(Singularity 21GB) -> UnetLoaderGGUF(Ref2VA Q3_K_M 8.3GB)
  MiniMaxH3TRTVAELoader(TRT .engine 5.2GB) -> VAELoader(video vae int8 2.6GB)
  SolAttnPatch(缺 sageattention) -> 删除，直连
  ModelPreviewOverrideKJ(需 taeh3) -> 删除，直连
  latent upscaler fp16 -> 本机 bf16 版
  LoRA 768p -> 本机 fl2v_turbo_8step_v1.0
  新增 LoadImage(char_ref.png) -> ref_images 自增长输入
"""
import json, urllib.request, urllib.parse, os

SRC = '/mnt/d/Apps/Local-Infinite-Canvas/comfyui-gateway/workflows/h3-ref2va-drama.json'
OUT = '/mnt/d/tmp/wf/selflift_8gb.json'
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
OI = json.load(OPENER.open("http://127.0.0.1:8188/object_info", timeout=180))

PROMPT = """integrated_multimodal_description: A cinematic medium close-up of the same young woman as in Image 1 — a Chinese woman in her early twenties with a small dark mole under her left eye, black hair held in a plain jade hairpin, wearing a white hanfu with a crimson sash at the waist. She stands in a snowy pine forest at blue-hour dusk, fine snow drifting sideways past her face. 0-1s: she holds still, breath visible as thin white vapor, eyes lowered. 1-3s: she lifts her head slowly and looks directly into the camera, snow settling on her lashes and one strand of hair. 3-5s: a faint exhale, the jade hairpin catches a glint of cold light, the crimson sash lifts slightly in the wind. Camera: slow dolly-in of roughly fifteen percent, shallow depth of field, background pines soft and bokeh-shaped. Light: cool blue ambient fill from the snow, warm amber rim light from a distant unseen lamp on her cheek, high dynamic range, film grain, 35mm anamorphic look, no lens flare. Color grade: desaturated blues and whites with the crimson sash as the only saturated accent. Skin texture natural, visible pores, no beauty-filter smoothing. Motion is restrained and quiet; the only fast motion is drifting snow.

overall_soundscape: Wind moving through pine needles in a soft continuous wash, low in the mix. Fine granular snow hiss, tiny particles striking fabric. A single faint creak of frozen wood far off to the right. Her breath: slow inhale through the nose, gentle exhale through the mouth, close-miked and dry. Fabric shifting as the sash lifts, a light silk rustle. On her head lift at around two seconds, a small intake of breath before the exhale. No voices, no dialogue, no music in this layer. Room tone stays constant, dynamics wide, no compression pumping.

non_diegetic_music: Solo dizi (Chinese bamboo flute) entering at one second, low register, breathy and unornamented, playing a slow descending three-note figure. Beneath it, a sustained low string drone in D minor at low volume, barely audible. Sparse guzheng harmonics at three and a half seconds, one plucked note allowed to decay naturally into the snow ambience. Tempo is free, no percussion at any point, no electric guitar. The music sits behind the soundscape, never masking her breath. End on the decaying drone without resolution, tail reverb four seconds, intimate close perspective."""

def node(**kw):
    return {"class_type": kw.pop("_class"), "inputs": kw}

wf = json.load(open(SRC, encoding='utf-8'))

# --- 1. CLIPLoader(int8) -> CLIPLoaderGGUF ---
wf["3"] = node(_class="CLIPLoaderGGUF",
               clip_name="qwen3vl_32b_minimax_h3-Q4_K_M.gguf", type="minimax")
# --- 2. UNETLoader(int8) -> UnetLoaderGGUF ---
wf["4"] = node(_class="UnetLoaderGGUF",
               unet_name="MiniMax-H3-Ref2VA-Pruned-Q3_K_M.gguf")
# --- 3. LoRA 换成本机 8step ---
wf["5"]["inputs"]["lora_name"] = "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors"
# --- 4. 删除 SolAttnPatch，直连 ---
del wf["34"]
wf["73"]["inputs"]["model"] = ["33", 0]
# --- 5. TRT VAE -> 普通 VAELoader ---
wf["72"] = node(_class="VAELoader", vae_name="minimax_h3_video_vae_int8_convrot.safetensors")
# --- 6. latent upscaler 换 bf16 ---
wf["78"]["inputs"]["upscaler_model"] = "minimax_h3_latent_upscaler_3d_conv_v1_bf16.safetensors"
# --- 7. 删除预览节点（需 taeh3），直连 ---
del wf["111"]
for nid in ("74", "78"):
    wf[nid]["inputs"]["model"] = ["73", 0]
# --- 7b. TESpeed 不兼容 GGUF 模型对象（unsupported _forward version），删除并直连 ---
del wf["110"]
wf["5"]["inputs"]["model"] = ["4", 0]
# --- 7c. SageAttention 补丁需 sageattention 包（Windows/Triton 难装），删除并直连 ---
del wf["32"]
wf["33"]["inputs"]["model"] = ["5", 0]
# --- 8. 提示词 / 参考图 ---
wf["76"]["inputs"]["strict_prompt_tags"] = False
wf["76"]["inputs"]["prompt"] = PROMPT
wf["90"] = node(_class="LoadImage", image="char_ref.png", upload="image")
# COMFY_AUTOGROW_V3 的 API 序列化形式：ref_images.ref_image_<n>
wf["76"]["inputs"]["ref_images.ref_image_0"] = ["90", 0]

# --- 校验 / 清理 -------------------------------------------------
# 部分节点（VHS_VideoCombine / LoadImage）在旧版工作流里带有多余控件，
# 当前版本已把它们并入 format 或不存在，直接剔除。
DROP = {"80": ["pix_fmt", "crf", "save_metadata"], "90": ["upload"]}
for nid, keys in DROP.items():
    for k in keys:
        wf[nid]["inputs"].pop(k, None)

problems = []
info = []
for nid, n in wf.items():
    ct = n["class_type"]
    if ct not in OI:
        problems.append(f"[{nid}] 节点不存在: {ct}"); continue
    spec = OI[ct].get("input") or {}
    req = spec.get("required") or {}
    opt = spec.get("optional") or {}
    hid = spec.get("hidden") or {}
    ins = n["inputs"]
    for key, val in req.items():
        if key not in ins:
            problems.append(f"[{nid}] {ct} 缺必填输入: {key}"); continue
        opts = val[0]
        if isinstance(opts, list) and isinstance(ins[key], str) and ins[key] not in opts:
            problems.append(f"[{nid}] {ct}.{key}={ins[key]!r} 不在枚举内")
    for key in list(ins):
        if key in req or key in opt or key in hid:
            continue
        if "." in key:  # autogrow 自增长输入
            continue
        info.append(f"[{nid}] {ct} 剔除未知输入: {key}")
        ins.pop(key)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(wf, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"已生成: {OUT}  ({len(wf)} 节点)")
for i in info:
    print("   · " + i)
if problems:
    print(f"\n❌ 校验问题 {len(problems)} 个:")
    for p in problems: print("   " + p)
else:
    print("\n✅ 校验通过：节点全部存在、必填输入齐全、枚举值合法")
