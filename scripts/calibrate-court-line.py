"""Fit a visible court arc in a visually identified ROI, without extrapolation.

This is assisted calibration of ONE source video, not an automatic semantic
three-point-line detector. ROI selection and line identity require visual review.
The median removes moving players; a robust fit follows the actual dark paint.
"""
import argparse, hashlib, json
from pathlib import Path
import cv2
import numpy as np


def fit_arc(image, roi):
    height,width=image.shape[:2]
    x1,y1,x2,y2=roi
    if not (0<=x1<x2<=width and 0<=y1<y2<=height):
        raise ValueError('ROI is outside the image')
    gray=cv2.cvtColor(image,cv2.COLOR_BGR2GRAY)
    dark=cv2.morphologyEx(gray,cv2.MORPH_BLACKHAT,cv2.getStructuringElement(cv2.MORPH_RECT,(1,15)))
    points=[]
    for x in range(x1,x2,3):
        column=dark[y1:y2,x]
        if column.max()>25:points.append((x,int(column.argmax())+y1))
    points=np.asarray(points,dtype=float)
    if len(points)<25:raise ValueError('Insufficient visible line evidence')
    rng=np.random.default_rng(21);best=None
    for _ in range(600):
        sample=points[rng.choice(len(points),3,replace=False)]
        if np.ptp(sample[:,0])<(x2-x1)*.35:continue
        poly=np.polyfit(sample[:,0]/width,sample[:,1],2)
        inliers=np.abs(np.polyval(poly,points[:,0]/width)-points[:,1])<2
        if best is None or inliers.sum()>best.sum():best=inliers
    if best is None or best.sum()<.60*len(range(x1,x2,3)):
        raise ValueError('No sufficiently supported arc; refusing to guess')
    support=points[best];poly=np.polyfit(support[:,0]/width,support[:,1],2)
    if np.max(np.diff(support[:,0]))>width*.08:
        raise ValueError('Visible line has a large unsupported gap')
    xs=np.arange(support[0,0],support[-1,0]+1,3)
    curve=np.column_stack([xs,np.polyval(poly,xs/width)])
    if np.any(curve[:,1]<y1) or np.any(curve[:,1]>=y2):raise ValueError('Fit leaves the reviewed region')
    return curve,{'supportPoints':len(support),'medianResidualPixels':round(float(np.median(np.abs(np.polyval(poly,support[:,0]/width)-support[:,1]))),3)}


def run(directory,roi):
    digest=hashlib.sha256()
    with (directory/'source.video').open('rb') as source:
        for chunk in iter(lambda:source.read(1024*1024),b''):digest.update(chunk)
    if digest.hexdigest()!=directory.name:raise ValueError('Source hash does not match job')
    cap=cv2.VideoCapture(str(directory/'upright.mp4'))
    fps=cap.get(cv2.CAP_PROP_FPS);count=cap.get(cv2.CAP_PROP_FRAME_COUNT)
    if fps<=0 or count<=0:raise ValueError('Invalid video')
    frames=[]
    for t in np.linspace(0,max(0,(count-1)/fps),65):
        cap.set(cv2.CAP_PROP_POS_MSEC,float(t)*1000);ok,frame=cap.read()
        if ok:frames.append(frame)
    cap.release()
    if len(frames)<15:raise ValueError('Insufficient frames')
    background=np.median(np.stack(frames),axis=0).astype('uint8')
    curve,quality=fit_arc(background,roi)
    h,w=background.shape[:2]
    # Thin adjacent highlight preserves the original painted line for inspection.
    preview=background.copy();polyline=np.round(curve).astype('int32')
    cv2.polylines(preview,[polyline],False,(0,220,255),3,cv2.LINE_AA)
    cv2.rectangle(preview,(20,20),(845,115),(20,30,35),-1)
    cv2.putText(preview,'THREE-POINT ARC: visible segment only',(35,55),cv2.FONT_HERSHEY_SIMPLEX,.75,(0,220,255),2,cv2.LINE_AA)
    cv2.putText(preview,'Assisted calibration / no extension beyond observed paint',(35,90),cv2.FONT_HERSHEY_SIMPLEX,.60,(255,255,255),1,cv2.LINE_AA)
    cv2.imwrite(str(directory/'court-line.jpg'),preview,[cv2.IMWRITE_JPEG_QUALITY,93])
    cv2.imwrite(str(directory/'court-background.jpg'),background,[cv2.IMWRITE_JPEG_QUALITY,93])
    result={'videoKey':directory.name,'kind':'three-point-arc','method':'visually-reviewed-roi-and-robust-pixel-fit',
            'partial':True,'width':w,'height':h,'sampledFrames':len(frames),'roi':roi,
            'points':(curve/np.array([w,h])).tolist(),'quality':quality,
            'note':'本视频的三分线可见段，已辅助标定。未延伸到画外；尚未结合起跳前脚底位置判分。新视频不能直接复用此坐标。'}
    temp=directory/'court.json.tmp';temp.write_text(json.dumps(result,ensure_ascii=False));temp.replace(directory/'court.json')
    print(json.dumps({'points':len(curve),'quality':quality,'preview':str(directory/'court-line.jpg')}))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--job-dir',type=Path,required=True)
    parser.add_argument('--reviewed-roi',type=int,nargs=4,required=True,metavar=('X1','Y1','X2','Y2'))
    args=parser.parse_args();run(args.job_dir,args.reviewed_roi)
