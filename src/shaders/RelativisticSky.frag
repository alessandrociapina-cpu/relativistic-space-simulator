// Esfera celeste relativística V3 (CLAUDE.md §5).
// Convenção: o eixo de voo é exatamente −Z (uForward = (0,0,−1), Sol em +Z,
// alvo em −Z). Com o eixo alinhado a um eixo de coordenadas, dPerp e a direção
// de origem saem sem cancelamento em float32, mesmo para γ ~ 10¹².
precision highp float;

// --- Câmera: direção de cada pixel reconstruída de gl_FragCoord ---
// (não interpolada da geometria, para o telescópio aguentar zooms de ~10⁶×)
uniform vec3  uCamRight;
uniform vec3  uCamUp;
uniform vec3  uCamForward;
uniform vec2  uTanHalfFov;
uniform vec2  uViewportSize;

// --- Cinemática (64 bits na CPU → 32 bits na GPU) ---
uniform float uBeta;
uniform float uGamma;
uniform float uOneMinusBeta;
uniform vec3  uForward;
uniform float uTime;             // anima a convecção estelar e o disco de acreção

// --- Corpos ---
uniform vec3  uSunDir;
uniform float uSunRadiusRad;
uniform float uSunPointAmp;      // o Sol como estrela pontual, quando o disco fica menor que um pixel
uniform vec3  uTargetDir;
uniform float uTargetRadiusRad;
uniform float uTargetTemp;
uniform int   uTargetType;       // 0 = estrela, 1 = buraco negro (Sgr A*), 2 = galáxia (Andrômeda)
uniform float uTargetPointAmp;   // o alvo como estrela pontual, antes de virar disco
uniform float uGalaxyGain;       // brilho superficial da galáxia-alvo (escala da Via Láctea)
uniform float uTargetGain;       // olho ou câmera adaptados a uma estrela-alvo grande e pouco luminosa
uniform float uBackgroundGain;   // o fundo (estrelas e Via Láctea) perde brilho quando a exposição sobe por causa do alvo

// --- Céu real ---
uniform sampler2D uSensorLut;    // log₁₀ da cor do sensor por log₁₀T (1 024 × 1)
uniform sampler2D uStarCells;    // catálogo HYG em células de um cubo (N × 6N)
uniform float uStarCellsN;
uniform float uStarGain;         // 0 enquanto a grade não ficou pronta
uniform vec3  uShipOffset;       // nave agora − nave na montagem da grade (anos-luz)
uniform sampler2D uMilkyWayA;    // brilho difuso em coordenadas galácticas: log₁₀ε e fração do bojo
uniform sampler2D uMilkyWayB;
uniform float uMilkyWayMix;
uniform mat3  uShipToGalactic;
uniform float uStarDensity;      // densidade de estrelas local, relativa à vizinhança solar

// --- Óptica e olho ---
// 0 = Visível (380-750nm), 1 = Infravermelho, 2 = Ultravioleta, 3 = Raios-X
uniform int   uSensorMode;
uniform float uPsfAngleRad;
uniform float uExposure;
uniform float uEyeSensitivity;   // adaptação da retina (1 no escuro; menor após o white-out)
uniform float uGlareIntensity;   // véu de espalhamento (display-referred), 0 nos instrumentos
uniform vec3  uGlareColor;       // cor linear do corpo negro de T_pico, luminância 1

const float T_CMB_0 = 2.72548;
const float T_SUN   = 5778.0;
const float PI      = 3.14159265358979;
const float LOG2_10 = 3.32192809;
// Teto do σ da PSF no referencial de repouso (rad): o mesmo da grade de estrelas na CPU.
const float STAR_SIGMA_MAX = 3e-3;

// ============================================================================
// 1. RUÍDO SIMPLEX 3D (granulação estelar, disco de acreção, braços espirais)
// ============================================================================
vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 1.0 / 7.0;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * snoise(p);
        p *= 2.05;
        a *= 0.5;
    }
    return v;
}

// ============================================================================
// 2. CINEMÁTICA RELATIVÍSTICA NUMERICAMENTE ESTÁVEL
// ============================================================================
struct RelativisticRay {
    vec3  sourceDir;
    float cosThetaObs;
    float doppler;
    float solidAngleJac;
    float psfDilution;
};

