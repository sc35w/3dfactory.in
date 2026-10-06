// 3Dfactory instant quote — STL/DXF viewer + estimate.
// Ported from the original "Get a Quote Now" page: same technologies, materials,
// ₹/cm³ rates and order flow (file + details → Google Apps Script → Razorpay).
(function () {
  var CFG = window.QUOTE_CONFIG;
  var viewerEl = document.getElementById('viewer');
  var fileInput = document.getElementById('upload');
  var scaleInput = document.getElementById('scale-value');
  var $ = function (id) { return document.getElementById(id); };

  var scene, camera, renderer, controls, current = null;
  var base = { volume: 0, x: 0, y: 0, z: 0, kind: null }; // raw model units (mm or inch)
  var modelVolume = 0; // cm³, after unit + scale
  var selectedFile = null;

  // ---------- Three.js scene ----------
  function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    camera = new THREE.PerspectiveCamera(45, viewerEl.clientWidth / viewerEl.clientHeight, 0.1, 100000);
    camera.position.set(0, 0, 100);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(viewerEl.clientWidth, viewerEl.clientHeight);
    viewerEl.appendChild(renderer.domElement);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    window.addEventListener('resize', function () {
      camera.aspect = viewerEl.clientWidth / viewerEl.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(viewerEl.clientWidth, viewerEl.clientHeight);
    });
    (function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    })();
  }

  function fitCamera(object) {
    var box = new THREE.Box3().setFromObject(object);
    var center = box.getCenter(new THREE.Vector3());
    var size = box.getSize(new THREE.Vector3()).length() || 1;
    controls.target.copy(center);
    camera.position.set(center.x + size * 0.6, center.y + size * 0.4, center.z + size * 1.1);
    camera.near = size / 1000; camera.far = size * 100;
    camera.updateProjectionMatrix();
  }

  function setObject(obj) {
    if (current) scene.remove(current);
    current = obj;
    scene.add(obj);
    applyScale();
    viewerEl.classList.add('has-model');
  }

  // ---------- File handling ----------
  function handleFile(file) {
    var ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'stl' && ext !== 'dxf') { alert('Please upload an .stl or .dxf file.'); return; }
    selectedFile = file;
    $('file-name').textContent = file.name;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        if (ext === 'stl') loadSTL(e.target.result); else loadDXF(e.target.result);
      } catch (err) {
        console.error(err);
        alert('Sorry, this file could not be read. Please check the file or send it to us on WhatsApp.');
      }
    };
    if (ext === 'stl') reader.readAsArrayBuffer(file); else reader.readAsText(file);
  }

  function loadSTL(buffer) {
    var geometry = new THREE.STLLoader().parse(buffer);
    var pos = geometry.attributes.position.array;
    var vol = 0, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < pos.length; i += 9) {
      var ax = pos[i], ay = pos[i + 1], az = pos[i + 2];
      var bx = pos[i + 3], by = pos[i + 4], bz = pos[i + 5];
      var cx = pos[i + 6], cy = pos[i + 7], cz = pos[i + 8];
      // signed tetrahedron volume: a · (b × c) / 6
      vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
      for (var k = 0; k < 9; k += 3) {
        for (var d = 0; d < 3; d++) {
          var v = pos[i + k + d];
          if (v < min[d]) min[d] = v;
          if (v > max[d]) max[d] = v;
        }
      }
    }
    base = { volume: Math.abs(vol), x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2], kind: 'stl' };
    var mesh = new THREE.Mesh(geometry, new THREE.MeshNormalMaterial({ flatShading: true }));
    setObject(mesh);
  }

  function loadDXF(text) {
    var dxf = new window.DxfParser().parseSync(text);
    var pts = [];
    var seg = function (a, b) { pts.push(a.x, a.y, a.z || 0, b.x, b.y, b.z || 0); };
    var arc = function (c, r, a0, a1) {
      if (a1 < a0) a1 += Math.PI * 2;
      var n = Math.max(12, Math.ceil((a1 - a0) / (Math.PI / 24)));
      for (var i = 0; i < n; i++) {
        var t0 = a0 + (a1 - a0) * i / n, t1 = a0 + (a1 - a0) * (i + 1) / n;
        seg({ x: c.x + r * Math.cos(t0), y: c.y + r * Math.sin(t0) }, { x: c.x + r * Math.cos(t1), y: c.y + r * Math.sin(t1) });
      }
    };
    (dxf.entities || []).forEach(function (e) {
      var v = e.vertices;
      if ((e.type === 'LINE' || e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && v && v.length > 1) {
        for (var i = 0; i < v.length - 1; i++) seg(v[i], v[i + 1]);
        if (e.shape || e.closed) seg(v[v.length - 1], v[0]);
      } else if (e.type === 'CIRCLE') {
        arc(e.center, e.radius, 0, Math.PI * 2);
      } else if (e.type === 'ARC') {
        arc(e.center, e.radius, e.startAngle, e.endAngle);
      }
    });
    if (!pts.length) throw new Error('No supported DXF entities');
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.computeBoundingBox();
    var bb = g.boundingBox;
    base = { volume: 0, x: bb.max.x - bb.min.x, y: bb.max.y - bb.min.y, z: bb.max.z - bb.min.z, kind: 'dxf' };
    setObject(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x0f172a })));
  }

  // ---------- Units, scale, stats ----------
  function factor() {
    var unit = document.querySelector('input[name="unit"]:checked').value;
    var scale = (parseFloat(scaleInput.value) || 100) / 100;
    return (unit === 'inch' ? 25.4 : 1) * scale; // → mm
  }

  function applyScale() {
    if (!current) return;
    var s = (parseFloat(scaleInput.value) || 100) / 100;
    current.scale.set(s, s, s);
    fitCamera(current);
    var f = factor();
    modelVolume = base.volume * f * f * f / 1000; // mm³ → cm³
    $('dim-x').textContent = (base.x * f / 10).toFixed(2);
    $('dim-y').textContent = (base.y * f / 10).toFixed(2);
    $('dim-z').textContent = (base.z * f / 10).toFixed(2);
    $('stats').textContent = base.kind === 'stl'
      ? 'Volume: ' + (modelVolume * 1000).toFixed(2) + ' mm³ (' + modelVolume.toFixed(2) + ' cm³)'
      : '2D drawing (DXF): we will confirm the price after reviewing your file.';
    showEstimate();
  }

  function estimate() {
    var matEl = $('material');
    var infill = parseFloat($('infill').value || 0);
    var costPerCm3 = parseFloat(matEl.selectedOptions[0].getAttribute('data-cost') || 0);
    var volumeUsed = modelVolume * (infill / 100);
    return {
      tech: $('technology').value, material: matEl.value, infill: infill,
      costPerCm3: costPerCm3, volumeUsed: volumeUsed, total: volumeUsed * costPerCm3
    };
  }

  var inr = function (n) { return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

  function showEstimate() {
    var e = estimate();
    $('estimate').innerHTML =
      '<dl>' +
      '<dt>Technology</dt><dd>' + e.tech + '</dd>' +
      '<dt>Material</dt><dd>' + e.material + '</dd>' +
      '<dt>Infill</dt><dd>' + e.infill + '%</dd>' +
      '<dt>Volume used</dt><dd>' + e.volumeUsed.toFixed(2) + ' cm³</dd>' +
      '<dt>Cost per cm³</dt><dd>' + inr(e.costPerCm3) + '</dd>' +
      '</dl>' +
      '<div class="total"><span>Total estimated cost</span><span>' + (base.kind ? inr(e.total) : '—') + '</span></div>';
  }

  // ---------- Send details & pay ----------
  // With a Google Apps Script URL configured: upload file + details there (saved to
  // Drive/Sheet, emailed to us), then continue to Razorpay as on the original site.
  // Without one: open WhatsApp with the details so the customer can attach the file.
  function details() {
    var e = estimate();
    return {
      type: 'instant',
      name: $('user-name').value.trim(),
      phone: $('user-phone').value.trim(),
      email: $('user-email').value.trim(),
      address: $('user-address').value.trim(),
      website: $('user-website').value,
      technology: e.tech, material: e.material, infill: e.infill + '%',
      scale: (parseFloat(scaleInput.value) || 100) + '%',
      unit: document.querySelector('input[name="unit"]:checked').value,
      dimX: $('dim-x').textContent, dimY: $('dim-y').textContent, dimZ: $('dim-z').textContent,
      volume: modelVolume.toFixed(2), total: e.total.toFixed(2)
    };
  }

  function whatsappText(d, file) {
    return 'Hi 3Dfactory, I would like to order a 3D print.\n' +
      'Name: ' + d.name + '\nPhone: ' + d.phone + (d.email ? '\nEmail: ' + d.email : '') +
      '\nShipping address: ' + d.address +
      '\nFile: ' + (file ? file.name : '-') +
      '\nTechnology: ' + d.technology + ', Material: ' + d.material + ', Infill: ' + d.infill +
      '\nSize: ' + d.dimX + ' × ' + d.dimY + ' × ' + d.dimZ + ' cm, Volume: ' + d.volume + ' cm³' +
      '\nEstimated cost: ₹' + d.total +
      '\n(I will attach my 3D file in this chat.)';
  }

  function openWhatsApp(d, file) {
    window.open('https://wa.me/' + CFG.whatsapp + '?text=' + encodeURIComponent(whatsappText(d, file)), '_blank', 'noopener');
  }

  function readBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1]); };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function sendDetailsAndRedirect() {
    var d = details();
    var file = selectedFile;
    if (!d.name || !d.phone || !d.address || !file) {
      alert('Please upload your 3D file and fill in your name, phone number and shipping address.');
      return;
    }
    if (!CFG.appsScriptUrl) { openWhatsApp(d, file); return; }
    if (file.size > CFG.maxFileMB * 1024 * 1024) {
      alert('Your file is larger than ' + CFG.maxFileMB + ' MB. Please send it to us on WhatsApp instead.');
      openWhatsApp(d, file);
      return;
    }
    var btn = $('send-details');
    btn.disabled = true; btn.textContent = 'Uploading…';
    var reset = function () { btn.disabled = false; btn.textContent = 'Send Details and Pay Now'; };

    readBase64(file)
      .then(function (data) {
        d.file = { name: file.name, data: data };
        // text/plain keeps this a "simple" request, which Apps Script accepts cross-origin
        return fetch(CFG.appsScriptUrl, { method: 'POST', body: JSON.stringify(d) });
      })
      .then(function (res) { return res.json(); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.error || 'Upload failed');
        alert('Details and file uploaded successfully! Taking you to payment.');
        window.location.href = CFG.razorpay;
      })
      .catch(function (err) {
        console.error(err);
        reset();
        if (confirm('Sorry, we could not upload your file. Send your details on WhatsApp instead?')) openWhatsApp(d, file);
      });
  }

  // ---------- Wire up ----------
  initScene();
  viewerEl.addEventListener('click', function () { fileInput.click(); });
  $('upload-model').addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () { if (fileInput.files.length) handleFile(fileInput.files[0]); });
  ['dragenter', 'dragover'].forEach(function (t) {
    viewerEl.addEventListener(t, function (e) { e.preventDefault(); viewerEl.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    viewerEl.addEventListener(t, function (e) { e.preventDefault(); viewerEl.classList.remove('dragover'); });
  });
  viewerEl.addEventListener('drop', function (e) {
    var f = e.dataTransfer.files[0];
    if (!f) return;
    try { var dt = new DataTransfer(); dt.items.add(f); fileInput.files = dt.files; } catch (_) {}
    handleFile(f);
  });
  scaleInput.addEventListener('input', applyScale);
  document.querySelectorAll('input[name="unit"]').forEach(function (r) { r.addEventListener('change', applyScale); });
  ['technology', 'material', 'infill'].forEach(function (id) { $(id).addEventListener('change', showEstimate); });
  $('send-details').addEventListener('click', sendDetailsAndRedirect);
  showEstimate();
})();
