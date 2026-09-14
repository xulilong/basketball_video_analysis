"""Conservative scoring rules. Image coordinates are for this fixed camera only."""
import math


def made_baskets(frames):
    """Require a moving ball descending through net exit in consecutive frames."""
    hits = []
    recent = []
    for f in frames:
        t = f['timestamp']
        for d in f['detections']:
            if d['class'] != 'Basketball' or d['confidence'] < .25:
                continue
            a,b,c,e = d['xyxy']; x,y=(a+c)/2,(b+e)/2
            if not (230 < x < 312 and 238 < y < 360 and 12 < c-a < 55):
                continue
            for pt,px,py,pc in recent:
                if .05 <= t-pt <= .25 and abs(x-px)<35 and 8<y-py<65 and 248<px<292 and py<295 and y>265:
                    if not hits or pt-hits[-1]['timestamp']>2:
                        hits.append({'timestamp':pt,'netConfidence':round((pc+d['confidence'])/2,3)})
                    break
            recent.append((t,x,y,d['confidence']))
        recent=[p for p in recent if t-p[0]<.3]
    return hits


def point_value(feet):
    # The painted key is an unambiguous subset of the two-point area. Outside
    # this polygon is NOT automatically a three: the camera has no homography.
    import cv2
    import numpy as np
    paint=np.array([[0,560],[545,520],[750,547],[0,668]],dtype=np.float32)
    if len(feet)==2 and all(cv2.pointPolygonTest(paint,tuple(map(float,p)),True)>4 for p in feet):
        return 2
    return None


def totals(players, events):
    rows=[]
    for p in players:
        es=[e for e in events if e.get('playerId')==p['id'] and e['status']=='estimated']
        known=sum(e['points'] or 0 for e in es)
        unknown=sum(e['points'] is None for e in es)
        rows.append({**p,'made':len(es),'two':sum(e['points']==2 for e in es),
                     'three':sum(e['points']==3 for e in es),'unknownValue':unknown,
                     'pointsMin':known+unknown*2,'pointsMax':known+unknown*3})
    return rows
