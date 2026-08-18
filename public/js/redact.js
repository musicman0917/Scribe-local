/**
 * Canvas-based click-and-drag redaction tool. Draws rectangles on an
 * overlay canvas positioned over an <img>, and reports them back scaled
 * to the image's *natural* (original) pixel dimensions so the server can
 * apply the blur/black-out at full resolution regardless of how large the
 * image is rendered on screen.
 */
class RedactTool {
  constructor(imgEl, canvasEl) {
    this.imgEl = imgEl;
    this.canvasEl = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.rects = []; // in natural image pixel coordinates: {x,y,width,height,mode}
    this.drawing = false;
    this.start = null;
    this.getMode = () => 'blackout';

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);

    canvasEl.addEventListener('mousedown', this._onDown);
    window.addEventListener('mousemove', this._onMove);
    window.addEventListener('mouseup', this._onUp);
  }

  reset() {
    this.rects = [];
    this.render();
  }

  resize() {
    const rect = this.canvasEl.getBoundingClientRect();
    this.canvasEl.width = rect.width;
    this.canvasEl.height = rect.height;
    this.render();
  }

  _displayToNatural(px, py) {
    const scaleX = this.imgEl.naturalWidth / this.canvasEl.width;
    const scaleY = this.imgEl.naturalHeight / this.canvasEl.height;
    return { x: px * scaleX, y: py * scaleY };
  }

  _naturalToDisplay(x, y) {
    const scaleX = this.canvasEl.width / this.imgEl.naturalWidth;
    const scaleY = this.canvasEl.height / this.imgEl.naturalHeight;
    return { x: x * scaleX, y: y * scaleY };
  }

  _pointerPos(e) {
    const rect = this.canvasEl.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _onDown(e) {
    e.preventDefault();
    this.drawing = true;
    this.start = this._pointerPos(e);
  }

  _onMove(e) {
    if (!this.drawing) return;
    const current = this._pointerPos(e);
    this.render(this._displayRectFrom(this.start, current));
  }

  _onUp(e) {
    if (!this.drawing) return;
    this.drawing = false;
    const current = this._pointerPos(e);
    const displayRect = this._displayRectFrom(this.start, current);
    if (displayRect.width > 4 && displayRect.height > 4) {
      const topLeftNatural = this._displayToNatural(displayRect.x, displayRect.y);
      const bottomRightNatural = this._displayToNatural(displayRect.x + displayRect.width, displayRect.y + displayRect.height);
      this.rects.push({
        x: topLeftNatural.x,
        y: topLeftNatural.y,
        width: bottomRightNatural.x - topLeftNatural.x,
        height: bottomRightNatural.y - topLeftNatural.y,
        mode: this.getMode()
      });
    }
    this.render();
  }

  _displayRectFrom(a, b) {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(a.x - b.x),
      height: Math.abs(a.y - b.y)
    };
  }

  undoLast() {
    this.rects.pop();
    this.render();
  }

  render(activeDisplayRect) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);

    for (const rect of this.rects) {
      const topLeft = this._naturalToDisplay(rect.x, rect.y);
      const bottomRight = this._naturalToDisplay(rect.x + rect.width, rect.y + rect.height);
      this._drawRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y, rect.mode);
    }

    if (activeDisplayRect) {
      this._drawRect(activeDisplayRect.x, activeDisplayRect.y, activeDisplayRect.width, activeDisplayRect.height, this.getMode(), true);
    }
  }

  _drawRect(x, y, w, h, mode, active) {
    const ctx = this.ctx;
    ctx.fillStyle = mode === 'blur' ? 'rgba(59,130,246,0.25)' : 'rgba(17,24,39,0.85)';
    ctx.strokeStyle = active ? '#f59e0b' : (mode === 'blur' ? '#3b82f6' : '#111827');
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }

  destroy() {
    this.canvasEl.removeEventListener('mousedown', this._onDown);
    window.removeEventListener('mousemove', this._onMove);
    window.removeEventListener('mouseup', this._onUp);
  }
}
