"""Automatic basket clip selection and audio-preserving MP4 export."""
import math
import subprocess
import json, uuid, shutil


def clip_ranges(timestamps, duration, before=5, after=2, merge=True):
    ranges=[]
    for t in sorted(set(timestamps)):
        if not math.isfinite(t) or t<0 or t>duration:continue
        start,end=max(0,t-before),min(duration,t+after)
        if end<=start:continue
        if merge and ranges and start<=ranges[-1]['end']:
            ranges[-1]['end']=end
            ranges[-1]['baskets'].append(t)
        else:ranges.append({'start':start,'end':end,'baskets':[t]})
    return ranges


def mix_music(source, output, music, duration, volume):
    info=subprocess.run(['ffmpeg','-hide_banner','-i',str(source)],capture_output=True,text=True)
    music_filter=f'[1:a]volume={volume},afade=t=in:d=0.5,afade=t=out:st={max(0,duration-.8)}:d=0.8[m]'
    if 'Audio:' in info.stderr:
        filters=music_filter+';[0:a][m]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95:level=false[a]'
    else:filters=music_filter+';[m]alimiter=limit=0.95:level=false[a]'
    result=subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(source),
        '-stream_loop','-1','-i',str(music),'-filter_complex',filters,'-map','0:v:0','-map','[a]',
        '-t',str(duration),'-c:v','copy','-c:a','aac','-b:a','160k','-movflags','+faststart',str(output)],capture_output=True,text=True)
    if result.returncode:raise ValueError('背景音乐合成失败：'+result.stderr[-300:])


def encode(source, job, ranges, progress, options=None):
    options=options or {}
    original_volume=options.get('originalVolume',1)

    for i,clip in enumerate(ranges):
        clip['file']=f'clip-{i+1:03d}.mp4'
        result=subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',
            '-ss',str(clip['start']),'-i',str(source),'-t',str(clip['end']-clip['start']),
            '-map','0:v:0','-map','0:a:0?',
            '-vf',"scale='trunc(min(1280,iw)/2)*2':-2,setsar=1",'-r','30',
            '-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p',
            '-c:a','aac','-b:a','160k','-af',f'aresample=async=1:first_pts=0,volume={original_volume}',
            '-movflags','+faststart',str(job/clip['file'])],capture_output=True,text=True)
        if result.returncode:raise ValueError('片段导出失败：'+result.stderr[-300:])
        progress('exporting',88+10*(i+1)/len(ranges),f'正在剪辑进球片段（{i+1} / {len(ranges)}）')
    if not ranges:return
    (job/'concat.txt').write_text(''.join(f"file '{clip['file']}'\n" for clip in ranges))
    result=subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','1',
        '-i',str(job/'concat.txt'),'-c','copy','-movflags','+faststart',str(job/'highlights.tmp.mp4')],capture_output=True,text=True)
    if result.returncode:raise ValueError('集锦合成失败：'+result.stderr[-300:])
    (job/'highlights.tmp.mp4').replace(job/'highlights.mp4')
    music=options.get('musicPath')
    if music and options.get('musicVolume',.3)>0:
        # Mix the full reel once so the music continues across video cuts.
        for filename,duration in [('highlights.mp4',sum(c['end']-c['start'] for c in ranges))]+[(c['file'],c['end']-c['start']) for c in ranges]:
            progress('mixing',99,'正在合成背景音乐与现场原声')
            mixed=job/('mixed-'+filename)
            mix_music(job/filename,mixed,music,duration,options.get('musicVolume',.3))
            mixed.replace(job/filename)


def render(job,source,events,duration,has_hoop,save,progress):
    options=json.loads((job/'options.json').read_text()) if (job/'options.json').exists() else {}
    ranges=clip_ranges([e['timestamp'] for e in events],duration,options.get('before',5),options.get('after',2),options.get('mergeOverlaps',True))
    # Persist observations separately so a failed render never requires detection again.
    save('events.json',{'events':events,'duration':duration,'hasHoop':has_hoop})
    generation=uuid.uuid4().hex;destination=job/'exports'/generation;destination.mkdir(parents=True)
    try:encode(source,destination,ranges,progress,options)
    except Exception:
        shutil.rmtree(destination,ignore_errors=True)
        raise
    save('result.json',{'duration':duration,'events':events,'clips':ranges,'generation':generation,
        'options':{k:v for k,v in options.items() if k!='musicPath'},
        'clipDuration':round(sum(c['end']-c['start'] for c in ranges),2),'hasHoop':has_hoop,
        'warning':'自动检测可能漏剪或误剪，目前无法可靠排除热身及死球投篮。'})
    progress('complete',100,'进球集锦已生成' if ranges else '未检测到满足条件的进球，未生成导出文件','complete',duration)



def finish(job,source,proxy,frames,duration,rules,rim_motion,save,progress):
    import cv2
    import numpy as np
    progress('selecting',84,'正在确认篮筐附近的进球轨迹')
    candidates=rules.find_makes(frames)
    for event in rules.find_color_makes(frames):
        if not any(abs(event['timestamp']-other['timestamp'])<2 for other in candidates):candidates.append(event)
    reader=cv2.VideoCapture(str(proxy));fps=reader.get(cv2.CAP_PROP_FPS)
    count=int(reader.get(cv2.CAP_PROP_FRAME_COUNT))
    def image_at(t):
        reader.set(cv2.CAP_PROP_POS_FRAMES,min(count-1,max(0,round(t*fps))))
        ok,image=reader.read()
        if not ok:raise ValueError('无法读取进球附近画面')
        return image
    events=[]
    try:
        for event in sorted(candidates,key=lambda e:e['timestamp']):
            t=event['timestamp']
            hoops=[f['hoop'] for f in frames[max(0,round((t-1.5)*fps)):max(1,round(t*fps))] if f.get('hoop')]
            if not hoops:continue
            evidence=rim_motion.net_passage_evidence(event,np.median(np.asarray(hoops),axis=0).tolist(),image_at)
            if evidence['confirmed']:events.append({'timestamp':round(t,3),'evidence':evidence})
    finally:reader.release()
    render(job,source,events,duration,any(f.get('hoop') for f in frames),save,progress)
