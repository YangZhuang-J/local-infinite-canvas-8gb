# MiniMax H3 · 8GB 显卡 AI 漫剧工作流 —— 调研与验证笔记

> 记录日期：2026-11-18
> 机器：Lenovo 笔记本 / RTX 5060 Laptop 8GB / 32GB RAM / Windows 11
> 目标：用 8GB 显存本地生产 AI 漫剧（多镜头、角色一致、带音轨）

---

## 一、环境现状

| 项目 | 值 |
|---|---|
| ComfyUI 核心 | 0.45.3（Desktop v1.1.9 装的实例） |
| venv 路径 | `<ComfyUI>\.venv` |
| 共享数据目录 | `<ComfyUI-Shared>`（C 盘 junction 过去） |
| 模型目录 | `<ComfyUI-Shared>\models` |
| 输出目录 | `<ComfyUI-Shared>\output\{video,audio}` |
| 模型清单配置 | `%USERPROFILE%\AppData\Roaming\Comfy Desktop\instance-model-paths\inst-1794729840796.yaml` |

### 启动方式（重要）

`ComfyUI` 必须**带 UTF-8 + 关 tqdm**启动，否则 tqdm 进度条写入 ComfyUI 的日志拦截器会抛 `OSError: [Errno 22]`，采样直接崩。

任务计划 `ComfyServer` → `%USERPROFILE%\AppData\Local\Temp\comfy_task.bat` → `wsl.exe bash <tmp>/start_comfy2.sh`

```bash
export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8
export TQDM_DISABLE=1
cd <ComfyUI>
exec ./.venv/Scripts/python.exe -s main.py --port 8188 --listen 127.0.0.1 \
  --extra-model-paths-config "%USERPROFILE%\AppData\Roaming\Comfy Desktop\instance-model-paths\inst-1794729840796.yaml" \
  --input-directory "%USERPROFILE%\AppData\Local\Comfy-Desktop\ComfyUI-Shared\input" \
  --output-directory "%USERPROFILE%\AppData\Local\Comfy-Desktop\ComfyUI-Shared\output"
```

### 已装模型

| 类型 | 文件 | 大小 | 说明 |
|---|---|---|---|
| H3 主模型 | `MiniMax-H3-FL2VA-Pruned-Q3_K_M.gguf` | 8.90 GB | 文/图/首尾帧生视频 |
| H3 主模型 | `MiniMax-H3-Ref2VA-Pruned-Q3_K_M.gguf` | 8.90 GB | 参考图→视频（角色一致） |
| 文本编码器 | `qwen3vl_32b_minimax_h3-Q4_K_M.gguf` | 14.58 GB | 必须用 CLIPLoaderGGUF + type=`minimax` |
| 视频 VAE | `minimax_h3_video_vae_int8_convrot.safetensors` | 2.81 GB | |
| 音频 VAE | `minimax_h3_audio_vae_fp32.safetensors` | 0.61 GB | |
| **Pika LoRA** | `pika_h3_flex_fl2va_v1_bf16.safetensors` | 1.96 GB | **关键：6 步出片** |
| Pika LoRA | `pika_h3_flex_ref2va_v1_bf16.safetensors` | 1.96 GB | 参考图模式用 |
| Turbo LoRA | `minimax_h3_fl2v_turbo_4step_v1.0_768p…` | 1.96 GB | 效果不如 Pika |
| Turbo LoRA | `minimax_h3_fl2v_turbo_8step_v1.0…` | 1.96 GB | 高分精修会出蓝斑伪影 |
| Latent 放大器 | `minimax_h3_latent_upscaler_3d_conv_v1_bf16.safetensors` | 0.69 GB | 放 `models/latent_upscale_models/` |
| 视频超分 | `seedvr2_ema_3b_fp8_e4m3fn.safetensors` | 3.39 GB | 放 `models/SEEDVR2/`**（专用目录）** |
| 视频超分 VAE | `ema_vae_fp16.safetensors` | 0.50 GB | 同上 |
| 音乐 | `acestep_v1.5_turbo.safetensors` + `qwen_0.6b/1.7b_ace15` + `ace_1.5_vae` | ~10 GB | ACE-Step 1.5 |

---

## 二、已验证可用的工作流（可直接抄）

### ✅ 方案 A：Pika H3 Flex 单遍（主力出片）