RelativisticRay computeRelativisticRay(vec3 obsDir, vec3 forward) {
    vec3 d = normalize(obsDir);
    vec3 f = normalize(forward);
    float cosTheta = clamp(dot(d, f), -1.0, 1.0);
    vec3  dPerp    = d - cosTheta * f;
    float sin2Theta = dot(dPerp, dPerp);
    float oneMinusCos = (cosTheta >= 0.0)
        ? (sin2Theta / (1.0 + cosTheta))
        : (1.0 - cosTheta);
    // Regra 3: 1 − β·cosθ = δ + β(1 − cosθ), soma de termos não-negativos
    float oneMinusBetaCos = uOneMinusBeta + uBeta * oneMinusCos;
    oneMinusBetaCos = max(oneMinusBetaCos, 1e-30);
    float D = 1.0 / (uGamma * oneMinusBetaCos);
    float cosMinusBeta = uOneMinusBeta - oneMinusCos;
    vec3 srcUnnorm = (uGamma * cosMinusBeta) * f + dPerp;
    float effectiveGammaCone = uGamma * uPsfAngleRad;
    RelativisticRay ray;
    ray.sourceDir     = normalize(srcUnnorm);
    ray.cosThetaObs   = cosTheta;
    ray.doppler       = D;
    ray.solidAngleJac = D * D;
    ray.psfDilution   = 1.0 / (1.0 + effectiveGammaCone * effectiveGammaCone * exp(-sin2Theta * uGamma * uGamma));
    return ray;
}

// Ângulo entre direções sem acos: acos(x) perto de x = 1 só resolve ~3×10⁻⁴ rad
// em float32; atan(|a×b|, a·b) mantém precisão relativa em ângulos pequenos.
float angleBetween(vec3 a, vec3 b) {
    return atan(length(cross(a, b)), dot(a, b));
}

// σ da PSF de um ponto no referencial de repouso: um pixel do monitor, ampliado
// por D (a aberração encolhe os ângulos à frente na mesma proporção).
float pointSigma(RelativisticRay ray) {
    return clamp(uPsfAngleRad * ray.doppler, 1e-9, STAR_SIGMA_MAX);
}

// Halo das estrelas mais brilhantes que V ≈ 2 (o mesmo de starCells.ts).
float starHalo(float amp) {
    return 1.0 + 0.8 * max(0.0, sqrt(min(amp, 16.0)) - 0.7);
}

// ============================================================================
// 3. CORPO NEGRO DE PLANCK → SENSOR → sRGB LINEAR (tabela feita na CPU)
// ============================================================================
// A tabela guarda log₁₀ da cor de `sensorRgb` (src/physics/sensorResponse.ts):
// 8 amostras de Planck entre 380 e 730 nm pesadas pelas funções de cor CIE.
const float LUT_N = 1024.0;
const float LUT_LOG_MIN = 2.35;
const float LUT_LOG_MAX = 15.0;

vec3 sampleBlackbodySensor(float apparentTempK) {
    float scaleFactor = 1.0;
    if (uSensorMode == 1) scaleFactor = 12.0;
    else if (uSensorMode == 2) scaleFactor = 0.15;
    else if (uSensorMode == 3) scaleFactor = 0.01;
    float effectiveTemp = apparentTempK * scaleFactor;
    // Abaixo de ~254 K nenhum comprimento de onda visível tem fótons: 0.
    if (effectiveTemp < 250.0) return vec3(0.0);
    float x = (log2(effectiveTemp) / LOG2_10 - LUT_LOG_MIN) / (LUT_LOG_MAX - LUT_LOG_MIN) * (LUT_N - 1.0);
    x = clamp(x, 0.0, LUT_N - 1.001);
    float i = floor(x);
    vec3 a = texture2D(uSensorLut, vec2((i + 0.5) / LUT_N, 0.5)).rgb;
    vec3 b = texture2D(uSensorLut, vec2((i + 1.5) / LUT_N, 0.5)).rgb;
    return exp2(mix(a, b, x - i) * LOG2_10);
}

