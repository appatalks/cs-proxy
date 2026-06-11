'use strict';

/* Classic 5x7 dot-matrix font. Each glyph is 7 rows of 5 columns ('1' = lit). */
const FONT = {
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  'C': ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  'D': ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  'G': ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  'I': ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  'J': ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  'N': ['10001', '10001', '11001', '10101', '10011', '10001', '10001'],
  'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  'Q': ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  'W': ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  'X': ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  'Z': ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00110', '00110'],
  ':': ['00000', '00110', '00110', '00000', '00110', '00110', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '_': ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  '>': ['10000', '01000', '00100', '00010', '00100', '01000', '10000'],
  '<': ['00001', '00010', '00100', '01000', '00100', '00010', '00001'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  ',': ['00000', '00000', '00000', '00000', '00110', '00110', '00100'],
  '*': ['00000', '00100', '10101', '01110', '10101', '00100', '00000'],
  '%': ['11001', '11010', '00100', '01011', '10011', '00000', '00000']
};

const CHAR_W = 5;
const CHAR_H = 7;
const CHAR_GAP = 1;
const LINE_GAP = 3;

class DotMatrix {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cols = opts.cols || 56;
    this.rows = opts.rows || 4;
    this.on = opts.on || '#ffb000';
    this.off = opts.off || 'rgba(255,176,0,0.10)';
    this.lines = new Array(this.rows).fill('');
    this.dotCols = this.cols * (CHAR_W + CHAR_GAP) - CHAR_GAP;
    this.dotRows = this.rows * (CHAR_H + LINE_GAP) - LINE_GAP;
    this._raf = null;
    this._resize = this._resize.bind(this);
    this._draw = this._draw.bind(this);
    window.addEventListener('resize', this._resize);
    this._resize();
  }

  setColors(on, off) {
    if (on) this.on = on;
    if (off) this.off = off;
  }

  setLines(arr) {
    for (let i = 0; i < this.rows; i++) {
      this.lines[i] = (arr[i] || '').toUpperCase();
    }
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth || 480;
    const h = this.canvas.clientHeight || 180;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._w = w;
    this._h = h;
  }

  _visible(text, now) {
    if (text.length <= this.cols) return text.padEnd(this.cols, ' ');
    const scroller = text + '   ';
    const start = Math.floor(now / 220) % scroller.length;
    const doubled = scroller + scroller;
    return doubled.substr(start, this.cols);
  }

  _dot(cx, cy, r, color) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  _draw(now) {
    const ctx = this.ctx;
    const W = this._w;
    const H = this._h;
    ctx.clearRect(0, 0, W, H);

    const pad = 2;
    const pitch = Math.min((W - pad * 2) / (this.dotCols - 1), (H - pad * 2) / (this.dotRows - 1));
    const radius = pitch * 0.42;
    const startX = pad;
    const startY = (H - (this.dotRows - 1) * pitch) / 2;

    // Extend background grid to fill the entire canvas.
    const bgCols = Math.floor((W - pad) / pitch) + 1;
    const bgRows = Math.floor((H - pad) / pitch) + 1;
    const bgStartY = (H - (bgRows - 1) * pitch) / 2;

    // Unlit background grid for the authentic matrix texture.
    for (let r = 0; r < bgRows; r++) {
      for (let c = 0; c < bgCols; c++) {
        this._dot(startX + c * pitch, bgStartY + r * pitch, radius, this.off);
      }
    }

    // Lit glyph pixels.
    ctx.shadowColor = this.on;
    ctx.shadowBlur = radius * 1.6;
    for (let line = 0; line < this.rows; line++) {
      const text = this._visible(this.lines[line] || '', now);
      for (let i = 0; i < this.cols; i++) {
        const glyph = FONT[text[i]] || FONT[' '];
        for (let gy = 0; gy < CHAR_H; gy++) {
          const rowBits = glyph[gy];
          for (let gx = 0; gx < CHAR_W; gx++) {
            if (rowBits[gx] !== '1') continue;
            const c = i * (CHAR_W + CHAR_GAP) + gx;
            const rr = line * (CHAR_H + LINE_GAP) + gy;
            this._dot(startX + c * pitch, startY + rr * pitch, radius, this.on);
          }
        }
      }
    }
    ctx.shadowBlur = 0;

    this._raf = requestAnimationFrame(this._draw);
  }

  start() {
    if (!this._raf) this._raf = requestAnimationFrame(this._draw);
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }
}

window.DotMatrix = DotMatrix;
