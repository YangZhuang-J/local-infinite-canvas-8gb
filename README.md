# 无界画布 · 8GB 显存适配版（Local Infinite Canvas 8GB）

[![Release](https://img.shields.io/github/v/release/YangZhuang-J/local-infinite-canvas-8gb?color=2ea44f)](https://github.com/YangZhuang-J/local-infinite-canvas-8gb/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![VRAM](https://img.shields.io/badge/VRAM-8GB%20tested-orange)](README.md)
[![Workflows](https://img.shields.io/badge/workflows-30%20available-brightgreen)](comfyui-gateway/workflows)
[![Base](https://img.shields.io/badge/based%20on-ModelScope%20%E6%97%A0%E7%95%8C%E7%94%BB%E5%B8%83-9cf)](https://modelscope.cn/datasets/shensanshu/ComfyUI-Local-Infinite-Canvas)

> **一键下载**：[Release v1.0.0](https://github.com/YangZhuang-J/local-infinite-canvas-8gb/releases/latest)（源码包 10MB + 画布卡片包）
> **无需 git-lfs**：LFS 文件由 `setup.ps1` 从魔搭自动取回。

把 [ComfyUI-本地无限画布](https://modelscope.cn/datasets/shensanshu/ComfyUI-Local-Infinite-Canvas) 改造成能在
**RTX 5060 Laptop 8GB 显存 + 32GB 内存** 上跑 AI 漫剧流水线的版本。

> 上游是 MIT 许可的开源项目（基于 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas)），
> 本项目只是**本地适配补丁集 + 可直接运行的完整源码树**，未改变其许可。

## 这套东西能做什么

一条完整的本地漫画短剧流水线，全程零 API 费用：

| 环节 | 用什么 | 实测耗时 |
|---|---|---|
| 角色定妆 / 四视图 | H3 Image / Krea2 四视图 | 1.5~3 分钟 |
| 单帧出图（可编辑） | H3 Image t2i / edit、MOSS、Z-Image、Krea2 | 96 秒 ~ 4 分钟 |
| 局部重绘 / 扩图 / 去物 | Qwen Image 2.1 | 43 秒 |
| 镜头视频（5 秒） | H3 + SelfLift 双采 1024×576 | **6 分钟** |
| 人物讲台词（口型） | H3 说话镜头（图 + 台词音频） | 15~22 分钟 |
| 首尾帧过渡（变身/昼夜） | H3 首尾帧 | 视尺寸 |
| 超分 | ESRGAN 2× / SeedVR2 | 秒级 ~ 19 分钟 |
| 出歌 / BGM | ACE-Step 1.5 | 120 秒歌 ≈ 150 秒 |

## 与上游的差异（我们的改动）

### 1. 模型全部换成 8GB 能跑的形态

| 原方案 | 我们的替代 | 省下 |
|---|---|---|
| H3 UNET int8 20.97GB + TE int8 27.14GB | **GGUF Q3_K_M 8.29GB + Q4_K_M 13.57GB** | 26GB |
| MOSS bf16 10.16GB | 官方 int8 convrot 5.04GB | 5GB |
| Z-Image bf16 12.31GB | **GGUF Q4_K_M 3.85GB** | 8.5GB |
| Krea2 fp8 13.14GB | **GGUF Q3_K_M 6.01GB** | 7.1GB |
| Qwen-Image 2.1 int8 7.26GB | **GGUF Q4_K_M 4.20GB** | 3.1GB |

> GGUF 只用于 UNET；文本编码器必须是官方 safetensors（`CLIPLoader` 的 `type=moss_image/krea2/qwen_image` 有专门实现）。

### 2. 工作流适配（`comfyui-gateway/workflows/`）

- `h3-ref2va-drama.json` / `-vdn.json` / `h3-character-swap-vdn.json`：换 GGUF 加载器
- **删除 VDN 后端**（`ApplyVDNH3Advanced` + stage-dmd 5.13GB），统一改走 SelfLift 双采
- **删除不兼容节点**：`TESpeedMiniMaxH3`（不兼容 GGUF）、`MiniMaxH3MemoryEfficientSageAttentionPatch` / `SolAttnPatch`（需 sageattention）、`ModelPreviewOverrideKJ`（需 taeh3）
- 新增 `h3-lipsync-1024x576.json`：**图 + 台词音频 → 说话镜头**（`audio_mode=lock_source` + `drive_audio`）
- 全部视频输出改为 **H.264 8-bit**（原来 HEVC 10-bit，浏览器无法解码）
- MOSS/Z-Image/Krea2/Qwen2.1 共 14 个工作流切到 `UnetLoaderGGUF`

### 3. 网关补丁（`comfyui-gateway/src/`）

| 文件 | 修复内容 |
|---|---|
| `public-url.js` | **新增**（上游仓库漏提交），实现 `absoluteTaskUrl` |
| `server.js` | `createTaskStore` 补上 `publicBaseUrl` —— 原来视频地址被拼成 `.../undefined/files/xxx.mp4`（画布无法预览） |
| `bindings.js` | 支持**单个音频绑定**（`drive_audio`），原来只支持数组音频 |
| `ui-workflow.js` | 支持音频输出类型；音乐类工作流让 `tags` 优先于 `lyrics` 作为主提示词 |
| `registry.js` | `inferType()` 里音频判定提到 image 之前（`KSampler` 会误判音乐图为 image） |
| `resources.js` | ①只有工作流**声明了 TRT 依赖**才检查 tensorrt；②**`ADAPTED_H3_IDS` 白名单**：7 个自建 H3 工作流直接跳过运行期依赖检查（它们已改 GGUF + SelfLift，根本不需要 TRT/VDN/ONNX） |
| `update.js` | 屏蔽升级提示（本机已定制，走官方更新会覆盖改动） |
| `resources/index.json` + `data/resources-index.json` | 裁掉 7 个 H3 工作流的 TRT/ONNX/VDN 运行期依赖声明（**两份都要改**，`data/` 那份是运行期缓存索引，会覆盖 `resources/` 的） |
| `workflows/registry.json` | 修正 5 处 `bindings.*.default` 模型名 —— 原值指向**未安装的官方文件名**，会让卡片直接报 `400 Value not in list`（详见下方「模型默认值修正」） |

#### 模型默认值修正（`registry.json`）

网关的 `bindings` 会用它自己的 `default` **覆盖工作流 JSON 里的模型名**。上游的默认值是官方文件名，本机装的是 GGUF，于是全部 400：

```
unet_name: 'z_image_turbo_bf16.safetensors' not in [... 'z-image-turbo-Q4_K_M.gguf']
```

| 工作流 | 原默认值（未安装） | 修正为（本机实际） |
|---|---|---|
| `image-z-image-turbo` | `z_image_turbo_bf16.safetensors` | `z-image-turbo-Q4_K_M.gguf` |
| `image-krea2-turbo` | `krea2_turbo_fp8_scaled.safetensors` | `krea2_turbo-Q3_K_M.gguf` |
| `image-krea2-four-view` | `krea2_turbo_fp8_scaled.safetensors` | `krea2_turbo-Q3_K_M.gguf` |
| `image-krea2-aesthetics` | `SinoXvision_Krea2_Aesthetics_fp8_scale.safetensors` | `krea2_turbo-Q3_K_M.gguf` |
| `image-seedvr2-upscale` | `seedvr2_ema_7b_...safetensors` | `seedvr2_ema_3b_fp8_e4m3fn.safetensors` |

> 换模型 / 换量化档位后，**一定要同步改 registry.json 的 default**，否则卡片会在校验阶段就 400。

### 4. 前端补丁（`infinite-canvas/web/dist/`）

| 改动 | 做法 |
|---|---|
| 去掉「打赏加群」入口 | 只在 `index.html` 加一段 CSS 隐藏（`[aria-label="打赏加群"]{display:none}`），**不改 JS 逻辑** |
| 右键也能打开创建菜单 | `index-NNUCJQLG.js` 里 `onContextMenu` 处理器改为调用创建菜单（原版只有双击） |
| **音频模型可选 + 自动默认** | 本地渠道的模型列表是**硬编码在包里的** `WX=[...]`，原本全是 image/video → 音频节点下拉永远为空。①往数组头部插 `{name:"local-tts",capability:"audio"}`；②默认配置里的 `audioModel:""` 改为 `` `${d5}::local-tts` ``，**开箱即选，不用手动配** |
| **卡片在前端看不到** | 部分工作流的 `baseModels.classType` 还写着 `UNETLoader`，而实际用的是 `UnetLoaderGGUF` → 网关以为找不到可用主模型，就不把它列进 `/v1/models`，画布自然看不到。改为 `UnetLoaderGGUF` 并把本地 GGUF 文件名加进 `aliases` |
| **点生成弹「配置与用户偏好」** | ①模型引用 `渠道id::模型名` 在旧配置里对不上 → `GX()` 返回 null；②`isAiConfigReady()` 要求 `apiKey` 非空，而本地渠道留空也算合法。两者都会直接弹配置窗 | 前端加三层兜底：`GX` 解析不到时按模型名/本地网关渠道兜底并伪造 model；`Gdt` 对 `127.0.0.1/localhost` 渠道允许空 apiKey；`RS` 在渠道无 audio 模型时回退到 `local-tts` |
| 破缓存 | `index.html` 里资源加 `?pd=6`（dist 资源是 `immutable` 缓存） |

> ⚠️ 若上游更新后重新构建 `dist`，以上前端改动会丢失；CSS 那段在 `index.html` 里可以直接抄回来。

### 5. 启动脚本
- `start-8gb.bat`：设置 `UPDATE_IGNORE=1` / `UPDATE_ENABLED=0` 后启动（不弹升级提示）
- `launcher/config.json` 需要按本机路径生成（`setup.ps1` 会做）
- **`scripts/start_comfy.bat`**：Windows 直启 ComfyUI，**不经过 WSL**（推荐，见下方故障排查）
- **`scripts/start_comfy.sh`**：Shell 版，自动识别 `/mnt/d`(WSL) 与 `/d`(Git Bash)，支持 `--print` 干跑检查路径

#### ⚠️ 为什么启动脚本要避开 WSL

原先用 `wsl.exe bash /mnt/d/tmp/start_comfy2.sh` 启动 ComfyUI，结果是：**ComfyUI 的父进程挂在 WSL 上**。WSL 会话一断（distro 空闲回收、终端关闭、升级重启），ComfyUI 跟着死，画布就报「ComfyUI 离线」，而计划任务看起来还是「正在运行」。

改成本机 `.venv\\Scripts\\python.exe` 直启后彻底避免。计划任务指向 `scripts/start_comfy.bat` 即可。

## 自研插件：画板（sketch:pad）

> 上游 Infinite Canvas **没有**这个功能，是本仓库手写新增的插件。详见 [`docs/画板插件.md`](docs/画板插件.md)。

**解决什么：** 本地出图最容易卡住的是「想法写不成提示词」。画板让你**用手画**——构个草图、描一张参考图、手绘一块蒙版——把结果直接当参考图喂给生成卡。

| 用法 | 流程 |
|---|---|
| 构图草图 | 画火柴人/几何构图 → 导出图片节点 → 接 Krea2 / Z-Image |
| 描摹定妆 | 把角色图连到画板当 28% 半透明底图 → 描线稿 → 导出 → 接 H3 Image 编辑 |
| 手绘蒙版 | 把原图连进来 → 橡皮擦出要保留的区域 → 导出 → 接 Qwen2.1 局部重绘 |

**怎么用：** 双击画布 → 菜单选「画板」→ 双击卡片开全屏画板 → `Enter` 完成 → 工具条「导出图片」变图片节点。

| 能力 | 细节 |
|---|---|
| 笔触引擎 | 内联 **perfect-freehand 1.2.3**（MIT），离线可用 |
| 工具 | 画笔 `B` / 橡皮 `E`，粗细 2~48，手写笔支持压感 |
| 历史 | `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` |
| 画布尺寸 | 1024² / 1024×576 / 576×1024 / 768² |
| 底图描摹 | 连入图片按 28% 透明度铺底，可开关 |
| 下游 | 实现了 `resource()`，可直接当图片资源拉给任意图像卡 |

**文件**（三个位置都要一致）：

```
infinite-canvas/web/dist/plugins/sketch-pad.js     ← 运行时加载
infinite-canvas/web/public/plugins/sketch-pad.js   ← 源码位备份
infinite-canvas/web/dist/plugins/index.json        ← 插件清单（第四条必须存在）
```

> ⚠️ 插件是**手写**的，不走构建。上游升级/重装后要手动把 `sketch-pad.js` 和 `index.json` 的第四条抄回来。

## 硬件要求

| 项目 | 最低 | 说明 |
|---|---|---|
| 显存 | **8GB** | 全部按 8GB 调过；`≤0.74MP` 是关键阈值 |
| 内存 | 32GB | H3 需要 21.9GB 常驻（GGUF UNET + Q4 TE） |
| 硬盘 | **180GB** | 模型约 120GB + 项目 + 输出 |
| Node.js | 24+ | 本仓库不含 `node/`，需自备 |

## 下载

| 方式 | 内容 |
|---|---|
| **[Release 源码包](https://github.com/YangZhuang-J/local-infinite-canvas-8gb/releases/latest)** | 解压即用（633 文件，10MB，不含模型） |
| **[Release 卡片包](https://github.com/YangZhuang-J/local-infinite-canvas-8gb/releases/latest)** | 只要 6 张画布工作流 JSON 时用 |
| `git clone` | 需要跟踪后续更新时用 |

## 快速开始

```powershell
# 1) 放到要安装的位置，例如 <安装目录>
# 2) 运行安装脚本（会检查环境、修复 LFS 文件、生成配置）
powershell -ExecutionPolicy Bypass -File .\setup.ps1

# 3) 启动
.\start-8gb.bat
```

`setup.ps1` 会做：
1. 检查 Node 24+（没有则提示下载）
2. 从魔搭取回 4 个 LFS 文件真内容（`node.exe` 除外，用本机 Node 复制）
3. 生成 `launcher/config.json`（指向本机 ComfyUI）
4. 把 `comfyui-workflows/*.json` 复制到 ComfyUI 的 `user/default/workflows/`
5. 打印模型清单与缺失提示

## 模型清单（需自行下载，约 120GB）

| 用途 | 文件 | 体积 | 来源 |
|---|---|---|---|
| H3 视频 | `MiniMax-H3-Ref2VA-Pruned-Q3_K_M.gguf` | 8.29GB | ModelScope `Comfy-Org/MiniMax-H3` |
| H3 视频 | `MiniMax-H3-FL2VA-Pruned-Q3_K_M.gguf` | 8.29GB | 同上 |
| H3 文本编码 | `qwen3vl_32b_minimax_h3-Q4_K_M.gguf` | 13.57GB | 同上 |
| H3 图像 | `MiniMax-H3-Image-AD-Q3_K.gguf` | 8.13GB | ModelScope `AtomicChat/MiniMax-H3-Image-GGUF` |
| H3 VAE | `minimax_h3_video_vae_int8_convrot` / `audio_vae_fp32` / `image_vae_fp16` | 2.6/0.6/1.1GB | `Comfy-Org/MiniMax-H3` |
| latent 放大 | `minimax_h3_latent_upscaler_3d_conv_v1_bf16` | 0.64GB | 同上 |
| 图 LoRA | `fl2v_turbo_8step` / `4step` / `ref2v_4step` / `pika_flex` | 1.82GB ×4 | 同上 |
| MOSS | `moss_image_sft_int8_convrot` + `qwen3.5_9b_int8` + `flux2-vae` | 5.04+9.75+0.34GB | `Comfy-Org/MOSS-Image` |
| Z-Image | `z-image-turbo-Q4_K_M.gguf` + `qwen_3_4b` + `ae` | 3.85+8.04+0.34GB | `unsloth/Z-Image-Turbo-GGUF` + `Comfy-Org/Z-Image-Turbo` |
| Krea2 | `krea2_turbo-Q3_K_M.gguf` + `qwen3vl_4b_fp8_scaled` + `qwen_image_vae` + 四视图 LoRA | 6.01+5.24+0.25+0.91GB | `vantagewithai/Krea-2-Turbo-GGUF` + `Comfy-Org/Krea2` |
| Qwen2.1 | `qwen-image-2.1-turbo-Q4_K_M.gguf` + `qwen3vl_8b_int8` + VAE + 3 LoRA | 4.20+9.35+0.68+0.48GB | `unsloth/Qwen-Image-2.1-Turbo-GGUF` + `Comfy-Org/Qwen-Image-2.1` |
| ACE-Step | `acestep_v1.5_turbo` + `qwen_0.6b` + `qwen_1.7b` + `ace_1.5_vae` | 4.5+1.1+3.5+0.3GB | `Comfy-Org/ACE-Step_ComfyUI_repackaged` |
| 超分 | `RealESRGAN_x2plus` / `seedvr2_ema_3b_fp8` + `ema_vae_fp16` | 0.07 / 3.2+0.5GB | `Comfy-Org` / `numz/ComfyUI-SeedVR2_VideoUpscaler` |
| 预览 | `taeh3` | 10MB | 画布仓库 LFS |
| 几何 | `moge_2_vitl_normal_fp16` | 0.66GB | `Comfy-Org/MoGe` |
| 角色替换 | `h3_character_swap_v1.5` | 0.16GB | `akatz-ai/MiniMax-H3-Character-Swap-LoRA` |

**关键：魔搭下载比 hf-mirror 快 10 倍以上**（实测 20 秒 vs 1 小时）。

## 必须安装的 ComfyUI 自定义节点

网关首次启动会**自动放置**随包节点，但下面这些需要手动装（本仓库不含）：

| 节点包 | 用途 |
|---|---|
| `ComfyUI-GGUF` | **必需**（所有 GGUF 主模型），需支持 `qwen_image` / `hyvid` 架构 |
| `comfyui-SelfLift` | SelfLift 双采采样器 |
| `TE-Speed-MiniMaxH3` | （本项目已从工作流移除，可不装） |
| `ComfyUI-SolAttn_triton` | （需 sageattention，本项目已移除引用） |
| `ComfyUI-H3VAE_TRT` / `TE_MAN` / `ComfyUI-Florence2` / `ComfyUI-llama-cpp_vllm` | 非必需 |
| `comfyui-krea2edit` | Krea2 四视图/编辑节点 |
| `ComfyUI-Idol` | idol-3d 工作流 |

## 已知限制

| 限制 | 原因 | 规避 |
|---|---|---|
| 有 3 个 H3 工作流不可用 | 缺 VDN 模型（5.13GB），本项目主动移除 VDN | 用「无VDN」版本 |
| MOSS 必须用 safetensors | `UnetLoaderGGUF` 不支持 `moss_image` 架构 | 已改用官方 int8 |
| 视频 ≥1280×704 会慢 15 倍 | 显存跨过驻留阈值，全量卸载 | 用 1024×576（0.59MP） |
| 口型镜头较慢 | 必须用单遍 KSampler（SelfLift 不接受音频掩码） | 降分辨率到 768×432 |
| 画布不能上传音频给自由卡片 | 前端只处理 image 上传 | 用内置卡片 `H3 说话镜头` + 固定文件名 wav，或 `/v1/videos` 直调 |
| 内置 Agent 未包含 | `assistant/` 131MB 运行时被排除 | 需要时从魔搭下载 `assistant-runtime.zip` |
| 画布音频模型下拉为空 | 本地渠道模型列表硬编码在 `dist` 包里，原版无 audio 条目 | 已插 `local-tts`；仍需手动在 **设置→首选项→默认模型→默认音频模型** 选一次（存 localStorage） |
| 卡片报 `400 Value not in list` | `registry.json` 的 `default` 指向未安装的官方模型名 | 已修正 5 处；换模型后记得同步改 |
| 画布里找不到某张卡 | 该工作流的 `baseModels.classType` 与实际加载器不一致（如写 `UNETLoader` 实际用 `UnetLoaderGGUF`）→ 不进 `/v1/models` | 已修 z-image / krea2-turbo / krea2-four-view；后续换加载器时记得同步改 `classType` |
| 设置面板里找不到「首选项」 | 实际标签叫 **「偏好设置」**（弹窗：渠道 / 云端 API / 本地代理 / **偏好设置** / 提示词来源 / WebDAV / 资源管理 / 本地存储） | 本文已把音频模型设成默认值，**无需手动选** |
| TTS 偶尔 `NoAudioReceived` | edge-tts 走微软云，偶发抽风 | `scripts/tts_edge.py` 已内置 3 次重试 + 退避 |
| 计划任务显示运行但服务已死 | 父进程挂在 WSL 上（详见「启动脚本」章节） | 改用 `scripts/start_comfy.bat` 直启 |

## 目录结构

```
comfyui-gateway/        网关（Node.js）：工作流注册表 + 参数注入 + 任务队列
  workflows/            30 个工作流 JSON（API 格式）+ registry.json
  src/                  网关源码（含我们的补丁）
infinite-canvas/web/dist/  画布前端（预构建，含 CSS 补丁）
  plugins/              插件目录（含自研的 sketch-pad.js 画板）
launcher/               启动器（拉起 ComfyUI + 网关 + 画布）
comfyui-workflows/      画布"自由卡片"工作流（需复制到 ComfyUI 用户目录）
scripts/                适配脚本 + 启动脚本
  start_comfy.bat       ★ Windows 直启 ComfyUI（不经 WSL，推荐）
  start_comfy.sh        Shell 版，/mnt/d 与 /d 双路径自动识别
  adapt_*.py            T0 适配 / GGUF 替换 / 自建图生成
  tts_edge*.py          edge-tts 台词音生成
docs/                   调研笔记 + 插件文档
    画板插件.md          ★ sketch:pad 的设计、操作与二次开发入口
start-8gb.bat           本地适配启动入口
```

## 实测性能（RTX 5060 Laptop 8GB）

| 任务 | 分辨率 | 耗时 |
|---|---|---|
| **Z-Image Turbo 文生图** | 768² | **34s** ⭐ 最快，适合草稿/分镜 |
| Krea2 Turbo 文生图 | 768² | 61s |
| H3 Image 文生图 | 1024² | 152s |
| H3 Image 编辑 | 1024² | 183s |
| **SelfLift 文生视频** | 1024×576 / 5s | **363s** ⭐ 甜点分辨率 |
| SelfLift 文生视频 | 1280×704 / 5s | 全量卸载，>20min ❌ |
| H3 说话镜头（口型） | 1024×576 / 6.6s | ~22s×60 帧 ≈ 1320s |
| Qwen2.1 局部重绘 | 1024² | 43.7s |
| MOSS int8 | 768² | 184s |
| MoGe 深度图 | — | 302s |
| ACE-Step 120s 歌曲 | — | 150s |
| edge-tts 台词 | — | <2s |

> 视频分辨率的硬阈值是 **≈0.74MP**：1024×576(0.59MP)=6 分钟，≥0.90MP 会触发全量卸载，慢 15～20 倍。H3 的宽高必须是 **32 的倍数**（1280×720 直接报错，用 1280×704）。

## 许可

上游 MIT。本仓库保留原 `LICENSE` / `NOTICE.md` / `THIRD_PARTY_NOTICES.md`。
二次修改部分同样以 MIT 发布，转载/分发请保留原作者信息。