// ============================================================================
// 4. ESTRELAS RESOLVIDAS, SAGITTARIUS A* E ANDRÔMEDA
// ============================================================================
// Base tangente ao redor de uma direção; com o eixo de voo em ±Z, as
// projeções usam só as componentes x e y (precisas) de rayDir.
void tangentBasis(vec3 n, vec3 upHint, out vec3 right, out vec3 localUp) {
    right = normalize(cross(upHint, n));
    localUp = cross(n, right);
}

// Disco estelar com escurecimento de bordo, granulação convectiva, coroa e
// spikes de difração. `coverage` é a opacidade do disco (oculta estrelas atrás).
vec3 renderRealisticStarDisk(vec3 rayDir, vec3 centerDir, float radiusRad, float baseTempK, float doppler, out float coverage) {
    coverage = 0.0;
    vec3 n = normalize(centerDir);
    if (angleBetween(rayDir, n) > radiusRad * 6.0) return vec3(0.0);

    vec3 right, localUp;
    tangentBasis(n, abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), right, localUp);
    // Projeções são senos: o bordo fica em sen(raio), exato também de perto (raio de ~20°).
    float sinRadius = max(sin(radiusRad), 1e-30);
    float xProj = dot(rayDir, right) / sinRadius;
    float yProj = dot(rayDir, localUp) / sinRadius;
    float rNorm = length(vec2(xProj, yProj));

    vec3 result = vec3(0.0);
    if (rNorm <= 1.0) {
        float mu = sqrt(max(0.0, 1.0 - rNorm * rNorm));
        vec3 sphereNormal = normalize(xProj * right + yProj * localUp + mu * n);
        float granules = fbm(sphereNormal * 14.0 + vec3(0.0, 0.0, uTime * 0.04));
        float spots = smoothstep(0.35, 0.7, snoise(sphereNormal * 4.5));
        // Escurecimento de bordo só pela lei I(μ) = 1 − u(1 − μ^0,75), u = 0,68: baixar também a
        // temperatura no bordo escureceria duas vezes (muito numa anã vermelha, no regime de Wien).
        float limbDarkening = 1.0 - 0.68 * (1.0 - pow(mu, 0.75));
        float localTemp = baseTempK * (0.94 + 0.12 * granules - 0.18 * spots);
        coverage = 1.0 - smoothstep(0.96, 1.0, rNorm);
        result += sampleBlackbodySensor(localTemp * doppler) * limbDarkening * coverage;
    }

    float corona = exp(-max(rNorm - 0.95, 0.0) * 2.2) * 0.35;
    // Spikes de difração são do instrumento: somem quando o disco ocupa boa parte da tela.
    float spikeGain = 0.08 * (1.0 - smoothstep(0.02, 0.1, radiusRad));
    float spikeX = exp(-abs(xProj) * 18.0) * exp(-abs(yProj) * 1.2);
    float spikeY = exp(-abs(yProj) * 18.0) * exp(-abs(xProj) * 1.2);
    result += sampleBlackbodySensor(baseTempK * doppler) * (corona + (spikeX + spikeY) * spikeGain);
    return result;
}

// Sombra do buraco negro, anel de fótons e disco de acreção inclinado, com
// arcos de lensing acima e abaixo e beaming rotacional (lado que se aproxima mais quente).
vec3 renderBlackHoleTarget(vec3 rayDir, vec3 centerDir, float radiusRad, float baseTempK, float doppler, out float coverage) {
    coverage = 0.0;
    vec3 n = normalize(centerDir);
    if (angleBetween(rayDir, n) > radiusRad * 8.0) return vec3(0.0);

    vec3 right, localUp;
    tangentBasis(n, vec3(0.15, 0.98, 0.0), right, localUp);
    vec2 uv = vec2(dot(rayDir, right), dot(rayDir, localUp)) / max(radiusRad, 1e-30);
    float r = length(uv);

    float ringOffset = (r - 1.05) * 14.0;
    float photonRing = exp(-ringOffset * ringOffset) * 2.2;
    float rDisk = length(vec2(uv.x, uv.y * 3.8));
    float diskMask = smoothstep(1.1, 1.4, r) * exp(-max(rDisk - 1.4, 0.0) * 0.9);
    float lensOffset = (r - 1.35) * 2.5;
    float lensedMask = smoothstep(0.95, 1.15, r) * exp(-lensOffset * lensOffset);

    float swirl = fbm(vec3(uv * 3.5, uTime * 0.25));
    float rotationDoppler = 1.0 - 0.35 * (uv.x / max(r, 0.5));
    vec3 diskColor = sampleBlackbodySensor(baseTempK * rotationDoppler * (0.85 + 0.3 * swirl) * doppler);

    float shadowMask = smoothstep(0.96, 1.04, r);
    coverage = 1.0 - shadowMask;
    return diskColor * ((diskMask + lensedMask * 0.7) * shadowMask + photonRing);
}