**完全照抄 ComfyUI 官方模板 `video_pika_h3_flex_t2v`**，仅把 `UNETLoader`→`UnetLoaderGGUF`、`CLIPLoader`→`CLIPLoaderGGUF`。

```
UnetLoaderGGUF(MiniMax-H3-FL2VA-Pruned-Q3_K_M.gguf)
  → LoraLoaderModelOnly(pika_h3_flex_fl2va_v1_bf16.safetensors, strength 1.0)
  → BasicGuider / BasicScheduler
CLIPLoaderGGUF(qwen3vl_32b_minimax_h3-Q4_K_M.gguf, type="minimax")
  → MiniMaxH3ImageToVideo(clip, vae, prompt, width, height, length)
  → SamplerCustomAdvanced(noise, guider, sampler=lcm, sigmas=ManualSigmas, latent)
  → VAEDecode + VAEDecodeAudio → CreateVideo(fps=24) → SaveVideo
```

**关键参数（缺一不可）**

| 参数 | 值 |
|---|---|
| Sigma 表 | `1.0, 0.972973, 0.923077, 0.8, 0.571429, 0.333333, 0.0`（用 `ManualSigmas` 节点） |
| 采样器 | `lcm`（不是 euler / res_multistep） |
| 步数 | 6 |
| CFG | 1.0（SamplerCustomAdvanced 路径天然为 1） |
| 帧数公式 | `max(5, round(秒×24)) + (5 - (max(5,round(秒×24)) % 17)) % 17` |
| 5.17 秒 | = 124 帧 |
| 音频 | 同一个 AV latent 解出，`VAEDecodeAudio` → `CreateVideo.audio` |

**实测**：896×512 / 124 帧 / **423 秒（7 分钟）**，显存峰值 ~7054 MB。

### ✅ 方案 B：SeedVR2 神经超分（画质收尾）

```
LoadVideo → GetVideoComponents → SeedVR2VideoUpscaler → CreateVideo(fps 24, audio) → SaveVideo
```

| 参数 | 值 |
|---|---|
| DiT | `seedvr2_ema_3b_fp8_e4m3fn.safetensors` |
| VAE | `ema_vae_fp16.safetensors` |
| blocks_to_swap | 24（8GB 关键） |
| swap_io_components | True |
| encode/decode_tiled | True，tile 512 / overlap 64 |
| batch_size | 5 |
| color_correction | `lab` |
| resolution / max_resolution | 1024 / 1920 |

**实测**：896×512 → 1792×1024 / 124 帧 / **1140 秒（19 分钟）**，显存 ~4.6 GB。

### 🔁 组合：A + B（当前最佳链路）

**约 26 分钟出一条 5.17 秒 1792×1024 带音轨镜头。**

### ✅ 方案 C：ACE-Step 1.5 音乐（BGM/主题曲）

```
UNETLoader(acestep_v1.5_turbo) + DualCLIPLoader(qwen_0.6b + qwen_1.7b, type=ace)
  + VAELoader(ace_1.5_vae)
  → TextEncodeAceStepAudio1.5(clip, tags, lyrics, seed, bpm, duration,
      timesignature, language, keyscale, generate_audio_codes,
      cfg_scale, temperature, top_p, top_k, min_p)
  → ConditioningZeroOut → KSampler(8步, euler, simple, cfg 1) → VAEDecodeAudio → SaveAudio
```

- 双编码器**必须两个都装**：`qwen_0.6b`（规划器）+ `qwen_1.7b`（文本编码器）。只用一个是 `NoneType.shape` 报错。
- 器乐模式：`lyrics` 填 `[inst]`，tags 描述编制。
- 语言 `zh`，调性如 `C major` / `A minor` / `F# minor`，拍号 `4`。
- **实测**：180 秒歌曲约 2.5 分钟（8 步）；45 秒约 40 秒。

---

## 三、关键结论（血泪教训）

### 1. 提示词格式 >> 一切参数 ⭐⭐⭐

H3 的提示词**不是散文描述**，是**三字段结构化**，官方示例长 ~2300 字符：

```
integrated_multimodal_description: [Shot 1] <风格> + <角色细描> + <场景细描>
    + <镜头语言> + <时间轴节拍："At about 1.5 seconds ... At 2.5 seconds ...">

overall_soundscape: <环境声逐项描述：风、钟鸣、羽翼、布料、水滴……>

non_diegetic_music: <配乐乐器、节奏、随剧情起伏的进出>
```

