"""Multi-view identity assembly. A tracking fragment is not a new person.

No target roster size: simultaneous fragments are forbidden from merging.
Short-gap motion and multiple appearance observations support reconnection.
"""
import numpy as np
import heapq

def coexist(a,b):
    shared=a['frames'].intersection(b['frames'])
    if not shared:return False
    if 'positions' not in a or 'positions' not in b:return True
    for frame in shared:
        aa=a['positions'].get(frame,a['positions'].get(str(frame),[]))
        bb=b['positions'].get(frame,b['positions'].get(str(frame),[]))
        if not aa or not bb:return True
        for x in aa:
            for y in bb:
                intersection=max(0,min(x[2],y[2])-max(x[0],y[0]))*max(0,min(x[3],y[3])-max(x[1],y[1]))
                union=(x[2]-x[0])*(x[3]-x[1])+(y[2]-y[0])*(y[3]-y[1])-intersection
                # Heavily overlapping detections can be two tracker IDs on
                # the SAME body. Distinct boxes remain hard contradictions.
                if intersection/max(1,union)<.5:return True
    return False

def joined_positions(members):
    if not all('positions' in m for m in members):return None
    positions={}
    for member in members:
        for frame,boxes in member['positions'].items():positions.setdefault(int(frame),[]).extend(boxes)
    return positions

def appearance_distance(a,b):
    matrix=np.linalg.norm(np.asarray(a)[:,None,:]-np.asarray(b)[None,:,:],axis=2)
    # Require support from several views instead of one lucky crop match.
    return float(np.median(np.sort(matrix.min(axis=1))[:3]))

def merge_all(groups,threshold=.75,margin=0):
    """Second pass over the whole video, retaining co-occurrence constraints.

    Reciprocal nearest matches merge. A runner-up can be another fragment of
    the SAME person, so within-video duplicate merging does not require a
    runner-up margin. Check every
    original member pair to prevent similarity chains swallowing other people.
    """
    clusters=[{'members':[g],'frames':set(g['frames']),**({'positions':g['positions']} if 'positions' in g else {})} for g in groups]
    pair_costs={}
    prepared={g['id']:(np.asarray(g.get('anchor',g['descriptor'])),np.asarray(g['prototypes'])) for g in groups}
    def member_cost(x,y):
        key=tuple(sorted((x['id'],y['id'])))
        if key not in pair_costs:
            xa,xv=prepared[x['id']];ya,yv=prepared[y['id']]
            pair_costs[key]=max(float(np.linalg.norm(xa-ya)),
                               appearance_distance(xv,yv),appearance_distance(yv,xv))
        return pair_costs[key]
    decisions=[]
    def cost(a,b):
        if coexist(a,b):return float('inf')
        return max(member_cost(x,y) for x in a['members'] for y in b['members'])
    # Complete-link distances only change for the newly merged cluster.
    # The global closest pair is also a reciprocal nearest pair. A heap avoids
    # recomputing all unchanged pairs after every merge in long videos.
    active=set(range(len(clusters)));distances={};heap=[]
    def key(i,j):return (min(i,j),max(i,j))
    for i,a in enumerate(clusters):
        for j in range(i+1,len(clusters)):
            d=cost(a,clusters[j]);distances[i,j]=d
            if d<threshold:heapq.heappush(heap,(d,i,j))
    while len(active)>1:
        if margin>0:
            ranked={i:sorted((distances[key(i,j)],j) for j in active if i!=j) for i in active}
            pairs=[]
            for i,choices in ranked.items():
                d,j=choices[0]
                if j<=i or d>=threshold or ranked[j][0][1]!=i:continue
                if len(choices)>1 and choices[1][0]-d<margin:continue
                if len(ranked[j])>1 and ranked[j][1][0]-d<margin:continue
                pairs.append((d,i,j))
            if not pairs:break
            d,i,j=min(pairs)
        else:
            while heap:
                d,i,j=heapq.heappop(heap)
                if i in active and j in active and d==distances[i,j]:break
            else:break
        a,b=clusters[i],clusters[j]
        decisions.append({'from':[g['id'] for g in b['members']],'to':a['members'][0]['id'],'distance':round(d,4)})
        a['members'].extend(b['members']);a['frames'].update(b['frames']);active.remove(j)
        for k in active:
            if k==i:continue
            pair=key(i,k)
            distances[pair]=max(distances[pair],distances[key(j,k)])
            if distances[pair]<threshold:heapq.heappush(heap,(distances[pair],*pair))
    clusters=[clusters[i] for i in sorted(active)]
    merged=[];mapping={}
    for cluster in clusters:
        members=cluster['members'];representative=max(members,key=lambda g:g['observations']);g=dict(representative)
        prototypes=[v for m in members for v in m['prototypes']]
        # Deterministic diversity selection retains complementary views.
        matrix=np.asarray(prototypes);indices=[0]
        nearest=np.linalg.norm(matrix-matrix[0],axis=1)
        while len(indices)<min(24,len(prototypes)):
            index=int(np.argmax(nearest))
            if nearest[index]<.05:break
            indices.append(index)
            nearest=np.minimum(nearest,np.linalg.norm(matrix-matrix[index],axis=1))
        kept=[prototypes[i] for i in indices]
        vector=np.mean(kept,axis=0);vector/=max(1e-9,np.linalg.norm(vector))
        g.update(prototypes=kept,descriptor=vector.tolist(),frames=cluster['frames'],
                 observations=sum(m['observations'] for m in members),first=min(m['first'] for m in members),last=max(m['last'] for m in members))
        positions=joined_positions(members)
        if positions is not None:g['positions']=positions
        merged.append(g)
        for member in members:mapping[member['id']]=g['id']
    return merged,mapping,decisions

