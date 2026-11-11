(()=>{"use strict";(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,81598,e=>{var t=e.i(43476),r=e.i(71645);let n=[{name:"__init__.py",at:[-.5,.06]},{name:"serializer.py",at:[0,.22],hub:!0},{name:"signer.py",at:[.46,.02]},{name:"encoding.py",at:[-.2,-.3]},{name:"timed.py",at:[.32,-.36]},{name:"exc.py",at:[.02,-.06]}],o=[[0,1],[1,2],[1,3],[1,5],[4,2],[4,5],[2,5]],a=`
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uCam;
uniform float uScale;
uniform vec2 uMouse;
uniform float uGlow;
uniform vec4 uRip[10];
uniform vec3 uSplash[3];
uniform vec3 uNode[6];
uniform vec4 uEdge[7];
const float PI = 3.14159265;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * noise(p);
    p = p * 2.03 + vec2(17.3, 9.1);
    a *= 0.5;
  }
  return s;
}

// Height of the water: slow swell, a ring per pointer ripple, a train per click.
float surface(vec2 p) {
  float h = 0.6 * (noise(p * 4.0 + vec2(uTime * 0.22, uTime * 0.17))
                 + noise(p * 7.0 - vec2(uTime * 0.15, -uTime * 0.2)));
  for (int i = 0; i < 10; i++) {
    vec4 r = uRip[i];
    float age = uTime - r.z;
    if (age > 0.0 && age < 5.0) {
      float d = length(p - r.xy);
      float w = d - age * 0.32;
      h += r.w * cos(w * 55.0) * exp(-w * w * 220.0) * exp(-age * 1.1) / (1.0 + d * 2.0);
    }
  }
  for (int i = 0; i < 3; i++) {
    vec3 s = uSplash[i];
    float age = uTime - s.z;
    if (age > 0.0 && age < 7.0) {
      float d = length(p - s.xy);
      float w = d - age * 0.5;
      h += 1.7 * cos(w * 30.0) * exp(-w * w * 26.0) * smoothstep(0.0, 0.08, age) * exp(-age * 0.55) / (1.0 + d * 1.1);
      h -= 1.2 * exp(-d * d * 260.0) * exp(-age * 5.0);
    }
  }
  return h;
}

float caustic(vec2 uv) {
  vec2 p = mod(uv * 6.2831853, 6.2831853) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float t = uTime * 0.5 + 23.0;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - 3.5 / float(n + 1));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / 0.005), p.y / (cos(i.y + tt) / 0.005)));
  }
  c = 1.17 - pow(c / 4.0, 1.4);
  return pow(abs(c), 8.0);
}

float fill(float d, float w, float aa) {
  return 1.0 - smoothstep(w - aa, w + aa, d);
}
float seg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

// The graph: a pool for each file, a channel for each import.
float inlay(vec2 q, float aa) {
  float c = 0.0;
  for (int i = 0; i < 7; i++) c = max(c, fill(seg(q, uEdge[i].xy, uEdge[i].zw), 0.0065, aa));
  for (int i = 0; i < 6; i++) {
    float d = length(q - uNode[i].xy);
    float r = uNode[i].z;
    // the hub is a ring with an island in it; the rest are plain pools
    c = max(c, r > 0.07 ? fill(abs(d - r + 0.018), 0.018, aa) : fill(d, r, aa));
  }
  return clamp(c, 0.0, 1.0);
}

vec3 marble(vec2 q) {
  vec2 w = q * 1.7 + vec2(3.7, 1.3);
  float n = fbm(w + 1.8 * vec2(fbm(w + vec2(1.7, 9.2)), fbm(w + vec2(8.3, 2.8))));
  float strength = smoothstep(0.35, 0.75, fbm(w * 0.6 + 11.0));
  float v = abs(sin((w.x * 0.9 + w.y * 1.6 + n * 4.2) * 1.7));
  float vein = (1.0 - smoothstep(0.0, 0.10, v)) * (0.35 + 0.65 * strength);
  float fine = (1.0 - smoothstep(0.0, 0.05, abs(sin((w.x * 2.3 - w.y * 1.1 + n * 7.0) * 2.3)))) * 0.25 * strength;
  vec3 col = mix(vec3(0.972, 0.970, 0.960), vec3(0.915, 0.922, 0.925), smoothstep(0.3, 0.8, n));
  return mix(col, vec3(0.70, 0.735, 0.76), clamp(vein * 0.6 + fine, 0.0, 1.0));
}

vec3 floorColour(vec2 q, float aa) {
  vec3 col = marble(q);
  float r = length(q);
  float a = atan(q.y, q.x);
  float hair = aa * 1.5;

  // Engraved chart grid and a slowly turning dial around the graph.
  vec2 g1 = abs(fract(q / 0.25 - 0.5) - 0.5) * 0.25;
  float e = (1.0 - smoothstep(0.0, hair, min(g1.x, g1.y))) * 0.28;
  e += 1.0 - smoothstep(0.0, hair, abs(r - 0.70));
  e += 1.0 - smoothstep(0.0, hair, abs(r - 0.735));
  float f1 = fract((a + uTime * 0.03) / (2.0 * PI) * 180.0);
  e += (1.0 - smoothstep(0.08, 0.16, min(f1, 1.0 - f1))) * (smoothstep(0.70 - aa, 0.70 + aa, r) - smoothstep(0.735 - aa, 0.735 + aa, r));
  float f3 = fract((a - uTime * 0.02) / (2.0 * PI) * 72.0);
  e += step(0.5, f3) * (1.0 - smoothstep(0.0, hair, abs(r - 0.83))) * 0.8;
  col = mix(col, vec3(0.52, 0.59, 0.68), clamp(e, 0.0, 1.0) * 0.5);

  // Channels with a shadowed and a lit wall, so they read as cut into the stone.
  vec2 light = vec2(-0.006, 0.008);
  float c = inlay(q, aa);
  float shadow = c * (1.0 - inlay(q + light, aa));
  float lit = c * (1.0 - inlay(q - light, aa));
  vec3 water = mix(vec3(0.36, 0.70, 0.88), vec3(0.16, 0.38, 0.86),
                   smoothstep(0.2, 0.75, fbm(q * 3.0 + uTime * 0.05)));
  col = mix(col, water, c * 0.86);
  col = mix(col, vec3(0.07, 0.20, 0.55), shadow * 0.55);
  col += lit * 0.16;
  return col;
}

void main() {
  float m = min(uRes.x, uRes.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / m;
  vec2 p = uv / uScale + uCam;
  float aa = 1.5 / m / uScale;

  float eps = 0.004 / uScale;
  float h = surface(p);
  float hx1 = surface(p + vec2(eps, 0.0));
  float hx0 = surface(p - vec2(eps, 0.0));
  float hy1 = surface(p + vec2(0.0, eps));
  float hy0 = surface(p - vec2(0.0, eps));
  vec2 g = vec2(hx1 - hx0, hy1 - hy0) / 0.008;
  float lap = (hx1 + hx0 + hy1 + hy0 - 4.0 * h) / 0.000016;

  vec2 q = p + g * 0.0009 / uScale;
  vec3 col = floorColour(q, aa) * vec3(0.905, 0.955, 0.985);

  col += vec3(0.80, 0.95, 1.0) * caustic(q * 2.2 + g * 0.004) * 0.17;
  col += vec3(0.85, 0.95, 1.0) * clamp(-lap * 0.00022, -0.5, 1.4) * 0.11;
  col += clamp(dot(g, vec2(-0.7, 0.7)), -40.0, 40.0) * 0.0016;
  vec3 nrm = normalize(vec3(-g * 0.02, 1.0));
  col += pow(max(dot(nrm, vec3(-0.28, 0.34, 0.90)), 0.0), 140.0) * 0.5;
  float dm = length(p - uMouse) * uScale;
  col += vec3(0.55, 0.75, 1.0) * exp(-dm * dm * 14.0) * 0.07 * uGlow;

  col *= vec3(0.975, 0.992, 1.0);
  gl_FragColor = vec4(col, 1.0);
}`;e.s(["WaterChart",0,function(){let e=(0,r.useRef)(null),i=(0,r.useRef)(null),l=(0,r.useRef)([]);return(0,r.useEffect)(()=>{let t,r=e.current?.parentElement,c=i.current;if(!r||!c)return;let u=c.getContext("webgl",{antialias:!1,alpha:!1});if(!u)return void e.current?.classList.add("no-gl");let f=window.matchMedia("(prefers-reduced-motion: reduce)").matches,s=(e,t)=>{let r=u.createShader(e);if(u.shaderSource(r,t),u.compileShader(r),!u.getShaderParameter(r,u.COMPILE_STATUS))throw Error(u.getShaderInfoLog(r)||"shader");return r};try{if(t=u.createProgram(),u.attachShader(t,s(u.VERTEX_SHADER,"attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}")),u.attachShader(t,s(u.FRAGMENT_SHADER,a)),u.linkProgram(t),!u.getProgramParameter(t,u.LINK_STATUS))throw Error("link")}catch{e.current?.classList.add("no-gl");return}u.useProgram(t),u.bindBuffer(u.ARRAY_BUFFER,u.createBuffer()),u.bufferData(u.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),u.STATIC_DRAW);let p=u.getAttribLocation(t,"a");u.enableVertexAttribArray(p),u.vertexAttribPointer(p,2,u.FLOAT,!1,0,0),u.uniform3fv(u.getUniformLocation(t,"uNode"),new Float32Array(n.flatMap(e=>[...e.at,e.hub?.085:.05]))),u.uniform4fv(u.getUniformLocation(t,"uEdge"),new Float32Array(o.flatMap(([e,t])=>[...n[e].at,...n[t].at])));let h=new Float32Array(40).fill(-100),d=new Float32Array(9).fill(-100),m=0,v=0,g=[0,0],y=1,w=[0,0],b=0,x={x:0,y:0,glow:0},E=[0,0,-1],S=performance.now(),P=()=>f?0:(performance.now()-S)/1e3,T=1,L=1,R=(e,t)=>{let r=Math.min(T,L);return[g[0]+(e-T/2)/r/y,g[1]+(L/2-t)/r/y]};function _(){T=r.clientWidth,L=r.clientHeight;let e=Math.min(window.devicePixelRatio||1,1.5,Math.sqrt(22e5/(T*L)));c.width=Math.max(1,Math.round(T*e)),c.height=Math.max(1,Math.round(L*e)),u.viewport(0,0,c.width,c.height);let t=T/L;g=t>1.15?[-(.5*t-.47)/(y=.56),0]:[0,-(.5/t-.46)/(y=.6)],n.forEach((e,t)=>{var r,n;let o,a=l.current[t];if(!a)return;let[i,c]=(r=e.at[0],n=e.at[1]-(e.hub?.085:.05)-.03,o=Math.min(T,L),[T/2+(r-g[0])*y*o,L/2-(n-g[1])*y*o]);a.style.transform=`translate(${i.toFixed(1)}px, ${c.toFixed(1)}px) translateX(-50%)`}),f&&F()}function A(e,t,r){f||(h.set([e,t,P(),r],4*m),m=(m+1)%10)}let C=e=>{let t=r.getBoundingClientRect(),[n,o]=R(e.clientX-t.left,e.clientY-t.top);w=[n,o],b=1;let a=P();(Math.hypot(n-E[0],o-E[1])>.07||a-E[2]>.35)&&(A(n,o,.42),E=[n,o,a])},M=e=>{if(f||e.target.closest("a, button"))return;let t=r.getBoundingClientRect();d.set([...R(e.clientX-t.left,e.clientY-t.top),P()],3*v),v=(v+1)%3},U=()=>b=0;function F(){let e=P();if(!f&&e-E[2]>1.8){let[t,r]=R(Math.random()*T,Math.random()*L);A(t,r,.3),E[2]=e-.4}x.x+=(w[0]-x.x)*.18,x.y+=(w[1]-x.y)*.18,x.glow+=(b-x.glow)*.06,u.uniform2f(u.getUniformLocation(t,"uRes"),c.width,c.height),u.uniform1f(u.getUniformLocation(t,"uTime"),e),u.uniform2f(u.getUniformLocation(t,"uCam"),g[0],g[1]),u.uniform1f(u.getUniformLocation(t,"uScale"),y),u.uniform2f(u.getUniformLocation(t,"uMouse"),x.x,x.y),u.uniform1f(u.getUniformLocation(t,"uGlow"),x.glow),u.uniform4fv(u.getUniformLocation(t,"uRip"),h),u.uniform3fv(u.getUniformLocation(t,"uSplash"),d),u.drawArrays(u.TRIANGLES,0,3)}r.addEventListener("pointermove",C),r.addEventListener("pointerdown",M),r.addEventListener("pointerleave",U);let N=0,I=!0,O=()=>{I&&F(),N=requestAnimationFrame(O)},j=new IntersectionObserver(([e])=>I=e.isIntersecting);return j.observe(r),window.addEventListener("resize",_),_(),f||(N=requestAnimationFrame(O)),()=>{cancelAnimationFrame(N),j.disconnect(),window.removeEventListener("resize",_),r.removeEventListener("pointermove",C),r.removeEventListener("pointerdown",M),r.removeEventListener("pointerleave",U)}},[]),(0,t.jsxs)("div",{className:"water-chart",ref:e,"aria-hidden":"true",children:[(0,t.jsx)("canvas",{ref:i}),n.map((e,r)=>(0,t.jsx)("span",{className:e.hub?"water-label is-hub":"water-label",ref:e=>{l.current[r]=e},children:e.name},e.name))]})}])},22016,(e,t,r)=>{e.i(47167),Object.defineProperty(r,"__esModule",{value:!0});var n={default:function(){return g},useLinkStatus:function(){return w}};for(var o in n)Object.defineProperty(r,o,{enumerable:!0,get:n[o]});let a=e.r(90809),i=e.r(43476),l=a._(e.r(71645)),c=e.r(95057),u=e.r(8372),f=e.r(18581),s=e.r(18967),p=e.r(5550),h=e.r(88540),d=e.r(91949),m=e.r(73668),v=e.r(9396);function g(t){var r;let n,o,a,[g,w]=(0,l.useOptimistic)(d.IDLE_LINK_STATUS),b=(0,l.useRef)(null),{href:x,as:E,children:S,prefetch:P=null,passHref:T,replace:L,shallow:R,scroll:_,onClick:A,onMouseEnter:C,onTouchStart:M,legacyBehavior:U=!1,onNavigate:F,transitionTypes:N,ref:I,unstable_dynamicOnHover:O,...j}=t;n=S,U&&("string"==typeof n||"number"==typeof n)&&(n=(0,i.jsx)("a",{children:n}));let q=l.default.useContext(u.AppRouterContext),$=!1!==P,k=!1===P?"none":!0===P?"full":"auto",B="none"!==k?"auto"===k?v.FetchStrategy.PPR:v.FetchStrategy.Full:v.FetchStrategy.PPR,z="string"==typeof(r=E||x)?r:(0,c.formatUrl)(r);if(U){if(n?.$$typeof===Symbol.for("react.lazy"))throw Error("`<Link legacyBehavior>` received a direct child that is either a Server Component, or JSX that was loaded with React.lazy(). This is not supported. Either remove legacyBehavior, or make the direct child a Client Component that renders the Link's `<a>` tag.");o=l.default.Children.only(n)}let D=U?o&&"object"==typeof o&&o.ref:I,K,G=l.default.useCallback(e=>(null!==q&&(b.current=(0,d.mountLinkInstance)(e,z,q,B,$,w,K)),()=>{b.current&&((0,d.unmountLinkForCurrentNavigation)(b.current),b.current=null),(0,d.unmountPrefetchableInstance)(e)}),[$,z,q,B,w,K]),H={ref:(0,f.useMergedRef)(G,D),onClick(t){U||"function"!=typeof A||A(t),U&&o.props&&"function"==typeof o.props.onClick&&o.props.onClick(t),!q||t.defaultPrevented||function(t,r,n,o,a,i,l,c="none"){if("u">typeof window){let u,{nodeName:f}=t.currentTarget;if("A"===f.toUpperCase()&&((u=t.currentTarget.getAttribute("target"))&&"_self"!==u||t.metaKey||t.ctrlKey||t.shiftKey||t.altKey||t.nativeEvent&&2===t.nativeEvent.which)||t.currentTarget.hasAttribute("download"))return;if(!(0,m.isLocalURL)(r)){o&&(t.preventDefault(),location.replace(r));return}if(t.preventDefault(),i){let e=!1;if(i({preventDefault:()=>{e=!0}}),e)return}let{navigate:s}=e.r(32916);s(r,o?"replace":"push",!1===a?h.ScrollBehavior.NoScroll:h.ScrollBehavior.Default,n.current,l,c)}}(t,z,b,L,_,F,N,k)},onMouseEnter(e){U||"function"!=typeof C||C(e),U&&o.props&&"function"==typeof o.props.onMouseEnter&&o.props.onMouseEnter(e),q&&$&&(0,d.onNavigationIntent)(e.currentTarget,!0===O)},onTouchStart:function(e){U||"function"!=typeof M||M(e),U&&o.props&&"function"==typeof o.props.onTouchStart&&o.props.onTouchStart(e),q&&$&&(0,d.onNavigationIntent)(e.currentTarget,!0===O)}};return(0,s.isAbsoluteUrl)(z)?H.href=z:U&&!T&&("a"!==o.type||"href"in o.props)||(H.href=(0,p.addBasePath)(z)),a=U?l.default.cloneElement(o,H):(0,i.jsx)("a",{...j,...H,children:n}),(0,i.jsx)(y.Provider,{value:g,children:a})}let y=(0,l.createContext)(d.IDLE_LINK_STATUS),w=()=>(0,l.useContext)(y);("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},18581,(e,t,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"useMergedRef",{enumerable:!0,get:function(){return o}});let n=e.r(71645);function o(e,t){let r=(0,n.useRef)(null),o=(0,n.useRef)(null);return(0,n.useCallback)(n=>{if(null===n){let e=r.current;e&&(r.current=null,e());let t=o.current;t&&(o.current=null,t())}else e&&(r.current=a(e,n)),t&&(o.current=a(t,n))},[e,t])}function a(e,t){if("function"!=typeof e)return e.current=t,()=>{e.current=null};{let r=e(t);return"function"==typeof r?r:()=>e(null)}}("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},95057,(e,t,r)=>{e.i(47167),Object.defineProperty(r,"__esModule",{value:!0});var n={formatUrl:function(){return l},formatWithValidation:function(){return u},urlObjectKeys:function(){return c}};for(var o in n)Object.defineProperty(r,o,{enumerable:!0,get:n[o]});let a=e.r(90809)._(e.r(98183)),i=/https?|ftp|gopher|file/;function l(e){let{auth:t,hostname:r}=e,n=e.protocol||"",o=e.pathname||"",l=e.hash||"",c=e.query||"",u=!1;t=t?encodeURIComponent(t).replace(/%3A/i,":")+"@":"",e.host?u=t+e.host:r&&(u=t+(~r.indexOf(":")?`[${r}]`:r),e.port&&(u+=":"+e.port)),c&&"object"==typeof c&&(c=String(a.urlQueryToSearchParams(c)));let f=e.search||c&&`?${c}`||"";return n&&!n.endsWith(":")&&(n+=":"),e.slashes||(!n||i.test(n))&&!1!==u?(u="//"+(u||""),o&&"/"!==o[0]&&(o="/"+o)):u||(u=""),l&&"#"!==l[0]&&(l="#"+l),f&&"?"!==f[0]&&(f="?"+f),o=o.replace(/[?#]/g,encodeURIComponent),f=f.replace("#","%23"),`${n}${u}${o}${f}${l}`}let c=["auth","hash","host","hostname","href","path","pathname","port","protocol","query","search","slashes"];function u(e){return l(e)}},73668,(e,t,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"isLocalURL",{enumerable:!0,get:function(){return a}});let n=e.r(18967),o=e.r(52817);function a(e){if(!(0,n.isAbsoluteUrl)(e))return!0;try{let t=(0,n.getLocationOrigin)(),r=new URL(e,t);return r.origin===t&&(0,o.hasBasePath)(r.pathname)}catch(e){return!1}}},18967,(e,t,r)=>{e.i(47167),Object.defineProperty(r,"__esModule",{value:!0});var n={DecodeError:function(){return g},MiddlewareNotFoundError:function(){return x},MissingStaticPage:function(){return b},NormalizeError:function(){return y},PageNotFoundError:function(){return w},SP:function(){return m},ST:function(){return v},WEB_VITALS:function(){return a},execOnce:function(){return i},getDisplayName:function(){return s},getLocationOrigin:function(){return u},getURL:function(){return f},isAbsoluteUrl:function(){return c},isResSent:function(){return p},loadGetInitialProps:function(){return d},normalizeRepeatedSlashes:function(){return h},stringifyError:function(){return E}};for(var o in n)Object.defineProperty(r,o,{enumerable:!0,get:n[o]});let a=["CLS","FCP","INP","LCP","TTFB"];function i(e){let t,r=!1;return(...n)=>(r||(r=!0,t=e(...n)),t)}let l=/^[a-zA-Z][a-zA-Z\d+\-.]*?:/,c=e=>{let t=e.charCodeAt(0);return!!(t>=65&&t<=90||t>=97&&t<=122)&&l.test(e)};function u(){let{protocol:e,hostname:t,port:r}=window.location;return`${e}//${t}${r?":"+r:""}`}function f(){let{href:e}=window.location,t=u();return e.substring(t.length)}function s(e){return"string"==typeof e?e:e.displayName||e.name||"Unknown"}function p(e){return e.finished||e.headersSent}function h(e){let t=e.split("?");return t[0].replace(/\\/g,"/").replace(/\/\/+/g,"/")+(t[1]?`?${t.slice(1).join("?")}`:"")}async function d(e,t){let r=t.res||t.ctx&&t.ctx.res;if(!e.getInitialProps)return t.ctx&&t.Component?{pageProps:await d(t.Component,t.ctx)}:{};let n=await e.getInitialProps(t);if(r&&p(r))return n;if(!n)throw Error(`"${s(e)}.getInitialProps()" should resolve to an object. But found "${n}" instead.`);return n}let m="u">typeof performance,v=m&&["mark","measure","getEntriesByName"].every(e=>"function"==typeof performance[e]);class g extends Error{}class y extends Error{}class w extends Error{constructor(e){super(),this.code="ENOENT",this.name="PageNotFoundError",this.message=`Cannot find module for page: ${e}`}}class b extends Error{constructor(e,t){super(),this.message=`Failed to load static file for page: ${e} ${t}`}}class x extends Error{constructor(){super(),this.code="ENOENT",this.message="Cannot find the middleware module"}}function E(e){return JSON.stringify({message:e.message,stack:e.stack})}}])})();