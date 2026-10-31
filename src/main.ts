import './style.css';
import { RehabBleClient } from './ble';
import { Simulator } from './simulator';
import { Ride, CHAPTERS, COURSE_LENGTH, chapterAt, gradeAt, median } from './ride';
import { ResistanceController, validProfile } from './resistance';
import { hasControl, readings } from './types';
import type { Source, Settings } from './types';
import { loadSettings, saveSettings, saveSummary, history, clearStorage } from './storage';
import { NeonScene } from './scene';
import { RideAudio } from './audio';

const icon = (name:string) => {
  const paths:Record<string,string>={arrow:'<path d="M4 12h15M13 5l7 7-7 7"/>',bluetooth:'<path d="m7 7 10 10-5 4V3l5 4L7 17"/>',settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',sound:'<path d="m11 4-6 5H2v6h3l6 5V4Zm4 4q6 4 0 8m3-11q9 7 0 14"/>',close:'<path d="m5 5 14 14M19 5 5 19"/>',pause:'<path d="M8 5v14M16 5v14"/>',stop:'<rect x="5" y="5" width="14" height="14" rx="2"/>',heart:'<path d="M20 5c-3-3-7 0-8 2-1-2-5-5-8-2-6 6 8 15 8 15S26 11 20 5Z"/>',bolt:'<path d="m14 2-9 12h6l-1 8 9-13h-6l1-7Z"/>',play:'<path d="m8 4 12 8-12 8V4Z"/>'};
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.arrow}</svg>`;
};
document.querySelector('#app')!.innerHTML=`
  <canvas id="world" aria-label="霓虹星際單車三維賽道"></canvas>
  <div class="atmosphere"></div><div class="grain"></div>
  <header class="topbar">
    <a class="brand" href="#" aria-label="回到首頁"><span class="brand-mark">N<span>↗</span></span><span>NEON<span class="brand-light">RIDER</span><small>POWERED BY YOUR PEDALS</small></span></a>
    <nav aria-label="工具列"><span id="connection" class="connection"><i></i><span>單車尚未連線</span></span><button id="quick-stop" class="quick-stop" hidden aria-label="立即停止騎乘">${icon('stop')}停止</button><button id="sound" class="icon-button" aria-label="開啟音效" aria-pressed="false">${icon('sound')}</button><button id="fullscreen" class="icon-button" aria-label="切換全螢幕">${icon('expand')}</button><button id="settings" class="icon-button" aria-label="開啟設定">${icon('settings')}</button></nav>
  </header>
  <main>
    <section id="home" class="home">
      <div class="hero-copy"><p class="eyebrow"><span class="tiny-cross">✦</span> YOUR ENERGY. ANOTHER UNIVERSE.</p>
        <h1>BEYOND<br>THE <em>RIDE.</em><span class="title-dot">✳</span></h1>
        <p class="hero-zh">踩進，另一個宇宙。</p><p class="hero-description">用你的每一次踩踏，點亮前方的星海。<br>連接單車，展開一場五公里的霓虹冒險。</p>
        <div class="hero-actions"><button id="connect" class="button primary">${icon('bluetooth')}連接單車 ${icon('arrow')}</button><button id="demo" class="button secondary">模擬體驗 <span>↗</span></button></div>
        <p class="connection-note"><span class="dot"></span> Web Bluetooth 連線 <span class="divider">/</span> 不需下載 App</p>
      </div>
      <div class="hero-coordinate"><span>SECTOR 01 — EARTH ORBIT</span><b>25°03′ N &nbsp; 121°30′ E</b><span class="coordinate-line"></span></div>
      <div class="hero-bottom"><div class="route-intro"><span class="eyebrow">THE EXPEDITION</span><h2>一趟騎行。三個世界。</h2><p><b>5.0</b> 公里虛擬旅程 <span>／</span> 跟隨你的節奏</p></div>
        <div class="chapters">${CHAPTERS.map((c,i)=>`<article class="chapter-card"><span class="chapter-num">0${i+1}</span><div class="chapter-art art-${i}"><span></span><i></i></div><div><h3>${c.name}</h3><p>${c.en}</p></div><span class="chapter-distance">${((c.end-c.start)/1000).toFixed(1)} KM</span></article>`).join('')}</div>
      </div>
    </section>
    <section id="ride-ui" class="ride-ui" hidden>
      <div class="ride-top"><div><p class="eyebrow" id="chapter-label">01 / NEON DISTRICT</p><h2 id="chapter-name">霓虹城市</h2><span class="mode-label" id="mode-label">模擬體驗</span></div><div class="ride-progress"><div><span id="distance">0.00</span><small> / 5.00 KM</small></div><div class="progress-track"><i id="progress"></i></div><div class="progress-labels"><span>NEON</span><span>ORBIT</span><span>HYPERSPACE</span></div></div></div>
      <aside class="mission"><span class="eyebrow">FIND YOUR FLOW</span><h3 id="mission-title">跟上自己的節奏</h3><p id="target-rpm">目標 48–72 RPM</p><div class="energy-track"><i id="energy"></i></div><div class="combo"><strong id="combo">×1</strong><span>FLOW COMBO</span><b id="score">00000</b></div></aside>
      <div class="speedometer"><span class="eyebrow">VIRTUAL SPEED</span><div><b id="speed">0</b><small>km/h</small></div><span class="speed-caption">虛擬速度</span></div>
      <div class="ride-bottom"><div class="metrics"><div><span>飛輪轉速</span><strong id="rpm">—</strong><small>RPM</small></div><div><span>${icon('heart')} 即時心率</span><strong id="bpm">—</strong><small>BPM</small></div><div><span>賽道坡度</span><strong id="grade">0.0</strong><small>%</small></div><div><span>機台阻力</span><strong id="level">—</strong><small>RAW</small></div></div>
        <div class="ride-actions"><button id="pause" class="button secondary">${icon('pause')}暫停</button><button id="stop" class="button danger">${icon('stop')}停止騎乘</button></div>
      </div>
      <div class="ride-details"><span id="resistance-detail">自動阻力未啟用</span><span id="elapsed">00:00</span></div>
      <div id="demo-controls" class="demo-controls" hidden><label for="demo-rpm">模擬 RPM <output id="demo-rpm-value">60</output></label><input id="demo-rpm" type="range" min="0" max="140" value="60"><label for="demo-grade">坡度測試</label><select id="demo-grade"><option value="route">跟隨賽道</option value="-6">−6% 下坡</option><option value="0">0% 平路</option><option value="8">+8% 上坡</option></select><button id="demo-disconnect">模擬斷線</button></div>
    </section>
    <section id="ride-panel" class="ride-panel" hidden aria-labelledby="panel-title"><div class="panel-orbit">${icon('bolt')}</div><p class="eyebrow" id="panel-kicker">PREPARE FOR LAUNCH</p><h2 id="panel-title">準備出發</h2><p id="panel-description">沿著光軌騎行，讓你的節奏帶你前往星海。</p><div id="result-metrics" class="result-metrics" hidden></div><div id="ready-options"><label class="check"><input id="auto-resistance" type="checkbox">依坡度自動調整實體阻力</label><p class="small" id="profile-note">請先至設定填妥機台阻力範圍。</p></div><div class="panel-actions"><button id="begin" class="button primary">開始騎乘 ${icon('arrow')}</button><button id="readonly" class="button secondary">唯讀騎行</button><button id="reconnect" class="button primary" hidden>重新連接</button><button id="leave" class="button text-button">返回首頁</button></div></section>
  </main>
  <div id="notice" class="notice" role="status" aria-live="polite" hidden><span></span><button aria-label="關閉提示">×</button></div>
  <div id="webgl-error" class="webgl-error" hidden><h2>無法啟動 3D 畫面</h2><p>請使用支援 WebGL 2 的瀏覽器，並確認硬體加速已開啟。騎乘已停止。</p><button class="button primary" id="reload">重新載入</button></div>
  <dialog id="settings-dialog"><form id="settings-form"><header><div><p class="eyebrow">YOUR RIDE, YOUR RULES</p><h2>騎乘設定</h2></div><button type="button" id="close-settings" class="icon-button" aria-label="關閉設定">${icon('close')}</button></header>
    <section><h3>01 <span>找到你的舒適節奏</span></h3><p>以機台回報的飛輪 RPM 為準，與踏板轉速可能不同。</p><div class="field-row"><label>舒適轉速（RPM）<input id="reference" type="number" min="1" max="65535" step="1" required></label><button type="button" id="calibrate" class="button secondary">15 秒轉速校正</button></div><p id="calibration-status" class="small">校正時請由機台啟動並維持舒適踩踏；網頁不會代為啟動機台。</p></section>
    <section><h3>02 <span>機台阻力對應</span></h3><p>請填入這台機器已確認可用的原始值。可遞增或遞減；不將 0 當成零阻力。</p><div class="profile-fields"><label>輕阻力<input id="easy" type="number" min="1" max="65535" step="1" placeholder="未設定"></label><label>平路阻力<input id="flat" type="number" min="1" max="65535" step="1" placeholder="未設定"></label><label>重阻力<input id="hard" type="number" min="1" max="65535" step="1" placeholder="未設定"></label><label>每次最大幅度<input id="step" type="number" min="1" max="65535" step="1" placeholder="未設定"></label></div><p class="small">至多每秒調整一次，並等待機台確認。留空四欄可停用實機自動阻力。</p></section>
    <section><h3>03 <span>視聽體驗</span></h3><div class="field-row"><label>畫質<select id="quality"><option value="auto">自動調整</option><option value="high">高畫質</option><option value="low">省效能</option></select></label><label class="check"><input id="reduced" type="checkbox">減少動態效果</label></div></section>
    <section><h3>04 <span>我的騎行紀錄</span></h3><div id="history" class="history"></div><button id="clear-data" type="button" class="text-button">清除本機設定與紀錄</button><p class="small">僅保存在此瀏覽器；不保存卡號或心率歷史。</p></section><p id="settings-error" role="alert"></p><footer><button type="submit" class="button primary">儲存設定 ${icon('arrow')}</button></footer>
  </form></dialog>
  <footer class="site-footer" id="site-footer"><span>HUMAN POWERED. COSMIC INSPIRED.</span><span>EST. 2026 <i>✦</i> NEON REHAB RIDER</span></footer>
`;
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const input=(id:string)=>$<HTMLInputElement>(id);
const show=(id:string,visible:boolean)=>{$(id).hidden=!visible;};
const text=(id:string,value:string)=>{$(id).textContent=value;};
const fmt=(seconds:number)=>`${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);
const messages:Record<string,string>={controller_busy:'另一個頁面持有控制權，你可以選擇唯讀騎行。',stopping:'機台正在停止，稍候再開始。',machine_busy:'機台忙碌，請確認已停止後再試。',not_controller:'你目前沒有機台控制權。'};
let settings=loadSettings(),ride=new Ride(),source:Source|null=null,controlled=false,inRide=false,busy=false,operation=0,startGrace=0;
let saved=false,autoRequested=false,lastTime=performance.now(),lastUI=0,calibration:{at:number;values:number[];seq:number}|null=null;
let resistance:ResistanceController|null=null;
let halting:Promise<void>|null=null;
const audio=new RideAudio();audio.enabled=settings.sound;
let scene:NeonScene|null=null;
let graphicsFailed=false;
function notify(message:string){$('notice').querySelector('span')!.textContent=messages[message]||message;show('notice',true);}
$('notice').querySelector('button')!.onclick=()=>show('notice',false);
try { scene=new NeonScene($<HTMLCanvasElement>('world'),()=>{graphicsFailed=true;show('webgl-error',true);void pauseRide('3D 畫面已中斷，騎乘已暫停。');});scene.setOptions(settings.quality,settings.reducedMotion);scene.onQualityChange=()=>notify('已自動降低畫面負載，保持騎乘流暢。'); } catch { graphicsFailed=true;show('webgl-error',true); }
$('reload').onclick=()=>location.reload();
function syncSound(){audio.enabled=settings.sound;$('sound').setAttribute('aria-pressed',String(settings.sound));$('sound').setAttribute('aria-label',settings.sound?'關閉音效':'開啟音效');$('sound').classList.toggle('active',settings.sound);}
syncSound();
function profileForSource(){return source?.mode==='demo'?{easy:5,flat:10,hard:20,step:2}:settings.profile;}
function readyOptions(){const valid=validProfile(profileForSource());input('auto-resistance').disabled=!valid;input('auto-resistance').checked=autoRequested&&valid;text('profile-note',source?.mode==='demo'?'模擬阻力 5 → 10 → 20，不會控制實體裝置。':valid?'已填妥機台設定，勾選後才會送出自動阻力。':'請先至設定填妥機台阻力範圍。');}
function panel(title:string,description:string){text('panel-title',title);text('panel-description',description);show('ride-panel',true);}
function setConnected(){const connected=source?.connected;const el=$('connection');el.classList.toggle('is-connected',!!connected);el.querySelector('span')!.textContent=connected?(source?.mode==='demo'?'模擬裝置連線中':'單車已連線'):'單車尚未連線';}
function bindSource(next:Source){
  source=next;
  next.onState=(s)=>{
    if(next!==source)return;
    if(calibration&&s.state.seq!==calibration.seq){calibration.seq=s.state.seq;const rpm=readings(s,performance.now()).rpm;if(rpm!==null&&rpm>0)calibration.values.push(rpm);}
  };
  next.onDisconnect=(reason)=>{if(next!==source)return;setConnected();if(inRide&&!saved&&!ride.complete){void pauseRide(reason);show('begin',false);show('readonly',false);show('reconnect',true);}else notify(reason);};
  next.onError=notify;
}
async function connect(mode:'demo'|'ble'){
  if(busy||!scene||graphicsFailed)return;busy=true;$<HTMLButtonElement>('connect').disabled=true;$<HTMLButtonElement>('demo').disabled=true;
  try {
    if(source){source.onDisconnect=()=>{};source.disconnect();}
    bindSource(mode==='demo'?new Simulator():new RehabBleClient());
    await source!.connect();setConnected();ride=new Ride();ride.referenceRpm=settings.referenceRpm;saved=false;controlled=false;autoRequested=false;
    show('home',false);show('site-footer',false);show('ride-ui',true);show('ride-panel',true);show('quick-stop',true);show('demo-controls',mode==='demo');inRide=true;
    text('mode-label',mode==='demo'?'模擬體驗 · 人工資料':'實機連線 · 尚未取得控制權');text('panel-kicker','PREPARE FOR LAUNCH');
    show('result-metrics',false);show('ready-options',true);show('begin',true);show('readonly',mode==='ble');show('reconnect',false);text('begin','開始騎乘 →');
    panel('準備出發',mode==='demo'?'調整下方 RPM 滑桿，體驗用踩踏穿越星海。':'開始騎乘會取得控制權並啟動機台；也可由機台操作後選擇唯讀騎行。');readyOptions();
    if(source instanceof Simulator){source.rpm=settings.referenceRpm;input('demo-rpm').max=String(Math.max(140,settings.referenceRpm*2));input('demo-rpm').value=String(settings.referenceRpm);text('demo-rpm-value',String(settings.referenceRpm));}
    input('demo-grade').value='route';
  }catch(e){notify(errorText(e));}finally{busy=false;$<HTMLButtonElement>('connect').disabled=false;$<HTMLButtonElement>('demo').disabled=false;}
}
async function startRide(readOnly=false){
  if(busy||!source?.connected||!scene||graphicsFailed)return;busy=true;const op=++operation,src=source;
  try {
    if(halting)await halting;
    if(op!==operation||!src.connected)return;
    if(ride.status==='complete'){await leaveRide();return;}
    await audio.unlock();
    if(readOnly){
      if(readings(src.snapshot,performance.now()).rpm===null)throw new Error('尚未收到有效 RPM，請先由機台啟動。');
      if(hasControl(src.snapshot,performance.now())){await src.send('release');throw new Error('已釋放控制權。請由機台重新啟動後，再選擇唯讀騎行。');}
      controlled=false;
    }else{
      await src.send('claim');
      if(op!==operation){try{await src.send('stop');await src.send('release');}catch{src.disconnect();}return;}
      controlled=true;
      if(!src.snapshot?.state.machine.tracking)await src.send('start');
    }
    if(op!==operation)return;
    autoRequested=!readOnly&&input('auto-resistance').checked;
    resistance?.stop();resistance=new ResistanceController(profileForSource(),level=>src.send('set_resistance',{level}),reason=>{void pauseRide(reason);});
    if(autoRequested)resistance.enable();
    ride.referenceRpm=settings.referenceRpm;ride.start();startGrace=performance.now()+5000;
    text('mode-label',src.mode==='demo'?'模擬體驗 · 人工資料':controlled?'實機騎乘 · 已取得控制權':'唯讀騎行 · 由機台操作');show('ride-panel',false);audio.cue(330);
  }catch(e){
    if(op===operation){notify(errorText(e));if(controlled){try{await src.send('stop');await src.send('release');}catch{}controlled=false;} }
  }finally{busy=false;}
}
function stopHardware(release:boolean):Promise<void>{
  resistance?.stop();if(halting)return halting;
  const src=source,owned=controlled; if(release)controlled=false;
  halting=(async()=>{
    if(src?.connected&&owned){
      try{await src.send('stop');if(release)await src.send('release');}
      catch(e){notify('停止狀態尚未確認：'+errorText(e)+'。已斷開連線，請確認機台狀態。');src.disconnect();}
    }
  })().finally(()=>{halting=null;});
  return halting;
}
async function pauseRide(reason='已暫停。準備好後，繼續你的旅程。'){
  ++operation;ride.pause();resistance?.stop();
  if(!inRide)return;
  text('panel-kicker','TAKE A BREATHER');panel('暫停一下，星海等你',reason);show('ready-options',true);readyOptions();show('result-metrics',false);
  show('begin',!!source?.connected);show('readonly',source?.mode==='ble'&&!!source.connected);show('reconnect',!source?.connected);text('begin','繼續騎乘 →');
  await stopHardware(true);
}
function displayResult(){
  const summary=ride.summary(source?.mode||'demo');if(!saved&&summary.distance>0){saveSummary(summary);saved=true;}
  const results=$('result-metrics');results.replaceChildren();
  for(const [label,value] of [['虛擬里程',(summary.distance/1000).toFixed(2)+' km'],['踩踏時間',fmt(summary.seconds)],['總分',String(summary.score)],['最高連擊','×'+summary.maxCombo]]){const cell=document.createElement('div'),strong=document.createElement('strong'),span=document.createElement('span');strong.textContent=value;span.textContent=label;cell.append(strong,span);results.append(cell);}
  text('panel-kicker',summary.completed?'MISSION COMPLETE':'RIDE COMPLETE');panel(summary.completed?'星海，因你而亮。':'每一次踩踏，都算數。',summary.completed?'你已完成五公里星際旅程。把這份能量帶回生活。':'本次騎行已完成，成績保存在此瀏覽器。');
  show('result-metrics',true);show('ready-options',false);show('begin',false);show('readonly',false);show('reconnect',false);
}
async function finishRide(){++operation;ride.pause();displayResult();await stopHardware(true);}
async function leaveRide(){++operation;ride.pause();await stopHardware(true);if(source){source.onDisconnect=()=>{};source.disconnect();}source=null;controlled=false;inRide=false;resistance=null;setConnected();show('home',true);show('site-footer',true);show('ride-ui',false);show('ride-panel',false);show('quick-stop',false);calibration=null;}
$('connect').onclick=()=>void connect('ble');$('demo').onclick=()=>void connect('demo');$('begin').onclick=()=>void startRide();$('readonly').onclick=()=>void startRide(true);
$('pause').onclick=()=>void pauseRide();$('stop').onclick=()=>void finishRide();$('leave').onclick=()=>void leaveRide();
$('quick-stop').onclick=()=>void finishRide();
document.querySelector<HTMLAnchorElement>('.brand')!.onclick=e=>{e.preventDefault();if(inRide)void leaveRide();};
$('reconnect').onclick=async()=>{if(busy||!source)return;busy=true;try{await source.connect(true);setConnected();show('begin',true);show('readonly',source.mode==='ble');show('reconnect',false);text('panel-description','已重新連線。確認機台後按繼續，不會自動恢復運動。');}catch(e){notify(errorText(e));}finally{busy=false;}};
input('demo-rpm').oninput=()=>{if(source instanceof Simulator){source.rpm=Number(input('demo-rpm').value);text('demo-rpm-value',String(source.rpm));}};
$('demo-disconnect').onclick=()=>{if(source instanceof Simulator)source.disconnect();};
$('sound').onclick=async()=>{settings.sound=!settings.sound;syncSound();saveSettings(settings);await audio.unlock();audio.cue();};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{notify('此瀏覽器無法切換全螢幕。');}};

