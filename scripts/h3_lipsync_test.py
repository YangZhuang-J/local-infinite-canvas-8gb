import json, urllib.request, uuid, time
OP=urllib.request.build_opener(urllib.request.ProxyHandler({}))

PROMPT = """integrated_multimodal_description: A cinematic medium close-up of the same young woman as in Image 1 — a Chinese woman in her early twenties with a small dark mole under her left eye, black hair held in a plain jade hairpin, wearing a white hanfu with a crimson sash. She stands in a snowy pine forest at blue hour, fine snow drifting past her face.

0-2s: She looks slightly off camera, then turns her head to face the viewer directly, eyes narrowing a little as she begins to speak.

2-6s: She speaks the line in Chinese, lips moving naturally and precisely in sync with the audio: "你终于来了。这座城，已经等了你三百年。" Her jaw, lips and tongue articulate each syllable; subtle head tilts, small brow movements and natural blinks accompany the speech. Snow settles on her lashes. Her expression is calm and slightly melancholic.

Camera locked off with a very slight push-in of about five percent. Cool blue ambient fill from the snow, warm amber rim light on her cheek, shallow depth of field, background pines softly out of focus, film grain, photorealistic skin texture with visible pores, no beauty-filter smoothing.

overall_soundscape: Her voice is the dominant element, close-miked and dry, natural room tone of a quiet snowy forest behind it, distant wind moving through pine needles, fine granular snow hiss, faint fabric rustle when her shoulders shift. No other voices. No music in this layer.

non_diegetic_music: A very quiet sustained low string drone in D minor, barely audible under the voice, entering at two seconds and holding without melody. No percussion, no drums, no electric guitar. The music never masks the dialogue and fades out at the final frame."""

wf = {
 "1": {"class_type":"UnetLoaderGGUF","inputs":{"unet_name":"MiniMax-H3-Ref2VA-Pruned-Q3_K_M.gguf"}},
 "2": {"class_type":"CLIPLoaderGGUF","inputs":{"clip_name":"qwen3vl_32b_minimax_h3-Q4_K_M.gguf","type":"minimax"}},
 "3": {"class_type":"VAELoader","inputs":{"vae_name":"minimax_h3_audio_vae_fp32.safetensors"}},
 "72":{"class_type":"VAELoader","inputs":{"vae_name":"minimax_h3_video_vae_int8_convrot.safetensors"}},
 "4": {"class_type":"UnetLoaderGGUF","inputs":{"unet_name":"MiniMax-H3-Ref2VA-Pruned-Q3_K_M.gguf"}},
 "5": {"class_type":"LoraLoaderBypassModelOnly","inputs":{"model":["1",0],
        "lora_name":"minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors","strength_model":1}},
 "33":{"class_type":"ModelAttentionBackend","inputs":{"model":["5",0],"attention":"comfy kitchen attention"}},
 "73":{"class_type":"MiniMaxH3SigmaShift","inputs":{"model":["33",0],"shift_video":12,"shift_audio":3}},
 "74":{"class_type":"BasicScheduler","inputs":{"model":["73",0],"scheduler":"simple","steps":8,"denoise":1}},
 "75":{"class_type":"KSamplerSelect","inputs":{"sampler_name":"euler"}},
 "90":{"class_type":"LoadImage","inputs":{"image":"char_ref.png"}},
 "91":{"class_type":"LoadAudio","inputs":{"audio":"tts_line.wav"}},
 "76":{"class_type":"MiniMaxH3AudioConditioningT8","inputs":{
        "clip":["2",0],"video_vae":["72",0],"audio_vae":["3",0],
        "prompt":PROMPT,"width":1024,"height":576,"length":158,
        "task_type":"Ref2VA","audio_mode":"lock_source","audio_denoise_strength":0.0,
        "add_source_as_reference":True,"prompt_primary_audio_ordinal":1,
        "strict_prompt_tags":False,"ref_image_size":"match",
        "reference_video_policy":"official_2_to_15s","allow_above_reference_area":False,
        "drive_audio":["91",0],
        "ref_images.ref_image_0":["90",0]}},
 "77":{"class_type":"ConditioningZeroOut","inputs":{"conditioning":["76",0]}},
 "78":{"class_type":"KSampler","inputs":{"model":["73",0],"positive":["76",0],"negative":["77",0],
        "latent_image":["76",1],"seed":20261121,"steps":8,"cfg":1,
        "sampler_name":"euler","scheduler":"simple","denoise":1.0}},
 "79":{"class_type":"MiniMaxH3AVDecodeT8","inputs":{"av_latent":["78",0],"video_vae":["72",0],"audio_vae":["3",0]}},
 "80":{"class_type":"VHS_VideoCombine","inputs":{"images":["79",0],"audio":["79",1],"frame_rate":24,
        "loop_count":0,"filename_prefix":"LipSyncTest/talk","format":"video/h264-mp4",
        "pingpong":False,"save_output":True}},
}
# 清掉未使用的 4 号节点
wf.pop("4",None)

req=urllib.request.Request("http://127.0.0.1:8188/prompt",
  data=json.dumps({"prompt":wf,"client_id":str(uuid.uuid4())}).encode(),headers={"Content-Type":"application/json"})
try:
    r=json.load(OP.open(req,timeout=120)); pid=r['prompt_id']; print("提交:",pid)
    open('/mnt/d/tmp/wf/pid_lip2.txt','w').write(pid)
except urllib.error.HTTPError as e:
    print("HTTP",e.code); print(e.read().decode('utf-8','ignore')[:800])