**对照实验**：同 seed / 同分辨率 / 同 LoRA，只把 400 字符散文换成 2577 字符结构化提示词 → 构图、光影、细节全部按描述兑现（9/9 命中）。

写成英文。对白放 `<d>` 标签里。屏幕文字保留原语言。

### 2. Pika LoRA（6 步 lcm）优于官方 Turbo LoRA（4/8 步）⭐⭐⭐

| 方案 | 结果 |
|---|---|
| Turbo 4 步 + 两遍法 | 细节尚可，但两遍法本身是错的 |
| Turbo 8 步 + 两遍法 | 细节多但**右侧出蓝色光斑伪影** |
| **Pika 6 步 lcm** | **同 seed 下构图/建筑/细节全面更好，还更快** |

### 3. 「双采 / 一二采」不能手搭 ⭐⭐

社区正确做法：
1. 一条完整 sigma 表用 `SplitSigmas` 切成 前 N 步 / 后 M 步
2. `LTXVSeparateAVLatent` 把 AV latent 拆开 → 只放大**视频** latent → `LTXVConcatAVLatent` 拼回
3. 第二遍必须用 **H3 专用的重加噪**（如 T8mars 的 `restart_base_noise≈0.5`）

**我手搭的错误版**：一采 denoise=1.0 + 二采 denoise=0.5 两个独立 scheduler，二采用 `DisableNoise`
→ 干净 latent 被当成半噪声 latent 继续去噪 → **画面糊成噪声**。

结论：**别自己搭，装 T8mars/comfyui-minimax-h3-audio-T8 或直接用官方双采模板。**

### 4. 环境类坑（都踩过）

| 症状 | 原因 | 解法 |
|---|---|---|
| 采样时 `OSError: [Errno 22] Invalid argument` | ComfyUI 日志拦截器 + tqdm 写进度条 | `TQDM_DISABLE=1` + 真实控制台 |
| 自定义节点导入失败 `UnicodeEncodeError: 'gbk'` | 节点源码里有 emoji（⚠️✅⚡） | 用 Python 正则剥掉节点 .py 里的 emoji |
| 自定义节点缺依赖 | 如 `diffusers` / `rotary_embedding_torch` / `cv2` | 装到 **`.venv`**（不是 standalone-env） |
| 模型找不到 | 节点有自己的目录约定 | SeedVR2 要 `models/SEEDVR2/`；latent 放大器要 `models/latent_upscale_models/` |
| Windows 上杀进程杀不掉 | WSL 的 pkill 摸不到 Windows 进程 | 用 `taskkill /F /PID` |
| 后台下载容易死 | 进程随会话被杀 | `nohup setsid bash script.sh &` + 守护循环 |
| 分段下载文件损坏 | curl 同时用 `-C -` 和 `-r` 有 bug | 手动算偏移：`-r $((S+CUR))-$E` 追加写 |
| 模型下载慢 | 单连接被限速 | `hf-mirror` 慢/不稳，**优先 ModelScope**（同一模型 20 秒 vs 1 小时） |

### 5. 共享 GPU 内存不能算进显存 ⭐

Windows 任务管理器里的「共享 GPU 内存（17GB）」**CUDA 用不了**，只有独立显存 8GB 有效。
32GB 系统内存的价值是「模型卸载缓冲」（offload），不是「显存扩展」。
PyTorch 超显存会直接 `CUDA out of memory`，不会自动溢出到共享内存。

### 6. 存储必须全在 D 盘

- Comfy Desktop 新版默认把模型/输出建到 `C:\Users\...\AppData\Local\Comfy-Desktop\ComfyUI-Shared`
- 已用 junction 指向 `<ComfyUI-Shared>`
- 另设环境变量：`HF_HOME=D:\Cache\hf`、`PIP_CACHE_DIR=D:\Cache\pip`、`UV_CACHE_DIR=D:\Cache\uv`

---

## 四、待调研 / 待抄的「组合拳」

