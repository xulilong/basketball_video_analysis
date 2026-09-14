"""Camera-relative rules; no coordinates or identities from the sample video."""
import math

def game_context_decision(moving,nearby):
    if moving>=2 and nearby>0:return None
    if moving<2 and nearby==0:return ('excluded','疑似热身 / 死球：同时缺少连续运动和周围参与者，未计入累计')
    return ('unresolved','缺少连续比赛参与证据，无法区分正常出手与热身 / 死球；暂不计入累计')

def find_makes(frames):
    recent=[]; events=[]
    for frame in frames:
        t=frame['timestamp']; hoop=frame.get('hoop')
        if not hoop: continue
        x1,y1,x2,y2=hoop; w=x2-x1; h=y2-y1
        if w<12 or h<8: continue
        for ball in frame['balls']:
            if ball.get('source')=='color-motion':continue
            x,y=ball['x'],ball['y']
            if ball['confidence']<.22: continue
            # The detector box includes both the rim and hanging net.
            if not (x1-.3*w<x<x2+.15*w and y1+.48*h<y<y2+1.35*h): continue
            for previous in recent:
                dt=t-previous['t']; px,py=previous['x'],previous['y']
                if (.05<=dt<=.31 and x1+.05*w<px<x2-.10*w and py<y2+.35*h
                    and .08*h<y-py<1.0*h and abs(x-px)<.65*w and y>y2+.35*h):
                    if not events or t-events[-1]['timestamp']>2:
                        events.append({'timestamp':previous['t'],'confidence':min(previous['confidence'],ball['confidence'])})
                    break
            recent.append({**ball,'t':t})
        recent=[p for p in recent if t-p['t']<.32]
    return events

def find_color_makes(frames):
    """A longer, smooth trajectory is mandatory for non-neural observations."""
    import numpy as np
    tracks=[];events=[]
    for frame in frames:
        t=frame['timestamp'];hoop=frame.get('hoop')
        if not hoop:continue
        x1,y1,x2,y2=hoop;w=x2-x1;h=y2-y1
        balls=[b for b in frame['balls'] if b['confidence']>=.22 and x1-.6*w<b['x']<x2+.6*w and y1-.5*h<b['y']<y2+1.1*h]
        tracks=[path for path in tracks if t-path[-1][0]<.12 and t-path[0][0]<1.2]
        assignments=[]
        for i,path in enumerate(tracks):
            pt,px,py=path[-1];dt=t-pt
            if dt<=0:continue
            vx=vy=0
            if len(path)>1:
                ot,ox,oy=path[-2];vx=(px-ox)/(pt-ot);vy=(py-oy)/(pt-ot)
            for j,b in enumerate(balls):
                error=math.hypot(b['x']-(px+vx*dt),b['y']-(py+vy*dt))
                if error<w*.22 and -.08*h<b['y']-py<.45*h:assignments.append((error,i,j))
        used_tracks=set();used_balls=set()
        for error,i,j in sorted(assignments):
            if i in used_tracks or j in used_balls:continue
            used_tracks.add(i);used_balls.add(j);ball=balls[j];path=tracks[i];path.append((t,ball['x'],ball['y']))
            values=np.asarray(path)
            reversals=np.flatnonzero(np.diff(values[:,2])<-.02*h)
            smooth=path[int(reversals[-1])+1:] if len(reversals) else path
            st,sx,sy=smooth[0]
            if len(smooth)<7 or t-st<.2 or ball['y']<y2+.4*h or ball['y']-sy<h*.7:continue
            if not (x1-.1*w<sx<x2+.15*w and y1+.25*h<sy<y2):continue
            if not events or t-events[-1]['timestamp']>2:
                events.append({'timestamp':t,'confidence':.32,'source':'continuous-rim-trajectory','path':smooth})
        for j,b in enumerate(balls):
            if j not in used_balls:tracks.append([(t,b['x'],b['y'])])
    return events

def distance(a,b):
    if len(a)!=len(b) or len(a)==0: return float('inf')
    return math.sqrt(sum((x-y)**2 for x,y in zip(a,b)))

def iou(a,b):
    x=max(0,min(a[2],b[2])-max(a[0],b[0])); y=max(0,min(a[3],b[3])-max(a[1],b[1]))
    intersection=x*y
    return intersection/max(1,(a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-intersection)
