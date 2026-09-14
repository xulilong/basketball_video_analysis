"""Render a selected subset using existing detection ranges; never rerun AI."""
import importlib.util,json,sys
from pathlib import Path
folder=Path(sys.argv[1])
def save(value):
    temporary=folder/'progress.tmp.json'
    temporary.write_text(json.dumps(value,ensure_ascii=False))
    temporary.replace(folder/'progress.json')
try:
    data=json.loads((folder/'request.json').read_text())
    spec=importlib.util.spec_from_file_location('highlights',Path(__file__).with_name('highlight-export.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    def progress(stage,percent,message):
        save({'status':'running','percent':max(0,round((percent-88)/12*100)), 'message':message})
    module.encode(Path(data['source']),folder,data['clips'],progress,data['options'])
    # Only the combined output needs to be retained for this selection.
    for clip in data['clips']:(folder/clip['file']).unlink(missing_ok=True)
    (folder/'request.json').unlink(missing_ok=True)
    save({'status':'complete','percent':100,'message':'选中片段已合成，可下载 MP4'})
except Exception:
    save({'status':'failed','percent':0,'message':'选中片段导出失败，请确认素材仍在服务器后重试'})
    raise
