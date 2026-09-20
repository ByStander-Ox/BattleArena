/* ---- stubs mínimos para ejecutar la lógica en Node ---- */
function _Vec(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
_Vec.prototype.set = function (x, y, z) { this.x = x; this.y = y; this.z = z; return this; };
_Vec.prototype.copy = function (v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; };
_Vec.prototype.clone = function () { return new _Vec(this.x, this.y, this.z); };
_Vec.prototype.project = function () { return this; };
_Vec.prototype.setScalar = function (s) { this.x = this.y = this.z = s; return this; };

function _attr(n) { return { count: n, getX: () => 0, getY: () => 0, getZ: () => 0, setXY() { }, setX() { }, setY() { }, setZ() { }, needsUpdate: false }; }
function _Geo() { this.attributes = { position: _attr(8), uv: _attr(8), normal: _attr(8) }; }
_Geo.prototype.rotateX = function () { return this; };
_Geo.prototype.rotateY = function () { return this; };
_Geo.prototype.translate = function () { return this; };
_Geo.prototype.clone = function () { return new _Geo(); };
_Geo.prototype.dispose = function () { };
_Geo.prototype.computeBoundingBox = function () { this.boundingBox = { min: new _Vec(-1, -1, -1), max: new _Vec(1, 1, 1) }; };
function _Mat(o) { Object.assign(this, o || {}); this.color = { setHex() { } }; this.emissive = { setHex() { } }; this.opacity = 1; }
_Mat.prototype.clone = function () { return new _Mat(); };
_Mat.prototype.dispose = function () { };
_Mat.prototype.setProperty = function () { };

function _Obj3D() {
  this.position = new _Vec(); this.rotation = new _Vec(); this.scale = new _Vec(1, 1, 1);
  this.scale.setScalar = s => { this.scale.x = this.scale.y = this.scale.z = s; return this.scale; };
  this.children = []; this.userData = {}; this.visible = true; this.material = new _Mat(); this.geometry = new _Geo();
}
_Obj3D.prototype.add = function (c) { this.children.push(c); return this; };
_Obj3D.prototype.remove = function () { };
_Obj3D.prototype.traverse = function (cb) { cb(this); for (const c of this.children) if (c.traverse) c.traverse(cb); };

function _mesh() { const o = new _Obj3D(); o.isMesh = true; return o; }

const THREE = {
  Vector2: function () { this.set = () => this; },
  Vector3: _Vec,
  Group: function () { return new _Obj3D(); },
  Mesh: function (g, m) { const o = _mesh(); o.geometry = g || new _Geo(); o.material = m || new _Mat(); return o; },
  Line: function (g, m) { const o = new _Obj3D(); o.geometry = g; o.material = m || new _Mat(); return o; },
  Points: function (g, m) { const o = new _Obj3D(); o.geometry = g; o.material = m; return o; },
  Color: function () { },
  Fog: function () { },
  Shape: function () {
    this.moveTo = () => this; this.lineTo = () => this; this.absarc = () => this;
    this.closePath = () => this; this.getPoints = n => Array.from({ length: n || 8 }, () => ({ x: 0, y: 0 }));
  },
  Raycaster: function () { this.ray = { intersectPlane: () => null }; this.setFromCamera = () => { }; },
  Plane: function () { },
  BufferGeometry: function () { const g = new _Geo(); g.setFromPoints = () => g; g.setAttribute = () => g; return g; },
  BufferAttribute: function () { },
  PerspectiveCamera: function () { const o = new _Obj3D(); o.lookAt = () => { }; o.updateMatrixWorld = () => { }; o.updateProjectionMatrix = () => { }; return o; },
  Clock: function () { this.getDelta = () => 1 / 60; this.start = () => { }; },
  Scene: function () { const o = new _Obj3D(); o.background = null; return o; },
  WebGLRenderer: function () { this.setPixelRatio = () => { }; this.setSize = () => { }; this.render = () => { }; this.shadowMap = {}; this.capabilities = { getMaxAnisotropy: () => 4 }; },
  HemisphereLight: _Obj3D, DirectionalLight: function () { const o = new _Obj3D(); o.shadow = { mapSize: { set() { } }, camera: {} }; return o; },
  PointLight: _Obj3D, CanvasTexture: function () { },
  PCFSoftShadowMap: 1, sRGBEncoding: 1, AdditiveBlending: 1, DoubleSide: 2
};
for (const g of ['BoxGeometry', 'SphereGeometry', 'CylinderGeometry', 'ConeGeometry', 'RingGeometry', 'TorusGeometry',
  'CircleGeometry', 'ShapeGeometry', 'ExtrudeGeometry', 'DodecahedronGeometry', 'OctahedronGeometry']) {
  THREE[g] = function () { return new _Geo(); };
}
for (const m of ['MeshStandardMaterial', 'MeshBasicMaterial', 'LineBasicMaterial', 'PointsMaterial']) {
  THREE[m] = function (o) { return new _Mat(o); };
}
globalThis.THREE = THREE;
globalThis.window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() { }, matchMedia: () => ({ matches: false }) };
globalThis.document = {
  createElement: () => ({ getContext: () => null, style: {}, classList: { add() { }, toggle() { }, remove() { } }, appendChild() { }, querySelector: () => null }),
  getElementById: () => null, querySelectorAll: () => [], body: { classList: { toggle() { } } }
};
globalThis.addEventListener = () => { };
globalThis.matchMedia = () => ({ matches: false });
globalThis.requestAnimationFrame = () => { };
globalThis.floatNum = () => { };
globalThis.feed = () => { };
globalThis.announce = () => { };
globalThis.devicePixelRatio = 1;
