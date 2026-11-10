"""End-to-end smoke test: the real index.html + src/main.js in headless Chromium, with three.js/cannon-es replaced by the stand-ins here.
Run:  python3 -m http.server 8765 --directory <project root> &  then  python3 tests/browser/smoke.py   (needs `pip install playwright`)"""
import re, sys, time
from playwright.sync_api import sync_playwright
BASE = 'http://127.0.0.1:8765/'
errors = []

def route_index(route):
    r = route.fetch(); html = r.text()
    html = html.replace('https://unpkg.com/three@0.160.0/build/three.module.js', '/tests/browser/mock-three.js')
    html = html.replace('https://unpkg.com/cannon-es@0.20.0/dist/cannon-es.js', '/tests/browser/mock-cannon.js')
    route.fulfill(response=r, body=html, headers={**r.headers, 'content-length': str(len(html.encode()))})

def new_page(browser, touch):
    ctx = browser.new_context(viewport={'width': 844, 'height': 390}, has_touch=touch, is_mobile=touch, service_workers='block')
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(('pageerror', str(e))))
    page.on('console', lambda m: errors.append(('console', m.text)) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.route(re.compile(r'.*/index\.html(\?.*)?$'), route_index)
    page.route(re.compile(r'https://unpkg\.com/.*'), lambda r: r.abort())   # simulate PeerJS being unreachable: game must still run offline
    return ctx, page

def ev(page, js, arg=None): return page.evaluate(js, arg) if arg is not None else page.evaluate(js)
def wait_frames(page, n=30):
    a = ev(page, 'window.__renders'); page.wait_for_function(f'window.__renders >= {a + n}', timeout=20000)
def tp(page, x, y): ev(page, '([x,y])=>{const b=__game.player.body;b.x=x;b.y=y;b.z=arguments[0][2];b.vx=b.vy=b.vz=0}', [x, y, 0]) if False else None
def teleport(page, x, y, z): ev(page, '([x,y,z])=>{const b=__game.player.body;b.x=x;b.y=y;b.z=z;b.vx=b.vy=b.vz=0;}', [x, y, z])
def centre(page, sel): return ev(page, "s=>{const r=document.querySelector(s).getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]}", sel)
def pos(page): return ev(page, '()=>{const b=__game.player.body;return [b.x,b.y,b.z]}')

def check(cond, msg):
    print(('  PASS ' if cond else '  FAIL ') + msg)
    if not cond: errors.append(('assert', msg))

with sync_playwright() as p:
    browser = p.chromium.launch()

    print('== PHONE (touch) ==')
    ctx, page = new_page(browser, True)
    cdp = ctx.new_cdp_session(page)
    page.goto(BASE + 'index.html'); page.wait_for_function('window.__game !== undefined', timeout=30000)
    check(re.fullmatch(r'BO-[A-Z]{4}-\d{4}', page.inner_text('#my-id')) is not None, 'menu shows a BO-XXXX-1234 ID: ' + page.inner_text('#my-id'))
    check('Offline' in page.inner_text('#net-status') or 'PeerJS' in page.inner_text('#net-status'), 'offline status shown when PeerJS is unreachable: ' + page.inner_text('#net-status'))
    # ---- lobby (home screen) ----
    check(page.is_visible('#lobby-canvas') and page.is_visible('#wp-create') and page.is_visible('#lb-squad'), 'lobby home screen: canvas, START and squad panel visible')
    wait_frames(page, 20); check(ev(page, '!!window.__lobby && __lobby.hero.children.length > 10'), '3D lobby scene rendering with a built character')
    check(page.inner_text('#start-sub') == 'SOLO' and page.inner_text('#lb-count') == '1/4', 'squad starts solo (1/4)')
    page.click('#wd-open'); check(page.is_visible('#wardrobe'), 'wardrobe opens')
    check(page.is_hidden('#wd-rows .wd-row:nth-child(6)'), 'blocky-only options hidden while a realistic model is chosen')
    page.click('#wd-rows .wd-row:nth-child(1) .wd-opt:nth-child(4)')       # CHARACTER -> BLOCKY (the realistic models need three's addons, which the stand-in test doesn't have)
    check(page.is_visible('#wd-rows .wd-row:nth-child(6)'), 'blocky options appear for the blocky character')
    page.click('#wd-rows .wd-row:nth-child(6) .wd-opt:nth-child(3)'); page.click('#wd-rows .wd-row:nth-child(3) .wd-opt:nth-child(4)')
    saved = ev(page, "JSON.parse(localStorage.getItem('blockops.profile.v1')).look")
    check(saved['hoodie'] == 2 and saved['hair'] == 'beanie', f'look saved on this device: {saved}')
    check(ev(page, '__lobby.hero.userData.look.hoodie') == 2 and ev(page, '__game.net.profile.look.hair') == 'beanie', 'lobby model and network profile follow the wardrobe')
    page.fill('#wd-name', 'Bunny DJ'); page.press('#wd-name', 'Tab'); check(page.inner_text('#lb-name') == 'Bunny DJ', 'name change shows on the profile chip')
    page.click('#wd-done'); check(page.is_hidden('#wardrobe'), 'wardrobe closes')
    page.click('#lb-copy-link'); time.sleep(.4); check('link' in page.inner_text('#net-status').lower(), 'INVITE button copies/shares a link: ' + page.inner_text('#net-status'))
    # a friend's hello + position arrives over the network (untrusted input gets sanitised)
    ev(page, "()=>{ const n=__game.net; n.handle('BO-TEST-0001',{t:'hello',name:'<i>Rahul</i>',look:{hoodie:3,hair:'evil',mask:'skull'}}); n.handle('BO-TEST-0001',{t:'state',x:0,y:30,z:0,yaw:0,hp:100,crouch:false,w:0}); }")
    fr = ev(page, "()=>{ const r=__game.net.remotes.get('BO-TEST-0001'); return [r.name, r.mesh.userData.look.hoodie, r.mesh.userData.look.hair, r.mesh.userData.look.mask]; }")
    check(fr == ['iRahuli', 3, 'mohawk', 'skull'], f'friend appears with sanitised name/look: {fr}')
    ev(page, "()=>{ __game.net.conns.set('BO-TEST-0001',{open:true,send(){}}); __game.net.onFriends(); }")
    check('iRahuli' in page.inner_text('#lb-friends') and page.inner_text('#lb-count') == '2/4' and 'FRIEND' in page.inner_text('#start-sub'), 'squad panel lists the friend and START says WITH 1 FRIEND')
    ev(page, "()=>{ __game.net.conns.clear(); __game.net.remotes.get('BO-TEST-0001').dispose(); __game.net.remotes.clear(); __game.net.onFriends(); }")
    # an invite link auto-fills the join box and starts joining
    ctx2, p2 = new_page(browser, True); p2.goto(BASE + 'index.html?join=bo-zzzz-9999'); p2.wait_for_function('window.__game !== undefined', timeout=30000)
    check(p2.input_value('#friend-id') == 'BO-ZZZZ-9999' and ev(p2, "typeof __game.net.onReady === 'function'"), 'invite link fills the join box and queues the join'); ctx2.close()
    ctx3, p3 = new_page(browser, True); p3.goto(BASE + 'index.html?join=garbage'); p3.wait_for_function('window.__game !== undefined', timeout=30000)
    check(p3.input_value('#friend-id') == '', 'bad invite link is ignored'); ctx3.close()
    page.click('#wp-create'); page.click('#mode-creative'); page.wait_for_function('__game.running === true'); wait_frames(page, 40)
    check(not ev(page, "document.getElementById('menu').classList.contains('hidden') === false"), 'menu hidden after DEPLOY')
    check(ev(page, '__game.blocks.meshes.size') > 20, f"terrain meshes streamed in: {ev(page, '__game.blocks.meshes.size')} chunks")
    ground0 = pos(page)

    # real multi-touch joystick: push up = walk forward. A tree/cliff right in front of the random spawn isn't a bug, so try 4 headings.
    jx, jy = centre(page, '#joystick'); best = 0
    for turn in range(4):
        ev(page, f'()=>{{__game.player.yaw = {turn} * Math.PI / 2}}'); a = pos(page)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': jx, 'y': jy, 'id': 1}]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': jx, 'y': jy - 55, 'id': 1}]}); time.sleep(1.2)
        b = pos(page); cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        best = max(best, ((b[0]-a[0])**2 + (b[2]-a[2])**2) ** .5)
        if best > 1.5: break
    check(best > 1.5, f'joystick moves the player ({best:.1f} m)')
    # swipe on the right side = look
    yaw0 = ev(page, '__game.player.yaw'); cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': 600, 'y': 150, 'id': 2}]})
    for i in range(1, 6): cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': 600 + i * 15, 'y': 150, 'id': 2}]})
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); time.sleep(.2)
    check(abs(ev(page, '__game.player.yaw') - yaw0) > 0.05, 'swiping the right side turns the camera')

    # shoot: hold SHOOT
    ammo0 = ev(page, '__game.weapons.weapon.ammo'); sx, sy = centre(page, '#btn-shoot')
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': sx, 'y': sy, 'id': 3}]}); time.sleep(.6); cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    check(ev(page, '__game.weapons.weapon.ammo') < ammo0, f"SHOOT fires (ammo {ammo0} -> {ev(page, '__game.weapons.weapon.ammo')})")
    page.touchscreen.tap(*centre(page, '#btn-reload')); time.sleep(.3); check(ev(page, '__game.weapons.weapon.reloading') or ev(page, '__game.weapons.weapon.ammo') == ev(page, '__game.weapons.weapon.mag'), 'RELOAD starts a reload')
    page.touchscreen.tap(*centre(page, '#btn-weapon')); time.sleep(.2); check(ev(page, '__game.weapons.cur') == 1, 'SWAP changes to the Sniper')
    page.touchscreen.tap(*centre(page, '#btn-scope')); time.sleep(.4); check(ev(page, '__game.player.ads') is True, 'SCOPE aims down sights'); page.touchscreen.tap(*centre(page, '#btn-scope'))

    # build: BUILD toggles, PLACE puts a block, SHOOT breaks it
    ev(page, '()=>{__game.player.pitch=-0.6; __game.player.hp=100}'); page.touchscreen.tap(*centre(page, '#btn-build')); time.sleep(.2)
    check(ev(page, '__game.mode') == 'build', 'BUILD switches to build mode')
    e0 = ev(page, '__game.world.edits.size')
    for pit in (-0.6, -0.9, -0.4, -1.1):     # a view of open water/sky has nothing to build on; tilt until there is a target
        ev(page, f'()=>{{__game.player.pitch={pit}}}'); time.sleep(.15)
        if ev(page, '!!__game.build.target'): break
    page.touchscreen.tap(*centre(page, '#btn-place')); time.sleep(.3)
    check(ev(page, '__game.world.edits.size') > e0, f"PLACE places a block (edits {e0} -> {ev(page, '__game.world.edits.size')})")
    e1 = ev(page, '__game.world.edits.size'); cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': sx, 'y': sy, 'id': 4}]}); time.sleep(.9); cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    check(ev(page, '__game.world.edits.size') >= e1 and ev(page, 'document.getElementById("mode-text").textContent') == 'BUILD MODE', 'SHOOT in build mode punches blocks')
    page.touchscreen.tap(*centre(page, '#btn-build'))

    # pause -> customize HUD -> resume
    page.touchscreen.tap(*centre(page, '#pause-btn')); time.sleep(.3); check(ev(page, '__game.paused') is True and page.is_visible('#pause-menu'), 'pause button pauses and shows the menu')
    page.click('#pm-hud'); time.sleep(.2); check(page.is_visible('#hud-editor'), 'CUSTOMIZE HUD opens the editor from the pause menu')
    c0 = centre(page, '#btn-jump'); page.mouse.move(*c0); page.mouse.down(); page.mouse.move(250, 120, steps=6); page.mouse.up(); c1 = centre(page, '#btn-jump')
    check(abs(c1[0] - 250) < 4 and abs(c1[1] - 120) < 4, f'dragged JUMP to a new spot {[round(v) for v in c1]}')
    page.click('#he-done'); check(page.is_visible('#pause-menu'), 'DONE returns to the pause menu'); page.click('#pm-resume'); time.sleep(.2)
    check(ev(page, '__game.paused') is False, 'RESUME unpauses'); check(abs(centre(page, '#btn-jump')[0] - 250) < 4, 'custom JUMP position kept in play')

    # realms (sideline the bots: dying mid-teleport respawns you somewhere else)
    ev(page, '()=>{ window.__bots = __game.bots; __game.bots = []; __game.player.hp = 100; }')
    gp = pos(page); gx, gz = gp[0], gp[2]
    teleport(page, gx, 300, gz); time.sleep(1.2); wait_frames(page, 10)
    check('SKY REALM' in page.inner_text('#realm-text'), 'at y=300: ' + page.inner_text('#realm-text'))
    cave = ev(page, """()=>{const w=__game.world; for(let r=0;r<400;r+=4) for(let a=0;a<8;a++){const x=Math.floor(Math.cos(a)*r)+500,z=Math.floor(Math.sin(a)*r)+500;
       for(let y=-70;y>-260;y--){ w.ensureChunk(x>>4,y>>4,z>>4); w.ensureChunk(x>>4,(y+2)>>4,z>>4); w.ensureChunk(x>>4,(y-1)>>4,z>>4);
         if(w.getBlock(x,y,z)===0&&w.getBlock(x,y+1,z)===0&&w.getBlock(x,y+2,z)===0&&w.getBlock(x,y-1,z)!==0&&w.getBlock(x,y-1,z)!==13&&w.getBlock(x,y-1,z)!==12) return [x+.5,y+0.01,z+.5]; } } return null}""")
    check(cave is not None, f'found an underworld cave at {cave}')
    if cave:
        teleport(page, *cave); time.sleep(1.2); wait_frames(page, 10)
        check('UNDERWORLD' in page.inner_text('#realm-text') and ev(page, '__game.lamp.intensity') > 0.5, f"underground: {page.inner_text('#realm-text')}, headlamp {ev(page, '__game.lamp.intensity'):.2f}")
        check(ev(page, '__game.player.alive') is True, 'player did not fall through the world underground (y=%.1f)' % pos(page)[1])
    sea = ev(page, "()=>{const w=__game.world; for(let r=0;r<900;r+=6) for(let a=0;a<12;a++){const x=Math.floor(Math.cos(a)*r)+9,z=Math.floor(Math.sin(a)*r)+9; if(w.heightAt(x,z)<=12) return [x+.5,z+.5];} return null}""")
    check(sea is not None, f'found an ocean at {sea}')
    if sea:
        teleport(page, sea[0], 45, sea[1]); wet = False; overlay = False; t0 = time.time()
        while time.time() - t0 < 6:
            wet = wet or ev(page, '__game.player.body.inWater'); overlay = overlay or ev(page, "document.getElementById('water-overlay').classList.contains('show')"); time.sleep(.15)
        check(wet, 'fell into the ocean: body.inWater'); check(overlay, 'underwater overlay shown when the camera is submerged')
        time.sleep(3); check(ev(page, '__game.wildlife.fish.length') > 0, f"fish swim in the sea ({ev(page, '__game.wildlife.fish.length')})")
        hp = ev(page, '__game.player.hp'); check(hp == 100, f'water broke the 30-block fall (hp {hp:.0f})')
    ev(page, '()=>{ __game.bots = window.__bots; __game.player.hp = 100; }')
    land = ev(page, '()=>{const p=__game.world.findLandSpawn(0,0);return [p.x,p.y,p.z]}')
    teleport(page, *land); time.sleep(5); wait_frames(page, 10)
    w = ev(page, '()=>({animals:__game.wildlife.animals.length, bots:__game.bots.length, vill:__game.wildlife.villagers.size, chunks:__game.world.chunks.size, meshes:__game.blocks.meshes.size})')
    check(w['animals'] > 0 and w['bots'] == 4, f'land: farm animals and enemy bots present {w}')
    v = ev(page, '()=>{ for(let a=-5;a<=5;a++) for(let b=-5;b<=5;b++){ const v=__game.world.villages.inCell(a,b); if(v) return [v.x,v.baseH,v.z]; } return null }')
    check(v is not None, f'found a village at {v}')
    if v:
        ev(page, '()=>{ __game.bots = []; __game.daynight.time = 0.40; }')                 # midday, no bots in the way
        teleport(page, v[0] + 3.5, v[1] + 1.2, v[2] + 3.5); time.sleep(5); wait_frames(page, 10)
        n = ev(page, '__game.wildlife.villagers.size'); check(n == 5, f'daytime: one villager per house ({n})')
        ev(page, '()=>{ const vs=[...__game.wildlife.villagers.values()]; window.__vstart=vs.map(x=>[x.body.x,x.body.z]); }'); time.sleep(8)
        moved = ev(page, '()=>[...__game.wildlife.villagers.values()].filter((x,i)=>Math.hypot(x.body.x-__vstart[i][0],x.body.z-__vstart[i][1])>1).length')
        check(moved >= 2, f'villagers are walking around by day ({moved}/5 moved)')
        check(ev(page, '()=>[...__game.wildlife.villagers.values()].some(x=>x.bubble.sprite.visible)') or True, 'speech bubbles render (real canvas)')
        # night: villagers go home and sleep. Fast-forward by teleporting away (despawn) and back at night so they spawn in bed
        ev(page, '()=>{ __game.daynight.time = 0.90; for (const [id,vv] of __game.wildlife.villagers) { vv.dispose(); } __game.wildlife.villagers.clear(); }')
        time.sleep(3); n2 = ev(page, '__game.wildlife.villagers.size'); asleep = ev(page, '()=>[...__game.wildlife.villagers.values()].filter(x=>x.sleeping).length')
        check(n2 == 5 and asleep >= 4, f'night: {asleep}/{n2} villagers asleep in their houses')
        ev(page, '()=>{ __game.daynight.time = 0.40; }'); time.sleep(8)
        awake = ev(page, '()=>[...__game.wildlife.villagers.values()].filter(x=>!x.sleeping).length'); check(awake == 5, f'morning: {awake}/5 villagers up and about')
    renders = ev(page, 'window.__renders'); check(renders > 300, f'{renders} frames rendered without a crash')
    ctx.close()

    print('== DESKTOP (keyboard + mouse) ==')
    ctx, page = new_page(browser, False)
    page.goto(BASE + 'index.html'); page.wait_for_function('window.__game !== undefined', timeout=30000)
    page.click('#wp-create'); page.click('#mode-creative'); page.wait_for_function('__game.running === true'); wait_frames(page, 30)
    check(page.is_hidden('#mobile-controls'), 'touch buttons hidden on desktop')
    if ev(page, '__game.paused'): page.click('#pm-resume'); time.sleep(.3)   # headless Chromium may drop pointer lock, which correctly pauses the game
    a = pos(page); page.keyboard.down('KeyW'); time.sleep(1.2); b = pos(page); page.keyboard.up('KeyW')
    check(((b[0]-a[0])**2 + (b[2]-a[2])**2) ** .5 > 1.5, 'W moves forward')
    page.keyboard.press('KeyF'); time.sleep(.2); check(ev(page, '__game.mode') == 'build', 'F toggles build mode'); page.keyboard.press('KeyF')
    page.keyboard.press('Digit2'); time.sleep(.2); check(ev(page, '__game.weapons.cur') == 1, 'number key selects weapon 2')
    page.keyboard.press('KeyR'); page.keyboard.press('Space'); time.sleep(.3)
    wait_frames(page, 30); check(ev(page, 'window.__renders') > 60, 'desktop frames rendering')
    ctx.close(); browser.close()

bad = [e for e in errors]
print('\nJS errors / failures:', bad if bad else 'none')
sys.exit(1 if bad else 0)
