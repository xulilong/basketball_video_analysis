"""Automatic sample scoring experiment; estimates, never verified box scores.

Run ball detection first. Uses pose wrists to associate release, appearance
prototypes for identity, and a movement heuristic for inactive shooting.
All evidence and abstentions are persisted. No per-shot user input is required.
"""
import argparse, hashlib, importlib.util, json, os, time
from pathlib import Path
import cv2
import numpy as np
import torch
from ultralytics import YOLO
root=Path(__file__).resolve().parents[1]
os.environ['YOLO_CONFIG_DIR']=str(root/'.local-run/yolo-config')
spec=importlib.util.spec_from_file_location('rules',root/'scripts/auto-score-rules.py')
rules=importlib.util.module_from_spec(spec); spec.loader.exec_module(rules)
parser=argparse.ArgumentParser()
parser.add_argument('--detections',default='.local-run/auto-score/basketball-detection.json')
args=parser.parse_args()
out=root/'.local-run/auto-score'; out.mkdir(exist_ok=True,parents=True)
review=root/'.local-run/sample-review'
source=Path(os.environ.get('BASKETBALL_SAMPLE_VIDEO',str(root.parent/'示例.mp4')))
key=hashlib.sha256(source.read_bytes()).hexdigest()
roster=json.loads((review/'roster-candidates.json').read_text())
if roster['videoKey']!=key: raise ValueError('Roster belongs to another video')
data=json.loads((root/args.detections).read_text())
if data.get('videoKey')!=key: raise ValueError('Ball detections belong to another video or lack source provenance')
if data.get('proxyKey')!=hashlib.sha256((review/'upright-10fps.mp4').read_bytes()).hexdigest(): raise ValueError('Upright proxy changed; rerun detection')
cap=cv2.VideoCapture(str(review/'upright-10fps.mp4'))
fps=cap.get(cv2.CAP_PROP_FPS)
torch.set_num_threads(4)
# The sole unrestricted checkpoint below is the official Ultralytics release.
os.environ['TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD']='1'
model=YOLO(str(root/'.local-run/models/yolo11s-pose.pt'))
device='cpu'  # Installed Ultralytics warns that MPS pose keypoints are unreliable.
cachepath=out/'pose-cache.json'
cache=json.loads(cachepath.read_text()) if cachepath.exists() else {}
if cache.get('videoKey')!=key or cache.get('device')!='cpu-v5': cache={'videoKey':key,'device':'cpu-v5','frames':{}}

def frame(t):
    cap.set(cv2.CAP_PROP_POS_FRAMES,round(t*fps)); ok,img=cap.read()
    if not ok: raise ValueError('Unable to decode frame')
    return img

def descriptor(image,kp=None):
    h,w=image.shape[:2]
    patches=[]
    if kp is not None and all(kp[j][2]>.45 for j in (5,6,11,12,13,14,15,16)):
        shoulder=np.mean(np.array(kp)[[5,6],:2],axis=0)
        hip=np.mean(np.array(kp)[[11,12],:2],axis=0)
        knee=np.mean(np.array(kp)[[13,14],:2],axis=0)
        ankle=np.mean(np.array(kp)[[15,16],:2],axis=0)
        length=max(15,hip[1]-shoulder[1])
        for center,top,bottom,halfwidth in [
            ((shoulder[0]+hip[0])/2,shoulder[1]+length*.12,hip[1],length*.35),
            (hip[0],hip[1],hip[1]+(knee[1]-hip[1])*.65,length*.4),
            ((knee[0]+ankle[0])/2,knee[1],ankle[1],length*.3),
            (ankle[0],ankle[1]-length*.1,min(h,ankle[1]+length*.3),length*.4)]:
            patch=image[max(0,int(top)):min(h,int(bottom)),max(0,int(center-halfwidth)):min(w,int(center+halfwidth))]
            patches.append(patch if patch.size else image)
    else:
        im=cv2.resize(image,(64,128));patches=[im[a:b,12:52] for a,b in [(20,64),(64,95),(95,116),(116,128)]]
    features=[]
    for patch in patches:
        part=cv2.cvtColor(patch,cv2.COLOR_BGR2HSV)
        hist=cv2.calcHist([part],[0,1],None,[18,8],[0,180,0,256]).ravel();hist/=max(1,hist.sum())
        value=cv2.calcHist([part],[2],None,[8],[0,256]).ravel();value/=max(1,value.sum())
        features.extend(np.sqrt(hist));features.extend(np.sqrt(value)*.8)
    return np.array(features)

prototypes=[]
for p in roster['candidates']:
    photo=cv2.imread(str(review/p['photo']))
    r=model.predict(photo,imgsz=320,conf=.2,device=device,verbose=False)[0]
    kp=None
    if len(r.boxes):
        sizes=(r.boxes.xyxy[:,2]-r.boxes.xyxy[:,0])*(r.boxes.xyxy[:,3]-r.boxes.xyxy[:,1])
        kp=r.keypoints.data[int(sizes.argmax())].cpu().numpy()
    prototypes.append((p,descriptor(photo,kp)))

