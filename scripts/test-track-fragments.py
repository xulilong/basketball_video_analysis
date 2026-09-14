import importlib.util
from pathlib import Path
import tempfile
import unittest
import cv2
import numpy as np
spec=importlib.util.spec_from_file_location('fragments',Path(__file__).with_name('track-fragments.py'))
fragments=importlib.util.module_from_spec(spec);spec.loader.exec_module(fragments)

class FragmentTests(unittest.TestCase):
    def test_tracker_switch_preserves_both_people_and_reconnects_returning_appearance(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'clip.avi';writer=cv2.VideoWriter(str(path),cv2.VideoWriter_fourcc(*'MJPG'),30,(100,100))
            observations=[]
            for i in range(90):
                color=(0,0,255) if i<30 or i>=60 else (0,255,0)
                image=np.full((100,100,3),color,np.uint8);writer.write(image)
                if i%3==0:observations.append({'timestamp':i/30,'people':[{'track':'1','bbox':[5,5,95,95]}]})
            writer.release();tracks=fragments.rebuild(observations,path)
            self.assertEqual(len(tracks),2)
            self.assertEqual(sorted(t['observations'] for t in tracks),[10,20])
            self.assertEqual(observations[0]['people'][0]['fragment'],observations[29]['people'][0]['fragment'])
            self.assertNotEqual(observations[0]['people'][0]['fragment'],observations[15]['people'][0]['fragment'])
            self.assertFalse(tracks[0]['frames']&tracks[1]['frames'])
if __name__=='__main__':unittest.main()
