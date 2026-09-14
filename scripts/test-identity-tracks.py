import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('identity',Path(__file__).with_name('identity-tracks.py'))
identity=importlib.util.module_from_spec(spec);spec.loader.exec_module(identity)

def fragment(ident,start,box=None,vector=None):
    box=box or [0,0,50,100]
    return {'id':ident,'observations':10,'first':start,'last':start+.9,'firstBox':box,'lastBox':box,
            'frames':set(range(round(start*10),round(start*10)+10)),'photo':vector or [1.,0.],
            'samples':[{'vector':vector or [1.,0.]} for _ in range(3)]}

class IdentityTests(unittest.TestCase):
    def assemble(self,tracks):return identity.assemble(tracks,lambda photos:[p.get('vector',p.get('photo')) for p in photos],10)
    def test_occluded_return_is_one_person(self):
        groups,mapping=self.assemble([fragment('a',0),fragment('b',1.2)])
        self.assertEqual(len(groups),1);self.assertEqual(mapping['a'],mapping['b'])
    def test_simultaneous_people_never_merge(self):
        groups,_=self.assemble([fragment('a',0),fragment('b',0)])
        self.assertEqual(len(groups),2)
    def test_impossible_short_gap_rejected(self):
        groups,_=self.assemble([fragment('a',0),fragment('b',1,[1000,0,1050,100])])
        self.assertEqual(len(groups),2)
    def test_brief_noise_does_not_create_player(self):
        noise=fragment('noise',0);noise['observations']=2
        self.assertEqual(self.assemble([noise])[0],[])
    def test_distinct_appearance_stays_separate(self):
        self.assertEqual(len(self.assemble([fragment('a',0),fragment('b',2,vector=[0.,1.])])[0]),2)
    def test_second_pass_reconnects_matching_groups(self):
        a=self.assemble([fragment('a',0)])[0][0]
        b=self.assemble([fragment('b',3)])[0][0];b['id']='person-2'
        merged,mapping,decisions=identity.merge_all([a,b])
        self.assertEqual(len(merged),1);self.assertEqual(mapping[a['id']],mapping[b['id']]);self.assertEqual(len(decisions),1)
    def test_second_pass_keeps_simultaneous_lookalikes_separate(self):
        groups,_=self.assemble([fragment('a',0),fragment('b',0)])
        self.assertEqual(len(identity.merge_all(groups)[0]),2)
    def test_multiple_equally_similar_fragments_do_not_block_merging(self):
        groups=[]
        for i in range(3):
            g=self.assemble([fragment(str(i),i*3)])[0][0];g['id']=str(i);groups.append(g)
        self.assertEqual(len(identity.merge_all(groups)[0]),1)
    def test_switched_track_gallery_cannot_override_cover_identity(self):
        a=fragment('a',0);a['samples']=[{'vector':[0.,1.]}]*3
        b=fragment('b',3,vector=[0.,1.])
        groups,_=self.assemble([a,b]);self.assertEqual(len(groups),2)
    def test_similarity_chain_does_not_swallow_dissimilar_endpoints(self):
        groups=[]
        for i,v in enumerate([0.,.5,1.]):
            groups.append({'id':str(i),'photo':'x','frames':{i},'prototypes':[[v]],'anchor':[v],
                           'descriptor':[v],'observations':10,'first':i,'last':i+.1})
        self.assertEqual(len(identity.merge_all(groups)[0]),2)
    def test_cached_pair_is_invalidated_when_merge_introduces_cooccurrence(self):
        groups=[]
        for i,(value,frame) in enumerate([(0.,1),(.1,2),(.2,2)]):
            groups.append({'id':str(i),'photo':'x','frames':{frame},'prototypes':[[value]],'anchor':[value],
                           'descriptor':[value],'observations':10,'first':i,'last':i+.1})
        merged,mapping,_=identity.merge_all(groups)
        self.assertEqual(len(merged),2)
        self.assertEqual(mapping['0'],mapping['1'])
        self.assertNotEqual(mapping['0'],mapping['2'])
    def test_duplicate_boxes_on_same_body_do_not_prove_two_people(self):
        a=fragment('a',0);b=fragment('b',0)
        a['positions']={f:[a['firstBox']] for f in a['frames']}
        b['positions']={f:[b['firstBox']] for f in b['frames']}
        self.assertEqual(len(self.assemble([a,b])[0]),1)
    def test_spatially_distinct_simultaneous_boxes_stay_separate(self):
        a=fragment('a',0);b=fragment('b',0,[500,0,550,100])
        a['positions']={f:[a['firstBox']] for f in a['frames']}
        b['positions']={f:[b['firstBox']] for f in b['frames']}
        groups,_=self.assemble([a,b])
        self.assertEqual(len(identity.reconcile(groups)[0]),2)
    def test_consolidated_views_are_compared_again_and_all_aliases_resolve(self):
        groups=[]
        for i,v in enumerate([0.,.4,.8]):
            groups.append({'id':str(i),'photo':'x','frames':{i},'prototypes':[[v]],'anchor':[v],
                           'descriptor':[v],'observations':100 if i==1 else 10,'first':i,'last':i+.1})
        self.assertEqual(len(identity.merge_all(groups)[0]),2)
        merged,mapping,history=identity.reconcile(groups)
        self.assertEqual(len(merged),1);self.assertEqual(len(set(mapping.values())),1)
        self.assertGreater(max(d['round'] for d in history),1)

if __name__=='__main__':unittest.main()
