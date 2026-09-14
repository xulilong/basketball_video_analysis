"""Process one uploaded video. Writes progress + actual observations, no mock data.

Independent of the original sample, its crops, roster, and fixed court geometry.
All jobs share a local advisory lock so only one model pipeline uses the GPU.
"""
import argparse, base64, fcntl, hashlib, importlib, importlib.util, json, os
from pathlib import Path
import signal, subprocess, sys, time, uuid, bisect

parser=argparse.ArgumentParser()
parser.add_argument('--job-dir',required=True)
parser.add_argument('--resume-detections',action='store_true')
parser.add_argument('--highlights',action='store_true')
parser.add_argument('--render-only',action='store_true')
args=parser.parse_args()
job=Path(args.job_dir).resolve()
root=Path(__file__).resolve().parents[1]
started=time.monotonic()

def save(name,value):
    temporary=job/(name+'.'+uuid.uuid4().hex+'.tmp')
    temporary.write_text(json.dumps(value,ensure_ascii=False))
    temporary.replace(job/name)

def progress(stage,percent,message,status='running',processed=None):
    save('progress.json',{'status':status,'stage':stage,'percent':round(percent,1),'message':message,
         'processedSeconds':processed,'elapsedSeconds':round(time.monotonic()-started,1)})

def interrupted(_signum,_frame):
    progress('cancelled',0,'已停止分析，可重新开始','cancelled')
    raise SystemExit(0)

signal.signal(signal.SIGTERM,interrupted)
signal.signal(signal.SIGINT,interrupted)