| 优先级 | 项目 | 解决什么 | 状态 |
|---|---|---|---|
| P0 | `zyli6269-cmyk/short-drama-4060-lipsync` | **RTX 4060 8GB 专用短剧流水线**：剧本→分镜→H3 提示词编译→TTS→MuseTalk/LatentSync 口型 | 待验证 |
| P0 | `nkxx188/ComfyUI-MiniMaxH3-Easy` ★826 | 单工作流覆盖 T2V / I2V / 首尾帧 / R2V | 待验证 |
| P1 | Civitai `MiniMax H3 ref2va - Lip Sync + TURBO v2.0` | 音频驱动口型（**纯原生节点**） | 待验证 |
| P1 | `caitongbo/ComfyUI-MiniMaxH3-LongVideo-DigitalHuman` | 音频驱动数字人 + 长视频分段 | 待验证 |
| P1 | `T8mars/comfyui-minimax-h3-audio-T8` | **正确的双采 sigma 计划** + Pika 双采 4+2 / 3+3 | 待验证 |
| P2 | `ai-manju` | 中文草稿 → 带音轨成片全链路 | 待评估 |
| P2 | `forest-laoli-h3` SKILL.md | H3 提示词编译规则（H3 按词找画面，**否定词会被丢弃**） | 知识 |
| P2 | `h3vid/awesome-minimax-h3-prompts` | 753 条验证过的 H3 提示词 | 素材库 |
| P2 | `MiniMax-AI/awesome-minimax-h3-integration` | 官方生态索引 | 索引 |
| P2 | `AtlasCloudAI/awesome-minimax-h3` | 社区索引（含 ComfyUI 节点/LoRA/工作流） | 索引 |

### 本地已有的官方模板（成本最低，优先用）

`.../site-packages/comfyui_workflow_templates_json/templates/`

- `video_pika_h3_flex_t2v.json` / `_fl2va.json` / `_ref2va.json` ← **主力**
- `video_minimax_h3_t2v.json` / `_i2v.json` / `_i2v_continuation.json` / `_r2v.json` / `_multiframe_reference.json` / `_fun_controlnet_union.json`
- `image_minimax_h3_t2i.json` / `_image_edit.json`（角色定妆图）
- `audio_minimax_music_3.json`（MiniMax Music 3 音乐）

---

## 五、成本模型（8GB 实测）

| 产物 | 耗时 | 显存峰值 |
|---|---|---|
| 5.17 秒 / 896×512（Pika 6 步） | 7 分钟 | 7.05 GB |
| 5.17 秒 / 1792×1024（+SeedVR2） | 19 分钟 | 4.6 GB |
| **一条 5 秒 1080p 镜头合计** | **26 分钟** | — |
| 3 分钟歌曲（ACE-Step 8 步） | 2.5 分钟 | 6.8 GB |
| 1 分钟漫剧（≈12 个镜头） | **≈5 小时** | — |

→ 结论：**批量生产必须挂机跑**，交互式只能用来挑镜头和调提示词。

---

## 六、下一步

1. 抄 8GB 短剧流水线，解决「角色一致性 + 人物讲台词」
2. 角色定妆图工作流（多角度同一角色）→ 喂给 Ref2VA 做跨镜头一致
3. 建立「提示词模板库」：把结构化三字段做成可复用模板
4. 用无限画布类前端管理多镜头，ComfyUI 只当后端

---

## 附录 F：无限画布部署 + SelfLift 双采实测（2026-11-20）

### F1 无限画布部署
- 位置：`<安装目录>`（129MB，git clone 自魔搭）
- 架构：画布 :3000 → 网关 :8190 → ComfyUI :8188
- 仓库用 Git LFS 管 341 个文件，clone 后全是指针。必须手动补：
  - `node/node.exe` → 用本地 `<Node24>\node.exe` 覆盖
  - `comfyui-gateway/src/resources.js`(144KB)、`resources/index.json`(118KB)、`launcher/gateway-deps.zip`(1MB)
  - 下载方式：`https://modelscope.cn/api/v1/datasets/shensanshu/ComfyUI-Local-Infinite-Canvas/resolve/master/<路径>`
- **`src/public-url.js` 仓库缺失**，我按调用点 `absoluteTaskUrl(config,req,url)` 反推实现
- 启动：计划任务 `InfiniteCanvas` → `%USERPROFILE%\AppData\Local\Temp\canvas_start.bat`
- `config.json` 关键项：`stopAdoptedComfyOnCanvasClose:false`（防止关画布杀掉我们的 ComfyUI）、`openBrowser:true`
- 注意：`closeCanvasStopsBackend:true` → **关网页会把网关和画布一起停掉**
- 网关会自动往 ComfyUI/custom_nodes 投放 16 个节点包，**必须重启 ComfyUI 才生效**（节点数 1097 → 1722）
- 打赏加群入口：补丁脚本 `patch-remove-donate.mjs`（把 `jsx(DonationPopover,...)` → `null`，源码 `donation-popover.tsx` 同步改存根）
- **缓存坑**：dist 资源头 `cache-control: immutable`，改完必须改 URL（已在 index.html 加 `?pd=1`）才生效

