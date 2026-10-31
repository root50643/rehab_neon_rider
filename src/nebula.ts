import * as T from 'three';
// Low-frequency, procedural sky; no remote texture or asset download.
export function createNebula() {
  return new T.Mesh(new T.SphereGeometry(450,24,16),new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,fog:false,
    uniforms:{time:{value:0},strength:{value:1}},
    vertexShader:`varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`
      varying vec3 direction; uniform float time; uniform float strength;
      float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      void main(){vec3 d=normalize(direction);vec3 p=d*3.+vec3(time*.003,0,0);float n=noise(p)*.55+noise(p*2.)*.28+noise(p*4.)*.17;float band=exp(-pow((d.y-.25+sin(d.x*4.)*.15)*3.8,2.));float cloud=smoothstep(.35,.82,n)*band;vec3 color=mix(vec3(.006,.018,.025),mix(vec3(.025,.14,.17),vec3(.13,.055,.12),noise(p+4.))*cloud,strength);gl_FragColor=vec4(color,1.);}
    `,
  }));
}
