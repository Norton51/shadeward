import * as THREE from 'three';

const DEG = Math.PI / 180;

export class CabinScene {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 5000);
    this.camera.position.set(0, 1.2, 0);
    this.camera.lookAt(2, 1.2, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    this._buildSky();
    this._buildCabin();
    this._buildSun();
    this._buildGround();

    this.viewSide = 'right';

    this._onResize();
    window.addEventListener('resize', () => this._onResize());

    this._animate();
  }

  _buildSky() {
    const skyGeo = new THREE.SphereGeometry(1000, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunElev: { value: 0.5 },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPos;
        uniform vec3 sunDir;
        uniform float sunElev;

        float hash(vec3 p) {
          p = fract(p * vec3(127.1, 311.7, 74.7));
          p += dot(p, p.yzx + 19.19);
          return fract((p.x + p.y) * p.z);
        }

        void main() {
          vec3 dir = normalize(vWorldPos);
          float h = dir.y;

          float dayF      = smoothstep(-0.12, 0.18, sunElev);
          float twilightF = smoothstep(-0.18, 0.0, sunElev) * (1.0 - smoothstep(0.0, 0.30, sunElev));

          // Rayleigh-like gradient
          float scatter = pow(clamp(1.0 - h, 0.0, 1.0), 2.0);
          vec3 dayZenith  = vec3(0.10, 0.33, 0.80);
          vec3 dayHorizon = vec3(0.55, 0.75, 0.95);
          vec3 daySky = mix(dayZenith, dayHorizon, scatter);

          // Mie halo
          float sunDot    = dot(dir, normalize(sunDir));
          float mieNarrow = pow(max(sunDot, 0.0), 64.0) * 0.7;
          float mieWide   = pow(max(sunDot, 0.0),  5.0) * 0.12;
          daySky += vec3(0.95, 0.90, 0.75) * (mieNarrow + mieWide) * dayF;

          // Horizon sunset / twilight glow
          float horizonBand = smoothstep(0.25, -0.05, abs(h));
          float sunSide  = pow(max( sunDot, 0.0), 5.0);
          float antiSide = pow(max(-sunDot, 0.0), 3.0);
          daySky = mix(daySky, vec3(1.0, 0.35, 0.05), horizonBand * sunSide  * twilightF * 1.0);
          daySky = mix(daySky, vec3(0.95, 0.25, 0.45), horizonBand * sunSide  * twilightF * 0.4);
          daySky = mix(daySky, vec3(0.30, 0.18, 0.50), horizonBand * antiSide * twilightF * 0.5);

          // Night sky
          vec3 nightSky = mix(vec3(0.003, 0.006, 0.022), vec3(0.015, 0.025, 0.06), scatter);
          vec3 col = mix(nightSky, daySky, dayF);

          // Stars
          if (h > 0.03) {
            vec3 sp = floor(dir * 280.0);
            float star = step(0.9965, hash(sp));
            float starBright = 0.6 + 0.4 * fract(hash(sp + 0.5) * 13.7);
            float starFade = (1.0 - dayF) * smoothstep(0.03, 0.18, h);
            col += vec3(0.85, 0.88, 1.0) * star * starBright * starFade;
          }

          if (h < 0.0) {
            col = mix(col, vec3(0.0), clamp(-h * 3.0, 0.0, 1.0) * 0.6);
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.sky);
  }

  _buildSun() {
    const sunGeo = new THREE.PlaneGeometry(120, 120);
    const sunMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        intensity: { value: 1.0 },
        elevNorm:  { value: 1.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float intensity;
        uniform float elevNorm;
        void main() {
          vec2 c = vUv - 0.5;
          float d = length(c);

          float core  = smoothstep(0.075, 0.035, d);
          float halo1 = smoothstep(0.22,  0.0,   d) * 0.55;
          float halo2 = smoothstep(0.50,  0.05,  d) * 0.18;
          float limb  = 1.0 - smoothstep(0.0, 0.075, d) * 0.25;

          float ef = clamp(elevNorm * 2.5 + 0.3, 0.0, 1.0);
          vec3 highCore = vec3(1.0, 0.97, 0.85) * limb;
          vec3 lowCore  = vec3(1.0, 0.45, 0.08);
          vec3 highGlow = vec3(1.0, 0.88, 0.50);
          vec3 lowGlow  = vec3(1.0, 0.30, 0.05);

          vec3 col = mix(mix(lowGlow, highGlow, ef), mix(lowCore, highCore, ef), core);
          float a  = clamp(core + halo1 + halo2, 0.0, 1.0) * intensity;
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    this.sun = new THREE.Mesh(sunGeo, sunMat);
    this.sun.renderOrder = 1;
    this.scene.add(this.sun);

    this.sunLight = new THREE.DirectionalLight(0xfff5e0, 1.4);
    this.sunLight.position.set(0, 1, 0);
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.ambient = new THREE.AmbientLight(0x8899bb, 0.35);
    this.scene.add(this.ambient);

    // Warm overhead cabin strip
    this.cabinLight = new THREE.PointLight(0xfff0d0, 0.5, 6);
    this.cabinLight.position.set(0, 1.85, 0);
    this.scene.add(this.cabinLight);
  }

  _buildGround() {
    // Subdivided so the curvature vertex displacement looks smooth
    const groundGeo = new THREE.PlaneGeometry(5000, 5000, 96, 96);
    const groundMat = new THREE.ShaderMaterial({
      side: THREE.FrontSide,
      uniforms: { sunElev: { value: 0.5 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          // Parabolic approximation of Earth curvature seen from cruise altitude
          float dist2 = wp.x * wp.x + wp.z * wp.z;
          wp.y -= dist2 / 32000.0;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float sunElev;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p) {
          vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
                     mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
        }
        float fbm(vec2 p, int oct) {
          float v=0.0, a=0.5;
          for(int i=0;i<7;i++){
            if(i>=oct) break;
            v+=a*noise(p); p*=2.07; a*=0.50;
          }
          return v;
        }

        void main() {
          float dayF = smoothstep(-0.12, 0.18, sunElev);

          // Large-scale coverage determines where clouds form
          float bigPat  = fbm(vUv * 2.2,          5);
          float coverage = smoothstep(0.36, 0.60, bigPat);

          // Medium detail: puffiness inside cloud masses
          float midPat   = fbm(vUv * 5.5 + 3.1,   4);
          float density  = coverage * smoothstep(0.32, 0.68, midPat * 0.5 + bigPat * 0.5);

          // Thin high cirrus in clear gaps
          float cirrusPat = fbm(vUv * vec2(22.0, 7.0) + 1.9, 3);
          float cirrus = smoothstep(0.52, 0.74, cirrusPat) * (1.0 - coverage) * 0.55;

          // Cloud color: lit tops bright white, shadowed bases blue-grey
          vec3 cloudLit  = vec3(0.98, 0.985, 1.00);
          vec3 cloudShad = vec3(0.64, 0.70, 0.80);
          vec3 cloud = mix(cloudShad, cloudLit, density * 0.65 + 0.35);
          // Night: clouds are dark with faint moonlit edge
          cloud = mix(cloud * 0.08, cloud, dayF);

          // Cirrus: near-white thin streaks
          vec3 cirrusCol = mix(vec3(0.08, 0.10, 0.18), vec3(0.94, 0.95, 0.98), dayF);

          // Ocean: deep blue center, teal shallows, slight depth variation
          float oceanD = fbm(vUv * 14.0, 3);
          vec3 deepSea    = mix(vec3(0.01, 0.04, 0.12), vec3(0.03, 0.13, 0.30), dayF);
          vec3 shallowSea = mix(vec3(0.02, 0.07, 0.18), vec3(0.05, 0.24, 0.50), dayF);
          vec3 ocean = mix(deepSea, shallowSea, smoothstep(0.3, 0.7, oceanD));

          // Compose
          vec3 surface = mix(ocean, cloud, density);
          surface = mix(surface, cirrusCol, cirrus * (1.0 - density));

          // City lights visible through cloud gaps at night
          float cityH = hash(floor(vUv * 220.0));
          float city  = step(0.9935, cityH) * (1.0 - density) * (1.0 - cirrus);
          surface += vec3(1.0, 0.82, 0.48) * city * (1.0 - dayF) * 0.85;

          // Atmospheric haze: horizon fade to sky-ish colour
          float horizonFade = smoothstep(0.3, 0.7, length(vUv - 0.5) * 2.0);
          vec3 hazeCol = mix(vec3(0.4, 0.6, 0.85), vec3(0.06, 0.08, 0.14), 1.0 - dayF);
          surface = mix(surface, hazeCol * 0.6, horizonFade * 0.55);

          gl_FragColor = vec4(surface, 1.0);
        }
      `,
    });
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -50;
    this.scene.add(this.ground);
  }

  _buildCabin() {
    this.cabin = new THREE.Group();

    // Floor
    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 6),
      new THREE.MeshStandardMaterial({ color: 0x2e3038, roughness: 0.95 })
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.4;
    this.cabin.add(floorMesh);

    // Ceiling
    const ceilingMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 6),
      new THREE.MeshStandardMaterial({ color: 0xeae6de, roughness: 0.65 })
    );
    ceilingMesh.rotation.x = Math.PI / 2;
    ceilingMesh.position.y = 1.9;
    this.cabin.add(ceilingMesh);

    // Side walls with oval window cutouts
    const wallShape = new THREE.Shape();
    wallShape.moveTo(-3, -0.4);
    wallShape.lineTo( 3, -0.4);
    wallShape.lineTo( 3,  1.9);
    wallShape.lineTo(-3,  1.9);
    wallShape.closePath();

    for (let i = -1; i <= 1; i++) {
      const hole = new THREE.Path();
      hole.absellipse(i * 1.4, 1.05, 0.22, 0.31, 0, Math.PI * 2, false, 0);
      wallShape.holes.push(hole);
    }

    const wallGeo = new THREE.ShapeGeometry(wallShape);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c8, roughness: 0.82, side: THREE.DoubleSide });

    const rightWall = new THREE.Mesh(wallGeo, wallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.x = 1.6;
    this.cabin.add(rightWall);

    const leftWall = new THREE.Mesh(wallGeo, wallMat.clone());
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.x = -1.6;
    this.cabin.add(leftWall);

    // Oval window bezels
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.5 });
    for (let i = -1; i <= 1; i++) {
      const fr = this._makeWindowFrame(frameMat);
      fr.position.set(1.58, 1.05, i * 1.4);
      fr.rotation.y = -Math.PI / 2;
      this.cabin.add(fr);

      const fl = this._makeWindowFrame(frameMat);
      fl.position.set(-1.58, 1.05, i * 1.4);
      fl.rotation.y = Math.PI / 2;
      this.cabin.add(fl);
    }

    // End walls
    const endGeo = new THREE.PlaneGeometry(3.2, 2.3);
    const endMat = new THREE.MeshStandardMaterial({ color: 0xb4aea2, roughness: 0.85 });
    const frontWall = new THREE.Mesh(endGeo, endMat);
    frontWall.position.set(0, 0.75, -3);
    this.cabin.add(frontWall);
    const backWall = new THREE.Mesh(endGeo, endMat.clone());
    backWall.position.set(0, 0.75, 3);
    backWall.rotation.y = Math.PI;
    this.cabin.add(backWall);

    // Overhead storage bins
    const binGeo = new THREE.BoxGeometry(0.38, 0.38, 1.05);
    const binMat = new THREE.MeshStandardMaterial({ color: 0xcecac0, roughness: 0.6 });
    for (let i = -1; i <= 1; i++) {
      const rb = new THREE.Mesh(binGeo, binMat);
      rb.position.set(1.22, 1.62, i * 1.4);
      this.cabin.add(rb);
      const lb = new THREE.Mesh(binGeo, binMat.clone());
      lb.position.set(-1.22, 1.62, i * 1.4);
      this.cabin.add(lb);
    }

    // Seat backs with headrests
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x28303e, roughness: 0.7 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x1e2530, roughness: 0.7 });

    for (const sx of [1.05, -1.05]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.05, 0.12), seatMat.clone());
      seat.position.set(sx, 0.62, -0.9);
      this.cabin.add(seat);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.22, 0.14), headMat.clone());
      head.position.set(sx, 1.18, -0.9);
      this.cabin.add(head);
    }

    // Armrests
    const armMat = new THREE.MeshStandardMaterial({ color: 0x1a1e24, roughness: 0.6 });
    for (const ax of [0.72, -0.72]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.5), armMat.clone());
      arm.position.set(ax, 0.32, -0.9);
      this.cabin.add(arm);
    }

    this.scene.add(this.cabin);
  }

  _makeWindowFrame(material) {
    const outer = new THREE.Shape();
    outer.absellipse(0, 0, 0.285, 0.375, 0, Math.PI * 2, false, 0);
    const inner = new THREE.Path();
    inner.absellipse(0, 0, 0.220, 0.310, 0, Math.PI * 2, false, 0);
    outer.holes.push(inner);
    return new THREE.Mesh(new THREE.ShapeGeometry(outer), material);
  }

  setViewSide(side) {
    this.viewSide = side;
    if (side === 'right') {
      this.camera.position.set(1.2, 1.15, 0);
      this.camera.lookAt(3, 1.1, 0);
    } else {
      this.camera.position.set(-1.2, 1.15, 0);
      this.camera.lookAt(-3, 1.1, 0);
    }
  }

  updateSun(relativeBearingDeg, elevationDeg) {
    const bearingRad = relativeBearingDeg * DEG;
    const elevRad    = elevationDeg * DEG;

    const horizDist = Math.cos(elevRad);
    const x = Math.sin(bearingRad) * horizDist;
    const z = Math.cos(bearingRad) * horizDist;
    const y = Math.sin(elevRad);

    const sunDir = new THREE.Vector3(x, y, z).normalize();

    this.sun.position.set(x * 900, y * 900, z * 900);
    this.sun.lookAt(0, 1.2, 0);

    this.sunLight.position.copy(sunDir).multiplyScalar(100);
    this.sunLight.target.position.set(0, 0, 0);

    const elevNorm = Math.sin(elevRad);
    const dayFactor = Math.max(0, Math.min(1, (elevNorm + 0.2) / 0.4));
    this.sunLight.intensity  = 0.3 + 1.4 * dayFactor;
    this.ambient.intensity   = 0.15 + 0.35 * dayFactor;
    this.cabinLight.intensity = 0.25 + 0.35 * (1.0 - dayFactor);

    this.sun.material.uniforms.intensity.value = Math.max(0, Math.min(1, (elevNorm + 0.05) / 0.12));
    this.sun.material.uniforms.elevNorm.value  = elevNorm;

    this.sky.material.uniforms.sunDir.value.copy(sunDir);
    this.sky.material.uniforms.sunElev.value   = elevNorm;
    this.ground.material.uniforms.sunElev.value = elevNorm;
  }

  _onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _animate = () => {
    this._onResize();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._animate);
  };
}
