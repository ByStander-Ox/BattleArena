/* ---- DOM falso: suficiente para ejecutar interfaz + bucle sin navegador ---- */
function FakeStyle() { }
FakeStyle.prototype.setProperty = function () { };
function FakeEl(tag) {
  this.tagName = tag || 'div';
  this.style = new FakeStyle();
  this.children = [];
  this.dataset = {};
  this._cls = new Set();
  this.textContent = '';
  this._html = '';
  this.classList = {
    add: c => this._cls.add(c), remove: c => this._cls.delete(c),
    toggle: (c, v) => { if (v === undefined) v = !this._cls.has(c); v ? this._cls.add(c) : this._cls.delete(c); return v; },
    contains: c => this._cls.has(c)
  };
}
Object.defineProperty(FakeEl.prototype, 'innerHTML', {
  get() { return this._html; },
  set(v) { this._html = v; this.children = []; }
});
Object.defineProperty(FakeEl.prototype, 'className', {
  get() { return [...this._cls].join(' '); },
  set(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
});
Object.defineProperty(FakeEl.prototype, 'firstChild', { get() { return this.children[0]; } });
FakeEl.prototype.appendChild = function (c) { this.children.push(c); return c; };
FakeEl.prototype.removeChild = function (c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; };
FakeEl.prototype.remove = function () { };
FakeEl.prototype.querySelector = function () { return new FakeEl('i'); };
FakeEl.prototype.querySelectorAll = function () { return []; };
FakeEl.prototype.addEventListener = function (k, fn) { (this._ev = this._ev || {})[k] = fn; };
FakeEl.prototype.setAttribute = function () { };
FakeEl.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: 100, height: 100 }; };
FakeEl.prototype.setPointerCapture = function () { };

const _ctx2d = new Proxy({}, {
  get: (t, k) => {
    if (k === 'canvas') return { width: 1024, height: 1024 };
    if (k === 'createRadialGradient') return () => ({ addColorStop() { } });
    return () => { };
  },
  set: () => true
});
const _els = {};
globalThis.document = {
  createElement(tag) { const e = new FakeEl(tag); if (tag === 'canvas') { e.getContext = () => _ctx2d; e.width = e.height = 1024; } return e; },
  getElementById(id) { return _els[id] || (_els[id] = new FakeEl('div')); },
  querySelectorAll() { return []; },
  body: new FakeEl('body')
};
globalThis.window = {
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  addEventListener() { }, matchMedia: () => ({ matches: false })
};
globalThis.addEventListener = () => { };
globalThis.matchMedia = () => ({ matches: false });
globalThis.requestAnimationFrame = () => { };
globalThis.devicePixelRatio = 1;
globalThis.AudioContext = undefined;
