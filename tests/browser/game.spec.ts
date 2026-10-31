import {test,expect} from '@playwright/test';
import {mockBle} from './ble-mock';
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('neon-rider:v1:settings',JSON.stringify({referenceRpm:60,quality:'low',reducedMotion:true,sound:false,profile:null})));});
test('static Pages subpath loads all assets and demo pauses, resumes, disconnects and saves',async({page})=>{
 const errors:string[]=[],missing:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)missing.push(r.url());});
 await page.goto('./');await expect(page.locator('h1')).toContainText('BEYOND');await expect(page.locator('#webgl-error')).toBeHidden();
 await page.screenshot({path:'test-results/home-desktop.png',fullPage:true});
 await page.locator('#demo').click();await expect(page.locator('#panel-title')).toHaveText('準備出發');await page.locator('#auto-resistance').check();await page.locator('#begin').click();
 await expect(page.locator('#rpm')).toHaveText('60');await expect.poll(async()=>Number(await page.locator('#speed').textContent())).toBeGreaterThan(20);
 await page.locator('#demo-grade').selectOption('8');await expect(page.locator('#level')).toHaveText('20',{timeout:15000});
 await page.screenshot({path:'test-results/ride-desktop.png',fullPage:true});
 await page.locator('#demo-rpm').fill('0');await expect(page.locator('#speed')).toHaveText('0');const stopped=await page.locator('#distance').textContent();await page.waitForTimeout(300);await expect(page.locator('#distance')).toHaveText(stopped!);
 await page.locator('#pause').click();await expect(page.locator('#panel-title')).toContainText('暫停');await page.locator('#begin').click();await page.locator('#demo-rpm').fill('60');await expect(page.locator('#rpm')).toHaveText('60');
 await page.locator('#demo-disconnect').click();await expect(page.locator('#reconnect')).toBeVisible();await page.locator('#reconnect').click();await expect(page.locator('#ride-panel')).toBeVisible();await page.locator('#begin').click();await expect(page.locator('#ride-panel')).toBeHidden();
 await page.locator('#stop').click();await expect(page.locator('#result-metrics')).toBeVisible();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('neon-rider:v1:history')||'[]').length)).toBe(1);expect(errors).toEqual([]);expect(missing).toEqual([]);
});
test('BLE starts read-only, claims on start, then stops on stale telemetry',async({page})=>{
 await mockBle(page);await page.goto('./');await page.locator('#connect').click();await expect(page.locator('#auto-resistance')).toBeDisabled();
 expect(await page.evaluate(()=>(window as any).bleMock.writes.map((v:any)=>v.cmd))).toEqual(['get_state']);await page.locator('#begin').click();await expect(page.locator('#rpm')).toHaveText('60');
 await page.waitForTimeout(5100);await page.evaluate(()=>(window as any).bleMock.stale());await expect(page.locator('#panel-title')).toContainText('暫停');await expect(page.locator('#rpm')).toHaveText('—');
 await expect.poll(()=>page.evaluate(()=>(window as any).bleMock.writes.map((v:any)=>v.cmd))).toContain('stop');await expect.poll(()=>page.evaluate(()=>(window as any).bleMock.writes.map((v:any)=>v.cmd))).toContain('release');
 expect(await page.evaluate(()=>(window as any).bleMock.writes.some((v:any)=>v.cmd==='pause'||v.cmd==='set_resistance'))).toBe(false);
});
test('another controller can be viewed without any hardware write',async({page})=>{
 await mockBle(page);await page.goto('./');await page.locator('#connect').click();await page.evaluate(()=>{(window as any).bleMock.busy();(window as any).bleMock.setRunning();});await page.locator('#begin').click();await expect(page.locator('#notice')).toContainText('另一個頁面');await page.locator('#readonly').click();await expect(page.locator('#mode-label')).toContainText('唯讀');await page.locator('#stop').click();expect(await page.evaluate(()=>(window as any).bleMock.writes.map((v:any)=>v.cmd))).toEqual(['get_state','claim']);
});
test('settings validate inverted resistance and persist without health data',async({page})=>{
 await page.goto('./');await page.locator('#settings').click();await page.locator('#reference').fill('90');for(const [id,v] of Object.entries({easy:'20',flat:'10',hard:'5',step:'2'}))await page.locator('#'+id).fill(v);await page.locator('#reduced').check();await page.locator('#settings-form button[type=submit]').click();await page.locator('#settings').click();await expect(page.locator('#reference')).toHaveValue('90');await expect(page.locator('#easy')).toHaveValue('20');expect(await page.evaluate(()=>localStorage.getItem('neon-rider:v1:settings'))).not.toMatch(/uid|heart|bpm/);
});
for(const width of [390,768])test(`responsive ${width}px home and ride`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('./');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/home-${width}.png`,fullPage:true});await page.locator('#demo').click();await page.locator('#begin').click();await expect(page.locator('#rpm')).toHaveText('60');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.locator('#stop')).toBeVisible();await page.screenshot({path:`test-results/ride-${width}.png`,fullPage:true});
});
test('unsupported Bluetooth retains demo; short viewport retains the stop control',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'bluetooth',{configurable:true,value:undefined}));
 await page.setViewportSize({width:390,height:568});await page.goto('./');await page.locator('#connect').click();await expect(page.locator('#notice')).toContainText('Web Bluetooth');await page.locator('#notice button').click();await page.locator('#demo').click();await page.locator('#begin').click();const box=await page.locator('#quick-stop').boundingBox();expect(box).not.toBeNull();expect(box!.y+box!.height).toBeLessThan(568);await page.locator('#quick-stop').click();await expect(page.locator('#result-metrics')).toBeVisible();
});
test('backgrounding controlled riding stops and releases without automatic resume',async({page})=>{
 await mockBle(page);await page.goto('./');await page.locator('#connect').click();await page.locator('#begin').click();await expect(page.locator('#rpm')).toHaveText('60');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.locator('#panel-description')).toContainText('背景');await expect.poll(()=>page.evaluate(()=>(window as any).bleMock.writes.map((v:any)=>v.cmd))).toContain('release');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.locator('#ride-panel')).toBeVisible();
});
test('high-quality scene and WebGL loss stop the controlled machine',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await mockBle(page);await page.goto('./');await page.locator('#settings').click();await page.locator('#quality').selectOption('high');await page.locator('#reduced').uncheck();await page.locator('#settings-form button[type=submit]').click();await page.locator('#notice button').click();await page.screenshot({path:'test-results/home-high.png',fullPage:true});
 await page.locator('#connect').click();await page.locator('#begin').click();await expect(page.locator('#rpm')).toHaveText('60');await page.screenshot({path:'test-results/ride-high.png',fullPage:true});
 await page.locator('#world').dispatchEvent('webglcontextlost');await expect(page.locator('#webgl-error')).toBeVisible();await expect.poll(()=>page.evaluate(()=>(window as any).bleMock.writes.map((v:any)=>v.cmd))).toContain('stop');await expect.poll(()=>page.evaluate(()=>(window as any).bleMock.writes.map((v:any)=>v.cmd))).toContain('release');expect(errors).toEqual([]);
});