### F2 SelfLift 双采适配 8GB（h3-ref2va-drama.json → selflift_8gb.json）

节点替换表：
| 原节点 | 替换为 | 原因 |
|---|---|---|
| CLIPLoader(int8 27GB) | **CLIPLoaderGGUF** + qwen3vl Q4_K_M 13.57GB | 内存装不下原版 |
| UNETLoader(Singularity 21GB) | **UnetLoaderGGUF** + Ref2VA Q3_K_M 8.29GB | 同上 |
| MiniMaxH3TRTVAELoader(.engine) | **VAELoader** + video_vae_int8 2.61GB | 无 TRT engine |
| **TESpeedMiniMaxH3** | **删除** | 报 `unsupported MiniMaxH3Model._forward version`，不兼容 GGUF |
| **MiniMaxH3MemoryEfficientSageAttentionPatch** | **删除** | 需 sageattention 包（Windows+Triton 难装） |
| **SolAttnPatch** | **删除** | 同上 |
| ModelPreviewOverrideKJ | **删除** | 需 taeh3.safetensors |
| latent upscaler fp16 | 本机 `3d_conv_v1_bf16` | 已有 |

输入：`LoadImage(char_ref.png)` → `ref_images.ref_image_0`（COMFY_AUTOGROW_V3 的 API 写法是扁平 key）

### F3 实测结果（成功）
- 输出：**1344×768 / 124帧 / 5.17s / 24fps / 含原生音轨**（音量 mean -28.7dB）
- 画质：优。角色一致性保持（玉簪/白hanfu/赤红腰带/左眼下小痣/雪松林 blue hour）
- **耗时 3532s ≈ 59 分钟**，明细：
  | 阶段 | 分辨率 | 步数 | 耗时 |
  |---|---|---|---|
  | 低清 | 448×800 | 6 | 251s（42s/步）|
  | latent 放大 | →768×1344 | — | 8s |
  | **高清** | 768×1344 | 3 | **3273s（965~1194s/步）** |
- **瓶颈根因**：高清阶段 ComfyUI 报 `0.00MB usable / 8784MB offloaded` → 模型全量推内存，每步走 PCIe。低清阶段部分驻留所以只要 42s/步
- 对比：Easy 720P（1280×736，6步单采）581s；Pika 896×512 6步 423s

### F4 两个必须记住的坑
1. **VHS_VideoCombine 需要 ffmpeg**：已 `pip install imageio-ffmpeg`（含 105MB ffmpeg 二进制）
2. **VHS 的 `ffmpeg_path` 是模块级全局变量，启动时解析一次** → 装完 ffmpeg 不重启 ComfyUI 仍然报错。
   绕过办法：用 `SaveImage` + `SaveAudio` 替代 VHS，再用 ffmpeg 自己合成（可复用 ComfyUI 的节点缓存，不重跑采样）

### F5 调优方向（待验证）
| 手段 | 预期 |
|---|---|
| 提高分辨率到临界点以下（如 1024×576 / 960×544）让模型部分驻留显存 | 高清步从 965s → 可能 60~100s |
| 去掉 H3SigmaRefiner（extra_steps=1 → 少一个高清步） | 省 16~20 分钟 |
| 换 4step LoRA（NFE 8→4） | 时间减半 |
| 低清后改用 SeedVR2 超分而非 SelfLift 高清 | SeedVR2 已有（1140s/5s 片段）|

---

## 附录 G：T0 —— 7 个 H3 视频工作流适配 GGUF（2026-11-20）

### G1 覆盖关系（3 个文件 → 6 个画布条目）
| 文件 | 画布条目 | 改造 |
|---|---|---|
| `h3-ref2va-drama.json` | video-h3-ref2va-novdn / t2v-novdn / frames-novdn | 换 GGUF 加载器 |
| `h3-ref2va-drama-vdn.json` | video-h3-ref2va / t2v / frames | **整份换成 SelfLift 链路**（删 ApplyVDNH3Advanced，省 5.13GB VDN 模型）|
| `h3-character-swap-vdn.json` | video-h3-character-swap | 同上 + 保留换角 LoRA（节点 120）|

脚本：`<tmp>/wf/adapt_t0.py`（原文件备份为 `*.orig`）

