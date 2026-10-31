export class RideAudio {
  enabled=false;
  private context?:AudioContext;
  private lastCombo=1;
  async unlock(){if(!this.context)this.context=new AudioContext();if(this.context.state==='suspended')await this.context.resume();}
  cue(frequency=440){if(!this.enabled||!this.context||this.context.state!=='running')return;const ctx=this.context,osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.setValueAtTime(frequency,ctx.currentTime);osc.frequency.exponentialRampToValueAtTime(frequency*1.5,ctx.currentTime+.18);gain.gain.setValueAtTime(.0001,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.07,ctx.currentTime+.015);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.4);osc.connect(gain).connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.42);}
  update(combo:number){if(combo>this.lastCombo)this.cue(220+combo*100);this.lastCombo=combo;}
}