const dialog=$<HTMLDialogElement>('settings-dialog');
function fillSettings(){input('reference').value=String(settings.referenceRpm);for(const key of ['easy','flat','hard','step'] as const)input(key).value=settings.profile?String(settings.profile[key]):'';input('quality').value=settings.quality;input('reduced').checked=settings.reducedMotion;text('settings-error','');const list=$('history');list.replaceChildren();const items=history();if(!items.length)list.textContent='第一段星際旅程，等你開始。';for(const item of items){const row=document.createElement('div');row.className='history-row';const date=new Date(item.date);row.textContent=`${Number.isNaN(date.getTime())?'—':date.toLocaleDateString('zh-TW')}　${item.mode==='demo'?'模擬':'實機'}　${(item.distance/1000).toFixed(2)} km　${item.score} 分`;list.append(row);}}
$('settings').onclick=async()=>{if(ride.status==='running')await pauseRide('調整設定前，已暫停騎乘。');fillSettings();dialog.showModal();};
$('close-settings').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{if(calibration&&source instanceof Simulator&&source.connected)void source.send('stop');calibration=null;$<HTMLButtonElement>('calibrate').disabled=false;text('calibration-status','校正時請由機台啟動並維持舒適踩踏；網頁不會代為啟動機台。');});
$('settings-form').onsubmit=e=>{
  e.preventDefault();const referenceRpm=Number(input('reference').value);
  const values=['easy','flat','hard','step'].map(k=>input(k).value.trim());const profile=values.every(v=>!v)?null:{easy:Number(values[0]),flat:Number(values[1]),hard:Number(values[2]),step:Number(values[3])};
  if(!Number.isInteger(referenceRpm)||referenceRpm<1||referenceRpm>65535){text('settings-error','舒適轉速必須是 1–65535 的整數。');return;}
  if(profile&&!validProfile(profile)){text('settings-error','請填妥四個正整數；平路需介於輕與重之間，輕重不可相同，變化幅度不可大於範圍。');return;}
  settings={...settings,referenceRpm,profile,quality:input('quality').value as Settings['quality'],reducedMotion:input('reduced').checked};saveSettings(settings);scene?.setOptions(settings.quality,settings.reducedMotion);ride.referenceRpm=referenceRpm;readyOptions();dialog.close();notify('設定已儲存在此瀏覽器。');
};
$('calibrate').onclick=()=>{if(!source?.connected){text('calibration-status','請先連接單車，再開始校正。');return;}if(source instanceof Simulator)void source.send('start');calibration={at:performance.now(),values:[],seq:-1};$<HTMLButtonElement>('calibrate').disabled=true;};
$('clear-data').onclick=()=>{clearStorage();settings=loadSettings();autoRequested=false;resistance?.stop();scene?.setOptions(settings.quality,settings.reducedMotion);syncSound();fillSettings();readyOptions();notify('本機設定與騎行紀錄已清除。');};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&inRide&&ride.status==='running')void pauseRide('頁面已切至背景，騎乘已暫停。');});
window.addEventListener('pagehide',()=>{resistance?.stop();if(source?.connected){if(controlled)void source.send('stop').then(()=>source?.send('release')).catch(()=>{});source.disconnect();}});