### G2 画布可用性有两层，都要改
1. **图层面**：loader 的模型枚举（setup 扫描）→ 换 GGUF 即通过
2. **声明层**：`resources/index.json` 的 `packs[].workflowDependencies[<工作流id>]`，会补「运行期依赖」检查
   - 还有**硬编码规则**：`resources.js` 里 `if (workflowId.startsWith("video-h3-"))` 就要求 `tensorrt`
   - 补丁：改成 `&& ids.has("h3_trt_vae_decoder_engine")`，即「真的声明了 TRT 才检查」
   - 同时把 index.json 里 TRT/ONNX/sage/VDN 依赖从这 7 个条目中删掉

### G3 结果
- 画布可用：**4 → 10 / 24**
- 新增：video-h3-frames / frames-novdn / ref2va / ref2va-novdn / t2v / t2v-novdn
- 仍差：video-h3-character-swap（只缺 `h3_character_swap_v1.5.safetensors` 155MB，属 T1）
- **冒烟测试通过**：640×352 / 39 帧 / T2VA（无参考图）/ 约 210 秒，画面与提示词吻合

### G4 运维坑
- **`Stop-ScheduledTask` 不会杀掉启动器派生的 node 子进程** → 改代码后必须
  `Get-CimInstance Win32_Process | where CommandLine -like '*Local-Infinite-Canvas*'` 找到 PID 再 `taskkill /F /T`
  注意不要杀掉 Pi 自身的 node 进程（`<Node24>\node.exe ...npm/node_modules`）
- 网关重启后要等 40~60 秒才 ready

---

## 附录 H：T1 完成（2026-11-20）

下载 3 个文件，共 **232MB**，sha256 全部匹配：

| 文件 | 大小 | 源 | 目标 |
|---|---|---|---|
| `taeh3.safetensors` | 9.79MB | 画布仓库 LFS（resolve 接口取真文件）| `models/vae_approx/` |
| `h3_character_swap_v1.5.safetensors` | 155.1MB | ModelScope `akatz-ai/MiniMax-H3-Character-Swap-LoRA` | `models/loras/` |
| `RealESRGAN_x2plus.pth` | 67.1MB | ModelScope dataset `ComfyUI-Local-Infinite-Canvas-Models` | `models/upscale_models/` |

结果：画布可用 **10 → 13 / 24**
新增：`video-h3-character-swap`、`image-esrgan-upscale`、`video-ESRGAN_2x放大`

**ESRGAN 实测通过**：640×352 → 1280×704，秒级完成。

> 注意：仓库自带的 `resources/vae_approx/taeh3.safetensors` 也是 LFS 指针（132 字节），
> 必须用 `.../datasets/shensanshu/ComfyUI-Local-Infinite-Canvas/resolve/master/<路径>` 取真文件。

---

## 附录 I：H3 Image 验证 + 视频速度临界点（2026-11-20）

### I1 H3 Image（GGUF Q3 + 复用 H3 视频的文本编码器）
| 任务 | 分辨率 | 耗时 | 结果 |
|---|---|---|---|
| 文生图 | 1024×1024 | 97s | ✅ 全要素命中 |
| 参考图编辑 | 1024×1024 | 183s | ✅ 换场景保身份 |
| 角色四视图 | 2048×1024 | 154~182s | ✅ 四视角+灰底+同基线 |

关键：**TE 复用 `qwen3vl_32b_minimax_h3-Q4_K_M.gguf`（CLIPLoaderGGUF, type=minimax）**，只需下
`MiniMax-H3-Image-AD-Q3_K.gguf`(8.13GiB) + `minimax_h3_image_vae_fp16`(1.09GiB)。

最小 API 图（t2i）：
```
UnetLoaderGGUF + CLIPLoaderGGUF(type=minimax) + VAELoader
→ MiniMaxH3ImageConditioning(clip,prompt,width,height[,vae,images.image_N]) → CONDITIONING + LATENT
→ ConditioningZeroOut(负向) + KSampler(steps=6,cfg=1,euler,simple,denoise=1)
→ VAEDecode → SaveImage
```
编辑模式：`MiniMaxH3ImageConditioning.images.image_0` 接 LoadImage，并连 `vae`（做参考潜变量锚定）。

四视图经验：
- 提示词要写「four full-body views in one horizontal row / equal scale / feet on one baseline / plain grey seamless backdrop / 45 degrees for view 2」
- 不加「photorealistic, not stylized, no CG doll look」会偏 3D 手办风
- 背面视图容易丢红腰带 → 明确写「same costume matching in every view」

