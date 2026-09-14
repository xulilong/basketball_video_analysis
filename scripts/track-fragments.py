"""Split a reused tracker ID into appearance-consistent fragments before ReID."""
import base64
from collections import defaultdict
import cv2
import numpy as np


def color_descriptor(crop):
    hsv=cv2.cvtColor(cv2.resize(crop,(64,128)),cv2.COLOR_BGR2HSV);features=[]
    for a,b in [(20,61),(61,94),(94,116),(116,128)]:
        part=hsv[a:b,12:52]
        hist=cv2.calcHist([part],[0,1],None,[18,8],[0,180,0,256]).ravel();hist/=max(1,hist.sum())
        val=cv2.calcHist([part],[2],None,[8],[0,256]).ravel();val/=max(1,val.sum())
        features.extend(np.sqrt(hist));features.extend(np.sqrt(val)*.8)
    return np.asarray(features)


def rebuild(observations,proxy):
    reader=cv2.VideoCapture(str(proxy));fps=reader.get(cv2.CAP_PROP_FPS)
    histories=defaultdict(list);read_index=-1
    try:
        for index,frame in enumerate(observations):
            wanted=round(frame['timestamp']*fps)
            while read_index<wanted:
                ok=reader.grab();read_index+=1
                if not ok:raise ValueError('无法读取人物轨迹核对画面')
            ok,image=reader.retrieve()
            if not ok:raise ValueError('无法解码人物轨迹核对画面')
            for person in frame['people']:
                x1,y1,x2,y2=map(int,person['bbox']);crop=image[max(0,y1):y2,max(0,x1):x2]
                person['fragment']=None
                if not crop.size:continue
                vector=color_descriptor(crop);history=histories[str(person['track'])]
                ranked=sorted((float(np.linalg.norm(vector-t['color'])),i) for i,t in enumerate(history))
                if ranked and ranked[0][0]<1.3:
                    track=history[ranked[0][1]]
                else:
                    track={'id':str(person['track'])+':'+str(len(history)), 'first':frame['timestamp'],
                           'firstBox':person['bbox'],'frames':set(),'positions':{},'observations':0,'samples':[],'quality':0,'color':vector}
                    history.append(track)
                person['fragment']=track['id'];track['last']=frame['timestamp'];track['lastBox']=person['bbox']
                track['frames'].add(index);track['observations']+=1
                track['positions'].setdefault(index,[]).append(person['bbox'])
                quality=(y2-y1)*person.get('confidence',1)*(.6 if x1<3 or x2>image.shape[1]-3 else 1)
                best=quality>track['quality']
                sample=not track['samples'] or all(abs(frame['timestamp']-s['timestamp'])>=.8 for s in track['samples'])
                if best or sample:
                    _,encoded=cv2.imencode('.jpg',cv2.resize(crop,(128,256)),[cv2.IMWRITE_JPEG_QUALITY,90])
                    photo='data:image/jpeg;base64,'+base64.b64encode(encoded).decode()
                    if best:track.update(photo=photo,quality=quality,color=vector)
                    if sample:
                        track['samples'].append({'photo':photo,'timestamp':frame['timestamp'],'quality':quality})
                        track['samples']=sorted(track['samples'],key=lambda s:s['quality'],reverse=True)[:6]
    finally:reader.release()
    tracks=[t for history in histories.values() for t in history]
    for track in tracks:track.pop('color')
    return tracks
