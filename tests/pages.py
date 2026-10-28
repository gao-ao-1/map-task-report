"""Verify the actual static deployment under a project subdirectory, without a backend."""
import json, pathlib, sys
from playwright.sync_api import sync_playwright, expect

url=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:5175/report-atlas/'
out=pathlib.Path(__file__).resolve().parents[1]/'outputs';out.mkdir(exist_ok=True)
workspace='https://county-report-atlas.regaleel259.chatgpt.site/'
with sync_playwright() as p:
 browser=p.chromium.launch(channel='msedge',headless=True)
 page=browser.new_page(viewport={'width':1440,'height':1080})
 errors=[];requests=[];failed=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:requests.append(r.url))
 page.on('response',lambda r:failed.append((r.status,r.url)) if r.status>=400 and ('/geo/' in r.url or '/pages-assets/' in r.url) else None)
 page.goto(url,wait_until='networkidle')
 page.locator('path.region').first.wait_for()
 assert page.locator('path.region').count()>=34
 assert page.title()=='县域报告地图'
 assert page.get_by_role('link',name='县域报告地图',exact=True).get_attribute('href')=='./'
 assert all('—' in t for t in page.locator('.stats strong').all_text_contents())
 page.get_by_role('button',name='登录',exact=True).click()
 expect(page.locator('#account-title')).to_have_text('账号登录')
 expect(page.get_by_role('button',name='立即注册',exact=True)).to_be_visible()
 page.get_by_role('button',name='关闭账号窗口',exact=True).click()
 page.screenshot(path=str(out/'pages-desktop.png'),full_page=True)
 page.get_by_label('搜索县名、报告或甲方').fill('东城区')
 page.locator('.search-results button').filter(has_text='北京市 / 东城区').click()
 expect(page.locator('path.region')).to_have_count(16)
 expect(page.locator('.region-heading h3')).to_have_text('东城区')
 expect(page.locator('.region-tasks')).to_contain_text('不代表该地区没有任务')
 page.get_by_role('button',name='全国',exact=True).click()
 page.wait_for_function("document.querySelectorAll('path.region').length >= 34")
 page.get_by_role('button',name='浙江省，浏览地区',exact=True).click()
 expect(page.locator('path.region')).to_have_count(11)
 page.get_by_role('button',name='杭州市，浏览地区',exact=True).click()
 page.wait_for_function("document.querySelector('.breadcrumbs').textContent.includes('杭州市')")
 page.locator('path.region').first.hover()
 page.set_viewport_size({'width':390,'height':844})
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
 page.screenshot(path=str(out/'pages-mobile.png'),full_page=True)
 assert not errors,errors
 assert not failed,failed
 assert not any('/api/' in r for r in requests),'Static page must not call a nonexistent API'
 assert any('/public/geo/110000.json' in r for r in requests)
 page.get_by_role('button',name='新建报告',exact=True).first.click()
 expect(page.locator('#account-title')).to_have_text('账号登录')
 assert page.url==url
 print(json.dumps({'url':url,'passed':['static entry','national map','relative paths','county search','province-city drilldown','honest task state','local account login dialog','no anonymous report requests','mobile layout','no script or asset errors']},ensure_ascii=True))
 browser.close()