### I2 视频速度临界点（SelfLift，Q3 GGUF，8GB 显存）
| 分辨率 | MP | 高清每步 | 总耗时 | 结论 |
|---|---|---|---|---|
| 1024×576 | 0.59 | 53s | **363s (6.0min)** | ✅ **甜点** |
| 1024×576（去 SigmaRefiner）| 0.59 | 50s | 334s (5.6min) | ✅ 省 30s |
| 1152×640 | 0.74 | 65~70s | 445s (7.4min) | ✅ 可行 |
| 1280×704 | 0.90 | **>1200s** | — | ❌ 全量卸载 |
| 1344×768 | 1.03 | 965s | 3532s (59min) | ❌ |

**显存驻留临界点约 0.8MP**（8GB + Q3_K_M 8.29GB UNET）：
- ≤0.74MP：模型部分驻留显存，高清步 50~70s
- ≥0.90MP：ComfyUI 报 `0.00MB usable / 8784MB offloaded`，每步走 PCIe，慢 15~20 倍

**注意 H3 尺寸必须是 32 的倍数**（1280×720 会报
`width and height must be divisible by 32`，应写 1280×704 或 1280×736）。

### I3 生产配置建议
```
主力：1024×576 SelfLift 8NFE（6 分钟/5秒片段）
升级：1152×640（7.4 分钟）→ SeedVR2 超分到 2304×1280
避免：≥1280×704 的 SelfLift 直出
```

### I4 升级评估结论
- 本地 git HEAD == origin/master（`911799c`），**git 层面零差异，无提交可摘取**
- `VERSION` 停在 v0.24.13，新代码装在 `patches/v0.25.3.zip`（200.8MB，LFS）
- `update.js` 用 `git fetch` + `git pull --ff-only` 或下载 patch.zip 解压覆盖
- v0.25.x 收益：写歌 INT8/BF16 两档 + oldx Qwen2.1 LoRA 卡 → 对我们价值≈0
- **结论：不升级**。备份在 `<安装目录>-backup-20261120`（230MB）+
  我们的适配脚本存于该目录 `_our-scripts/`

---

## 附录 J：音乐工作流在画布里的支持情况（2026-11-21）

### 结论
v0.24.13 的画布**没有音乐工作流**：`registry.json` 只有 `image`(14) / `video`(14) 两类。
画布的「写歌」是 **v0.25.x 才有的功能**，且模型是 **Yue2 3B**（`yue2_3b_bf16` 7.80GB / `yue2_3b_int8` 3.96GB），
不是 ACE-Step。

### 已做的接入工作（代码层面）
1. `ui-workflow.js`：新增 `isAudioOutputClass`，outputType 支持 `audio`；文本输入排序让 `tags/style` 优先于 `lyrics`
2. `registry.js`：`inferType()` 里音频判定提到 image 之前（原来 `KSampler` 会先把音乐图判成 image）
3. 修正 registry.json 里被误判的条目：
   - `image-ace_step_1.5_song` → `audio-ace_step_1.5_song`（type=audio）
   - `video-h3image_t2i/edit` → `image-h3image_t2i/edit`
4. 结果：`/v1/models` 出现 `audio-ACE_Step_1.5_song`

### 仍然缺的（为什么画布里还不能一键出歌）
- 网关只有 `/v1/free-workflows/:id/images` 和 `/videos`，**没有 `/audios`**
- 前端打包产物里 `/audios` 引用数为 0，也没有 audio 生成节点 UI
- v0.24.13 无法补充（前端 dist 是预构建，web/node_modules 为空，无法重建）

### 实践方案
- 音乐生成：由 pi 直接调 ComfyUI 跑 ACE-Step（已验证：20 秒片段 19 秒出片，120 秒约 150 秒）
- 工作流模板：`<tmp>/wf/ace_full3min.json`；画布侧文件
  `ComfyUI/user/default/workflows/ACE_Step_1.5_song.json`
- 等 v0.25.x（或后续版本）补上写歌 UI 后，这条 audio 卡片即可直接用

---

## 附录 K：画布创建节点的交互方式（v0.24.13）

