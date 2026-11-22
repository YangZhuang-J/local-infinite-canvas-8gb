# 无界画布 · 8GB 显存适配版（Local Infinite Canvas 8GB）

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
| `resources.js` | 只有工作流**声明了 TRT 依赖**才检查 tensorrt（否则自建 GGUF 工作流会被误判不可用） |
| `update.js` | 屏蔽升级提示（本机已定制，走官方更新会覆盖改动） |
| `resources/index.json` | 裁掉 7 个 H3 工作流的 TRT/ONNX/VDN 运行期依赖声明 |

### 4. 前端补丁（`infinite-canvas/web/dist/`）

| 改动 | 做法 |
|---|---|
| 去掉「打赏加群」入口 | 只在 `index.html` 加一段 CSS 隐藏（`[aria-label="打赏加群"]{display:none}`），**不改 JS 逻辑** |
| 右键也能打开创建菜单 | `index-NNUCJQLG.js` 里 `onContextMenu` 处理器改为调用创建菜单（原版只有双击） |
| 破缓存 | `index.html` 里资源加 `?pd=3`（dist 资源是 `immutable` 缓存） |

> ⚠️ 若上游更新后重新构建 `dist`，以上前端改动会丢失；CSS 那段在 `index.html` 里可以直接抄回来。

### 5. 启动脚本

- `start-8gb.bat`：设置 `UPDATE_IGNORE=1` / `UPDATE_ENABLED=0` 后启动（不弹升级提示）
- `launcher/config.json` 需要按本机路径生成（`setup.ps1` 会做）

## 硬件要求

| 项目 | 最低 | 说明 |
|---|---|---|
| 显存 | **8GB** | 全部按 8GB 调过；`≤0.74MP` 是关键阈值 |
| 内存 | 32GB | H3 需要 21.9GB 常驻（GGUF UNET + Q4 TE） |
| 硬盘 | **180GB** | 模型约 120GB + 项目 + 输出 |
| Node.js | 24+ | 本仓库不含 `node/`，需自备 |

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

## 目录结构

```
comfyui-gateway/        网关（Node.js）：工作流注册表 + 参数注入 + 任务队列
  workflows/            29 个工作流 JSON（API 格式）+ registry.json
  src/                  网关源码（含我们的补丁）
infinite-canvas/web/dist/  画布前端（预构建，含 CSS 补丁）
launcher/               启动器（拉起 ComfyUI + 网关 + 画布）
comfyui-workflows/      画布"自由卡片"工作流（需复制到 ComfyUI 用户目录）
scripts/                我们的适配脚本（T0 适配 / GGUF 替换 / TTS / 口型测试）
docs/                   调研笔记（含实测数据、踩坑记录）
start-8gb.bat           本地适配启动入口
```

## 许可

上游 MIT。本仓库保留原 `LICENSE` / `NOTICE.md` / `THIRD_PARTY_NOTICES.md`。
二次修改部分同样以 MIT 发布，转载/分发请保留原作者信息。
