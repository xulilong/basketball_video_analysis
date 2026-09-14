import importlib.util
from pathlib import Path
import unittest
import numpy as np
spec=importlib.util.spec_from_file_location('rules',Path(__file__).with_name('upload-analysis-rules.py'))
rules=importlib.util.module_from_spec(spec);spec.loader.exec_module(rules)

def frames(ox=0,oy=0,scale=1):
    hoop=[ox+100*scale,oy+100*scale,ox+160*scale,oy+170*scale]
    return [{'timestamp':1+i*.1,'hoop':hoop,'balls':[{'x':ox+128*scale,'y':oy+y*scale,'confidence':.8}]} for i,y in enumerate([154,180,205])]

class Rules(unittest.TestCase):
    def test_downward_path_is_one_event(self): self.assertEqual(len(rules.find_makes(frames())),1)
    def test_hoop_location_and_scale_do_not_depend_on_sample(self):
        self.assertEqual(len(rules.find_makes(frames(350,80,.6))),1)
    def test_stationary_ball_does_not_score(self):
        f=frames()
        for p in f:p['balls'][0]['y']=160
        self.assertEqual(rules.find_makes(f),[])
    def test_upward_ball_and_missing_hoop_do_not_score(self):
        f=frames()
        for i,p in enumerate(f):p['balls'][0]['y']=205-i*25
        self.assertEqual(rules.find_makes(f),[])
        for p in f:p['hoop']=None
        self.assertEqual(rules.find_makes(f),[])
    def test_numpy_descriptors_work_and_empty_is_not_a_match(self):
        self.assertEqual(rules.distance(np.array([1.,0.]),[1.,0.]),0)
        self.assertEqual(rules.distance([],[]),float('inf'))
    def test_walking_bystanders_do_not_prove_live_play(self):
        self.assertEqual(rules.game_context_decision(2,0)[0],'unresolved')
        self.assertEqual(rules.game_context_decision(0,0)[0],'excluded')
        self.assertEqual(rules.game_context_decision(1,1)[0],'unresolved')
        self.assertIsNone(rules.game_context_decision(2,1))
    def test_color_requires_long_exit_trajectory(self):
        f=[{'timestamp':i/30,'hoop':[100,100,160,170],'balls':[{'x':128,'y':145+i*5,'confidence':.32,'source':'color-motion'}]} for i in range(15)]
        self.assertEqual(rules.find_makes(f),[])
        self.assertEqual(len(rules.find_color_makes(f)),1)
        for frame in f:frame['balls'][0]['y']=155+(int(frame['timestamp']*30)%3)*3
        self.assertEqual(rules.find_color_makes(f),[])
if __name__=='__main__':unittest.main()