### 三种入口
| 方式 | 代码依据 |
|---|---|
| **双击画布空白处** | `onCanvasDoubleClick: F => { Fs || (Be(null), pt(Ki(F.clientX,F.clientY))) }` ← 官方入口 |
| 工具条「打开画布菜单」按钮 | `aria-label = canvas.openMenu`（撤销/重做那一排）|
| 从节点端口拖线到空白处 | 弹出 `引用该节点生成` 菜单（pending connection）|

### 右键为什么没反应
原始代码：
```js
BE = useCallback(F => {
  F.target.closest("[data-node-id]") || (F.preventDefault(), Be(null))
}, [])
```
只做「阻止浏览器菜单 + 清空选中」，**不弹任何菜单**。所以右键无反应是设计如此。

### 本地补丁（已加）
改成也打开创建菜单：
```js
BE = useCallback(F => {
  F.target.closest("[data-node-id]") || (F.preventDefault(), Be(null), pt(Ki(F.clientX,F.clientY)))
}, [])
```
注意：**不能**把 `Fs` 放进依赖数组（`[Fs]` 会在 useCallback 调用时立刻求值，而 `Fs` 可能在其之后声明 → TDZ 报错）。

### 菜单项（6 个）
文本生成 / 图片生成 / 视频生成 / 音频参考 / 配置节点 / 插件

### 打赏入口的最终处理方式
- ❌ 之前做法：改 JS 把 `jsx(DonationPopover,{...})` 换成 `null` —— 有风险（改动了打包逻辑）
- ✅ 现在做法：**JS 保持原版**，只在 `index.html` 里加 CSS：
  `button[aria-label="打赏加群"],[aria-label="打赏加群"]{display:none!important}`
- 破缓存参数：`?pd=3`（每次改 dist 都要递增，否则浏览器 immutable 缓存不刷新）

---

## 附录 L：全部 28 个工作流跑通（2026-11-21）

### 下载总量 56.7GB（20 个文件），全部经 ModelScope 直连，约 18MB/s

| 族 | GGUF 主模型（替代官方 bf16/int8） | 官方 TE / VAE / LoRA |
|---|---|---|
| MOSS | `MOSS-Image-SFT-Q4_K_M.gguf` 3.20GB | qwen3.5_9b_int8 9.75 + flux2-vae 0.34 + 8step LoRA 1.19 |
| Z-Image | `z-image-turbo-Q4_K_M.gguf` 3.85GB | qwen_3_4b 8.04 + ae 0.34 |
| Krea2 | `krea2_turbo-Q3_K_M.gguf` 6.01GB | qwen3vl_4b_fp8 5.24 + qwen_image_vae 0.25 + 四视图 LoRA 0.91 |
| Qwen2.1 | `qwen-image-2.1-turbo-Q4_K_M.gguf` 4.20GB | qwen3vl_8b_int8 9.35 + vae 0.68 + 3 LoRA 0.48 |
| idol-3d | idol_fp16 0.74 | birefnet 0.44 + dino_v3 1.68 + idol_vae 0.58 |

**关键洞察**：GGUF 只有 UNET；文本编码器必须用官方 safetensors（CLIPLoader 的 type=moss_image / krea2 / qwen_image 都有对应实现）。

### 节点包（sha256 校验过）
- `comfyui-krea2edit`（27KB，魔搭自托管）→ Krea2EditGroundedEncode / Krea2EditModelPatch
- `ComfyUI-Idol`（7.2MB，GitHub PedroMarinhoDev）→ IdolPreprocessImage / IdolPrecision / IdolInputCamera

### 适配脚本
`<tmp>/adapt_image_gguf.py`：把 UNETLoader 换成 UnetLoaderGGUF（按 unet_name 关键字映射到 GGUF 文件），
14 个工作流自动改完，原文件备份为 `*.orig`。

### 两个特例
1. `image-krea2-aesthetics` 需要的 `SinoXvision_Krea2_Aesthetics_fp8_scale` **不在画布资源索引里**
   （官方没给下载源，是社区微调）。临时方案：指向 `krea2_turbo-Q3_K_M.gguf`，可用但风格是 turbo 不是 aesthetics。
2. `image-idol-3d` 的 VAE `idol_vae_decoder_fp16` 索引里 id 是 `image3d_idol_vae_fp16`，
   源在 `hf-mirror.com/PedroMarinhoDev/Idol-ComfyUI/resolve/main/vae/idol_vae_decoder_fp16.safetensors`（576MB）。

### 最终结果
**画布可用工作流 28 / 28**，另加 5 个自由工作流（ACE-Step 音频、SelfLift 视频×2、H3Image 图×2）。
