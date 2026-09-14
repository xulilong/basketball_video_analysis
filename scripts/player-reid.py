"""Local OSNet person embeddings and conservative within-video deduplication.

Architecture and pretrained weights: Kaiyang Zhou / Torchreid (MIT).
No face recognition, network requests, or automatic weight downloads at runtime.
"""
import argparse, base64, importlib.util, io, json, os
from pathlib import Path
import numpy as np
from PIL import Image
import torch
from functools import lru_cache

ROOT=Path(__file__).resolve().parents[1]
KIND='osnet-ain-msmt17-v1'

@lru_cache(maxsize=1)
def embedding_model():
    torch.set_num_threads(4)
    spec=importlib.util.spec_from_file_location('osnet_ain',ROOT/'scripts/vendor/osnet_ain.py')
    architecture=importlib.util.module_from_spec(spec);spec.loader.exec_module(architecture)
    state=torch.load(ROOT/'.local-run/models/osnet-ain-msmt17.pth',map_location='cpu',weights_only=True)
    state={k.removeprefix('module.'):v for k,v in state.items()}
    model=architecture.osnet_ain_x1_0(num_classes=state['classifier.weight'].shape[0],pretrained=False).eval()
    model.load_state_dict(state,strict=True)
    device='mps' if torch.backends.mps.is_available() and os.environ.get('BASKETBALL_REID_DEVICE')!='cpu' else 'cpu'
    return model.to(device)

def embeddings(players):
    model=embedding_model()
    mean=torch.tensor([.485,.456,.406]).view(3,1,1);std=torch.tensor([.229,.224,.225]).view(3,1,1)
    tensors=[]
    for p in players:
        image=Image.open(io.BytesIO(base64.b64decode(p['photo'].split(',')[1]))).convert('RGB').resize((128,256),Image.Resampling.BILINEAR)
        tensors.append((torch.from_numpy(np.array(image).copy()).permute(2,0,1).float()/255-mean)/std)
    vectors=[]
    with torch.inference_mode():
        for start in range(0,len(tensors),16):
            batch=torch.stack(tensors[start:start+16]).to(next(model.parameters()).device)
            output=model(batch); output=torch.nn.functional.normalize(output,dim=1)
            vectors.extend(output.cpu().tolist())
    return vectors

def verify_shooters(directory,report):
    """Verify release appearance independently of the coarse tracker ID.

    Pose/tracker box overlap alone is unsafe during occlusion. Never transfer
    points unless the release crop has a sufficiently distinct appearance match.
    """
    import cv2
    from ultralytics import YOLO
    events=[e for e in report['events'] if e.get('releaseTime') is not None]
    if not events:return
    previous=os.environ.get('TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD')
    os.environ['TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD']='1'
    model=YOLO(str(ROOT/'.local-run/models/yolo11s-pose.pt'))
    if previous is None:os.environ.pop('TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD',None)
    else:os.environ['TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD']=previous
    cap=cv2.VideoCapture(str(directory/'upright.mp4'));crops=[];selected=[]
    for event in events:
        cap.set(cv2.CAP_PROP_POS_MSEC,event['releaseTime']*1000);ok,frame=cap.read()
        if not ok:continue
        bbox=event.get('shooterBbox')
        if bbox is None:
            # Older jobs did not retain the pose crop. Recover only when exactly
            # one visible person has both hands raised at the selected release.
            result=model.predict(frame,imgsz=1280,conf=.2,device='cpu',verbose=False)[0]
            candidates=[]
            for box,kp in zip(result.boxes,result.keypoints.data.cpu().numpy()):
                b=box.xyxy[0].cpu().tolist();h=b[3]-b[1]
                if not all(kp[j][2]>.5 for j in (5,6,9,10)):continue
                shoulder=(kp[5][1]+kp[6][1])/2
                if max(kp[9][1],kp[10][1])<shoulder+10 and min(kp[9][1],kp[10][1])<shoulder-.1*h:candidates.append(b)
            if len(candidates)==1:bbox=candidates[0]
        if bbox is None:
            event.update(playerId=None,status='unresolved',reason='出手画面存在遮挡，未能可靠确认投篮者；未计入累计')
            continue
        x1,y1,x2,y2=map(int,bbox);crop=frame[max(0,y1):y2,max(0,x1):x2]
        if not crop.size:continue
        _,encoded=cv2.imencode('.jpg',crop)
        crops.append({'photo':'data:image/jpeg;base64,'+base64.b64encode(encoded).decode()});selected.append(event)
    cap.release()
    for event,vector in zip(selected,embeddings(crops) if crops else []):
        ranked=sorted((float(np.linalg.norm(np.array(vector)-p['descriptor'])),p['id']) for p in report['players'])
        if ranked and ranked[0][0]<.75 and (len(ranked)<2 or ranked[1][0]-ranked[0][0]>.10):
            event['playerId']=ranked[0][1]
        else:
            event.update(playerId=None,status='unresolved',reason='投篮者与人物档案的外观匹配不确定；未计入累计')