// Disco espiral inclinado: bojo dourado e braços logarítmicos com FBM.
vec3 renderGalaxyTarget(vec3 rayDir, vec3 centerDir, float radiusRad, float baseTempK, float doppler) {
    vec3 n = normalize(centerDir);
    if (angleBetween(rayDir, n) > radiusRad * 6.0) return vec3(0.0);

    vec3 right, localUp;
    tangentBasis(n, normalize(vec3(0.4, 0.9, 0.1)), right, localUp);
    vec2 uv = vec2(dot(rayDir, right), dot(rayDir, localUp) * 2.4) / max(radiusRad, 1e-30);
    float r = length(uv);
    float phi = atan(uv.y, uv.x + 1e-9);

    float spiral = cos(2.0 * phi - 4.5 * log(max(r, 0.05)) + fbm(vec3(uv * 2.5, 0.0)) * 1.8);
    float armDensity = smoothstep(-0.2, 0.8, spiral) * exp(-r * 1.1);
    float bulge = exp(-r * 3.5) * 1.8;
    return sampleBlackbodySensor(4500.0 * doppler) * bulge
         + sampleBlackbodySensor(baseTempK * 1.35 * doppler) * armDensity * 0.7;
}

// Estrela pontual (o alvo ou o Sol de longe), com halo nas mais brilhantes. Some
// à medida que o disco de raio `radiusRad` passa a cobrir alguns pixels.
vec3 renderPointSource(RelativisticRay ray, vec3 dir, float amp, float tempK, float radiusRad) {
    if (amp <= 0.0 || dot(ray.sourceDir, dir) <= 0.0) return vec3(0.0);
    float sigma = pointSigma(ray);
    float resolved = smoothstep(0.7, 2.5, radiusRad / sigma);
    if (resolved >= 1.0) return vec3(0.0);
    sigma *= starHalo(amp);
    vec3 c = cross(ray.sourceDir, dir);
    float profile = exp(-0.5 * dot(c, c) / (sigma * sigma));
    if (profile * amp < 1e-4) return vec3(0.0);
    float beaming = clamp(ray.solidAngleJac * ray.psfDilution, 0.0, 65.0);
    return sampleBlackbodySensor(tempK * ray.doppler) * amp * profile * beaming * (1.0 - resolved);
}

// ============================================================================
// 5. CÉU REAL: CATÁLOGO, VIA LÁCTEA E ESTRELAS DE FUNDO
// ============================================================================
// Célula do cubo que contém a direção (a mesma conta de starCells.ts).
vec2 starCellUv(vec3 d) {
    vec3 a = abs(d);
    float face;
    vec2 uv;
    if (a.x >= a.y && a.x >= a.z) { face = d.x > 0.0 ? 0.0 : 1.0; uv = d.yz / a.x; }
    else if (a.y >= a.z)          { face = d.y > 0.0 ? 2.0 : 3.0; uv = d.xz / a.y; }
    else                          { face = d.z > 0.0 ? 4.0 : 5.0; uv = d.xy / a.z; }
    vec2 cell = min(floor((uv * 0.5 + 0.5) * uStarCellsN), uStarCellsN - 1.0);
    return vec2((cell.x + 0.5) / uStarCellsN, (face * uStarCellsN + cell.y + 0.5) / (6.0 * uStarCellsN));
}