def run():
    global started
    progress('queued',0,'等待本机空闲后开始分析','queued')
    with open(os.environ.get('BASKETBALL_ANALYSIS_LOCK',str(job.parents[1]/'analysis.lock')),'a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        started=time.monotonic()
        process()

def process():
    global started
    if args.render_only:
        spec=importlib.util.spec_from_file_location('highlight_export',root/'scripts/highlight-export.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        cached=json.loads((job/('events.json' if (job/'events.json').exists() else 'result.json')).read_text())
        module.render(job,job/'source.video',cached['events'],cached['duration'],cached['hasHoop'],save,progress)
        return
    import cv2
    import numpy as np
    import torch
    from ultralytics import YOLO
    torch.set_num_threads(4)
    source=job/'source.video'
    key=hashlib.sha256(source.read_bytes()).hexdigest()
    if key!=job.name: raise ValueError('上传文件校验失败，请重新上传')
    progress('preparing',1,'正在读取视频并校正方向')
    metadata=cv2.VideoCapture(str(source))
    source_fps=metadata.get(cv2.CAP_PROP_FPS)
    if not metadata.isOpened() or source_fps<=0: raise ValueError('无法读取视频，请使用可正常播放的 MP4、MOV 或 WebM 文件')
    duration=metadata.get(cv2.CAP_PROP_FRAME_COUNT)/source_fps
    metadata.release()
    if not np.isfinite(duration) or duration<=0 or duration>7200: raise ValueError('视频时长须在 0–120 分钟之间')
    proxy=job/'upright.mp4'
    if not (job/'proxy-v2-ready').exists():
        converted=subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(source),'-map','0:v:0',
            '-vf',"scale='trunc(min(1280,iw)/2)*2':-2,fps=%g"%min(30,source_fps),'-c:v','libx264','-preset','ultrafast','-crf','20','-an',str(proxy)],capture_output=True,text=True)
        if converted.returncode: raise ValueError('视频解码失败：'+converted.stderr[-300:])
        (job/'proxy-ready').write_text('ready')
        (job/'proxy-v2-ready').write_text('ready')
    progress('models',4,'正在加载本地篮球识别模型' if args.highlights else '正在加载本地人物和篮球识别模型')
    # Unrestricted load applies only to the two official Ultralytics artifacts.
    previous=os.environ.get('TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD')
    os.environ['TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD']='1'
    person_model=None if args.highlights else YOLO(str(root/'.local-run/models/yolo11s.pt'))
    pose_model=None if args.highlights else YOLO(str(root/'.local-run/models/yolo11s-pose.pt'))
    if previous is None: os.environ.pop('TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD',None)
    else: os.environ['TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD']=previous
    # Third-party basketball checkpoint uses an explicit architecture allowlist.
    allowed=[ 'torch.nn.modules.batchnorm.BatchNorm2d','ultralytics.nn.modules.conv.Conv',
        'ultralytics.nn.modules.conv.Concat','torch.nn.modules.pooling.MaxPool2d','torch.nn.modules.conv.Conv2d',
        'ultralytics.nn.modules.head.Detect','ultralytics.nn.modules.block.DFL','torch.nn.modules.upsampling.Upsample',
        'torch.nn.modules.activation.SiLU','torch.nn.modules.container.ModuleList','ultralytics.nn.modules.block.SPPF',
        'ultralytics.nn.modules.block.Bottleneck','ultralytics.nn.tasks.DetectionModel','ultralytics.nn.modules.block.C2f',
        'torch.nn.modules.container.Sequential']
    checkpoint=root/'.local-run/models/basketball-best.pt'
    if set(torch.serialization.get_unsafe_globals_in_checkpoint(checkpoint))-set(allowed): raise ValueError('篮球模型结构不受支持')
    torch.serialization.add_safe_globals([getattr(importlib.import_module(n.rsplit('.',1)[0]),n.rsplit('.',1)[1]) for n in allowed])
    loader=torch.load
    def restricted(*a,**kw): kw['weights_only']=True; return loader(*a,**kw)
    torch.load=restricted
    try: ball_model=YOLO(str(checkpoint))
    finally: torch.load=loader
    spec=importlib.util.spec_from_file_location('rules',root/'scripts/upload-analysis-rules.py')
    rules=importlib.util.module_from_spec(spec); spec.loader.exec_module(rules)
    spec=importlib.util.spec_from_file_location('reid',root/'scripts/player-reid.py')
    reid=importlib.util.module_from_spec(spec);spec.loader.exec_module(reid)
    spec=importlib.util.spec_from_file_location('identities',root/'scripts/identity-tracks.py')
    identities=importlib.util.module_from_spec(spec);spec.loader.exec_module(identities)
    spec=importlib.util.spec_from_file_location('rim_motion',root/'scripts/rim-motion.py')
    rim_motion=importlib.util.module_from_spec(spec);spec.loader.exec_module(rim_motion)
    device='mps' if torch.backends.mps.is_available() else 'cpu'
    cap=cv2.VideoCapture(str(proxy)); fps=cap.get(cv2.CAP_PROP_FPS)
    if fps<=0: raise ValueError('视频帧率无效')
    width=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); height=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    count=int(cap.get(cv2.CAP_PROP_FRAME_COUNT)); duration=count/fps
    tracks={}; observations=[]; ball_frames=[]; hoops=[]; last_progress=0
    stride=max(1,round(fps/10));tracking_fps=fps/stride

    cached=None
    if args.resume_detections:
        cached=json.loads((job/'detection-checkpoint.json').read_text())
        if cached.get('proxyHash')!=hashlib.sha256(proxy.read_bytes()).hexdigest() or cached.get('pipelineVersion')!=2:
            raise ValueError('Detection cache does not match this proxy or pipeline')
        if not args.highlights: started-=max(0,float(cached.get('detectionElapsedSeconds',0)))
    if cached is None:
        scan_images=[];scan_indices=[]
        def consume_scan(index,image,ball_result,person_result):
            timestamp=index/fps
            balls=[]; choices=[]
            for box in ball_result.boxes:
                x1,y1,x2,y2=map(float,box.xyxy[0].cpu().tolist()); conf=float(box.conf.item())
                if int(box.cls.item())==0:
                    if 3<x2-x1<width*.16 and 3<y2-y1<height*.20: balls.append({'x':(x1+x2)/2,'y':(y1+y2)/2,'confidence':conf,'bbox':[x1,y1,x2,y2]})
                elif conf>.5 and x2-x1>width*.014: choices.append((conf*(x2-x1)*(y2-y1),[x1,y1,x2,y2]))
            hoop=max(choices,key=lambda p:p[0])[1] if choices else None
            if hoop: hoops.append(hoop)
            elif hoops: hoop=np.median(np.array(hoops[-30:]),axis=0).tolist()
            ball_frames[index]={'timestamp':timestamp,'balls':balls,'hoop':hoop}
            people=[]
            for box in (person_result.boxes if person_result is not None else []):
                if box.id is None: continue
                bounds=list(map(float,box.xyxy[0].cpu().tolist())); x1,y1,x2,y2=bounds
                if y2<height*.52 or y2-y1<height*.10: continue
                ident=str(int(box.id.item())); crop=image[max(0,int(y1)):min(height,int(y2)),max(0,int(x1)):min(width,int(x2))]
                if not crop.size: continue
                tracks[ident]=True
                people.append({'track':ident,'bbox':bounds,'confidence':float(box.conf.item())})
            observations.append({'timestamp':timestamp,'people':people})
        def flush_scan():
            if not scan_images:return
            ball_results=ball_model.predict(scan_images,imgsz=1280,conf=.15,device=device,verbose=False)
            person_results=person_model.track(scan_images,persist=True,tracker='bytetrack.yaml',classes=[0],imgsz=960,conf=.22,device=device,verbose=False) if person_model else [None]*len(scan_images)
            for index,image,br,pr in zip(scan_indices,scan_images,ball_results,person_results):consume_scan(index,image,br,pr)
            scan_images.clear();scan_indices.clear()
        for index in range(count):
            ok,image=cap.read()
            if not ok:raise ValueError('Video decode interrupted; partial results were not imported')
            timestamp=index/fps
            ball_frames.append({'timestamp':timestamp,'balls':[],'hoop':None})
            if index%stride==0:scan_images.append(image);scan_indices.append(index)
            if len(scan_images)>=4:flush_scan()
            if time.monotonic()-last_progress>2:
                progress('detecting',5+timestamp/duration*60,'正在检测篮球与篮筐' if args.highlights else '正在连续跟踪人物与篮球',processed=round(timestamp,1));last_progress=time.monotonic()
        flush_scan()
        last_hoop=None
        for frame in ball_frames:
            if frame['hoop']:last_hoop=frame['hoop']
            else:frame['hoop']=last_hoop
        cap.release()
        progress('rim',80,'正在逐帧放大检查篮筐区域')
        # Batch the native-rate close-ups separately. Alternating full images and
        # crops in a single predictor forces expensive shape changes on MPS.
        rim_reader=cv2.VideoCapture(str(proxy));batch=[];locations=[];background_samples=[]
        for sample_index in np.linspace(0,count-1,min(25,count)).astype(int):
            rim_reader.set(cv2.CAP_PROP_POS_FRAMES,int(sample_index));ok,frame=rim_reader.read()
            if ok:background_samples.append(frame)
        background=np.median(np.stack(background_samples),axis=0).astype('uint8')
        rim_reader.set(cv2.CAP_PROP_POS_FRAMES,0)
        def flush_rim():
            if not batch:return
            predictions=ball_model.predict(batch,imgsz=640,conf=.20,device=device,verbose=False,rect=False)
            for result,(frame,left,top,hw,hh) in zip(predictions,locations):
                for box in result.boxes:
                    if int(box.cls.item())!=0:continue
                    a,b,c,d=map(float,box.xyxy[0].cpu().tolist());a+=left;c+=left;b+=top;d+=top
                    x,y=(a+c)/2,(b+d)/2
                    if not (3<c-a<hw*.9 and 3<d-b<hh*.9):continue
                    detection={'x':x,'y':y,'confidence':float(box.conf.item()),'bbox':[a,b,c,d],'source':'rim-crop'}
                    existing=next((v for v in frame['balls'] if np.hypot(x-v['x'],y-v['y'])<max(5,(c-a)*.6)),None)
                    if existing is not None:
                        if existing.get('source')=='color-motion':existing.update(detection)
                    else:frame['balls'].append(detection)
            batch.clear();locations.clear()
        for frame in ball_frames:
            ok,image=rim_reader.read()
            if not ok:raise ValueError('篮筐检测阶段视频读取中断')
            if not frame['hoop']:continue
            for candidate in rim_motion.moving_ball_components(image,background,frame['hoop']):
                if not any(np.hypot(candidate['x']-b['x'],candidate['y']-b['y'])<8 for b in frame['balls']):frame['balls'].append(candidate)
            hx,hy,hx2,hy2=frame['hoop'];hw=hx2-hx;hh=hy2-hy
            left=max(0,int(hx-hw*1.2));right=min(width,int(hx2+hw*1.2))
            top=max(0,int(hy-hh));bottom=min(height,int(hy2+hh*1.8))
            patch=image[top:bottom,left:right]
            if patch.size:batch.append(patch);locations.append((frame,left,top,hw,hh))
            if len(batch)>=8:flush_rim()
            if time.monotonic()-last_progress>2:
                progress('rim',65+frame['timestamp']/duration*18,'正在逐帧放大检查篮筐区域',processed=frame['timestamp']);last_progress=time.monotonic()
        flush_rim();rim_reader.release()
    if args.highlights:
        cap.release()
        if cached is not None: ball_frames=cached['frames']
        spec=importlib.util.spec_from_file_location('highlight_export',root/'scripts/highlight-export.py')
        highlight_export=importlib.util.module_from_spec(spec);spec.loader.exec_module(highlight_export)
        highlight_export.finish(job,source,proxy,ball_frames,duration,rules,rim_motion,save,progress)
        return
    progress('players',84,'正在整理本视频中的人物截图')
    if cached is not None:
        cap.release()
        ball_frames=cached['frames'];observations=cached['people']
        hoops=[f['hoop'] for f in ball_frames if f.get('hoop')]
        tracking_fps=cached['trackingFps']
    spec=importlib.util.spec_from_file_location('fragments',root/'scripts/track-fragments.py')
    fragments=importlib.util.module_from_spec(spec);spec.loader.exec_module(fragments)
    split_tracks=fragments.rebuild(observations,proxy)
    groups,track_to_group=identities.assemble(split_tracks,reid.embeddings,tracking_fps)
    first_pass_count=len(groups)
    progress('merging',87,'正在对全视频人物进行第二轮相似度合并')
    groups,merged_ids,merge_decisions=identities.reconcile(groups)
    track_to_group={track:merged_ids[ident] for track,ident in track_to_group.items()}
    save('identity-merge.json',{'before':first_pass_count,'after':len(groups),'decisions':merge_decisions})
    for obs in observations:
        for p in obs['people']:
            p['playerId']=track_to_group.get(p.get('fragment'))
    save('detection-checkpoint.json',{'groups':[{k:v for k,v in g.items() if k!='frames'} for g in groups],
        'frames':ball_frames,'people':observations,'trackingFps':tracking_fps,'rawTracks':len(tracks) if cached is None else cached['rawTracks'],'pipelineVersion':2,'detectionElapsedSeconds':round(time.monotonic()-started,1),'proxyHash':hashlib.sha256(proxy.read_bytes()).hexdigest()})
    makes=rules.find_makes(ball_frames)
    for make in rules.find_color_makes(ball_frames):
        if not any(abs(make['timestamp']-e['timestamp'])<2 for e in makes):makes.append(make)
    makes.sort(key=lambda e:e['timestamp'])
    # Add missed single-frame exits only when image matching follows the ball
    # downward in the next frame. The net moving alone never adds an event.
    reader=cv2.VideoCapture(str(proxy))
    def image_at(t):
        target=min(count-1,max(0,round(t*fps)))
        position=round(reader.get(cv2.CAP_PROP_POS_FRAMES))
        if 0<=target-position<=round(fps*3):
            for _ in range(target-position):
                if not reader.grab():raise ValueError('无法读取进球附近的画面')
        else:reader.set(cv2.CAP_PROP_POS_FRAMES,target)
        ok,image=reader.read()
        if not ok: raise ValueError('无法读取进球附近的画面')
        return image
    for f in ball_frames:
        if not f['hoop'] or any(abs(e['timestamp']-f['timestamp'])<2 for e in makes): continue
        hx,hy,hx2,hy2=f['hoop']; hw,hh=hx2-hx,hy2-hy
        for b in f['balls']:
            if b.get('source')=='color-motion':continue
            if b['confidence']<.3 or not (hx+.1*hw<b['x']<hx2-.1*hw and hy+.55*hh<b['y']<hy2+.1*hh): continue
            x,y=round(b['x']),round(b['y']); radius=max(4,round(hw*.13)); side=max(radius+2,round(hw*.5)); down=max(radius+3,round(hh*.85))
            if x-side<0 or x+side>=width or y-radius<0 or y+down>=height: continue
            before=image_at(f['timestamp']);after=image_at(f['timestamp']+.1)
            patch=cv2.cvtColor(before[y-radius:y+radius,x-radius:x+radius],cv2.COLOR_BGR2GRAY)
            search=cv2.cvtColor(after[y-radius:y+down,x-side:x+side],cv2.COLOR_BGR2GRAY)
            response=cv2.matchTemplate(search,patch,cv2.TM_CCOEFF_NORMED);_,quality,_,location=cv2.minMaxLoc(response)
            dx=location[0]-(side-radius);dy=location[1]
            if quality>.55 and .1*hh<dy<.8*hh and abs(dx)<.4*hw and quality-float(response[:max(2,int(hh*.07))].max())>.08:
                makes.append({'timestamp':f['timestamp'],'confidence':b['confidence']});break
    makes.sort(key=lambda e:e['timestamp'])
    pose_cache={}
    group_views={g['id']:np.asarray(g['prototypes']) for g in groups}
    observation_times=[o['timestamp'] for o in observations]
    def near_people(t):
        if not observations:return []
        index=bisect.bisect_left(observation_times,t)
        candidates=[i for i in (index-1,index) if 0<=i<len(observations)]
        return observations[min(candidates,key=lambda i:abs(observation_times[i]-t))]['people']
    def poses(t):
        t=round(t,1)
        if t in pose_cache: return pose_cache[t]
        image=image_at(t); result=pose_model.predict(image,imgsz=1280,conf=.2,device='cpu',verbose=False)[0]; out=[]
        crops=[]
        for box,kp in zip(result.boxes,result.keypoints.data.cpu().numpy()):
            bounds=list(map(float,box.xyxy[0].cpu().tolist()));x1,y1,x2,y2=bounds
            if y2<height*.52 or y2-y1<height*.09: continue
            nearest=sorted([(rules.iou(bounds,p['bbox']),p) for p in near_people(t) if p.get('playerId')],key=lambda v:v[0],reverse=True)
            crop=image[max(0,int(y1)):min(height,int(y2)),max(0,int(x1)):min(width,int(x2))]
            if not crop.size:continue
            _,encoded=cv2.imencode('.jpg',crop)
            crops.append({'photo':'data:image/jpeg;base64,'+base64.b64encode(encoded).decode()})
            out.append({'bbox':bounds,'kp':kp.tolist(),'playerId':None,'trackCandidate':nearest[0][1]['playerId'] if nearest and nearest[0][0]>.65 else None})
        for p,vector in zip(out,reid.embeddings(crops) if crops else []):
            query=np.asarray([vector])
            ranked=sorted((identities.appearance_distance(query,views),ident) for ident,views in group_views.items())
            if ranked and ranked[0][0]<.8 and (len(ranked)<2 or ranked[1][0]-ranked[0][0]>.08):p['playerId']=ranked[0][1]
            elif p['trackCandidate']:
                supported=[d for d,i in ranked if i==p['trackCandidate']]
                if supported and supported[0]<.65:p['playerId']=p['trackCandidate']
        pose_cache[t]=out;return out
    events=[]
    for index,make in enumerate(makes):
        t=make['timestamp']; possible=[];method='篮球与手腕关联'
        if make.get('source') in ('continuous-rim-trajectory','continuous-color-trajectory'):
            preceding=[f['hoop'] for f in ball_frames[max(0,round((t-1.5)*fps)):max(1,round((t-.9)*fps))] if f['hoop']]
            passage=rim_motion.net_passage_evidence(make,np.median(np.array(preceding),axis=0).tolist(),image_at) if preceding else {'confirmed':False}
            make['netPassage']=passage
            if not passage['confirmed']:
                events.append({'id':'score-'+str(round(t*10)),'timestamp':round(t,2),'playerId':None,'points':None,'status':'unresolved',
                    'reason':'球在篮筐附近下落，但未确认穿过篮网，可能是侧面未进球；不计入统计','netPassage':passage})
                continue
        for frame in ball_frames[max(0,round((t-2.6)*fps)):max(0,round((t-.3)*fps))]:
            for b in frame['balls']:
                if b['y']>height*.7:continue
                # Only moving detections can represent release. This filters
                # many stationary head / wall false positives from the model.
                moving=any(5<np.hypot(b['x']-n['x'],b['y']-n['y'])<width*.12 for nf in ball_frames[max(0,round(frame['timestamp']*fps)-2):round(frame['timestamp']*fps)+3] if nf['timestamp']!=frame['timestamp'] for n in nf['balls'])
                if not moving:continue
                for p in poses(frame['timestamp']):
                    if not p['playerId']: continue
                    h=p['bbox'][3]-p['bbox'][1];k=p['kp'];shoulder=(k[5][1]+k[6][1])/2
                    for wrist in (k[9],k[10]):
                        if wrist[2]<.5 or wrist[1]>shoulder+15:continue
                        d=float(np.hypot(b['x']-wrist[0],b['y']-wrist[1]))
                        cost=d/max(60,h)+.06*abs(t-frame['timestamp']-1.2)
                        if d<max(25,h*.25) and cost<.22:possible.append((cost,frame['timestamp'],p))
        if not possible:
            method='连续投篮姿势（离手帧缺失，归属较弱）';gestures=[]
            for tt in np.arange(max(0,t-2.6),max(0,t-.65),.2):
                tt=round(float(tt),1)
                for p in poses(tt):
                    if not p['playerId']:continue
                    k=p['kp'];h=p['bbox'][3]-p['bbox'][1]
                    if not all(k[j][2]>.5 for j in (5,6,9,10)):continue
                    shoulder=(k[5][1]+k[6][1])/2
                    if max(k[9][1],k[10][1])>shoulder+10 or min(k[9][1],k[10][1])>shoulder-h*.1:continue
                    if np.linalg.norm(np.array(k[9][:2])-k[10][:2])>h*.45:continue
                    gestures.append((.08*abs(t-tt-1.6),tt,p))
            possible=[g for g in gestures if any(v[2]['playerId']==g[2]['playerId'] and .1<abs(v[1]-g[1])<.45 for v in gestures)]
        possible.sort(key=lambda v:v[0]);event={'id':'score-'+str(round(t*10)),'timestamp':round(t,2),'playerId':None,'points':None,'status':'unresolved','reason':'球通过篮网，但未能确定投篮者'}
        event['detectionSource']=make.get('source','detector-and-trajectory')
        if 'netPassage' in make:event['netPassage']=make['netPassage']
        if possible:
            cost,release,p=possible[0]; competitors=[v for v in possible if v[2]['playerId']!=p['playerId']]
            if not competitors or competitors[0][0]-cost>.025:
                event.update(playerId=p['playerId'],releaseTime=release,shooterBbox=p['bbox'],status='estimated',reason=method+'；两分 / 三分尚未确定')
                # Use the higher-resolution pose pass for game context too:
                # the coarse tracking pass may miss a distant defender.
                now=poses(release);earlier=poses(max(0,release-.8));moving=0;nearby=0
                pb=p['bbox'];foot=np.array([(pb[0]+pb[2])/2,pb[3]])
                for q in now:
                    qb=q['bbox'];qfoot=np.array([(qb[0]+qb[2])/2,qb[3]])
                    old=[r for r in earlier if r['playerId']==q['playerId'] and r['playerId']]
                    if old and min(np.linalg.norm(qfoot-[(r['bbox'][0]+r['bbox'][2])/2,r['bbox'][3]]) for r in old)>max(8,(qb[3]-qb[1])*.09):moving+=1
                    if q['playerId']!=p['playerId'] and np.linalg.norm(qfoot-foot)<.85*(qb[3]-qb[1]):nearby+=1
                event['gameContext']={'movingPeople':moving,'nearbyPeople':nearby}
                # Moving bystanders alone do not prove that play is live.
                # An isolated shot remains unresolved instead of being counted
                # as a game basket or definitively declared a warmup shot.
                decision=rules.game_context_decision(moving,nearby)
                if decision:event.update(status=decision[0],reason=decision[1])
        events.append(event)
        progress('scoring',88+(index+1)/max(1,len(makes))*10,'正在关联进球和球员（%d / %d）'%(index+1,len(makes)),processed=duration)
    reader.release()
    warnings=['得分为自动估算，遮挡和小球漏检会造成漏记；未计入不代表实际零分。',
        '两分或三分无法判定的进球列为待判分，不加入已判定得分累计。',
        '热身 / 死球排除使用运动启发式，会漏排非比赛进球、误排空位进球。',
        '人物按外观匹配，可能包含旁观者或重复人物；跨天换衣服后通常需要关联一次球员。']
    if not hoops:warnings.insert(0,'本视频未检测到可用篮筐，因此未生成得分事件。')
    if not groups:warnings.insert(0,'未检测到足够清晰的人物，请尝试清晰、较近的固定机位视频。')
    for g in groups:g.pop('frames',None);g.pop('positions',None)
    save('observations.json',{'frames':ball_frames,'people':observations})
    save('result.json',{'version':1,'pipelineVersion':2,'identityMerge':{'before':first_pass_count,'after':len(groups),'merged':first_pass_count-len(groups)},'descriptorKind':reid.KIND,'videoKey':key,'duration':duration,'analyzedSeconds':duration,'elapsedSeconds':round(time.monotonic()-started,1),
         'players':groups,'events':events,'warnings':warnings,'hoop':np.median(np.array(hoops),axis=0).tolist() if hoops else None})
    progress('identifying',99,'正在提取跨视频人物特征',processed=duration)
    subprocess.run([sys.executable,str(root/'scripts/player-reid.py'),'--job-dir',str(job)],check=True)
    completed=json.loads((job/'result.json').read_text())
    completed['elapsedSeconds']=round(time.monotonic()-started,1)
    save('result.json',completed)
    progress('complete',100,'分析完成，已生成本视频的人物和得分估算','complete',duration)

try: run()
except Exception as error:
    import traceback
    traceback.print_exc()
    progress('failed',0,str(error)[:400],'failed')
    sys.exit(1)
