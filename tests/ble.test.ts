import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {RehabBleClient} from '../src/ble';
import * as P from '../src/vendor/protocol.js';
import {snapshot} from './fixtures';

function mockBle(){
 const writes:Array<{cmd:string;id:number;level?:number}>=[],chars=new Map<string,Characteristic>();let owner=false,seq=0,infoVersion=1,hold:Promise<void>|null=null,releaseHold=()=>{},held=false,refuseClaim=false;
 const emit=(kind:'state'|'response'|'event',value:unknown)=>{const ch=chars.get(P.UUID[kind]);if(!ch)return;for(const f of P.chunkPayload(P.encodeJson(value),20,++seq,P.CHANNEL[kind])){ch.value=new DataView(f.buffer);ch.dispatchEvent(new Event('characteristicvaluechanged'));}};
 const lease=()=>({owner:owner?1:null,you_control:owner,remaining_ms:owner?30000:0,stopping:false});
 const state=()=>{const s=snapshot(performance.now()).state;s.seq=++seq;s.lease=lease();emit('state',s);};
 class Characteristic extends EventTarget {
  value?:DataView;
  assembler=new P.FrameReassembler(3,1024);
  async readValue(){return new DataView(P.encodeJson({v:infoVersion,protocol:infoVersion}).buffer);}
  async startNotifications(){return this;}
  async writeValueWithResponse(frame:Uint8Array){
   if(hold){const current=hold;hold=null;held=true;await current;}
   const data=this.assembler.push(frame);if(!data)return;const cmd=P.decodeJson(data);writes.push(cmd);
   if(cmd.cmd==='claim'&&!refuseClaim)owner=true;if(cmd.cmd==='release')owner=false;
   queueMicrotask(()=>{emit('response',{v:1,type:'response',id:cmd.id,cmd:cmd.cmd,ok:!(cmd.cmd==='claim'&&refuseClaim),error:'controller_busy',lease:lease()});if(cmd.cmd==='get_state')state();});
  }
 }
 const device=new EventTarget() as EventTarget & {name:string;gatt:any};device.name='Test Rehab';
 device.gatt={connected:false,async connect(){this.connected=true;chars.clear();return{getPrimaryService:async()=>({getCharacteristic:async(uuid:string)=>{if(!chars.has(uuid))chars.set(uuid,new Characteristic());return chars.get(uuid)!;}})};},disconnect(){this.connected=false;owner=false;device.dispatchEvent(new Event('gattserverdisconnected'));}};
 vi.stubGlobal('isSecureContext',true);vi.stubGlobal('navigator',{bluetooth:{requestDevice:async()=>device}});
 return {writes,emit,state,device,get held(){return held;},setVersion(v:number){infoVersion=v;},setBusy(){refuseClaim=true;},holdNext(){hold=new Promise(r=>{releaseHold=r;});},release(){releaseHold();}};
}
describe('BLE client lifecycle and write isolation',()=>{
 let client:RehabBleClient;
 beforeEach(()=>{client=new RehabBleClient();});afterEach(()=>{client.disconnect();vi.unstubAllGlobals();vi.useRealTimers();});
 it('connects read-only, subscribes, accepts a claim and strips unused fields',async()=>{const mock=mockBle();await client.connect();expect(client.connected).toBe(true);expect(client.snapshot!.state.lease.you_control).toBe(false);expect(mock.writes.map(v=>v.cmd)).toEqual(['get_state']);await client.send('claim');expect(client.snapshot!.state.lease.you_control).toBe(true);});
 it('rejects incompatible INFO before issuing commands',async()=>{const mock=mockBle();mock.setVersion(2);await expect(client.connect()).rejects.toThrow('協定版本');expect(client.connected).toBe(false);expect(mock.writes).toHaveLength(0);});
 it('surfaces controller conflicts without granting ownership',async()=>{const mock=mockBle();mock.setBusy();await client.connect();await expect(client.send('claim')).rejects.toThrow('controller_busy');expect(client.snapshot!.state.lease.you_control).toBe(false);});
 it('finishes an active fragmented command then prioritizes Stop, cancelling queued controls',async()=>{const mock=mockBle();await client.connect();await client.send('claim');mock.holdNext();const first=client.send('set_resistance',{level:11});await vi.waitFor(()=>expect(mock.held).toBe(true));const cancelled=client.send('start').catch(e=>e);const second=client.send('set_resistance',{level:12}).catch(e=>e);const stop=client.send('stop');mock.release();await first;await stop;expect(await cancelled).toBeInstanceOf(Error);expect(await second).toBeInstanceOf(Error);expect(mock.writes.map(v=>v.cmd)).toEqual(['get_state','claim','set_resistance','stop']);expect(mock.writes.map(v=>v.id)).toEqual([1,2,3,4]);});
 it('does not replay old writes across reconnects',async()=>{const mock=mockBle();await client.connect();mock.holdNext();const old=client.send('start').catch(e=>e);await vi.waitFor(()=>expect(mock.held).toBe(true));client.disconnect();await client.connect(true);mock.release();await old;await client.send('claim');expect(mock.writes.map(v=>v.cmd)).toEqual(['get_state','get_state','claim']);expect(client.connected).toBe(true);});
 it('sends heartbeat at ten seconds and cancels it on disconnect',async()=>{vi.useFakeTimers();const mock=mockBle();await client.connect();await client.send('claim');await vi.advanceTimersByTimeAsync(10000);expect(mock.writes.at(-1)?.cmd).toBe('heartbeat');client.disconnect();const count=mock.writes.length;await vi.advanceTimersByTimeAsync(30000);expect(mock.writes).toHaveLength(count);});
 it('invalidates the session after a stalled fragmented write',async()=>{vi.useFakeTimers();const mock=mockBle();await client.connect();mock.holdNext();const failed=client.send('start').catch(e=>e);await vi.advanceTimersByTimeAsync(1901);expect(await failed).toBeInstanceOf(Error);expect(client.connected).toBe(false);mock.release();await Promise.resolve();expect(mock.writes.some(v=>v.cmd==='start')).toBe(false);});
 it('rejects unsupported browser contexts',async()=>{vi.stubGlobal('isSecureContext',false);await expect(client.connect()).rejects.toThrow('HTTPS');});
});
