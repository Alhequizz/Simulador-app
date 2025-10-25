// --- CONSTANTES E DADOS ---
const playIconSVG = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
const pauseIconSVG = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
const planetColors = ['#4A90E2', '#E27D4A', '#A2E24A', '#E24A7D', '#4AE2D6', '#D64AE2', '#E2A24A', '#8cffda', '#ff8ca9'];
const BASE_SPEED_FACTOR = 120000;
const MAX_TRAIL_LENGTH = 50;
const planets = {
    mercurio: { name: 'Mercúrio', e: 0.205, p: 95, color: planetColors[0], isActive: false, angle: 0, trail: [], omega: 0 },
    venus:    { name: 'Vênus', e: 0.007, p: 180, color: planetColors[1], isActive: false, angle: 0, trail: [], omega: 0 },
    terra:    { name: 'Terra', e: 0.017, p: 250, color: planetColors[2], isActive: false, angle: 0, trail: [], omega: 0 },
    marte:    { name: 'Marte', e: 0.093, p: 375, color: planetColors[3], isActive: false, angle: 0, trail: [], omega: 0 },
    jupiter:  { name: 'Júpiter', e: 0.048, p: 1300, color: planetColors[4], isActive: false, angle: 0, trail: [], omega: 0 },
    saturno:  { name: 'Saturno', e: 0.054, p: 2380, color: planetColors[5], isActive: false, angle: 0, trail: [], omega: 0 },
    urano:    { name: 'Urano', e: 0.047, p: 4780, color: planetColors[6], isActive: false, angle: 0, trail: [], omega: 0 },
    netuno:   { name: 'Netuno', e: 0.009, p: 7500, color: planetColors[7], isActive: false, angle: 0, trail: [], omega: 0 },
    halley:   { name: 'Cometa Halley', e: 0.967, p: 289, color: planetColors[8], isActive: false, angle: 0, trail: [], omega: 0 },
    custom:   { name: 'Customizado', e: 0.6, p: 400, color: '#FFFFFF', isActive: false, angle: 0, trail: [], omega: 0 }
};

// --- SETUP DOS ELEMENTOS DO DOM ---
const canvas = document.getElementById('orbitCanvas');
const ctx = canvas.getContext('2d');
const pInput = document.getElementById('pInput'), eInput = document.getElementById('eInput');
const playPauseBtn = document.getElementById('playPauseBtn'), clearAllBtn = document.getElementById('clearAllBtn'), toggleOrbitBtn = document.getElementById('toggleOrbitBtn');
const showFocusCheckbox = document.getElementById('showFocusCheckbox'), showApsidesCheckbox = document.getElementById('showApsidesCheckbox'), showTrailCheckbox = document.getElementById('showTrailCheckbox');
const timeSpeedSlider = document.getElementById('timeSpeedSlider'), timeSpeedValue = document.getElementById('timeSpeedValue');
const massInput = document.getElementById('massInput'), planetList = document.getElementById('planet-list');
const fitViewBtn = document.getElementById('fitViewBtn'), alignPlanetsBtn = document.getElementById('alignPlanetsBtn');
const analyzeKepler2Btn = document.getElementById('analyzeKepler2Btn');
const activePlanetsListDiv = document.getElementById('active-planets-list');

// --- VARIÁVEIS DE ESTADO ---
let origin = { x: 0, y: 0 };
let scale = 1.0, panOffset = { x: 0, y: 0 }, isDragging = false, dragStart = { x: 0, y: 0 };
let isPaused = false, isOrbitVisible = true, showEmptyFocus = false, showApsidesLine = false, showPlanetTrail = true;
let timeSpeedMultiplier = 0.1, starMass = 1.0;
let stars = [];
let initialPinchDistance = 0, highlightedPlanetId = null, isAnalyzing = false;
let analysisState = { stage: 'idle', planetId: null, perihelionPath: [], aphelionPath: [], areaPerihelion: 0, areaAphelion: 0 };

