"""Integration checks with real FFmpeg: silence, gains, loops and silent input."""
import importlib.util,unittest,tempfile,subprocess
from pathlib import Path
import numpy as np
spec=importlib.util.spec_from_file_location('export',Path(__file__).with_name('highlight-export.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class AudioTests(unittest.TestCase):
 def test_audio_rendering(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp)
   def run(*args):subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*map(str,args)],check=True)
   run('-f','lavfi','-i','color=c=black:s=160x90:r=30:d=2','-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-c:a','aac',root/'source.mp4')
   run('-i',root/'source.mp4','-c:v','copy','-an',root/'silent.mp4')
   run('-f','lavfi','-i','sine=frequency=880:duration=0.3','-c:a','aac',root/'music.m4a')
   def energy(file,start=.7,duration=.3):
    data=subprocess.check_output(['ffmpeg','-v','error','-ss',str(start),'-i',str(file),'-t',str(duration),'-f','f32le','-ac','1','-ar','8000','pipe:1'])
    a=np.frombuffer(data,dtype='<f4');return float(np.sqrt(np.mean(a*a)))
   energies=[]
   for gain in (0,.2,.8):
    target=root/f'gain-{gain}';target.mkdir()
    module.encode(root/'source.mp4',target,module.clip_ranges([1],2,1,1),lambda *a:None,{'originalVolume':gain})
    energies.append(energy(target/'highlights.mp4'))
   self.assertLess(energies[0],.0001)
   self.assertGreater(energies[2]/energies[1],3.5)
   module.mix_music(root/'silent.mp4',root/'music-only.mp4',root/'music.m4a',2,.5)
   self.assertGreater(energy(root/'music-only.mp4'),.01)
   module.mix_music(root/'source.mp4',root/'mixed.mp4',root/'music.m4a',2,.5)
   self.assertGreater(energy(root/'mixed.mp4'),energies[1])
if __name__=='__main__':unittest.main()
