"""Browser account/report flow against local backend. Optional --pages tests real cross-origin semantics with local routing."""
import pathlib,json,secrets,sys,io,zipfile
from playwright.sync_api import sync_playwright,expect
root=pathlib.Path(__file__).resolve().parents[1];out=root/'outputs';out.mkdir(exist_ok=True)
username='ui_'+secrets.token_hex(4);password=secrets.token_urlsafe(15);reportname='界面测试-'+secrets.token_hex(4)
pages='--pages' in sys.argv
with sync_playwright() as p:
 browser=p.chromium.launch(channel='msedge',headless=True)
 context=browser.new_context(viewport={'width':1440,'height':1080},accept_downloads=True)
 if pages:
  def static_route(route):
   local=route.request.url.replace('https://gao-ao-1.github.io/map-task-report/','http://127.0.0.1:5175/report-atlas/')
   route.fulfill(response=route.fetch(url=local))
  def api_route(route):
   local=route.request.url.replace('https://county-report-atlas.regaleel259.chatgpt.site','http://127.0.0.1:5174')
   route.fulfill(response=route.fetch(url=local))
  context.route('https://gao-ao-1.github.io/map-task-report/**',static_route)
  context.route('https://county-report-atlas.regaleel259.chatgpt.site/api/**',api_route)
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 url='https://gao-ao-1.github.io/map-task-report/' if pages else 'http://127.0.0.1:5174/'
 page.goto(url,wait_until='networkidle');page.locator('path.region').first.wait_for()
 page.get_by_role('button',name='登录',exact=True).click()
 expect(page.locator('#account-title')).to_have_text('账号登录')
 page.screenshot(path=str(out/'account-login.png'),full_page=True)
 page.get_by_role('button',name='立即注册',exact=True).click()
 dialog=page.locator('.account-dialog')
 dialog.get_by_label('用户名',exact=True).fill(username)
 dialog.get_by_label('密码',exact=True).fill(password)
 dialog.get_by_label('确认密码',exact=True).fill(password)
 dialog.get_by_role('button',name='注册账号',exact=True).click()
 expect(dialog.locator('[role=status]')).to_contain_text('注册成功')
 dialog.get_by_label('密码',exact=True).fill(password)
 dialog.get_by_role('button',name='登录',exact=True).click()
 expect(dialog).not_to_be_visible();expect(page.locator('.user-label')).to_contain_text(username)
 assert page.url==url,'Login must stay on the map page, not navigate to ChatGPT'
 page.get_by_label('搜索县名、报告或甲方').fill('东城区')
 page.locator('.search-results button').filter(has_text='北京市 / 东城区').click()
 expect(page.locator('path.region')).to_have_count(16)
 page.get_by_role('button',name='新建报告',exact=True).first.click()
 page.get_by_label('报告名称',exact=False).fill(reportname)
 page.get_by_label('甲方单位',exact=False).fill('界面测试甲方')
 page.get_by_label('联系人',exact=True).fill('测试联系人')
 page.get_by_label('联系电话',exact=True).fill('13800000000')
 pdf=b'%PDF-1.4\n%%EOF'
 docx=io.BytesIO()
 with zipfile.ZipFile(docx,'w',zipfile.ZIP_DEFLATED) as z:
  z.writestr('[Content_Types].xml','<Types/>');z.writestr('word/document.xml','<document/>')
 page.locator('input[type=file]').set_input_files([{'name':'测试报告.pdf','mimeType':'application/pdf','buffer':pdf},{'name':'测试报告.docx','mimeType':'application/octet-stream','buffer':docx.getvalue()}])
 page.get_by_role('button',name='保存报告',exact=True).click();page.wait_for_selector('.dialog',state='hidden')
 page.get_by_role('button',name=reportname,exact=True).click();expect(page.locator('.file-row')).to_have_count(2)
 with page.expect_download() as event:page.locator('.file-row').filter(has_text='测试报告.pdf').click()
 download=event.value;assert pathlib.Path(download.path()).read_bytes()==pdf
 page.get_by_role('button',name='编辑信息 / 追加附件').click()
 page.locator('.dialog select').nth(1).select_option('已完成')
 page.get_by_role('button',name='保存报告',exact=True).click();page.wait_for_selector('.dialog',state='hidden')
 expect(page.locator('tr').filter(has_text=reportname)).to_contain_text('已完成')
 page.get_by_role('button',name='新建报告',exact=True).first.click()
 page.get_by_label('报告名称',exact=False).fill(reportname);page.get_by_label('甲方单位',exact=False).fill('重复测试')
 page.get_by_role('button',name='保存报告',exact=True).click();expect(page.get_by_role('alert')).to_contain_text('报告名称已存在')
 page.get_by_role('button',name='取消',exact=True).click()
 page.get_by_role('button',name='修改密码',exact=True).click()
 nextpassword=secrets.token_urlsafe(16)
 dialog.get_by_label('当前密码',exact=True).fill(password);dialog.get_by_label('新密码',exact=True).fill(nextpassword);dialog.get_by_label('确认密码',exact=True).fill(nextpassword)
 dialog.get_by_role('button',name='保存新密码',exact=True).click();expect(dialog).not_to_be_visible()
 page.get_by_role('button',name='退出',exact=True).click();expect(page.locator('.user-label')).not_to_be_visible()
 page.get_by_role('button',name='登录',exact=True).click();dialog.get_by_label('用户名',exact=True).fill(username);dialog.get_by_label('密码',exact=True).fill(password);dialog.get_by_role('button',name='登录',exact=True).click();expect(dialog.get_by_role('alert')).to_contain_text('用户名或密码不正确')
 dialog.get_by_label('密码',exact=True).fill(nextpassword);dialog.get_by_role('button',name='登录',exact=True).click();expect(dialog).not_to_be_visible()
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.get_by_role('button',name='修改密码',exact=True).click();page.screenshot(path=str(out/'account-mobile.png'),full_page=True)
 assert not errors,errors
 print(json.dumps({'mode':'Pages cross-origin with local routing' if pages else 'same-origin backend','passed':['normal login form','self registration','login remains on map','county search','report creation','Word and PDF upload','authorized file download','status edit','duplicate report error','password change','old password denied','logout','mobile layout','no JS exceptions'],'test_user':username},ensure_ascii=True))
 browser.close()