// --- LÓGICA DE REDIMENSIONAMENTO ---
function resizeCanvas() {
    const containerWidth = canvas.clientWidth;
    if (window.innerWidth <= 1000) {
        canvas.height = containerWidth * 1;
    } else {
        canvas.height = containerWidth * (9 / 16);
    }
    canvas.width = containerWidth;
    origin.x = canvas.width / 2;
    origin.y = canvas.height / 2;
    stars = [];
    createStars();
}

// --- FUNÇÕES DE CÁLCULO ---
function populatePlanetList() { Object.keys(planets).forEach(id => { if (id === 'custom') return; const p = planets[id]; const li = document.createElement('li'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.id = id; checkbox.dataset.planet = id; checkbox.checked = p.isActive; const label = document.createElement('label'); label.htmlFor = id; label.textContent = p.name; li.appendChild(checkbox); li.appendChild(label); planetList.appendChild(li); }); }
function calculatePosition(angle, p, e, omega = 0) { const r = p / (1 + e * Math.cos(angle - omega)); return { x: r * Math.cos(angle), y: r * Math.sin(angle) }; }
function calculateOrbitalPeriod(p, e, mass) { if (e >= 1) return "∞"; const p_earth = planets.terra.p, e_earth = planets.terra.e; const a_earth_px = p_earth / (1 - e_earth**2); const a_curr_px = p / (1 - e**2); const a_curr_au = a_curr_px / a_earth_px; const period_y = Math.sqrt(Math.pow(a_curr_au, 3) / mass); if (period_y < 1) return `${(period_y * 365.25).toFixed(1)} d`; return `${period_y.toFixed(2)} a`; }
function calculateTangentVector(angle, p, e, omega = 0) { const theta = angle - omega; const r = p / (1 + e * Math.cos(theta)); const dr_d_angle = (p * e * Math.sin(theta)) / ((1 + e * Math.cos(theta)) ** 2); const dx_d_angle = dr_d_angle * Math.cos(angle) - r * Math.sin(angle); const dy_d_angle = dr_d_angle * Math.sin(angle) + r * Math.cos(angle); const mag = Math.sqrt(dx_d_angle**2 + dy_d_angle**2); if (mag === 0) return { x: 0, y: 0 }; const sf = 30; return { x: (dx_d_angle / mag) * sf, y: (dy_d_angle / mag) * sf }; }
function hexToRgb(hex) { const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : {r:255,g:255,b:255}; }

// --- FUNÇÕES DE DESENHO (RENDER) ---
function createStars() { for (let i = 0; i < 200; i++) { stars.push({ x: Math.random() * canvas.width * 2 - canvas.width, y: Math.random() * canvas.height * 2 - canvas.height, radius: Math.random() * 1.5 }); } }
function drawStars() { ctx.fillStyle = 'white'; stars.forEach(s => { ctx.beginPath(); ctx.arc(s.x, s.y, s.radius, 0, 2 * Math.PI); ctx.fill(); }); }
function drawPlanetTrail(trail, color) { for (let i = 0; i < trail.length; i++) { const pos = trail[i]; const opacity = i / trail.length; ctx.beginPath(); ctx.arc(pos.x, pos.y, 2 / scale, 0, 2 * Math.PI); const rgb = hexToRgb(color); ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`; ctx.fill(); } }
function drawOrbitPath(p, e, omega = 0) { ctx.beginPath(); ctx.strokeStyle = '#3c3c3c'; ctx.lineWidth = 1 / scale; const step = 0.01; for (let angle = 0; angle <= 2 * Math.PI; angle += step) { const pos = calculatePosition(angle, p, e, omega); if (angle === 0) ctx.moveTo(pos.x, pos.y); else ctx.lineTo(pos.x, pos.y); } if (e < 1) ctx.closePath(); ctx.stroke(); }
function drawStar() { ctx.beginPath(); ctx.arc(0, 0, 10 / scale, 0, 2 * Math.PI); ctx.fillStyle = '#FFD700'; ctx.fill(); }
function drawEmptyFocus(planet) { const a = planet.p / (1 - planet.e**2); const c = a * planet.e; const focusPos = {x: -2 * c * Math.cos(planet.omega), y: -2 * c * Math.sin(planet.omega) }; const size = 5 / scale; ctx.beginPath(); ctx.moveTo(focusPos.x - size, focusPos.y - size); ctx.lineTo(focusPos.x + size, focusPos.y + size); ctx.moveTo(focusPos.x - size, focusPos.y + size); ctx.lineTo(focusPos.x + size, focusPos.y - size); ctx.strokeStyle = '#888'; ctx.lineWidth = 1 / scale; ctx.stroke(); }
function drawApsidesLine(planet) { const peri = calculatePosition(planet.omega, planet.p, planet.e, planet.omega); const aphe = calculatePosition(planet.omega + Math.PI, planet.p, planet.e, planet.omega); ctx.beginPath(); ctx.moveTo(peri.x, peri.y); ctx.lineTo(aphe.x, aphe.y); ctx.strokeStyle = '#666'; ctx.lineWidth = 1 / scale; ctx.setLineDash([5 / scale, 5 / scale]); ctx.stroke(); ctx.setLineDash([]); }
function drawApsidesLabels(planet) { const peri = calculatePosition(planet.omega, planet.p, planet.e, planet.omega); const aphe = calculatePosition(planet.omega + Math.PI, planet.p, planet.e, planet.omega); const offset = 10 / scale; ctx.fillStyle = '#ccc'; ctx.font = `${12 / scale}px Arial`; ctx.textAlign = 'left'; ctx.fillText("Periélio", peri.x + offset, peri.y); ctx.textAlign = 'right'; ctx.fillText("Afélio", aphe.x - offset, aphe.y); ctx.textAlign = 'left'; }
function drawPlanet(pos, p, e, angle, color, omega = 0) { ctx.beginPath(); ctx.arc(pos.x, pos.y, 5 / scale, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill(); const tangent = calculateTangentVector(angle, p, e, omega); const endVecX = pos.x + tangent.x / scale; const endVecY = pos.y + tangent.y / scale; ctx.beginPath(); ctx.moveTo(pos.x, pos.y); ctx.lineTo(endVecX, endVecY); ctx.strokeStyle = '#00FF00'; ctx.lineWidth = 2 / scale; ctx.stroke(); const headlen = 8 / scale; const tangentAngle = Math.atan2(tangent.y, tangent.x); ctx.beginPath(); ctx.moveTo(endVecX, endVecY); ctx.lineTo(endVecX - headlen * Math.cos(tangentAngle - Math.PI / 6), endVecY - headlen * Math.sin(tangentAngle - Math.PI / 6)); ctx.moveTo(endVecX, endVecY); ctx.lineTo(endVecX - headlen * Math.cos(tangentAngle + Math.PI / 6), endVecY - headlen * Math.sin(tangentAngle + Math.PI / 6)); ctx.stroke(); }
function drawHighlight(pos) { ctx.beginPath(); ctx.arc(pos.x, pos.y, 10 / scale, 0, 2 * Math.PI); ctx.strokeStyle = '#00FF00'; ctx.lineWidth = 2 / scale; ctx.stroke(); }
function updateActivePlanetsPanel(mass) { activePlanetsListDiv.innerHTML = ''; Object.keys(planets).forEach(id => { const planet = planets[id]; if (planet.isActive) { const periodText = calculateOrbitalPeriod(planet.p, planet.e, mass); const item = document.createElement('div'); item.className = 'active-planet-item'; item.dataset.planetId = id; if (id === highlightedPlanetId) item.classList.add('highlighted'); item.innerHTML = `<div class="active-planet-header"><div class="color-swatch" style="background-color: ${planet.color};"></div><span>${planet.name}</span></div><div class="active-planet-data"><span>e: ${planet.e.toFixed(3)}</span><span>p: ${planet.p.toFixed(0)}</span><span>T: ${periodText}</span></div>`; activePlanetsListDiv.appendChild(item); } }); }
function drawScaleIndicator() { const p_earth = planets.terra.p, e_earth = planets.terra.e; const pixelsPerAU = p_earth / (1 - e_earth**2); const barScreenLength = 100; const barWorldLength = barScreenLength / scale; const barAULength = barWorldLength / pixelsPerAU; ctx.fillStyle = '#f0f0f0'; ctx.font = '12px Arial'; ctx.fillText(`${barAULength.toFixed(2)} AU`, 20, canvas.height - 35); ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(20, canvas.height - 25); ctx.lineTo(20 + barScreenLength, canvas.height - 25); ctx.moveTo(20, canvas.height - 30); ctx.lineTo(20, canvas.height - 20); ctx.moveTo(20 + barScreenLength, canvas.height - 30); ctx.lineTo(20 + barScreenLength, canvas.height - 20); ctx.stroke(); }
function runKepler2Analysis() { const planet = planets[analysisState.planetId]; if (!planet) { isAnalyzing = false; return; } const duration = 30; const calculateSweep = (startAngle) => { let currentAngle = startAngle; let area = 0; let path = [calculatePosition(currentAngle, planet.p, planet.e, planet.omega)]; for(let i=0; i < duration; i++) { const pos = calculatePosition(currentAngle, planet.p, planet.e, planet.omega); const r = Math.sqrt(pos.x**2 + pos.y**2); const dAngle = (BASE_SPEED_FACTOR / (r*r)) * (1/60); currentAngle += dAngle; area += 0.5 * r * r * dAngle; path.push(calculatePosition(currentAngle, planet.p, planet.e, planet.omega)); } return { path, area }; }; const perihelion = calculateSweep(planet.omega); analysisState.perihelionPath = perihelion.path; analysisState.areaPerihelion = perihelion.area; const aphelion = calculateSweep(planet.omega + Math.PI); analysisState.aphelionPath = aphelion.path; analysisState.areaAphelion = aphelion.area; analysisState.stage = 'finished'; }
function drawKeplerAnalysis() { const drawSector = (path, color) => { if(path.length === 0) return; const rgb = hexToRgb(color); ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`; ctx.beginPath(); ctx.moveTo(0, 0); path.forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath(); ctx.fill(); }; drawSector(analysisState.perihelionPath, '#00FF00'); drawSector(analysisState.aphelionPath, '#FF00FF'); if (analysisState.stage === 'finished') { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'white'; ctx.font = '18px Poppins'; ctx.textAlign = 'center'; ctx.fillText(`Área no Periélio: ${analysisState.areaPerihelion.toFixed(0)} pixels²`, canvas.width / 2, 40); ctx.fillText(`Área no Afélio: ${analysisState.areaAphelion.toFixed(0)} pixels²`, canvas.width / 2, 65); ctx.font = 'bold 20px Poppins'; ctx.fillStyle = '#00FF00'; ctx.fillText('As áreas são (aproximadamente) iguais!', canvas.width / 2, 95); ctx.restore(); } }

// --- FUNÇÕES DE ATUALIZAÇÃO E ANIMAÇÃO ---
function updatePhysics(activePlanets) { if (isAnalyzing) return; activePlanets.forEach(planet => { const r_vec = calculatePosition(planet.angle, planet.p, planet.e, planet.omega); const r_mag = Math.sqrt(r_vec.x**2 + r_vec.y**2); if (r_mag > 0) planet.angle += (BASE_SPEED_FACTOR / (r_mag * r_mag)) * (1 / 60) * timeSpeedMultiplier * Math.sqrt(starMass); if (planet.angle > 2 * Math.PI) planet.angle -= 2 * Math.PI; }); }

function renderScene() {
    starMass = parseFloat(massInput.value); if (isNaN(starMass) || starMass <= 0) starMass = 1.0;
    const activePlanetsList = Object.values(planets).filter(p => p.isActive);
    analyzeKepler2Btn.disabled = !(activePlanetsList.length === 1 && activePlanetsList[0].e < 1);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawStars();
    
    ctx.save();
    ctx.translate(origin.x, origin.y);
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(scale, scale);
    drawStar();
    
    activePlanetsList.forEach(planet => {
        const currentPos = calculatePosition(planet.angle, planet.p, planet.e, planet.omega);
        if (showPlanetTrail && !isAnalyzing) { 
            if (!isPaused) { planet.trail.push(currentPos); if (planet.trail.length > MAX_TRAIL_LENGTH) planet.trail.shift(); } 
            drawPlanetTrail(planet.trail, planet.color);
        }
        if (isOrbitVisible) drawOrbitPath(planet.p, planet.e, planet.omega);
        if (showEmptyFocus && planet.e < 1) drawEmptyFocus(planet);
        if (showApsidesLine && planet.e < 1) { drawApsidesLine(planet); drawApsidesLabels(planet); }
        drawPlanet(currentPos, planet.p, planet.e, planet.angle, planet.color, planet.omega);
        if (planet.id === highlightedPlanetId) drawHighlight(currentPos);
    });
    if (isAnalyzing) drawKeplerAnalysis();
    
    ctx.restore();
    updateActivePlanetsPanel(starMass);
    drawScaleIndicator();
}

function animate() { if (!isPaused) { updatePhysics(Object.values(planets).filter(p => p.isActive)); } renderScene(); requestAnimationFrame(animate); }

// --- CONTROLES DE EVENTOS ---
function saveState() { const activeIds = Object.keys(planets).filter(id => planets[id].isActive); localStorage.setItem('orbitExplorerState', JSON.stringify(activeIds)); }
function loadState() { const savedState = localStorage.getItem('orbitExplorerState'); if (savedState) { const activeIds = JSON.parse(savedState); if (activeIds.length > 0) { Object.keys(planets).forEach(id => planets[id].isActive = false); activeIds.forEach(id => { if (planets[id]) planets[id].isActive = true; }); } } }
playPauseBtn.addEventListener('click', () => { isPaused = !isPaused; playPauseBtn.innerHTML = isPaused ? playIconSVG : pauseIconSVG; });
clearAllBtn.addEventListener('click', () => { Object.keys(planets).forEach(id => { planets[id].isActive = false; }); document.querySelectorAll('#sidebar input[type="checkbox"]').forEach(cb => cb.checked = false); saveState(); });
alignPlanetsBtn.addEventListener('click', () => { Object.values(planets).forEach(p => { if (p.isActive) { p.angle = p.omega; p.trail = []; } }); });
fitViewBtn.addEventListener('click', () => { const activeEllipses = Object.values(planets).filter(p => p.isActive && p.e < 1); if (activeEllipses.length === 0) { fitViewBtn.classList.add('error-flash'); setTimeout(() => fitViewBtn.classList.remove('error-flash'), 500); return; } let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity; activeEllipses.forEach(p => { for(let i=0; i<360; i++){ const pos = calculatePosition(i*Math.PI/180, p.p, p.e, p.omega); minX = Math.min(minX, pos.x); maxX = Math.max(maxX, pos.x); minY = Math.min(minY, pos.y); maxY = Math.max(maxY, pos.y); } }); const boxWidth = maxX - minX; const boxHeight = maxY - minY; if (boxWidth <= 0 || boxHeight <= 0) return; const scaleX = canvas.width / boxWidth; const scaleY = canvas.height / boxHeight; const newScale = Math.min(scaleX, scaleY) * 0.9; const centerX = (minX + maxX) / 2; const centerY = (minY + maxY) / 2; scale = newScale; panOffset.x = -centerX * scale; panOffset.y = -centerY * scale; });
analyzeKepler2Btn.addEventListener('click', () => { if (isAnalyzing || analyzeKepler2Btn.disabled) return; const wasPaused = isPaused; isPaused = true; isAnalyzing = true; const activePlanetId = Object.keys(planets).find(id => planets[id].isActive); analysisState = { stage: 'calculating', planetId: activePlanetId }; runKepler2Analysis(); setTimeout(() => { isAnalyzing = false; isPaused = wasPaused; }, 5000); });
toggleOrbitBtn.addEventListener('change', (e) => { isOrbitVisible = e.target.checked; });
showFocusCheckbox.addEventListener('change', (e) => { showEmptyFocus = e.target.checked; });
showApsidesCheckbox.addEventListener('change', (e) => { showApsidesLine = e.target.checked; });
showTrailCheckbox.addEventListener('change', (e) => { showPlanetTrail = e.target.checked; });
timeSpeedSlider.addEventListener('input', (e) => { timeSpeedMultiplier = parseFloat(e.target.value); timeSpeedValue.textContent = `${timeSpeedMultiplier.toFixed(1)}x`; });
document.getElementById('sidebar').addEventListener('change', (e) => { if (e.target && e.target.type === 'checkbox') { const planetId = e.target.dataset.planet; const planet = planets[planetId]; if (planet) { planet.isActive = e.target.checked; if (planet.isActive) { if (planetId === 'custom') { planet.p = parseFloat(pInput.value); planet.e = parseFloat(eInput.value); } planet.angle = planet.omega; planet.trail = []; } saveState(); } } });
activePlanetsListDiv.addEventListener('mouseover', e => { const item = e.target.closest('.active-planet-item'); if (item) highlightedPlanetId = item.dataset.planetId; });
activePlanetsListDiv.addEventListener('mouseout', () => { highlightedPlanetId = null; });
activePlanetsListDiv.addEventListener('click', e => { const item = e.target.closest('.active-planet-item'); if (item) { highlightedPlanetId = item.dataset.planetId; setTimeout(() => { highlightedPlanetId = null; }, 1000); } });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); const zI=0.1; const s=e.deltaY<0?1:-1; const z=Math.exp(s*zI); const mX=e.offsetX, mY=e.offsetY; const mWX=(mX-origin.x-panOffset.x)/scale, mWY=(mY-origin.y-panOffset.y)/scale; scale*=z; panOffset.x=mX-origin.x-mWX*scale; panOffset.y=mY-origin.y-mWY*scale; });
canvas.addEventListener('mousedown', (e) => { isDragging = true; dragStart.x = e.offsetX; dragStart.y = e.offsetY; });
canvas.addEventListener('mouseup', () => { isDragging = false; });
canvas.addEventListener('mouseleave', () => { isDragging = false; });
canvas.addEventListener('mousemove', (e) => { if (isDragging) { const dx = e.offsetX - dragStart.x; const dy = e.offsetY - dragStart.y; panOffset.x += dx; panOffset.y += dy; dragStart.x = e.offsetX; dragStart.y = e.offsetY; } });
function getDistance(t1, t2) { const dx = t1.clientX - t2.clientX; const dy = t1.clientY - t2.clientY; return Math.sqrt(dx * dx + dy * dy); }
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); const touches = e.touches; if (touches.length === 1) { isDragging = true; dragStart.x = touches[0].clientX; dragStart.y = touches[0].clientY; } else if (touches.length === 2) { isDragging = false; initialPinchDistance = getDistance(touches[0], touches[1]); } });
canvas.addEventListener('touchend', (e) => { if (e.touches.length < 2) initialPinchDistance = 0; if (e.touches.length < 1) isDragging = false; });
canvas.addEventListener('touchmove', (e) => { e.preventDefault(); const touches = e.touches; if (touches.length === 1 && isDragging) { const dx = touches[0].clientX - dragStart.x; const dy = touches[0].clientY - dragStart.y; panOffset.x += dx; panOffset.y += dy; dragStart.x = touches[0].clientX; dragStart.y = touches[0].clientY; } else if (touches.length === 2) { const newDist = getDistance(touches[0], touches[1]); if (initialPinchDistance <= 0) { initialPinchDistance = newDist; return; } const zF = newDist / initialPinchDistance; const rect = canvas.getBoundingClientRect(); const mX = (touches[0].clientX + touches[1].clientX) / 2, mY = (touches[0].clientY + touches[1].clientY) / 2; const oX = mX - rect.left, oY = mY - rect.top; const wX = (oX - origin.x - panOffset.x) / scale, wY = (oY - origin.y - panOffset.y) / scale; scale *= zF; panOffset.x = oX - origin.x - wX * scale; panOffset.y = oY - origin.y - wY * scale; initialPinchDistance = newDist; } });

// --- INICIALIZAÇÃO ---
window.addEventListener('resize', resizeCanvas);
playPauseBtn.innerHTML = pauseIconSVG;
loadState();
populatePlanetList();
resizeCanvas();
animate();
