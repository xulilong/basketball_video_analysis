import importlib.util
from pathlib import Path
import unittest
import json
import numpy as np
spec=importlib.util.spec_from_file_location('rim',Path(__file__).with_name('rim-motion.py'))
rim=importlib.util.module_from_spec(spec);spec.loader.exec_module(rim)
class PassageTests(unittest.TestCase):
    def test_side_fall_and_static_net_are_not_a_make(self):
        frame=np.zeros((120,120,3),np.uint8)
        event={'timestamp':2,'path':[(i/30,85,50+i) for i in range(8)]}
        result=rim.net_passage_evidence(event,[30,30,80,80],lambda t:frame)
        self.assertFalse(result['confirmed']);json.dumps(result)
    def test_continuous_central_passage_is_evidence(self):
        frame=np.zeros((120,120,3),np.uint8)
        event={'timestamp':2,'path':[(i/30,55,55+i) for i in range(8)]}
        self.assertTrue(rim.net_passage_evidence(event,[30,30,80,80],lambda t:frame)['confirmed'])
    def test_single_transient_reference_frame_does_not_create_net_change(self):
        black=np.zeros((120,120,3),np.uint8);white=np.full_like(black,255)
        result=rim.net_passage_evidence({'timestamp':2,'path':[]},[30,30,80,80],lambda t:white if abs(t-.5)<.01 else black)
        self.assertFalse(result['confirmed'])
if __name__=='__main__':unittest.main()
