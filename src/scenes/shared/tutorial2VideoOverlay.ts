import tutorial2VideoUrl from '../../assets/tutorial-2.mp4';
import { HTML_LAYER } from '../../layers';
import { UI_CJK_FONT_FAMILY } from '../../uiFonts';

export interface Tutorial2TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Tutorial2VideoOverlayOptions {
  canvas: HTMLCanvasElement;
  sceneWidth: number;
  sceneHeight: number;
  targetRect: () => Tutorial2TargetRect;
  volume: () => number;
  onContinue: () => void;
  rootAttr: string;
  promptAttr: string;
}

export class Tutorial2VideoOverlay {
  private readonly options: Tutorial2VideoOverlayOptions;
  private root?: HTMLDivElement;
  private video?: HTMLVideoElement;
  private promptRoot?: HTMLDivElement;
  private keyHandler?: (event: KeyboardEvent) => void;
  private pointerHandler?: (event: PointerEvent) => void;
  private mouseHandler?: (event: MouseEvent) => void;
  private touchHandler?: (event: TouchEvent) => void;
  private domHandler?: (event: Event) => void;
  private readonly resizeHandler = () => this.refreshBounds();

  constructor(options: Tutorial2VideoOverlayOptions) {
    this.options = options;
  }

  show() {
    this.remove();
    this.forceRemoveArtifacts();

    this.root = document.createElement('div');
    this.root.setAttribute(this.options.rootAttr, '1');
    this.root.style.position = 'fixed';
    this.root.style.pointerEvents = 'auto';
    this.root.style.background = '#000000';
    this.root.style.zIndex = String(HTML_LAYER.FULLSCREEN_VIDEO);
    this.root.style.overflow = 'hidden';

    this.video = document.createElement('video');
    this.video.src = tutorial2VideoUrl;
    this.video.autoplay = true;
    this.video.loop = true;
    this.video.controls = false;
    this.video.volume = this.options.volume();
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.video.style.width = '100%';
    this.video.style.height = '100%';
    this.video.style.objectFit = 'contain';
    this.video.style.background = '#000000';

    this.root.appendChild(this.video);
    document.body.appendChild(this.root);

    this.promptRoot = document.createElement('div');
    this.promptRoot.setAttribute(this.options.promptAttr, '1');
    this.promptRoot.textContent = '按任意按鍵繼續';
    this.promptRoot.style.position = 'fixed';
    this.promptRoot.style.pointerEvents = 'auto';
    this.promptRoot.style.transform = 'translate(-50%, -50%)';
    this.promptRoot.style.zIndex = String(HTML_LAYER.FULLSCREEN_VIDEO_PROMPT);
    this.promptRoot.style.color = '#ffffff';
    this.promptRoot.style.fontFamily = UI_CJK_FONT_FAMILY;
    this.promptRoot.style.fontWeight = 'bold';
    this.promptRoot.style.fontSize = '32px';
    this.promptRoot.style.webkitTextStroke = '6px #000000';
    this.promptRoot.style.paintOrder = 'stroke fill';
    document.body.appendChild(this.promptRoot);

    this.refreshBounds();
    window.addEventListener('resize', this.resizeHandler);
    this.video.play().catch(() => {
      // Ignore autoplay failures on restrictive browsers.
    });

    let transitioned = false;
    const continueOnce = () => {
      if (transitioned) return;
      transitioned = true;
      this.options.onContinue();
    };

    this.keyHandler = () => continueOnce();
    this.pointerHandler = () => continueOnce();
    window.addEventListener('keydown', this.keyHandler);
    window.addEventListener('pointerdown', this.pointerHandler);
    this.mouseHandler = () => continueOnce();
    this.touchHandler = () => continueOnce();
    document.addEventListener('mousedown', this.mouseHandler, true);
    document.addEventListener('touchstart', this.touchHandler, true);
    this.domHandler = () => continueOnce();
    this.root.addEventListener('pointerdown', this.domHandler);
    this.root.addEventListener('mousedown', this.domHandler);
    this.root.addEventListener('touchstart', this.domHandler);
    this.video.addEventListener('pointerdown', this.domHandler);
    this.video.addEventListener('mousedown', this.domHandler);
    this.video.addEventListener('touchstart', this.domHandler);
    this.promptRoot.addEventListener('pointerdown', this.domHandler);
    this.promptRoot.addEventListener('mousedown', this.domHandler);
    this.promptRoot.addEventListener('touchstart', this.domHandler);
  }

  remove() {
    window.removeEventListener('resize', this.resizeHandler);

    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = undefined;
    }
    if (this.pointerHandler) {
      window.removeEventListener('pointerdown', this.pointerHandler);
      this.pointerHandler = undefined;
    }
    if (this.mouseHandler) {
      document.removeEventListener('mousedown', this.mouseHandler, true);
      this.mouseHandler = undefined;
    }
    if (this.touchHandler) {
      document.removeEventListener('touchstart', this.touchHandler, true);
      this.touchHandler = undefined;
    }
    if (this.domHandler) {
      this.root?.removeEventListener('pointerdown', this.domHandler);
      this.root?.removeEventListener('mousedown', this.domHandler);
      this.root?.removeEventListener('touchstart', this.domHandler);
      this.video?.removeEventListener('pointerdown', this.domHandler);
      this.video?.removeEventListener('mousedown', this.domHandler);
      this.video?.removeEventListener('touchstart', this.domHandler);
      this.promptRoot?.removeEventListener('pointerdown', this.domHandler);
      this.promptRoot?.removeEventListener('mousedown', this.domHandler);
      this.promptRoot?.removeEventListener('touchstart', this.domHandler);
      this.domHandler = undefined;
    }

    if (this.video) {
      this.video.pause();
      this.video.currentTime = 0;
      this.video.src = '';
      this.video.load();
      this.video.remove();
      this.video = undefined;
    }

    this.root?.remove();
    this.root = undefined;
    this.promptRoot?.remove();
    this.promptRoot = undefined;
  }

  forceRemoveArtifacts() {
    const staleRoots = document.querySelectorAll<HTMLDivElement>(`[${this.options.rootAttr}]`);
    staleRoots.forEach((node) => node.remove());
    const stalePrompts = document.querySelectorAll<HTMLDivElement>(`[${this.options.promptAttr}]`);
    stalePrompts.forEach((node) => node.remove());
  }

  refreshBounds() {
    const canvasRect = this.options.canvas.getBoundingClientRect();
    const scaleX = canvasRect.width / this.options.sceneWidth;
    const scaleY = canvasRect.height / this.options.sceneHeight;
    const target = this.options.targetRect();

    if (this.root) {
      this.root.style.left = `${canvasRect.left + (target.x - target.width / 2) * scaleX}px`;
      this.root.style.top = `${canvasRect.top + (target.y - target.height / 2) * scaleY}px`;
      this.root.style.width = `${target.width * scaleX}px`;
      this.root.style.height = `${target.height * scaleY}px`;
    }

    if (this.promptRoot) {
      this.promptRoot.style.left = `${canvasRect.left + canvasRect.width / 2}px`;
      this.promptRoot.style.top = `${canvasRect.top + (this.options.sceneHeight - 68) * scaleY}px`;
    }
  }

  setVolume(volume: number) {
    if (this.video) {
      this.video.volume = volume;
    }
  }
}
