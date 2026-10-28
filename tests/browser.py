import pathlib, os, json, uuid
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'outputs';out.mkdir(exist_ok=True)
name='界面测试-'+uuid.uuid4().hex[:6]
with sync_playwright() as p:
 browser=p.chromium.launch(channel='msedge',headless=True)
 context=browser.new_context(viewport={'width':1440,'height':1100},extra_http_headers={'oai-authenticated-user-id':'local_seedy','oai-authenticated-user-email':'seedy@sites.test'})
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:5174/',wait_until='networkidle')
 page.locator('path.region').first.wait_for();assert page.locator('path.region').count()>=34
 page.screenshot(path=str(out/'desktop-national.png'),full_page=True)
 page.get_by_label('搜索县名、报告或甲方').fill('东城区')
 page.locator('.search-results button').filter(has_text='北京市 / 东城区').click()
 page.wait_for_function("document.querySelectorAll('path.region').length===16")
 page.get_by_role('button',name='新建报告',exact=True).first.click()
 page.get_by_label('报告名称',exact=False).fill(name)
 page.get_by_label('甲方单位',exact=False).fill('界面测试甲方')
 page.get_by_label('联系人',exact=True).fill('测试联系人')
 page.get_by_label('联系电话',exact=True).fill('13800000000')
 page.locator('input[type=file]').set_input_files({'name':'测试报告.pdf','mimeType':'application/pdf','buffer':b'%PDF-1.4\n%%EOF'})
 page.get_by_role('button',name='保存报告',exact=True).click()
 page.wait_for_selector('.dialog',state='hidden');page.get_by_role('button',name=name,exact=True).wait_for()
 page.get_by_role('button',name=name,exact=True).click()
 page.locator('.file-row').first.wait_for();assert '测试报告.pdf' in page.locator('.file-row').inner_text()
 page.screenshot(path=str(out/'report-detail.png'),full_page=True)
 page.get_by_role('button',name='编辑信息 / 追加附件').click()
 page.locator('.dialog select').nth(1).select_option('已完成')
 page.get_by_role('button',name='保存报告',exact=True).click();page.wait_for_selector('.dialog',state='hidden')
 page.wait_for_timeout(400)
 page.screenshot(path=str(out/'after-edit.png'),full_page=True)
 row=page.locator('tr').filter(has_text=name);assert '已完成' in row.inner_text()
 page.get_by_role('button',name='新建报告',exact=True).first.click()
 page.get_by_label('报告名称',exact=False).fill(name)
 page.get_by_label('甲方单位',exact=False).fill('重复测试')
 page.get_by_role('button',name='保存报告',exact=True).click()
 page.get_by_role('alert').filter(has_text='报告名称已存在').wait_for()
 page.get_by_role('button',name='取消',exact=True).click()
 page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(300)
 assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'mobile horizontal overflow'
 page.screenshot(path=str(out/'mobile.png'),full_page=True)
 assert not errors,errors
 print(json.dumps({'passed':['national map','county search and drilldown','create report','PDF upload','detail attachments','edit status','duplicate error','mobile layout','no browser exceptions'],'screenshots':str(out),'report_name':name},ensure_ascii=True))
 browser.close()
