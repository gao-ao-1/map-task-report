"""Local-only integration tests. Run built Worker on 127.0.0.1:5174 with .dev.vars."""
import concurrent.futures, io, json, pathlib, secrets, zipfile
import requests
BASE='http://127.0.0.1:5174/api/'
ROOT=pathlib.Path(__file__).resolve().parents[1]
config=dict(line.split('=',1) for line in (ROOT/'.dev.vars').read_text().splitlines() if '=' in line)
tag='test_'+secrets.token_hex(4); password=secrets.token_urlsafe(16); checks=[]
def call(path,method='GET',token=None,**kwargs):
 headers=kwargs.pop('headers',{})
 if token:headers['Authorization']='Bearer '+token
 return requests.request(method,BASE+path,headers=headers,timeout=30,**kwargs)
def expect(r,status,label):
 assert r.status_code==status,(label,r.status_code,status)
 checks.append(label);return r
def login(name,pwd):
 return expect(call('auth/login','POST',json={'username':name,'password':pwd}),200,'password login').json()['token']
expect(call('reports'),401,'anonymous report access denied')
expect(call('reports',headers={'oai-authenticated-user-id':'forged','oai-authenticated-user-email':'seedy@sites.test'}),401,'legacy identity header spoof denied')
admin=login('admin',config['INITIAL_ADMIN_PASSWORD'])
expect(call('auth/register','POST',json={'username':'ＡＤＭＩＮ','password':password}),409,'admin username reserved')
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 results=list(pool.map(lambda name:call('auth/register','POST',json={'username':name,'password':password,'role':'admin'}),[tag,tag.upper()]))
assert sorted(r.status_code for r in results)==[201,409];checks.append('concurrent case-insensitive username uniqueness')
member=login(tag.upper(),password)
me=expect(call('me',token=member),200,'current account').json();assert me['role']=='member';uid=me['userId'];checks.append('registration cannot choose admin role')
expect(call('auth/login','POST',json={'username':tag,'password':'wrong-password'}),401,'wrong password rejected')
expect(call('auth/register','POST',json={'username':'bad spaces','password':password}),400,'invalid username rejected')
expect(call('auth/register','POST',json={'username':tag+'short','password':'123'}),400,'short password rejected')
expect(call('members',token=member),403,'member cannot manage accounts')
body=dict(name=tag+' Report A',county='110101',client='测试甲方',contact='测试联系人',phone='13800000000',owner='测试负责人',status='编写中',due='2026-12-01',type='可行性研究报告',notes='本地集成测试')
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 results=list(pool.map(lambda _:call('reports','POST',token=admin,json=body),range(2)))
assert sorted(r.status_code for r in results)==[201,409];checks.append('concurrent report-name uniqueness')
rid=next(r.json()['id'] for r in results if r.status_code==201)
expect(call('reports','POST',token=member,json={**body,'name':' '+body['name'].lower().replace(' ','   ')+' '}),409,'normalized duplicate report rejected')
expect(call('reports','POST',token=member,json={**body,'name':tag+' invalid','county':'110000'}),400,'province not accepted as county')
expect(call('reports','POST',token=member,json={**body,'name':tag+' date','due':'2026-02-31'}),400,'invalid date rejected')
expect(call(f'reports/{rid}','PATCH',token=member,json={**body,'revision':1}),403,'member cannot edit another author')
expect(call(f'reports/{rid}','PATCH',token=admin,json={**body,'revision':1,'status':'审核中'}),200,'admin edit')
expect(call(f'reports/{rid}','PATCH',token=admin,json={**body,'revision':1}),409,'stale update blocked')
pdf=b'%PDF-1.4\n%%EOF'
expect(call(f'reports/{rid}/files','POST',token=admin,files={'file':('fake.pdf',b'not-pdf','application/pdf')}),400,'disguised attachment rejected')
expect(call(f'reports/{rid}/files','POST',token=member,files={'file':('report.pdf',pdf,'application/pdf')}),403,'unauthorized attachment upload denied')
fid=expect(call(f'reports/{rid}/files','POST',token=admin,files={'file':('测试报告.pdf',pdf,'application/pdf')}),201,'PDF upload').json()['id']
expect(call(f'files/{fid}'),401,'anonymous attachment download denied')
r=expect(call(f'files/{fid}',token=member),200,'authenticated attachment download');assert r.content==pdf;assert 'attachment;' in r.headers['Content-Disposition']
docx=io.BytesIO()
with zipfile.ZipFile(docx,'w',zipfile.ZIP_DEFLATED) as z:
 z.writestr('[Content_Types].xml','<Types/>');z.writestr('word/document.xml','<document/>')
expect(call(f'reports/{rid}/files','POST',token=admin,files={'file':('报告.docx',docx.getvalue(),'application/octet-stream')}),201,'Word upload')
expect(call(f'reports/{rid}/files','POST',token=admin,files={'file':('报告.doc',bytes.fromhex('d0cf11e0a1b11ae1')+b'test','application/msword')}),201,'legacy Word upload')
assert len(expect(call(f'reports/{rid}/files',token=member),200,'attachment history').json())==3
own=expect(call('reports','POST',token=member,json={**body,'name':tag+' own'}),201,'member creates report').json()['id']
expect(call(f'reports/{own}','PATCH',token=member,json={**body,'name':tag+' own','revision':1,'status':'已完成'}),200,'member edits own report')
origin='https://gao-ao-1.github.io'
r=expect(call('auth/login','OPTIONS',headers={'Origin':origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}),204,'Pages CORS preflight');assert r.headers['Access-Control-Allow-Origin']==origin
r=expect(call('reports',token=member,headers={'Origin':origin}),200,'Pages cross-origin reports');assert r.headers['Access-Control-Allow-Origin']==origin
expect(call('reports','POST',token=member,headers={'Origin':'https://untrusted.example'},json=body),403,'untrusted write origin denied')
expect(call('auth/password','POST',token=member,json={'currentPassword':'wrong-password','newPassword':password+'x'}),400,'password change requires current password')
newpassword=secrets.token_urlsafe(16)
newtoken=expect(call('auth/password','POST',token=member,json={'currentPassword':password,'newPassword':newpassword}),200,'password changed').json()['token']
expect(call('me',token=member),401,'old sessions revoked after password change')
expect(call('auth/login','POST',json={'username':tag,'password':password}),401,'old password invalid')
member=login(tag,newpassword)
expect(call('members','PATCH',token=admin,json={'id':uid,'disabled':True}),200,'admin disables account')
expect(call('me',token=member),401,'disabled session invalid')
expect(call('auth/login','POST',json={'username':tag,'password':newpassword}),401,'disabled account cannot login')
expect(call('members','PATCH',token=admin,json={'id':uid,'disabled':False}),200,'admin enables account')
expect(call('me',token=newtoken),401,'old token not revived when account enabled')
member=login(tag,newpassword)
expect(call('auth/logout','POST',token=member),200,'logout')
expect(call('me',token=member),401,'logged out token invalid')
rows=expect(call('members',token=admin),200,'admin lists accounts').json();assert all('password_hash' not in r and 'salt' not in r for r in rows)
for _ in range(20):
 r=call('auth/login','POST',json={'username':tag+'_unknown','password':password});assert r.status_code==401
expect(call('auth/login','POST',json={'username':tag+'_unknown','password':password}),429,'login throttling')
expect(call('auth/logout','POST',token=admin),200,'admin logout')
print(json.dumps({'passed':len(checks),'checks':checks,'test_prefix':tag},ensure_ascii=True))