// Estrela do catálogo HYG dona da célula: direção e brilho pela posição atual da
// nave (paralaxe e 1/d² exatos), cor de corpo negro deslocada pelo Doppler.
vec3 renderCatalogStar(RelativisticRay ray) {
    if (uStarGain <= 0.0) return vec3(0.0);
    vec4 cell = texture2D(uStarCells, starCellUv(ray.sourceDir));
    if (cell.w <= 0.0) return vec3(0.0);
    vec3 rel = cell.xyz - uShipOffset;
    float dist2 = dot(rel, rel);
    vec3 dir = rel * inversesqrt(dist2);
    if (dot(ray.sourceDir, dir) <= 0.0) return vec3(0.0);
    float t10 = floor(cell.w / 1024.0);
    float lum = exp2((cell.w - t10 * 1024.0) * 0.01 * LOG2_10 - 2.0 * LOG2_10);
    float amp = 2.2 * pow(lum / dist2, 0.8);
    float sigma = pointSigma(ray) * starHalo(amp);
    vec3 c = cross(ray.sourceDir, dir);
    float profile = exp(-0.5 * dot(c, c) / (sigma * sigma));
    if (profile * amp < 1e-4) return vec3(0.0);
    float beaming = clamp(ray.solidAngleJac * ray.psfDilution, 0.0, 65.0);
    return sampleBlackbodySensor(t10 * 10.0 * ray.doppler) * amp * profile * beaming * uStarGain;
}

// Brilho difuso da Via Láctea na direção de origem: log₁₀ε e fração do bojo,
// interpolados entre os dois mapas mais próximos da posição da nave.
vec2 milkyWaySample(vec3 sourceDir) {
    vec3 g = uShipToGalactic * sourceDir;
    vec2 uv = vec2(atan(g.y, g.x) / (2.0 * PI) + 0.5, asin(clamp(g.z, -1.0, 1.0)) / PI + 0.5);
    return mix(texture2D(uMilkyWayA, uv).rg, texture2D(uMilkyWayB, uv).rg, uMilkyWayMix);
}

vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yxx) * p3.zyx);
}

// Estrelas de fundo procedurais, além do catálogo: a camada 0 é a população
// local, que só aparece onde há mais estrelas que perto do Sol (rumo ao centro
// galáctico); a camada 1 é o pó de estrelas fracas, mais denso na faixa da Via Láctea.
vec3 renderBackgroundStars(RelativisticRay ray, float glowRel) {
    vec3 stars = vec3(0.0);
    float localBoost = log(max(uStarDensity, 1.0)) / log(10.0);
    for (int layer = 0; layer < 2; layer++) {
        float gridScale = (layer == 0) ? 130.0 : 320.0;
        float probability = (layer == 0)
            ? clamp(0.008 * (pow(max(uStarDensity, 1.0), 0.4) - 1.0), 0.0, 0.18)
            : clamp(0.03 * pow(glowRel, 0.8), 0.004, 0.25);
        vec3 cell = floor(ray.sourceDir * gridScale);
        vec3 rnd  = hash33(cell + float(layer) * 17.3);
        if (rnd.x > 1.0 - probability) {
            vec3 starCenter = normalize(cell + 0.5 + (rnd - 0.5) * 0.65);
            vec3 c = cross(ray.sourceDir, starCenter);
            float sigma = min(pointSigma(ray), 0.18 / gridScale);
            float profile = exp(-0.5 * dot(c, c) / (sigma * sigma));
            float starTemp0 = mix(2800.0, 14000.0, pow(rnd.y, 2.2));
            float amp = (layer == 0)
                ? (0.1 + 1.0 * rnd.z * rnd.z * rnd.z) * clamp(0.5 + 0.25 * localBoost, 0.5, 2.2)
                : 0.03 + 0.12 * rnd.z;
            float beaming = clamp(ray.solidAngleJac * ray.psfDilution, 0.0, 65.0);
            stars += sampleBlackbodySensor(starTemp0 * ray.doppler) * profile * beaming * amp;
        }
    }
    return stars;
}

