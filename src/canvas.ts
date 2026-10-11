import type { Artwork, CanvasCallbacks, CanvasSettings, PaintCommand, PaintPoint } from './types';

type Position = { x: number; y: number };
type Pointer = Position & { type: string };
type Region = { id: string; path: Path2D; inverse: Path2D };

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const distance = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.y - b.y);
const copyCommand = (command: PaintCommand): PaintCommand => ({ ...command, points: command.points.map(point => ({ ...point })) });

/** A deterministic PRNG keeps pencil/texture marks identical after undo, reload and export. */
function randomSource(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function colorChannels(color: string): [number, number, number] {
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map(character => character + character).join('') : hex;
  return [parseInt(full.slice(0, 2), 16) || 0, parseInt(full.slice(2, 4), 16) || 0, parseInt(full.slice(4, 6), 16) || 0];
}

/**
 * The editable document is a list of commands in artwork coordinates, never a screen bitmap.
 * A bounded-resolution bitmap accelerates normal painting. Outlines are always vectors;
 * exports replay the commands at their requested resolution without using screen state.
 */
export class PaintingCanvas {
  readonly element: HTMLCanvasElement;
  private readonly artwork: Artwork;
  private readonly callbacks: CanvasCallbacks;
  private readonly context: CanvasRenderingContext2D;
  private readonly paintCanvas = document.createElement('canvas');
  private readonly outlineCanvas = document.createElement('canvas');
  private readonly paintContext: CanvasRenderingContext2D;
  private readonly hitContext = document.createElement('canvas').getContext('2d')!;
  private readonly regions: Region[];
  private readonly linePaths: { path: Path2D; width: number; fill?: string }[];
  private readonly regionIndex = new Map<string, number>();
  private readonly resizeObserver: ResizeObserver;
  private readonly pointers = new Map<number, Pointer>();
  private readonly paintScale: number;
  private commands: PaintCommand[];
  private redoCommands: PaintCommand[] = [];
  private settings: CanvasSettings = { tool: 'fill', color: '#e89e80', secondaryColor: '#9d5877', size: 28, opacity: 1, guided: true };
  private active?: PaintCommand;
  private activePointer?: number;
  private penPointer?: number;
  private gesture?: { distance: number; zoom: number; anchor: Position };
  private navigating = false;
  private moved = false;
  private startPosition?: Position;
  private viewWidth = 1;
  private viewHeight = 1;
  private pixelRatio = 1;
  private fitScale = 1;
  private zoom = 1;
  private offset: Position = { x: 0, y: 0 };
  private frame = 0;
  private destroyed = false;
  private lastBrushPoint?: PaintPoint;
  private pendingResize = true;
  private outlineDirty = true;
  private fillAnimation?: { before: HTMLCanvasElement; started: number };

  constructor(container: HTMLElement, artwork: Artwork, commands: PaintCommand[], callbacks: CanvasCallbacks) {
    // A drawing stays self-contained even when browsing caches evict its source asset.
    this.artwork = {
      ...artwork,
      regions: artwork.regions.map(region => ({ ...region })),
      lines: artwork.lines.map(line => ({ ...line })),
    };
    this.callbacks = callbacks;
    this.commands = commands.map(copyCommand);
    this.element = document.createElement('canvas');
    this.element.className = 'painting-canvas';
    this.element.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;user-select:none;-webkit-user-select:none;';
    this.element.setAttribute('role', 'img');
    this.element.setAttribute('aria-label', 'Coloring canvas. Paint with one finger or a stylus. Pinch with two fingers to zoom and move.');
    this.element.tabIndex = 0;
    container.append(this.element);
    this.context = this.element.getContext('2d', { alpha: true, willReadFrequently: true })!;
    this.paintContext = this.paintCanvas.getContext('2d')!;
    this.paintScale = Math.min(2, Math.sqrt(2_600_000 / (artwork.width * artwork.height)));
    this.paintCanvas.width = Math.ceil(artwork.width * this.paintScale);
    this.paintCanvas.height = Math.ceil(artwork.height * this.paintScale);
    this.regions = this.artwork.regions.map((region, index) => {
      this.regionIndex.set(region.id, index);
      const path = new Path2D(region.path);
      const inverse = new Path2D();
      inverse.rect(-1, -1, artwork.width + 2, artwork.height + 2);
      inverse.addPath(path);
      return { id: region.id, path, inverse };
    });
    this.linePaths = this.artwork.lines.map(line => ({ path: new Path2D(line.path), width: line.width ?? 1.7, fill: line.fill }));
    this.element.addEventListener('pointerdown', this.pointerDown);
    this.element.addEventListener('pointermove', this.pointerMove);
    this.element.addEventListener('pointerup', this.pointerUp);
    this.element.addEventListener('pointercancel', this.pointerCancel);
    this.element.addEventListener('lostpointercapture', this.lostCapture);
    this.element.addEventListener('wheel', this.wheel, { passive: false });
    this.element.addEventListener('contextmenu', this.contextMenu);
    this.element.addEventListener('keydown', this.keyDown);
    document.addEventListener('visibilitychange', this.visibilityChange);
    this.resizeObserver = new ResizeObserver(() => { this.pendingResize = true; this.scheduleRender(); });
    this.resizeObserver.observe(container);
    this.rebuildPaint();
    this.resize();
    this.reportHistory();
    this.scheduleRender();
  }

  setSettings(settings: Partial<CanvasSettings>) {
    this.settings = {
      ...this.settings, ...settings,
      size: clamp(settings.size ?? this.settings.size, 1, 180),
      opacity: clamp(settings.opacity ?? this.settings.opacity, 0.01, 1),
    };
    if (this.settings.lockedRegionId && !this.regionIndex.has(this.settings.lockedRegionId)) this.settings.lockedRegionId = undefined;
    this.element.style.cursor = this.settings.tool === 'eyedropper' ? 'crosshair' : 'default';
    this.scheduleRender();
  }

  lockRegion(regionId?: string) {
    this.setSettings({ lockedRegionId: regionId && this.regionIndex.has(regionId) ? regionId : undefined });
  }

  getCommands(): PaintCommand[] { return this.commands.map(copyCommand); }

  /** Flush the live stroke before lifecycle handlers persist a document or leave the editor. */
  finishStroke() { this.commitActive(); }

  undo() {
    this.cancelActive();
    const command = this.commands.pop();
    if (!command) return;
    this.redoCommands.push(command);
    this.rebuildPaint();
    this.changed();
  }

  redo() {
    this.cancelActive();
    const command = this.redoCommands.pop();
    if (!command) return;
    this.commands.push(command);
    this.appendPaint(command);
    this.changed();
  }

  reset() {
    this.cancelActive();
    this.commands = [];
    this.redoCommands = [];
    this.rebuildPaint();
    this.changed();
  }

  fit() {
    this.zoom = 1;
    this.offset = { x: (this.viewWidth - this.artwork.width * this.fitScale) / 2, y: (this.viewHeight - this.artwork.height * this.fitScale) / 2 };
    this.outlineDirty = true;
    this.callbacks.onZoom?.(this.zoom);
    this.scheduleRender();
  }

  zoomBy(factor: number) { this.setZoom(this.zoom * factor, { x: this.viewWidth / 2, y: this.viewHeight / 2 }); }

  /** Exports include a meaningful in-progress stroke and are independent of view/animation. */
  async exportImage(format: 'png' | 'jpeg', scale = 3): Promise<Blob> {
    this.commitActive();
    const output = document.createElement('canvas');
    const exportScale = clamp(scale, 0.25, 4);
    output.width = Math.round(this.artwork.width * exportScale);
    output.height = Math.round(this.artwork.height * exportScale);
    const context = output.getContext('2d')!;
    // Erasing must remove paint, never the paper or line art. Build the transparent paint
    // layer first, put paper behind it, then draw original vectors on top.
    context.scale(exportScale, exportScale);
    for (const command of this.commands) this.drawCommand(context, command);
    context.globalCompositeOperation = 'destination-over';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, this.artwork.width, this.artwork.height);
    context.globalCompositeOperation = 'source-over';
    this.drawOutlines(context);
    return new Promise((resolve, reject) => output.toBlob(blob => {
      output.width = 1; output.height = 1;
      if (blob) resolve(blob); else reject(new Error('Could not create the image. Free some memory and try again.'));
    }, format === 'png' ? 'image/png' : 'image/jpeg', 0.96));
  }

  preview(): string {
    const output = document.createElement('canvas');
    output.width = 240;
    output.height = Math.round(240 * this.artwork.height / this.artwork.width);
    const context = output.getContext('2d')!;
    context.scale(output.width / this.artwork.width, output.height / this.artwork.height);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, this.artwork.width, this.artwork.height);
    context.drawImage(this.paintCanvas, 0, 0, this.artwork.width, this.artwork.height);
    this.drawOutlines(context);
    const image = output.toDataURL('image/jpeg', 0.78);
    output.width = 1; output.height = 1;
    return image;
  }

  destroy() {
    this.commitActive();
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.element.removeEventListener('pointerdown', this.pointerDown);
    this.element.removeEventListener('pointermove', this.pointerMove);
    this.element.removeEventListener('pointerup', this.pointerUp);
    this.element.removeEventListener('pointercancel', this.pointerCancel);
    this.element.removeEventListener('lostpointercapture', this.lostCapture);
    this.element.removeEventListener('wheel', this.wheel);
    this.element.removeEventListener('contextmenu', this.contextMenu);
    this.element.removeEventListener('keydown', this.keyDown);
    document.removeEventListener('visibilitychange', this.visibilityChange);
    this.pointers.clear();
    this.finishFillAnimation();
    this.paintCanvas.width = 1;
    this.paintCanvas.height = 1;
    this.outlineCanvas.width = 1;
    this.outlineCanvas.height = 1;
    this.element.remove();
  }

  private changed() {
    this.reportHistory();
    this.scheduleRender();
    this.callbacks.onChange(this.getCommands());
  }

  private reportHistory() { this.callbacks.onHistory?.(this.commands.length > 0, this.redoCommands.length > 0); }

  private resize() {
    const rectangle = this.element.parentElement!.getBoundingClientRect();
    const width = Math.max(1, rectangle.width), height = Math.max(1, rectangle.height);
    const previousCenter = this.toArtwork({ x: this.viewWidth / 2, y: this.viewHeight / 2 });
    const first = this.viewWidth === 1;
    this.viewWidth = width; this.viewHeight = height;
    // Bound display memory on large high-density tablets while preserving crisp outlines.
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2.5, Math.sqrt(5_000_000 / (width * height)));
    this.element.width = Math.round(width * this.pixelRatio);
    this.element.height = Math.round(height * this.pixelRatio);
    this.fitScale = Math.min((width - 24) / this.artwork.width, (height - 24) / this.artwork.height);
    this.fitScale = Math.max(0.001, this.fitScale);
    if (first || this.zoom === 1) this.fit();
    else this.offset = { x: width / 2 - previousCenter.x * this.scale, y: height / 2 - previousCenter.y * this.scale };
    this.pendingResize = false;
    this.outlineDirty = true;
  }

  private get scale() { return this.fitScale * this.zoom; }
  private toArtwork(point: Position): Position { return { x: (point.x - this.offset.x) / this.scale, y: (point.y - this.offset.y) / this.scale }; }
  private screenPoint(event: PointerEvent | WheelEvent): Position {
    const rectangle = this.element.getBoundingClientRect();
    return { x: event.clientX - rectangle.left, y: event.clientY - rectangle.top };
  }
  private paintPoint(event: PointerEvent): PaintPoint {
    return { ...this.toArtwork(this.screenPoint(event)), pressure: event.pointerType === 'pen' && event.pressure > 0 ? clamp(event.pressure, 0.08, 1) : 0.65 };
  }
  private hitRegion(point: Position): string | undefined {
    for (let index = this.regions.length - 1; index >= 0; index--) {
      if (this.hitContext.isPointInPath(this.regions[index].path, point.x, point.y)) return this.regions[index].id;
    }
    return undefined;
  }
  private inArtwork(point: Position) { return point.x >= 0 && point.y >= 0 && point.x <= this.artwork.width && point.y <= this.artwork.height; }

  private pointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    event.preventDefault();
    if (this.penPointer !== undefined && event.pointerType !== 'pen') return;
    if (event.pointerType === 'pen') {
      this.cancelActive();
      this.pointers.clear();
      this.gesture = undefined;
      this.navigating = false;
      this.penPointer = event.pointerId;
    }
    const position = this.screenPoint(event);
    this.pointers.set(event.pointerId, { ...position, type: event.pointerType });
    this.element.setPointerCapture(event.pointerId);
    if (this.pointers.size >= 2) {
      // A second contact converts the entire tentative stroke into navigation: no stray dot.
      this.cancelActive();
      this.navigating = true;
      const [a, b] = Array.from(this.pointers.values());
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.gesture = { distance: Math.max(1, distance(a, b)), zoom: this.zoom, anchor: this.toArtwork(center) };
      return;
    }
    if (this.navigating) return;
    const point = this.paintPoint(event);
    if (!this.inArtwork(point)) return;
    const hit = this.hitRegion(point);
    this.callbacks.onRegion?.(hit);
    const regionId = this.settings.lockedRegionId ?? hit;
    const regionRequired = this.settings.tool === 'fill' || this.settings.tool === 'gradient' || this.settings.guided;
    if (regionRequired && !regionId && this.settings.tool !== 'eyedropper') return;
    this.activePointer = event.pointerId;
    this.startPosition = position;
    this.moved = false;
    this.lastBrushPoint = point;
    this.active = {
      id: globalThis.crypto?.randomUUID?.() ?? `paint-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      tool: this.settings.tool, color: this.settings.color, secondaryColor: this.settings.secondaryColor,
      size: this.settings.size, opacity: this.settings.opacity,
      regionId: regionRequired || this.settings.lockedRegionId ? regionId : undefined,
      points: [point], seed: Math.floor(Math.random() * 4294967295),
    };
    this.scheduleRender();
  };

  private pointerMove = (event: PointerEvent) => {
    if (!this.pointers.has(event.pointerId)) return;
    event.preventDefault();
    const position = this.screenPoint(event);
    this.pointers.set(event.pointerId, { ...position, type: event.pointerType });
    if (this.gesture && this.pointers.size >= 2) {
      const [a, b] = Array.from(this.pointers.values());
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.zoom = clamp(this.gesture.zoom * distance(a, b) / this.gesture.distance, 0.7, 12);
      this.offset = { x: center.x - this.gesture.anchor.x * this.scale, y: center.y - this.gesture.anchor.y * this.scale };
      this.constrainPan();
      this.outlineDirty = true;
      this.callbacks.onZoom?.(this.zoom);
      this.scheduleRender();
      return;
    }
    if (!this.active || this.activePointer !== event.pointerId || this.navigating) return;
    if (this.startPosition && distance(position, this.startPosition) > 5) this.moved = true;
    if (this.active.tool === 'fill' || this.active.tool === 'eyedropper') return;
    const coalesced = event.getCoalescedEvents?.() ?? [event];
    for (const sample of coalesced.length ? coalesced : [event]) {
      const point = this.paintPoint(sample);
      if (this.active.tool === 'gradient') this.active.points = [this.active.points[0], point];
      else if (!this.lastBrushPoint || distance(point, this.lastBrushPoint) > Math.max(0.35, 0.45 / this.scale)) {
        this.active.points.push(point);
        this.lastBrushPoint = point;
      }
    }
    this.scheduleRender();
  };

  private pointerUp = (event: PointerEvent) => {
    if (!this.pointers.has(event.pointerId)) return;
    event.preventDefault();
    if (this.activePointer === event.pointerId && !this.navigating) {
      if (this.active?.tool === 'eyedropper') {
        if (!this.moved) this.pickColor(this.screenPoint(event));
        this.cancelActive();
      } else if (this.active?.tool === 'fill' && this.moved) this.cancelActive();
      else {
        if (this.active && this.active.tool !== 'fill') {
          const point = this.paintPoint(event);
          // A pen's pointerup often reports zero pressure; retain the final real pressure.
          point.pressure = this.lastBrushPoint?.pressure ?? point.pressure;
          if (this.active.tool === 'gradient') this.active.points = [this.active.points[0], point];
          else if (this.lastBrushPoint && distance(point, this.lastBrushPoint) > 0.1) this.active.points.push(point);
        }
        this.commitActive();
      }
    }
    this.releasePointer(event.pointerId);
  };

  private pointerCancel = (event: PointerEvent) => {
    if (this.activePointer === event.pointerId) this.cancelActive();
    this.releasePointer(event.pointerId);
  };
  private lostCapture = (event: PointerEvent) => {
    if (this.pointers.has(event.pointerId)) this.pointerCancel(event);
  };
  private releasePointer(id: number) {
    this.pointers.delete(id);
    if (this.penPointer === id) this.penPointer = undefined;
    if (this.pointers.size < 2) this.gesture = undefined;
    else if (this.navigating) {
      const [a, b] = Array.from(this.pointers.values());
      this.gesture = { distance: Math.max(1, distance(a, b)), zoom: this.zoom, anchor: this.toArtwork({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }) };
    }
    if (this.pointers.size === 0) this.navigating = false;
    if (this.element.hasPointerCapture(id)) this.element.releasePointerCapture(id);
  }
  private cancelActive() {
    this.active = undefined; this.activePointer = undefined; this.lastBrushPoint = undefined;
    this.scheduleRender();
  }
  private commitActive() {
    const command = this.active;
    this.active = undefined; this.activePointer = undefined; this.lastBrushPoint = undefined;
    if (!command || command.tool === 'eyedropper') return;
    let before: HTMLCanvasElement | undefined;
    if (command.tool === 'fill' && document.visibilityState !== 'hidden' && !document.documentElement.classList.contains('reduce-motion') && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      before = document.createElement('canvas');
      before.width = this.paintCanvas.width; before.height = this.paintCanvas.height;
      before.getContext('2d')!.drawImage(this.paintCanvas, 0, 0);
    }
    this.commands.push(command);
    this.redoCommands = [];
    this.appendPaint(command);
    if (before) this.fillAnimation = { before, started: performance.now() };
    this.changed();
  }
  private visibilityChange = () => { if (document.visibilityState === 'hidden') this.commitActive(); };
  private contextMenu = (event: Event) => event.preventDefault();
  private keyDown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault(); event.stopPropagation(); if (event.shiftKey) this.redo(); else this.undo();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); event.stopPropagation(); this.redo(); }
  };
  private wheel = (event: WheelEvent) => {
    event.preventDefault();
    this.setZoom(this.zoom * Math.exp(-event.deltaY * 0.0018), this.screenPoint(event));
  };
  private setZoom(zoom: number, center: Position) {
    const anchor = this.toArtwork(center);
    this.zoom = clamp(zoom, 0.7, 12);
    this.offset = { x: center.x - anchor.x * this.scale, y: center.y - anchor.y * this.scale };
    this.constrainPan();
    this.outlineDirty = true;
    this.callbacks.onZoom?.(this.zoom);
    this.scheduleRender();
  }
  private constrainPan() {
    this.offset.x = clamp(this.offset.x, 40 - this.artwork.width * this.scale, this.viewWidth - 40);
    this.offset.y = clamp(this.offset.y, 40 - this.artwork.height * this.scale, this.viewHeight - 40);
  }
  private pickColor(position: Position) {
    this.finishFillAnimation();
    this.render();
    const pixel = this.context.getImageData(
      clamp(Math.round(position.x * this.pixelRatio), 0, this.element.width - 1),
      clamp(Math.round(position.y * this.pixelRatio), 0, this.element.height - 1), 1, 1,
    ).data;
    this.callbacks.onPickColor?.(`#${Array.from(pixel.slice(0, 3)).map(value => value.toString(16).padStart(2, '0')).join('')}`);
  }

  private scheduleRender() {
    if (this.frame || this.destroyed) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
  }
  private render() {
    if (this.destroyed) return;
    if (this.pendingResize) this.resize();
    const context = this.context;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.element.width, this.element.height);
    context.scale(this.pixelRatio, this.pixelRatio);
    context.translate(this.offset.x, this.offset.y);
    context.scale(this.scale, this.scale);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, this.artwork.width, this.artwork.height);
    if (this.fillAnimation) {
      const progress = clamp((performance.now() - this.fillAnimation.started) / 160, 0, 1);
      if (progress >= 1) this.finishFillAnimation();
      else {
        context.drawImage(this.fillAnimation.before, 0, 0, this.artwork.width, this.artwork.height);
        context.globalAlpha = 1 - (1 - progress) ** 3;
        this.scheduleRender();
      }
    }
    context.drawImage(this.paintCanvas, 0, 0, this.artwork.width, this.artwork.height);
    context.globalAlpha = 1;
    if (this.active && !['fill', 'eyedropper'].includes(this.active.tool)) this.drawCommand(context, this.active, true);
    this.drawScreenOutlines(context);
    if (this.settings.lockedRegionId) {
      const region = this.regions[this.regionIndex.get(this.settings.lockedRegionId)!];
      if (region) {
        context.save();
        context.strokeStyle = '#a970c8'; context.lineWidth = 1.3 / this.scale;
        context.setLineDash([5 / this.scale, 4 / this.scale]);
        context.stroke(region.path);
        context.restore();
      }
    }
  }

  private rebuildPaint() {
    this.finishFillAnimation();
    this.paintContext.setTransform(1, 0, 0, 1, 0, 0);
    this.paintContext.clearRect(0, 0, this.paintCanvas.width, this.paintCanvas.height);
    this.paintContext.setTransform(this.paintScale, 0, 0, this.paintScale, 0, 0);
    for (const command of this.commands) this.drawCommand(this.paintContext, command);
    this.scheduleRender();
  }
  private appendPaint(command: PaintCommand) {
    this.finishFillAnimation();
    this.paintContext.setTransform(this.paintScale, 0, 0, this.paintScale, 0, 0);
    this.drawCommand(this.paintContext, command);
  }

  private finishFillAnimation() {
    if (!this.fillAnimation) return;
    this.fillAnimation.before.width = 1; this.fillAnimation.before.height = 1;
    this.fillAnimation = undefined;
  }

  private clipRegion(context: CanvasRenderingContext2D, regionId?: string): boolean {
    context.beginPath(); context.rect(0, 0, this.artwork.width, this.artwork.height); context.clip();
    if (!regionId) return true;
    const index = this.regionIndex.get(regionId);
    if (index === undefined) return false;
    context.clip(this.regions[index].path);
    // Subtract each later visible shape separately. One even-odd path containing all of
    // them would incorrectly reopen overlapping holes (for example an iris inside an eye).
    if (!this.artwork.disjointRegions) {
      for (let overlay = index + 1; overlay < this.regions.length; overlay++) context.clip(this.regions[overlay].inverse, 'evenodd');
    }
    return true;
  }

  private drawCommand(context: CanvasRenderingContext2D, command: PaintCommand, preview = false) {
    if (!command.points.length || command.tool === 'eyedropper') return;
    context.save();
    if (!this.clipRegion(context, command.regionId)) { context.restore(); return; }
    context.lineCap = 'round'; context.lineJoin = 'round';
    context.globalAlpha = clamp(command.opacity, 0.01, 1);
    context.fillStyle = command.color; context.strokeStyle = command.color;
    if (command.tool === 'fill') {
      context.fillRect(0, 0, this.artwork.width, this.artwork.height);
    } else if (command.tool === 'gradient') {
      const first = command.points[0];
      let last = command.points[command.points.length - 1];
      if (distance(first, last) < 1) last = { ...first, y: first.y + this.artwork.height * 0.3 };
      const gradient = context.createLinearGradient(first.x, first.y, last.x, last.y);
      gradient.addColorStop(0, command.color); gradient.addColorStop(1, command.secondaryColor);
      context.fillStyle = gradient;
      context.fillRect(0, 0, this.artwork.width, this.artwork.height);
    } else if (command.tool === 'airbrush') {
      this.drawAirbrush(context, command);
    } else if (command.tool === 'pencil' || command.tool === 'texture') {
      this.drawTextured(context, command);
    } else {
      if (command.tool === 'eraser') {
        context.globalCompositeOperation = preview ? 'source-over' : 'destination-out';
        context.fillStyle = '#ffffff';
      }
      this.drawSolidStroke(context, command.points, command.size);
    }
    context.restore();
  }

  private smoothedPoints(points: PaintPoint[]): PaintPoint[] {
    if (points.length < 3) return points;
    return points.map((point, index) => {
      if (index === 0 || index === points.length - 1) return point;
      const before = points[index - 1], after = points[index + 1];
      return { x: (before.x + point.x * 2 + after.x) / 4, y: (before.y + point.y * 2 + after.y) / 4, pressure: (before.pressure + point.pressure * 2 + after.pressure) / 4 };
    });
  }

  private drawSolidStroke(context: CanvasRenderingContext2D, original: PaintPoint[], size: number) {
    const points = this.smoothedPoints(original);
    context.beginPath();
    for (let index = 0; index < points.length; index++) {
      const point = points[index], radius = Math.max(0.25, size * (0.25 + point.pressure * 0.75) / 2);
      context.moveTo(point.x + radius, point.y);
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      if (!index) continue;
      const before = points[index - 1], length = distance(before, point);
      if (length < 0.001) continue;
      const priorRadius = Math.max(0.25, size * (0.25 + before.pressure * 0.75) / 2);
      const nx = -(point.y - before.y) / length, ny = (point.x - before.x) / length;
      context.moveTo(before.x - nx * priorRadius, before.y - ny * priorRadius);
      context.lineTo(point.x - nx * radius, point.y - ny * radius);
      context.lineTo(point.x + nx * radius, point.y + ny * radius);
      context.lineTo(before.x + nx * priorRadius, before.y + ny * priorRadius);
      context.closePath();
    }
    // One fill avoids dark overlap seams when opacity is below 100%.
    context.fill();
  }

  private eachStamp(points: PaintPoint[], spacing: number, callback: (point: PaintPoint) => void) {
    callback(points[0]);
    let carried = 0;
    for (let index = 1; index < points.length; index++) {
      const first = points[index - 1], last = points[index], length = distance(first, last);
      if (length < 0.001) continue;
      let along = spacing - carried;
      for (; along <= length; along += spacing) {
        const ratio = along / length;
        callback({ x: first.x + (last.x - first.x) * ratio, y: first.y + (last.y - first.y) * ratio, pressure: first.pressure + (last.pressure - first.pressure) * ratio });
      }
      carried = length - (along - spacing);
    }
  }

  private drawAirbrush(context: CanvasRenderingContext2D, command: PaintCommand) {
    const [red, green, blue] = colorChannels(command.color);
    context.globalAlpha = command.opacity * 0.22;
    this.eachStamp(this.smoothedPoints(command.points), Math.max(1, command.size * 0.12), point => {
      const radius = command.size * (0.5 + point.pressure * 0.5);
      const gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
      gradient.addColorStop(0, `rgba(${red},${green},${blue},0.72)`);
      gradient.addColorStop(0.45, `rgba(${red},${green},${blue},0.3)`);
      gradient.addColorStop(1, `rgba(${red},${green},${blue},0)`);
      context.fillStyle = gradient;
      context.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
    });
  }

  private drawTextured(context: CanvasRenderingContext2D, command: PaintCommand) {
    const random = randomSource(command.seed);
    const pencil = command.tool === 'pencil';
    const size = pencil ? Math.max(1, command.size * 0.32) : command.size;
    context.globalAlpha = command.opacity * (pencil ? 0.34 : 0.2);
    this.drawSolidStroke(context, command.points, size);
    context.globalAlpha = command.opacity * (pencil ? 0.32 : 0.55);
    context.beginPath();
    this.eachStamp(this.smoothedPoints(command.points), Math.max(0.8, size * 0.14), point => {
      const radius = size * (0.25 + point.pressure * 0.75) / 2;
      const speckles = pencil ? 8 : 13;
      for (let index = 0; index < speckles; index++) {
        const angle = random() * Math.PI * 2, offset = Math.sqrt(random()) * radius;
        const x = point.x + Math.cos(angle) * offset, y = point.y + Math.sin(angle) * offset;
        const dotSize = pencil ? 0.2 + random() * 0.45 : 0.35 + random() * Math.max(0.7, size * 0.025);
        context.moveTo(x + dotSize, y); context.arc(x, y, dotSize, 0, Math.PI * 2);
      }
    });
    context.fill();
  }

  private drawOutlines(context: CanvasRenderingContext2D) {
    context.save();
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.strokeStyle = '#292535';
    context.lineWidth = 1.65;
    context.lineCap = 'round'; context.lineJoin = 'round';
    for (let index = 0; index < this.regions.length; index++) {
      context.save();
      if (!this.artwork.disjointRegions) {
        for (let overlay = index + 1; overlay < this.regions.length; overlay++) context.clip(this.regions[overlay].inverse, 'evenodd');
      }
      context.stroke(this.regions[index].path);
      context.restore();
    }
    for (const line of this.linePaths) {
      if (line.fill) { context.fillStyle = line.fill; context.fill(line.path); }
      if (line.width > 0) { context.lineWidth = line.width; context.stroke(line.path); }
    }
    context.restore();
  }

  private drawScreenOutlines(context: CanvasRenderingContext2D) {
    if (this.outlineDirty) {
      this.outlineCanvas.width = this.element.width;
      this.outlineCanvas.height = this.element.height;
      const outline = this.outlineCanvas.getContext('2d')!;
      outline.scale(this.pixelRatio, this.pixelRatio);
      outline.translate(this.offset.x, this.offset.y);
      outline.scale(this.scale, this.scale);
      outline.strokeStyle = '#292535';
      outline.lineWidth = 1.65;
      outline.lineCap = 'round'; outline.lineJoin = 'round';
      // Painting regions are layered like SVG paths. Remove earlier outlines hidden by
      // a foreground face, sleeve, hair strand, etc. This cache is only viewport-sized.
      for (const region of this.regions) {
        outline.globalCompositeOperation = 'destination-out';
        outline.fill(region.path);
        outline.globalCompositeOperation = 'source-over';
        outline.stroke(region.path);
      }
      for (const line of this.linePaths) {
        if (line.fill) { outline.fillStyle = line.fill; outline.fill(line.path); }
        if (line.width > 0) { outline.lineWidth = line.width; outline.stroke(line.path); }
      }
      this.outlineDirty = false;
    }
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(this.outlineCanvas, 0, 0);
    context.restore();
  }
}
