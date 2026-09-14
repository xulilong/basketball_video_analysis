import importlib.util
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('rules',Path(__file__).with_name('auto-score-rules.py'))
rules=importlib.util.module_from_spec(spec);spec.loader.exec_module(rules)
def ball(t,x,y):
 return {'timestamp':t,'detections':[{'class':'Basketball','xyxy':[x-12,y-12,x+12,y+12],'confidence':.8}]}
class ScoringRules(unittest.TestCase):
 def test_downward_net_crossing_counted_once(self):
  self.assertEqual(len(rules.made_baskets([ball(1,265,252),ball(1.1,264,275),ball(1.2,264,299)])),1)
 def test_miss_beside_net_is_not_a_make(self):
  self.assertEqual(rules.made_baskets([ball(1,330,252),ball(1.1,330,275)]),[])
 def test_static_ball_or_upward_motion_does_not_score(self):
  self.assertEqual(rules.made_baskets([ball(1,265,275),ball(1.1,265,275),ball(1.2,265,250)]),[])
 def test_missing_trajectory_does_not_score(self):
  self.assertEqual(rules.made_baskets([ball(1,265,250),ball(2,265,280)]),[])
 def test_only_estimated_attributed_events_enter_totals(self):
  events=[{'playerId':'P01','status':status,'points':value} for status,value in [('estimated',2),('estimated',None),('excluded',3),('unresolved',3)]]
  events.append({'playerId':None,'status':'estimated','points':3})
  row=rules.totals([{'id':'P01'}],events)[0]
  self.assertEqual((row['made'],row['pointsMin'],row['pointsMax']),(2,4,5))
 def test_outside_paint_is_unknown_not_automatic_three(self):
  self.assertEqual(rules.point_value([[200,590],[240,590]]),2)
  self.assertIsNone(rules.point_value([[1050,550],[1090,550]]))
  self.assertIsNone(rules.point_value([[200,590]]))
if __name__=='__main__': unittest.main()
