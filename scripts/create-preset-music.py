"""Original instrumental loops synthesized for MT; no external recordings."""
from pathlib import Path
import numpy as np
import wave,subprocess,tempfile
sr=44100
out=Path(__file__).resolve().parents[1]/'public/assets/music';out.mkdir(parents=True,exist_ok=True)
for name,bpm in [('drive',110),('chill',85)]:
 beat=60/bpm;duration=beat*64;audio=np.zeros(int(sr*duration));rng=np.random.default_rng(17)
 def add(at,sound,gain):
  start=int(at*sr);end=min(len(audio),start+len(sound));audio[start:end]+=sound[:end-start]*gain
 def tone(freq,dur):
  t=np.arange(int(sr*dur))/sr;env=np.minimum(t/.02,1)*np.exp(-t*2.8/dur)*np.minimum((dur-t)/.08,1)
  return (np.sin(2*np.pi*freq*t)+.15*np.sin(4*np.pi*freq*t))*env
 roots=[130.81,103.83,155.56,116.54]
 for bar in range(16):
  root=roots[bar%4]
  for offset in [0,3,7]:add(bar*4*beat,tone(root*2**(offset/12),beat*3.8),.075)
  for n in range(4):
   at=(bar*4+n)*beat;t=np.arange(int(sr*.28))/sr
   if n in (0,2):add(at,np.sin(2*np.pi*(48*t+11*(1-np.exp(-t*23))))*np.exp(-t*18),.36)
   else:add(at,rng.standard_normal(len(t))*np.exp(-t*24),.075)
   add(at,tone(root/2,beat*.65),.18)
   for h in range(2):
    t=np.arange(int(sr*.045))/sr;noise=rng.standard_normal(len(t));noise=np.concatenate(([0],np.diff(noise)))
    add(at+h*beat/2,noise*np.exp(-t*95),.02)
   if bar%2==1:add(at+beat*.5,tone(root*2**([12,15,19,22][n]/12),beat*.7),.06)
 audio=np.tanh(audio*1.2)*.72
 fade=int(.02*sr);audio[:fade]*=np.linspace(0,1,fade);audio[-fade:]*=np.linspace(1,0,fade)
 with tempfile.NamedTemporaryFile(suffix='.wav') as temp:
  with wave.open(temp.name,'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(sr);f.writeframes((audio*32767).astype('<i2').tobytes())
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',temp.name,'-c:a','aac','-b:a','160k',str(out/(name+'.m4a'))],check=True)
 print(name,round(duration,1))