vec3 renderSky(RelativisticRay ray) {
    // Via Láctea difusa: ε (fixo pela transformação de Lorentz) vezes o corpo
    // negro da luz estelar integrada, deslocado pelo Doppler.
    vec2 mw = milkyWaySample(ray.sourceDir);
    float eps = exp2(mw.x * LOG2_10);
    vec3 glow = eps * sampleBlackbodySensor(mix(6800.0, 5600.0, mw.y) * ray.doppler);
    // Joelho: o brilho difuso satura devagar (o olho e a câmera se adaptam), para o
    // centro galáctico desviado para o azul não virar uma parede branca.
    float glowLevel = dot(glow, vec3(0.2126, 0.7152, 0.0722)) * uExposure;
    glow *= 1.0 / (1.0 + 1.5 * max(glowLevel - 0.25, 0.0));
    vec3 stars = (glow + renderCatalogStar(ray) + renderBackgroundStars(ray, eps / 0.07)) * uBackgroundGain
               + renderPointSource(ray, uSunDir, uSunPointAmp, T_SUN, uSunRadiusRad);

    // Sol atrás e alvo à frente; os discos opacos escondem as estrelas atrás deles.
    float sunCoverage;
    vec3 sun = renderRealisticStarDisk(ray.sourceDir, uSunDir, uSunRadiusRad, T_SUN, ray.doppler, sunCoverage);
    // A estrela-alvo como o Sol: o disco sem diluição pela PSF e o ponto com a diluição uma vez só, no
    // beaming (como as estrelas do catálogo). O ponto fica fora da oclusão do próprio disco, que é menor
    // que um pixel enquanto ele aparece.
    float targetCoverage = 0.0;
    vec3 targetDisk;
    vec3 targetPoint = vec3(0.0);
    if (uTargetType == 0) {
        targetDisk = renderRealisticStarDisk(ray.sourceDir, uTargetDir, uTargetRadiusRad, uTargetTemp, ray.doppler, targetCoverage) * uTargetGain;
        targetPoint = renderPointSource(ray, uTargetDir, uTargetPointAmp, uTargetTemp, uTargetRadiusRad);
    } else if (uTargetType == 1) {
        targetDisk = renderBlackHoleTarget(ray.sourceDir, uTargetDir, uTargetRadiusRad, uTargetTemp, ray.doppler, targetCoverage) * ray.psfDilution;
    } else {
        targetDisk = renderGalaxyTarget(ray.sourceDir, uTargetDir, uTargetRadiusRad, uTargetTemp, ray.doppler) * uGalaxyGain * ray.psfDilution;
    }
    float occlusion = max(sunCoverage, targetCoverage);
    return stars * (1.0 - occlusion) + sun + targetDisk + targetPoint;
}

vec3 acesToneMapping(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
    vec2 ndc = gl_FragCoord.xy / uViewportSize * 2.0 - 1.0;
    vec3 obsDir = uCamForward + ndc.x * uTanHalfFov.x * uCamRight + ndc.y * uTanHalfFov.y * uCamUp;
    RelativisticRay ray = computeRelativisticRay(obsDir, uForward);

    // 1. CMB no próprio raio
    vec3 cmbRadiance = sampleBlackbodySensor(T_CMB_0 * ray.doppler) * ray.psfDilution * 0.38;
    // 2. Estrelas, Via Láctea e corpos
    vec3 skyRadiance = renderSky(ray);
    vec3 color = (cmbRadiance + skyRadiance) * uExposure;
    // 3. Véu de espalhamento ocular: a luz do cone frontal espalhada no olho,
    //    mais forte olhando para a frente (só no para-brisa).
    if (uGlareIntensity > 0.0) {
        float glareProfile = pow(max(0.0, 0.5 + 0.5 * ray.cosThetaObs), 1.6);
        color += uGlareColor * uGlareIntensity * (0.28 + 0.72 * glareProfile);
    }
    // 4. Adaptação da retina e tone mapping
    vec3 mappedColor = acesToneMapping(color * uEyeSensitivity);
    gl_FragColor = vec4(pow(mappedColor, vec3(1.0 / 2.2)), 1.0);
}
