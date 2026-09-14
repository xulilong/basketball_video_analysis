import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('export',Path(__file__).with_name('highlight-export.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class ClipTests(unittest.TestCase):
    def test_boundaries_and_duplicates(self):
        self.assertEqual(module.clip_ranges([1,1,29],30),[{'start':0,'end':3,'baskets':[1]},{'start':24,'end':30,'baskets':[29]}])
    def test_overlapping_baskets_share_one_clip(self):
        self.assertEqual(module.clip_ranges([15,10],30),[{'start':5,'end':17,'baskets':[10,15]}])
    def test_custom_lengths_and_merge_off(self):
        clips=module.clip_ranges([10,12],30,before=3,after=4,merge=False)
        self.assertEqual([(c['start'],c['end']) for c in clips],[(7,14),(9,16)])
        self.assertEqual(module.clip_ranges([10,12],30,before=3,after=4)[0]['end'],16)
    def test_invalid_and_empty(self):
        self.assertEqual(module.clip_ranges([float('nan'),float('inf'),-1,31],30),[])
        self.assertEqual(module.clip_ranges([],30),[])
if __name__=='__main__':unittest.main()
