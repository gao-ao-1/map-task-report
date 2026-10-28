"""Cache public DataV boundaries and region catalog; no customer data involved."""
import json, urllib.request, pathlib, concurrent.futures, time
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'public'/'geo'; out.mkdir(parents=True,exist_ok=True)
def get(url):
 for attempt in range(4):
  try:
   with urllib.request.urlopen(url,timeout=45) as response: return json.load(response)
  except Exception:
   if attempt==3: raise
   time.sleep(attempt+1)
regions=get('https://geo.datav.aliyun.com/areas_v3/bound/all.json')
(root/'lib'/'regions.json').write_text(json.dumps(regions,ensure_ascii=False),encoding='utf-8')
(out/'regions.json').write_text(json.dumps(regions,ensure_ascii=False),encoding='utf-8')
parents={r['parent'] for r in regions}
codes=[r['adcode'] for r in regions if r['level'] in ('country','province','city') and r['adcode'] in parents]
def download(code):
 path=out/f'{code}.json'
 if path.exists(): return None
 try:
  data=get(f'https://geo.datav.aliyun.com/areas_v3/bound/{code}_full.json')
  path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 except Exception as e: return f'{code}: {e}'
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
 errors=[x for x in pool.map(download,codes) if x]
print(json.dumps({'regions':len(regions),'maps':len(list(out.glob('*.json')))-1,'errors':errors}))
