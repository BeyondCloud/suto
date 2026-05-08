interface EndingCelebrationParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
  life: number;
  maxLife: number;
  shape: 'rect' | 'circle';
}

const PARTICLE_CANVAS_Z_INDEX = '6';
const MAX_DT_MS = 50;
const MIN_DT_SEC = 0.008;
const INITIAL_BURST_COUNT = 220;
const CONTINUOUS_PER_SECOND = 180;
const BURST_CHANCE_PER_FRAME = 0.1;
const BURST_MIN = 6;
const BURST_MAX = 14;
const DPR_MIN = 1;
const DPR_MAX = 2;

const PARTICLE_COLORS = ['#ff4d6d', '#ffd166', '#06d6a0', '#00c2ff', '#ff8fab', '#b5e48c'];
const MAX_PARTICLES = 200;
const SPAWN_SIDE_OFFSET_X = 136;
const SPAWN_BASE_Y = -60;
const LANE_HALF_INITIAL_RATIO = 0.24;
const LANE_HALF_NORMAL_RATIO = 0.18;
const VX_MIN = 220;
const VX_MAX = 620;
const VY_MIN = -200;
const VY_MAX = 90;
const SIZE_MIN_INITIAL = 6;
const SIZE_MAX_INITIAL = 20;
const SIZE_MIN_NORMAL = 5;
const SIZE_MAX_NORMAL = 16;
const ROTATION_MIN = -8;
const ROTATION_MAX = 8;
const LIFE_MIN = 2.1;
const LIFE_MAX = 4.4;
const RECT_SHAPE_CHANCE = 0.8;

const GRAVITY = 260;
const DRAG = 0.991;
const SWIRL = 84;
const SWING_FREQ = 12;
const SWING_VY_FREQ = 7;
const SWING_VY_SCALE = 18;
const CULL_BOTTOM_MARGIN = 180;
const CULL_SIDE_MARGIN = 260;
const ALPHA_FADE_IN_RATIO = 0.2;
const ALPHA_FADE_OUT_RATIO = 0.8;
const RECT_HEIGHT_RATIO = 0.66;
const CIRCLE_RADIUS_RATIO = 0.45;

export class EndingCelebrationParticleSystem {
  private root?: HTMLDivElement;
  private canvas?: HTMLCanvasElement;
  private ctx?: CanvasRenderingContext2D;
  private animFrame?: number;
  private particles: EndingCelebrationParticle[] = [];
  private lastTime = 0;
  private spawnCarry = 0;

  start(root: HTMLDivElement) {
    this.stop();

    let canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = PARTICLE_CANVAS_Z_INDEX;

    let ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    this.root = root;
    this.canvas = canvas;
    this.ctx = ctx;
    this.particles = [];
    this.spawnCarry = 0;
    this.lastTime = performance.now();

    root.prepend(canvas);
    this.resize();

    this.spawnParticles(INITIAL_BURST_COUNT, true);

    let tick = (now: number) => {
      if (!this.canvas || !this.ctx || !this.root) return;

      let dtMs = Math.min(MAX_DT_MS, now - this.lastTime);
      let dt = Math.max(MIN_DT_SEC, dtMs / 1000);
      this.lastTime = now;

      this.spawnCarry += CONTINUOUS_PER_SECOND * dt;
      let spawnCount = Math.floor(this.spawnCarry);
      this.spawnCarry -= spawnCount;

      if (Math.random() < BURST_CHANCE_PER_FRAME) {
        spawnCount += this.randInt(BURST_MIN, BURST_MAX);
      }
      if (spawnCount > 0) {
        this.spawnParticles(spawnCount, false);
      }

      this.updateAndRender(dt);
      this.animFrame = window.requestAnimationFrame(tick);
    };

    this.animFrame = window.requestAnimationFrame(tick);
  }

  stop() {
    if (this.animFrame !== undefined) {
      window.cancelAnimationFrame(this.animFrame);
      this.animFrame = undefined;
    }

    this.lastTime = 0;
    this.spawnCarry = 0;
    this.particles = [];
    this.ctx = undefined;

    this.canvas?.remove();
    this.canvas = undefined;
    this.root = undefined;
  }

  resize() {
    if (!this.root || !this.canvas || !this.ctx) return;

    let width = Math.max(1, this.root.clientWidth);
    let height = Math.max(1, this.root.clientHeight);
    let dpr = Math.max(DPR_MIN, Math.min(DPR_MAX, window.devicePixelRatio || DPR_MIN));
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private spawnParticles(count: number, initialBurst: boolean) {
    if (!this.root) return;

    let width = Math.max(1, this.root.clientWidth);
    let height = Math.max(1, this.root.clientHeight);

    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) break;

      let fromLeft = Math.random() < 0.5;
      let x = fromLeft ? -SPAWN_SIDE_OFFSET_X : width + SPAWN_SIDE_OFFSET_X;
      let laneHalf = height * (initialBurst ? LANE_HALF_INITIAL_RATIO : LANE_HALF_NORMAL_RATIO);
      let y = this.randFloat(SPAWN_BASE_Y - laneHalf, SPAWN_BASE_Y + laneHalf);
      let sideDirection = fromLeft ? 1 : -1;
      let vxBase = this.randFloat(VX_MIN, VX_MAX) * sideDirection;
      let vyBase = this.randFloat(VY_MIN, VY_MAX);
      let sizeBase = initialBurst
        ? this.randFloat(SIZE_MIN_INITIAL, SIZE_MAX_INITIAL)
        : this.randFloat(SIZE_MIN_NORMAL, SIZE_MAX_NORMAL);

      this.particles.push({
        x,
        y,
        vx: vxBase,
        vy: vyBase,
        size: sizeBase,
        rotation: this.randFloat(0, Math.PI * 2),
        rotationSpeed: this.randFloat(ROTATION_MIN, ROTATION_MAX),
        color: PARTICLE_COLORS[this.randInt(0, PARTICLE_COLORS.length - 1)],
        life: 0,
        maxLife: this.randFloat(LIFE_MIN, LIFE_MAX),
        shape: Math.random() < RECT_SHAPE_CHANCE ? 'rect' : 'circle',
      });
    }
  }

  private updateAndRender(dt: number) {
    if (!this.root || !this.ctx) return;

    let width = Math.max(1, this.root.clientWidth);
    let height = Math.max(1, this.root.clientHeight);
    let ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      let particle = this.particles[i];
      particle.life += dt;
      if (
        particle.life >= particle.maxLife
        || particle.y > height + CULL_BOTTOM_MARGIN
        || particle.x < -CULL_SIDE_MARGIN
        || particle.x > width + CULL_SIDE_MARGIN
      ) {
        this.particles.splice(i, 1);
        continue;
      }

      let lifeRatio = particle.life / particle.maxLife;
      let alpha = lifeRatio < ALPHA_FADE_IN_RATIO
        ? lifeRatio / ALPHA_FADE_IN_RATIO
        : Math.max(0, Math.min(1, (1 - lifeRatio) / ALPHA_FADE_OUT_RATIO));
      let swing = Math.sin(particle.life * SWING_FREQ + particle.rotation) * SWIRL;

      particle.vx = (particle.vx + swing * dt) * DRAG;
      particle.vy += Math.sin(particle.life * SWING_VY_FREQ + particle.rotation) * SWING_VY_SCALE * dt + GRAVITY * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.rotation += particle.rotationSpeed * dt;

      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      if (particle.shape === 'rect') {
        ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * RECT_HEIGHT_RATIO);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, particle.size * CIRCLE_RADIUS_RATIO, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.globalAlpha = 1;
  }

  private randFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  private randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
