from playwright.sync_api import sync_playwright
import json,sys,re
base=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8787'
with sync_playwright() as p:
 b=p.chromium.launch(headless=True)
 host=b.new_page();player=b.new_page();errors=[]
 for page in [host,player]: page.on('pageerror',lambda e:errors.append(str(e)))
 host.goto(base);host.wait_for_load_state('networkidle')
 host.get_by_placeholder('Ismingizni kiriting').first.fill('Browser migration test')
 host.get_by_role('button',name='O‘YINNI BOSHLASH',exact=True).click()
 host.wait_for_function('!!sessionStorage.getItem("game-session")')
 session=host.evaluate('JSON.parse(sessionStorage.getItem("game-session"))');code=session['roomCode']
 player.goto(base);player.wait_for_load_state('networkidle')
 player.get_by_placeholder('Ismingizni kiriting').nth(1).fill('Browser Player')
 player.get_by_placeholder('0000').fill(code)
 player.get_by_role('button',name='QO‘SHILISH',exact=True).click()
 host.get_by_role('button',name='O‘YINNI BOSHLASH',exact=True).wait_for()
 host.get_by_role('button',name='O‘YINNI BOSHLASH',exact=True).click()
 host.wait_for_timeout(600)
 player.get_by_role('button',name='JAVOB',exact=True).wait_for()
 host.get_by_role('button',name=re.compile('TAYMERNI BOSHLASH',re.I)).click()
 player.get_by_role('button',name='JAVOB',exact=True).click()
 host.get_by_role('button',name='✓ TO‘G‘RI',exact=True).click()
 player.reload();player.wait_for_load_state('networkidle')
 player.get_by_role('button',name='JAVOB',exact=True).wait_for()
 assert 'Browser Player' in player.locator('body').inner_text()
 host.get_by_role('button',name=re.compile('MAVZU QO‘SHISH',re.I)).click()
 host.get_by_text('6. 6-mavzu',exact=True).wait_for()
 host.on('dialog',lambda d:d.accept())
 host.get_by_role('button',name='Tugatish',exact=True).click()
 host.wait_for_url('**/#results/*')
 player.wait_for_url('**/#results/*')
 assert not errors, errors
 print(json.dumps({'ok':True,'code':code,'resultId':host.url.split('#results/')[1],'checks':['browser-create','browser-join','browser-buzz','browser-judge','player-refresh','add-topic','finish-results'],'pageErrors':errors}))
 b.close()
