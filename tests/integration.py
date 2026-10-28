"""Run ONLY against the loopback built Worker (npm start -- --port 5174).
The Sites gateway supplies identity in production. Headers here simulate that gateway.
Creates clearly prefixed test records in the local preview database only.
"""
import concurrent.futures, io, json, uuid, zipfile
import requests
BASE='http://127.0.0.1:5174/api/'
tag='集成测试-'+uuid.uuid4().hex[:8]
admin={'oai-authenticated-user-id':'local_seedy','oai-authenticated-user-email':'seedy@sites.test'}
member={'oai-authenticated-user-id':'test-member','oai-authenticated-user-email':'member@atlas.test'}
checks=[]
def expect(response,status,label):
 assert response.status_code==status,(label,response.status_code,response.text[:500])
 checks.append(label);return response
def call(path,method='GET',identity=admin,**kwargs):
 return requests.request(method,BASE+path,headers=identity,timeout=30,**kwargs)
expect(call('reports',identity={}),401,'anonymous reports denied')
expect(call('me'),200,'admin identity')
expect(call('members','POST',json={'email':member['oai-authenticated-user-email']}),200,'add team member')
body=dict(name=tag+' 报告 A',county='110101',client='测试甲方',contact='测试联系人',phone='13800000000',owner='测试负责人',status='编写中',due='2026-12-01',type='可行性研究报告',notes='本地自动化测试数据')
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 results=list(pool.map(lambda _:call('reports','POST',json=body),range(2)))
assert sorted(r.status_code for r in results)==[201,409],[(r.status_code,r.text) for r in results]
checks.append('concurrent duplicate insert: one success, one conflict')
rid=next(r.json()['id'] for r in results if r.status_code==201)
expect(call('reports','POST',json={**body,'name':'  '+body['name'].lower().replace(' ','   ')+'  '}),409,'normalized duplicate name rejected')
expect(call('reports','POST',json={**body,'name':tag+' invalid county','county':'110000'}),400,'province is not county')
expect(call('reports','POST',json={**body,'name':tag+' invalid date','due':'2026-02-31'}),400,'invalid date rejected')
expect(call('reports',identity=member),200,'team member can read shared reports')
expect(call('members',identity=member),403,'member cannot administer team')
expect(call(f'reports/{rid}','PATCH',identity=member,json={**body,'revision':1}),403,'member cannot edit other author')
expect(call(f'reports/{rid}','PATCH',json={**body,'revision':1,'status':'审核中'}),200,'admin updates report')
expect(call(f'reports/{rid}','PATCH',json={**body,'revision':1}),409,'stale revision blocked')
pdf=b'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'
expect(call(f'reports/{rid}/files','POST',files={'file':('fake.pdf',b'not pdf','application/pdf')}),400,'disguised upload rejected')
expect(call(f'reports/{rid}/files','POST',identity=member,files={'file':('report.pdf',pdf,'application/pdf')}),403,'unauthorized upload denied')
response=expect(call(f'reports/{rid}/files','POST',files={'file':('测试报告.pdf',pdf,'application/pdf')}),201,'PDF upload')
fileid=response.json()['id']
expect(call(f'files/{fileid}',identity={}),401,'anonymous download denied')
download=expect(call(f'files/{fileid}',identity=member),200,'team file download')
assert download.content==pdf;assert 'attachment;' in download.headers['content-disposition'];checks.append('download bytes and disposition preserved')
docx=io.BytesIO()
with zipfile.ZipFile(docx,'w',zipfile.ZIP_DEFLATED) as z:
 z.writestr('[Content_Types].xml','<Types/>');z.writestr('word/document.xml','<document/>')
expect(call(f'reports/{rid}/files','POST',files={'file':('报告.docx',docx.getvalue(),'application/octet-stream')}),201,'Word docx upload')
expect(call(f'reports/{rid}/files','POST',files={'file':('报告.doc',bytes.fromhex('d0cf11e0a1b11ae1')+b'legacy-word','application/msword')}),201,'legacy doc upload signature')
files=expect(call(f'reports/{rid}/files'),200,'list attachment versions').json();assert len(files)==3
created=expect(call('reports','POST',identity=member,json={**body,'name':tag+' 成员报告'}),201,'member creates report').json()['id']
expect(call(f'reports/{created}','PATCH',identity=member,json={**body,'name':tag+' 成员报告','revision':1,'status':'已完成'}),200,'member edits own report')
expect(requests.post(BASE+'reports',headers={**admin,'Origin':'https://untrusted.example'},json=body),403,'cross-origin write blocked')
expect(call('members','DELETE',json={'email':member['oai-authenticated-user-email']}),200,'remove member')
expect(call('reports',identity=member),403,'removed member denied')
print(json.dumps({'passed':len(checks),'checks':checks,'local_test_prefix':tag},ensure_ascii=True,indent=2))
