"""Rebuild and merge identities from saved detections without rerunning YOLO.

Outputs a reviewable proposal, never silently mutates stored scores. Works with
any uploaded video's observations and upright proxy; no sample roster or IDs.
"""
import argparse,base64,importlib.util,json
from collections import defaultdict
from pathlib import Path
import cv2

ROOT=Path(__file__).resolve().parents[1]
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def run(directory):
    reid=load('reid','player-reid.py');identities=load('identity','identity-tracks.py')
    evidence=json.loads((directory/'observations.json').read_text())
    cap=cv2.VideoCapture(str(directory/'upright.mp4'));fps=cap.get(cv2.CAP_PROP_FPS);height=cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
    history=defaultdict(list)
    for index,frame in enumerate(evidence['people']):
        for person in frame['people']:
            x1,y1,x2,y2=person['bbox']
            history[str(person['track'])].append({'timestamp':frame['timestamp'],'bbox':person['bbox'],'quality':y2-y1,'index':index})
    needed=defaultdict(list);tracks=[]
    for key,entries in history.items():
        # Require at least one sufficiently detailed observation to create a
        # roster identity; unresolved tiny figures remain in raw detections.
        if len(entries)<4 or max(p['quality'] for p in entries)<height*.15:continue
        selected=[]
        for item in sorted(entries,key=lambda p:p['quality'],reverse=True):
            if all(abs(item['timestamp']-s['timestamp'])>=.8 for s in selected):selected.append(item)
            if len(selected)>=6:break
        track={'id':key,'first':entries[0]['timestamp'],'last':entries[-1]['timestamp'],'observations':len(entries),
               'firstBox':entries[0]['bbox'],'lastBox':entries[-1]['bbox'],'frames':{e['index'] for e in entries},'samples':[]}
        tracks.append(track)
        for item in selected:needed[round(item['timestamp']*fps)].append((track,item))
    frame_index=0
    while True:
        ok,image=cap.read()
        if not ok:break
        for track,item in needed.get(frame_index,[]):
            x1,y1,x2,y2=map(int,item['bbox']);crop=image[max(0,y1):y2,max(0,x1):x2]
            if not crop.size:continue
            _,encoded=cv2.imencode('.jpg',cv2.resize(crop,(128,256)),[cv2.IMWRITE_JPEG_QUALITY,90])
            photo='data:image/jpeg;base64,'+base64.b64encode(encoded).decode()
            track['samples'].append({'photo':photo})
            if item['quality']>track.get('photoQuality',0):track['photo']=photo;track['photoQuality']=item['quality']
        frame_index+=1
    cap.release();tracks=[t for t in tracks if t['samples']]
    observation_fps=1/max(.01,evidence['people'][1]['timestamp']-evidence['people'][0]['timestamp']) if len(evidence['people'])>1 else 2
    groups,mapping=identities.assemble(tracks,reid.embeddings,observation_fps)
    before=len(groups);groups,aliases,decisions=identities.merge_all(groups)
    for g in groups:g.pop('frames',None)
    proposal={'videoKey':directory.name,'rawTracks':len(history),'retainedTracks':len(tracks),'firstPass':before,'after':len(groups),
              'players':groups,'trackMapping':{t:aliases[g] for t,g in mapping.items()},'decisions':decisions,
              'note':'Identity proposal only; event attribution must be recomputed before replacing statistics.'}
    (directory/'identity-proposal.json').write_text(json.dumps(proposal,ensure_ascii=False))
    print(json.dumps({k:v for k,v in proposal.items() if k not in ('players','trackMapping','decisions')}),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--job-dir',type=Path,required=True);args=p.parse_args();run(args.job_dir)
