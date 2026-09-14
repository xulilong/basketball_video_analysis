"""Supplement tiny-ball detections with moving orange/brown components.

Only supplies observations; temporal net-crossing rules still decide events.
Static rim paint and white moving net pixels cannot supply observations.
"""
import cv2
import numpy as np

def moving_ball_components(image,background,hoop):
    if hoop is None:return []
    x1,y1,x2,y2=hoop;w=x2-x1;h=y2-y1
    if w<12 or h<8:return []
    left=max(0,int(x1-w*.6));right=min(image.shape[1],int(x2+w*.6))
    top=max(0,int(y1-h*.5));bottom=min(image.shape[0],int(y2+h*1.1))
    crop=image[top:bottom,left:right];base=background[top:bottom,left:right]
    if crop.size==0 or crop.shape!=base.shape:return []
    hsv=cv2.cvtColor(crop,cv2.COLOR_BGR2HSV)
    colored=((hsv[:,:,0]<28)|(hsv[:,:,0]>174))&(hsv[:,:,1]>80)&(hsv[:,:,2]>40)
    difference=np.max(cv2.absdiff(crop,base),axis=2)>22
    mask=(colored&difference).astype('uint8')*255
    mask=cv2.morphologyEx(mask,cv2.MORPH_OPEN,np.ones((2,2),np.uint8))
    count,_,stats,centers=cv2.connectedComponentsWithStats(mask)
    observations=[]
    for i in range(1,count):
        x,y,bw,bh,area=stats[i];cx,cy=centers[i]
        if not (max(9,w*w*.008)<area<w*w*.5 and .25<bw/max(1,bh)<2.8 and .08*w<bw<.9*w and .08*w<bh<1.1*w):continue
        observations.append({'x':float(cx+left),'y':float(cy+top),'confidence':.32,
                             'bbox':[int(x+left),int(y+top),int(x+bw+left),int(y+bh+top)],'source':'color-motion'})
    return observations

def net_passage_evidence(event,hoop,image_at):
    """Reject side misses: require central passage or net deformation.

    Compare the central white net against several PRE-shot frames, avoiding
    a transient hand in one reference frame or motion beside the hoop.
    """
    t=event['timestamp'];a,b,c,d=hoop;w=c-a;h=d-b
    frame=image_at(t);height,width=frame.shape[:2]
    left=max(0,int(a+.05*w));right=min(width,int(c-.05*w))
    top=max(0,int(b+.25*h));bottom=min(height,int(d+.15*h))
    if left>=right or top>=bottom:return {'confirmed':False,'centralObservations':0,'netChange':0.}
    def net_mask(tt):
        crop=image_at(max(0,tt))[top:bottom,left:right]
        hsv=cv2.cvtColor(crop,cv2.COLOR_BGR2HSV)
        return ((hsv[:,:,1]<70)&(hsv[:,:,2]>110)).astype('uint8')
    reference=np.median(np.stack([net_mask(t+dt) for dt in (-1.5,-1.2,-.9)]),axis=0)
    change=max(np.count_nonzero(reference!=net_mask(t+dt))/max(1,w*h) for dt in (-.6,-.45,-.3,-.15,0))
    central=sum(a+.15*w<x<c-.15*w and b+.4*h<y<d for _,x,y in event.get('path',[]))
    return {'confirmed':bool(central>=3 or change>.12 or (central>=2 and change>.045)),
            'centralObservations':int(central),'netChange':round(float(change),4)}