def poses(t):
    t=round(t,1); ck=str(t)
    if ck in cache['frames']: return cache['frames'][ck]
    img=frame(t)
    res=model.predict(img,imgsz=1280,conf=.2,device=device,verbose=False)[0]
    people=[]
    for box,kp in zip(res.boxes,res.keypoints.data.cpu().numpy()):
        x1,y1,x2,y2=map(float,box.xyxy[0].cpu().tolist()); h=y2-y1
        if y2<470+.015*(x1+x2)/2 or h<75: continue
        # Remove raised arms from the appearance crop so shirt / shorts / shoes
        # occupy comparable vertical bands in standing and shooting poses.
        shoulder_y=float(np.mean([k[1] for k in kp[5:7] if k[2]>.5])) if any(k[2]>.5 for k in kp[5:7]) else y1+h*.2
        appearance_top=max(y1,shoulder_y-.18*(y2-shoulder_y))
        crop=img[max(0,int(appearance_top)):min(720,int(y2)),max(0,int(x1)):min(1280,int(x2))]
        if not crop.size: continue
        desc=descriptor(img,kp)
        distances=sorted((float(np.linalg.norm(desc-d)),p['id']) for p,d in prototypes)
        people.append({'bbox':[x1,y1,x2,y2],'kp':kp.tolist(),'playerId':distances[0][1],
                       'appearanceDistance':distances[0][0], 'identityMargin':distances[1][0]-distances[0][0]})
    cache['frames'][ck]=people
    return people

balls=[]
for f in data['frames']:
    for d in f['detections']:
        if d['class']=='Basketball' and d['confidence']>=.15:
            a,b,c,e=d['xyxy']; balls.append({'t':f['timestamp'],'x':(a+c)/2,'y':(b+e)/2,'confidence':d['confidence']})
events=rules.made_baskets(data['frames'])
# Recover single-frame ball detections only with an independently visible
# downward optical displacement; a net-motion peak alone never counts.
for b in balls:
    if not (b['confidence']>.3 and 250<b['x']<292 and 240<b['y']<280): continue
    if any(abs(e['timestamp']-b['t'])<2 for e in events): continue
    before=frame(b['t']); after=frame(b['t']+.1)
    x,y=int(b['x']),int(b['y'])
    patch=cv2.cvtColor(before[y-9:y+9,x-9:x+9],cv2.COLOR_BGR2GRAY)
    search=cv2.cvtColor(after[y-9:y+65,x-34:x+34],cv2.COLOR_BGR2GRAY)
    response=cv2.matchTemplate(search,patch,cv2.TM_CCOEFF_NORMED)
    _,quality,_,location=cv2.minMaxLoc(response)
    dx,dy=location[0]-25,location[1]
    still=float(response[:5].max())
    if quality>.55 and 8<dy<55 and abs(dx)<25 and quality-still>.08:
        events.append({'timestamp':b['t'],'netConfidence':b['confidence'],'visualTracking':{'dx':dx,'dy':dy,'similarity':round(quality,3)}})