def reconcile(groups):
    """Recompare consolidated galleries until stable, preserving spatial conflicts.

    Each pass uses complete-link matching over its current identity records.
    Later passes use the consolidated representative and views, so they do not
    impose an all-original-crops distance limit across every refinement pass.
    """
    mapping={g['id']:g['id'] for g in groups};history=[];round_number=0
    while groups:
        before=len(groups);groups,aliases,decisions=merge_all(groups);round_number+=1
        mapping={key:aliases[value] for key,value in mapping.items()}
        history.extend({**decision,'round':round_number} for decision in decisions)
        if len(groups)==before:break
    return groups,mapping,history


def assemble(tracks,embed,track_fps):
    retained=[t for t in tracks if t['observations']>=max(4,round(track_fps*.8))]
    photos=[s for t in retained for s in [{'photo':t['photo']}]+t['samples']]
    vectors=embed(photos) if photos else []
    offset=0
    for t in retained:
        anchor=vectors[offset];samples=vectors[offset+1:offset+1+len(t['samples'])];offset+=1+len(t['samples'])
        t['anchor']=anchor
        # A tracker ID may already have switched people. Conflicting crops
        # must not poison an identity's appearance gallery.
        t['vectors']=[anchor]+[v for v in samples if np.linalg.norm(np.array(v)-anchor)<.8]
        t['_vectors']=np.asarray(t['vectors']);t['_anchor']=np.asarray(anchor)
    groups=[];mapping={}
    for track in sorted(retained,key=lambda t:t['observations'],reverse=True):
        candidates=[]
        for group in groups:
            if coexist(group,track):continue
            distance=max(appearance_distance(track['_vectors'],group['_prototypes']),float(np.linalg.norm(track['_anchor']-group['_anchor'])))
            # Physical continuity is additional evidence, never a substitute
            # for appearance (a defender may occupy the previous position).
            continuity=False;impossible=False
            for other in group['tracks']:
                a,b=(track,other) if track['last']<other['first'] else (other,track)
                gap=b['first']-a['last']
                if 0<gap<.7:
                    aa=a['lastBox'];bb=b['firstBox'];scale=max(20,aa[3]-aa[1],bb[3]-bb[1])
                    displacement=np.linalg.norm(np.array([(aa[0]+aa[2])/2,aa[3]])-[(bb[0]+bb[2])/2,bb[3]])/scale
                    impossible |= displacement>1.5+gap*2
                    continuity |= displacement<.35+gap
            if impossible:continue
            candidates.append((distance-(.08 if continuity else 0),group,distance))
        candidates.sort(key=lambda p:p[0])
        if candidates and candidates[0][0]<.70 and (len(candidates)<2 or candidates[1][0]-candidates[0][0]>.08):
            group=candidates[0][1]
        else:
            group={'id':'person-'+str(len(groups)+1),'photo':track['photo'],'anchor':track['anchor'],'frames':set(),'tracks':[],
                   'prototypes':[],'observations':0,'first':track['first'],'last':track['last']};groups.append(group)
            group['_anchor']=track['_anchor']
            if 'positions' in track:group['positions']={}
        group['frames'].update(track['frames']);group['tracks'].append(track)
        if 'positions' in group:
            for frame,boxes in track['positions'].items():group['positions'].setdefault(frame,[]).extend(boxes)
        # Retain diverse views across fragments without unbounded storage.
        for v in track['vectors']:
            if not group['prototypes'] or min(np.linalg.norm(np.array(v)-p) for p in group['prototypes'])>.2:
                if len(group['prototypes'])<16:group['prototypes'].append(v)
        group['_prototypes']=np.asarray(group['prototypes'])
        group['observations']+=track['observations'];group['first']=min(group['first'],track['first']);group['last']=max(group['last'],track['last'])
        mapping[track['id']]=group['id']
    for g in groups:
        vector=np.mean(g['prototypes'],axis=0);vector/=max(1e-9,np.linalg.norm(vector));g['descriptor']=vector.tolist();g.pop('tracks')
        g.pop('_anchor');g.pop('_prototypes')
    return groups,mapping