function updateUI(now:number){
  const r=readings(source?.connected?source.snapshot:null,now),c=chapterAt(ride.distance),ch=CHAPTERS[c];
  text('chapter-label',`0${c+1} / ${ch.en}`);text('chapter-name',ch.name);text('distance',(ride.distance/1000).toFixed(2));$('progress').style.width=`${ride.distance/COURSE_LENGTH*100}%`;
  text('rpm',r.rpm===null?'—':String(Math.round(r.rpm)));text('bpm',r.bpm===null?'—':String(Math.round(r.bpm)));text('level',r.level===null?'—':String(r.level));text('speed',String(Math.round(ride.speed)));
  const grade=source instanceof Simulator&&input('demo-grade').value!=='route'?Number(input('demo-grade').value):gradeAt(ride.distance);
  text('grade',(grade>0?'+':'')+grade.toFixed(1));text('score',Math.floor(ride.score).toString().padStart(5,'0'));text('combo','×'+ride.combo);$('energy').style.width=ride.energy+'%';
  text('target-rpm',`舒適區間 ${Math.round(settings.referenceRpm*.8)}–${Math.round(settings.referenceRpm*1.2)} RPM`);
  text('mission-title',ride.energy>=100?'光軌全開，保持節奏':ride.combo>1?'很好，保持這個節奏':'跟上自己的節奏');text('elapsed',fmt(ride.seconds));
  const m=source?.snapshot?.state.machine;text('resistance-detail',resistance?.enabled?`自動阻力 · 目標 ${resistance.target??'—'} / 已送 ${m?.sent_level??'—'} / 回報 ${r.level??'—'}`:controlled?'自動阻力未啟用 · 機台阻力由你設定':'唯讀資料 · 不送出阻力命令');
}
function frame(now:number){
  const dt=Math.min((now-lastTime)/1000,.25);lastTime=now;
  const r=readings(source?.connected?source.snapshot:null,now);
  if(inRide&&ride.status==='running'){
    const snapshot=source?.snapshot;
    if(!source?.connected)void pauseRide('連線已中斷。');
    else if(controlled&&now>startGrace&&(!hasControl(snapshot??null,now)||r.rpm===null||r.level===null||!snapshot?.state.machine.tracking))void pauseRide('機台遙測、運轉狀態或控制權失效，騎乘已暫停。');
    else if(!controlled&&r.rpm===null)void pauseRide('轉速資料已過期，請確認機台連線。');
    else {
      ride.tick(dt,r.rpm);
      const grade=source instanceof Simulator&&input('demo-grade').value!=='route'?Number(input('demo-grade').value):gradeAt(ride.distance);
      if(controlled&&snapshot?.state.machine.tracking&&r.rpm!==null&&r.level!==null)resistance?.tick(grade,snapshot,now);
      if(ride.complete){displayResult();audio.cue(880);void stopHardware(true);}
    }
  }
  if(calibration){const left=Math.max(0,15-(now-calibration.at)/1000);text('calibration-status',`維持舒適踩踏，還有 ${Math.ceil(left)} 秒 · ${calibration.values.length} 筆有效轉速`);if(!left){const value=median(calibration.values);if(value){input('reference').value=String(value);text('calibration-status',`校正完成：${value} RPM，按儲存設定套用。`);}else text('calibration-status','沒有收到非零有效 RPM，請確認機台正在回報並重試。');calibration=null;if(source instanceof Simulator)void source.send('stop');$<HTMLButtonElement>('calibrate').disabled=false;}}
  audio.update(ride.combo);
  if(!graphicsFailed)try{scene?.render(dt,ride.distance,inRide&&ride.status==='running'?(r.rpm??0):0,ride.speed,ride.energy,!inRide,ride.status==='complete');}catch{graphicsFailed=true;show('webgl-error',true);void pauseRide('3D 畫面發生錯誤，騎乘已暫停。');}
  if(now-lastUI>100){updateUI(now);lastUI=now;}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