events.sort(key=lambda e:e['timestamp'])
for i,event in enumerate(events):
    t=event['timestamp']; possible=[]
    # Raised wrist close to a moving ball before the net crossing. Static
    # head detections are rejected with a neighbouring moving-ball requirement.
    for b in balls:
        if not t-2.6 <= b['t'] <= t-.35 or b['y']>490: continue
        moving=any(.05<=abs(b['t']-n['t'])<=.35 and 9<np.hypot(b['x']-n['x'],b['y']-n['y'])<150 for n in balls)
        if not moving: continue
        for p in poses(b['t']):
            x1,y1,x2,y2=p['bbox']; h=y2-y1; kp=p['kp']
            shoulder=min(kp[5][1],kp[6][1])
            for wrist in (kp[9],kp[10]):
                if wrist[2]<.35 or wrist[1]>shoulder+25: continue
                distance=np.hypot(b['x']-wrist[0],b['y']-wrist[1])
                if distance>max(38,h*.25): continue
                cost=distance/max(80,h)+.06*abs(t-b['t']-1.2)
                if cost<.22: possible.append((float(cost),b,p))
    association_method='ball-wrist'
    if not possible:
        # When release is missed, use a repeated two-hand shooting pose. This
        # is a weaker estimate, explicitly recorded separately from ball contact.
        gestures=[]
        for tt in np.arange(max(0,t-2.6),max(0,t-.65),.2):
            tt=round(float(tt),1)
            for p in poses(tt):
                k=p['kp']; height=p['bbox'][3]-p['bbox'][1]
                if not all(k[j][2]>.5 for j in (5,6,9,10)): continue
                shoulder=(k[5][1]+k[6][1])/2
                if max(k[9][1],k[10][1])>shoulder+10: continue
                if min(k[9][1],k[10][1])>shoulder-height*.10: continue
                if np.linalg.norm(np.array(k[9][:2])-k[10][:2])>height*.45: continue
                cost=.08*abs(t-tt-1.6)
                gestures.append((cost,{'t':tt,'x':(k[9][0]+k[10][0])/2,'y':(k[9][1]+k[10][1])/2},p))
        for g in gestures:
            if any(v[2]['playerId']==g[2]['playerId'] and .1<abs(v[1]['t']-g[1]['t'])<.45 for v in gestures):
                possible.append(g)
        if possible: association_method='repeated-shooting-pose'
    possible.sort(key=lambda v:v[0])
    event.update({'id':f'auto-{round(t*10)}','playerId':None,'points':None,'status':'unresolved','reason':'未找到清晰出手人与篮球的关联'})
    if possible:
        cost,b,p=possible[0]
        event.update({'associationMethod':association_method,'releaseTime':b['t'],'suggestedPlayerId':p['playerId'],'associationCost':round(cost,3),'identityMargin':round(p['identityMargin'],3)})
        # Explicitly provisional appearance identity; keep competing identities
        # out of totals instead of silently assigning the nearest colour.
        competitors=[v for v in possible[1:] if v[2]['playerId']!=p['playerId']]
        margin=competitors[0][0]-cost if competitors else 1
        event['shooterMargin']=round(margin,3)
        now=poses(b['t']); earlier=poses(max(0,b['t']-.8)); moving_count=0
        for q in now:
            box=q['bbox']; center=np.array([(box[0]+box[2])/2,box[3]])
            ds=[]
            for r in earlier:
                if r['playerId']!=q['playerId']: continue
                rb=r['bbox']; ds.append(np.linalg.norm(center-[(rb[0]+rb[2])/2,rb[3]]))
            if ds and min(ds)>max(12,(box[3]-box[1])*.09): moving_count+=1
        event['movingPlayers']=moving_count
        pb=p['bbox']; foot=np.array([(pb[0]+pb[2])/2,pb[3]])
        nearby=0
        for q in now:
            qb=q['bbox']
            if np.linalg.norm(np.array(qb)-np.array(pb))<10: continue
            otherfoot=np.array([(qb[0]+qb[2])/2,qb[3]])
            if np.linalg.norm(foot-otherfoot)<.85*(qb[3]-qb[1]): nearby+=1
        event['nearbyPlayers']=nearby
        kp=p['kp']; feet=[[kp[j][0],kp[j][1]] for j in (15,16) if kp[j][2]>.5]
        event['points']=rules.point_value(feet)
        event['playerId']=p['playerId'] if p['identityMargin']>.07 and margin>.025 else None
        if moving_count<2 or nearby==0:
            event.update(status='excluded',reason='场上运动人数少或出手周围无人，疑似热身 / 死球（可能误排空位进球）')
        elif event['playerId']:
            event.update(status='estimated',reason=('篮球下穿网口 + 出手手腕关联' if association_method=='ball-wrist' else '篮球下穿网口 + 连续投篮姿势（球离手帧缺失，归属较弱）')+' + 外观匹配；比赛状态为启发式判断')
        else:
            event['reason']='出手已关联，但相似衣着或多个候选导致身份不确定'
        # Save annotated release evidence for development validation, not a
        # mandatory user review workflow.
        img=frame(b['t']); x1,y1,x2,y2=map(int,p['bbox'])
        cv2.rectangle(img,(x1,y1),(x2,y2),(0,200,255),3)
        cv2.circle(img,(int(b['x']),int(b['y'])),15,(0,0,255),3)
        cv2.putText(img,f"{t:.1f}s {p['playerId']} {event['status']}",(25,45),cv2.FONT_HERSHEY_SIMPLEX,1,(0,200,255),2)
        cv2.imwrite(str(out/f"{event['id']}.jpg"),img)
    cachepath.write_text(json.dumps(cache))
    print(json.dumps(event,ensure_ascii=False),flush=True)
players=[{'id':p['id'],'label':p['label'],'photo':p['photo']} for p in roster['candidates']]
report={'version':1,'videoKey':key,'filename':source.name,'analyzedSeconds':data['analyzedSeconds'],
        'generatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'mode':'experimental-estimates',
        'rosterSource':'人工整理的外观模板；事件及归属自动计算',
        'limitations':['单机位遮挡会漏检，以下不是完整或已验证的个人成绩。','热身 / 死球仅用运动和附近人数启发式排除，会误排空位进球，也会漏排非比赛进球。','仅油漆区内明确记 2 分，其余显示 2–3 分区间；尚未完成三分线标定。','同色衣着身份可能混淆；助攻和篮板尚未统计。'],
        'events':events,'players':rules.totals(players,events)}
(out/'automatic-scores.json.tmp').write_text(json.dumps(report,ensure_ascii=False,indent=2))
(out/'automatic-scores.json.tmp').replace(out/'automatic-scores.json')
print('Saved automatic-scores.json',flush=True)