def refine(directory,force=False):
    file=directory/'result.json';report=json.loads(file.read_text())
    if report.get('descriptorKind')==KIND and not force:return
    backup=directory/'result-before-reid.json'
    if not backup.exists():backup.write_text(json.dumps(report,ensure_ascii=False))
    players=report['players'];vectors=[p['descriptor'] for p in players] if report.get('descriptorKind')==KIND else embeddings(players) if players else []
    for p,v in zip(players,vectors):p['descriptor']=v
    evidence=json.loads((directory/'observations.json').read_text())
    together=set()
    for frame in evidence['people']:
        aliases=report.get('trackletAliases',{})
        ids={aliases.get(p['playerId'],p['playerId']) for p in frame['people'] if p.get('playerId')}
        for a in ids:
            for b in ids:
                if a!=b:together.add((a,b))
    groups=[];mapping={}
    for person in sorted(players,key=lambda p:p['observations'],reverse=True):
        candidates=[]
        for group in groups:
            if any((person['id'],m['id']) in together for m in group['members']):continue
            distances=[float(np.linalg.norm(np.array(person['descriptor'])-m['descriptor'])) for m in group['members']]
            if max(distances)>1.0:continue
            distance=min(distances)
            candidates.append((distance,group))
        candidates.sort(key=lambda pair:pair[0])
        if candidates and candidates[0][0]<.75 and (len(candidates)<2 or candidates[1][0]-candidates[0][0]>.06):
            group=candidates[0][1];group['members'].append(person)
        else:group={'representative':person,'members':[person]};groups.append(group)
        mapping[person['id']]=group['representative']['id']
    final=[]
    for group in groups:
        p=dict(group['representative']);members=group['members'];vector=np.mean([m['descriptor'] for m in members],axis=0);vector/=max(1e-9,np.linalg.norm(vector))
        p.update(descriptor=vector.tolist(),observations=sum(m['observations'] for m in members),first=min(m['first'] for m in members),last=max(m['last'] for m in members))
        final.append(p)
    for event in report['events']:
        if event['playerId']:event['playerId']=mapping.get(event['playerId'])
    report['players']=final;report['descriptorKind']=KIND
    report['trackletAliases']={old:mapping.get(current,current) for old,current in report.get('trackletAliases',{p['id']:p['id'] for p in players}).items()}
    verify_shooters(directory,report)
    temporary=directory/'result-reid.tmp';temporary.write_text(json.dumps(report,ensure_ascii=False));temporary.replace(file)
    print(json.dumps({'before':len(players),'after':len(final),'descriptorKind':KIND}),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--job-dir',required=True);parser.add_argument('--force',action='store_true');args=parser.parse_args();refine(Path(args.job_dir),args.force)
