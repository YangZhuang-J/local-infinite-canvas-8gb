import json, os, shutil
GW='/mnt/d/Apps/Local-Infinite-Canvas/comfyui-gateway/workflows'
SRC='/mnt/d/LenovoSoftstore/comfyui/ComfyUI/ComfyUI/user/default/workflows'

def bind_img(n): return {"prompt":{"node":"5","input":"prompt"},
 "width":{"node":"5","input":"width","from":"size.width","transform":"snap32","default":1024},
 "height":{"node":"5","input":"height","from":"size.height","transform":"snap32","default":1024},
 "seed":{"node":"7","input":"seed","from":"params.seed","transform":"int","random":True},
 "steps":{"node":"7","input":"steps","from":"params.steps","transform":"int","default":6},
 "cfg":{"node":"7","input":"cfg","from":"params.cfg","default":1},
 "images":[{"node":n,"input":"image"}] if n else None}

def bind_vid(img_node):
    b={"prompt":{"node":"76","input":"prompt"},
     "width":{"node":"76","input":"width","from":"size.width","transform":"snap32","default":1024},
     "height":{"node":"76","input":"height","from":"size.height","transform":"snap32","default":576},
     "length":{"node":"76","input":"length","from":"seconds","transform":"secondsToFrames17","fps":24,"default":124},
     "seed":{"node":"78","input":"seed","from":"params.seed","transform":"int","random":True},
     "steps":{"node":"74","input":"steps","from":"params.steps","transform":"int","default":8},
     "cfg":{"node":"78","input":"cfg","from":"params.cfg","default":1},
     "transition_step":{"node":"78","input":"transition_step","from":"params.transition_step","transform":"int","default":6},
     "lowres_scale":{"node":"78","input":"lowres_scale","from":"params.lowres_scale","default":0.6}}
    if img_node: b["refs"]={"node":"76","input":"ref_images","from":"image","array":True,"inputPrefix":"ref_images.ref_image_","min":0,"max":6}
    return b

def params_img():
    return [{"key":"seed","label":"种子","type":"number","min":1,"max":2147483647},
            {"key":"steps","label":"步数","type":"number","min":1,"max":20,"default":6},
            {"key":"cfg","label":"CFG","type":"number","min":1,"max":10,"default":1}]

def params_vid():
    return [{"key":"seed","label":"种子","type":"number"},
            {"key":"steps","label":"步数（8=6低清+2高清）","type":"number","min":4,"max":30,"default":8},
            {"key":"transition_step","label":"低清步数","type":"number","min":2,"max":7,"default":6},
            {"key":"lowres_scale","label":"低清比例","type":"number","min":0.25,"max":1,"default":0.6},
            {"key":"cfg","label":"CFG","type":"number","min":1,"max":10,"default":1}]

CARDS=[
 # (源文件, 目标文件, registry 条目)
 ('H3Image_t2i.json','h3image-t2i.json', {
   "id":"image-h3image-t2i","name":"image-h3image-t2i","label":"H3 Image 文生图",
   "type":"image","description":"MiniMax-H3-Image（GGUF Q3）文生图，6 步无 CFG，原生高分辨率。",
   "bindings":bind_img(None),"parameters":params_img()}),
 ('H3Image_edit.json','h3image-edit.json', {
   "id":"image-h3image-edit","name":"image-h3image-edit","label":"H3 Image 参考图编辑",
   "type":"image","description":"以上传图为 <Picture 1> 做指令式编辑；图片槽留空=灰色占位图，务必先上传。",
   "bindings":bind_img("10"),"parameters":params_img(),"minMedia":1}),
 ('SelfLift_1024x576_t2v.json','selflift-t2v-1024x576.json', {
   "id":"video-selflift-t2v","name":"video-selflift-t2v","label":"H3 文生视频 1024×576（约6分钟）",
   "type":"video","description":"SelfLift 双采 8NFE，纯文生视频，约 6 分钟/5秒，含 H3 原生音轨。",
   "bindings":bind_vid(None),"parameters":params_vid()}),
 ('SelfLift_ref2va_1024x576.json','selflift-ref2va-1024x576.json', {
   "id":"video-selflift-ref2va","name":"video-selflift-ref2va","label":"H3 角色一致性 1024×576",
   "type":"video","description":"以参考图锁定角色身份，多镜头保持一致；图片槽留空=灰色占位图，务必先上传。",
   "bindings":bind_vid("90"),"parameters":params_vid(),"minMedia":1}),
]

reg=json.load(open(f'{GW}/registry.json',encoding='utf-8'))
existing={w['id'] for w in reg['workflows']}
added=[]
for src,dst,entry in CARDS:
    shutil.copyfile(os.path.join(SRC,src), os.path.join(GW,dst))
    # 绑定里的 None 清掉
    entry['bindings']={k:v for k,v in entry['bindings'].items() if v}
    entry['file']=dst
    if entry['id'] not in existing:
        reg['workflows'].append(entry); added.append(entry['id'])
    else:
        reg['workflows']=[entry if w['id']==entry['id'] else w for w in reg['workflows']]
        added.append(entry['id']+' (updated)')
json.dump(reg,open(f'{GW}/registry.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
print("已恢复/新增 registry 条目:", added)
print("registry 总数:", len(reg['workflows']))
