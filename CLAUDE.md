# CLAUDE.md — Relativistic Space Travel Simulator (Projeto Minda)
## 1. Visão Geral do Projeto
Simulador interativo de viagem espacial relativística em primeira pessoa (3D/WebGL), rodando diretamente no navegador a 60 FPS. O projeto reproduz e expande a física da viagem em tempo real até Proxima Centauri (e outros destinos cósmicos), demonstrando visual e quantitativamente:
- **Aberração Relativística da Luz** (compressão angular do campo estelar frontal e ilusão óptica de recuo na ignição).
- **Efeito Doppler Relativístico e Beaming** (deslocamento espectral de corpo negro de Planck das estrelas para o infravermelho e ultravioleta, e amplificação de brilho $D^4$).
- **Radiação Cósmica de Fundo (CMB)** deslocada das micro-ondas ($2,72548\text{ K}$) para o espectro visível humano em regimes ultrarrelativísticos ($\gamma \in [500, 30000]$) e sua posterior atenuação sub-pixel pela PSF óptica.
- **Dilatação Temporal e Contração Espacial de Lorentz** em tempo real.
- **Cockpit Multi-Monitor:** Para-brisa principal (visível humano 380–750 nm), Câmera Traseira apontada para o Sol/Origem, e Telescópio Multiespectral (Infravermelho, Visível, Ultravioleta, Raios-X).
---
## 2. Stack Tecnológica e Configuração de Build
- **Runtime / Bundler:** Vite + TypeScript (strict mode).
- **UI & Estado:** React 18 + Zustand (gerenciamento do estado cinemático de 64 bits fora do ciclo de re-render pesado do React) + TailwindCSS (HUD, telemetria e controles).
- **Renderização 3D:** Three.js + `@react-three/fiber` + `@react-three/drei` + `@react-three/postprocessing` (efeito de Bloom HDR para ofuscamento da CMB e estrelas).
- **Testes:** Vitest para validação matemática do motor relativístico (`RelativityEngine.test.ts`).
- **Áudio:** Web Audio API pura (sem arquivos de som): motor procedural e alertas de contagem regressiva.
- **Fórmulas:** KaTeX nas explicações (§10), num chunk carregado à parte (`React.lazy`) para não atrasar o cockpit; as fontes `woff2` entram no pré-cache do PWA.
- **PWA:** `vite-plugin-pwa` (manifest + service worker Workbox que pré-carrega o app para uso offline). Ícones em `public/icons/`.
- **Deploy:** GitHub Pages via GitHub Actions (`vite.config.ts` configurado com `base: './'`). O workflow `.github/workflows/deploy.yml` roda testes e build em todo PR e publica a cada push na `main`. Pré-requisito: Settings → Pages → Source: "GitHub Actions".
---
## 3. Regras Inegociáveis de Precisão Numérica (64-bit CPU -> 32-bit GPU)
### 3.1 Proibição de `v/c` como Variável de Estado Primária
No ponto médio da missão para Proxima Centauri ($1,61 \times 10^6\text{ G}$), a nave fica a $12\text{ }\mu\text{m/s}$ abaixo de $c$, onde $\gamma \approx 3,53 \times 10^6$ e $1 - \beta \approx 4,01 \times 10^{-14}$.
- Em `float` de 32 bits no GLSL, qualquer operação `1.0 - uBeta` sofre *underflow* para `0.0` acima de $\gamma \approx 2896$.
- **Regra 1:** A variável primária de estado na CPU (TypeScript `number` IEEE 754 de 64 bits) DEVE ser a **Rapidez ($\eta$)**, onde $\beta = \tanh(\eta)$ e $\gamma = \cosh(\eta)$.
- **Regra 2:** Calcule `uOneMinusBeta` na CPU sem subtração usando a identidade hiperbólica exata:
  $$\delta = 1 - \beta = 1 - \tanh(\eta) = \frac{e^{-\eta}}{\cosh(\eta)}$$
- **Regra 3:** No Fragment Shader GLSL, calcule $1 - \beta\cos\theta$ exclusivamente como soma de termos não-negativos (válida na esfera inteira):
  $$1 - \beta\cos\theta = \delta + \beta(1 - \cos\theta)$$
  No hemisfério frontal ($\cos\theta \ge 0$), calcule $1 - \cos\theta$ sem subtração: $1 - \cos\theta = \frac{\sin^2\theta}{1 + \cos\theta} = \frac{\vert{}\vec{d}_\perp\vert{}^2}{1 + \cos\theta}$. No traseiro, $1 - \cos\theta$ é soma de positivos e pode ser calculado direto.
---
## 4. Equações do Motor Físico (`src/physics/RelativityEngine.ts`)
### 4.1 Constantes Físicas Exatas
- Velocidade da luz: $c = 299792458\text{ m/s}$
- Gravidade padrão: $g_0 = 9.80665\text{ m/s}^2$
- Ano-luz: $1\text{ ly} = 9.4607304725808 \times 10^{15}\text{ m}$
- Segundo-luz: $1\text{ ls} = 299792458\text{ m}$
- Temperatura de repouso da CMB: $T_{\text{CMB},0} = 2.72548\text{ K}$
### 4.2 Cinemática Hiperbólica (*Flip-and-Burn* com Aceleração Própria Constante $\alpha$)
Dado um destino a distância em repouso $D_{\text{total}}$ (metros) e aceleração própria constante $\alpha = N_G \cdot g_0$ ($\text{m/s}^2$), com ponto de inversão em $d_{1/2} = D_{\text{total}} / 2$:
1. **Parâmetros de Pico (no Ponto Médio $x = d_{1/2}$):**
   $$\gamma_{\text{max}} = 1 + \frac{\alpha \, d_{1/2}}{c^2}$$
   $$\eta_{\text{max}} = \text{acosh}(\gamma_{\text{max}})$$
   $$\tau_{1/2} = \frac{c}{\alpha}\eta_{\text{max}}, \quad \tau_{\text{total}} = 2\tau_{1/2}$$
   $$t_{1/2} = \frac{c}{\alpha}\sinh(\eta_{\text{max}}), \quad t_{\text{total}} = 2t_{1/2}$$
2. **Fase 1 — Aceleração ($0 \le \tau \le \tau_{1/2}$):**
   $$\eta(\tau) = \frac{\alpha \tau}{c}, \quad \gamma(\tau) = \cosh(\eta(\tau))$$
   $$x(\tau) = \frac{c^2}{\alpha}(\gamma(\tau) - 1)$$
   $$t(\tau) = \frac{c}{\alpha}\sinh(\eta(\tau))$$
3. **Fase 2 — Frenagem ($\tau_{1/2} < \tau \le \tau_{\text{total}}$):**
   Definindo o tempo próprio restante $\tau_{\text{rem}} = \max(0, \tau_{\text{total}} - \tau)$:
   $$\eta(\tau) = \frac{\alpha \, \tau_{\text{rem}}}{c}, \quad \gamma(\tau) = \cosh(\eta(\tau))$$
   $$x(\tau) = D_{\text{total}} - \frac{c^2}{\alpha}(\gamma(\tau) - 1)$$
   $$t(\tau) = t_{\text{total}} - \frac{c}{\alpha}\sinh(\eta(\tau))$$
4. **Distância Restante Contraída de Lorentz (exibida no HUD da nave):**
   $$L_{\text{repouso}}(\tau) = D_{\text{total}} - x(\tau)$$
   $$L_{\text{contraída}}(\tau) = \frac{L_{\text{repouso}}(\tau)}{\gamma(\tau)}$$
5. **Tempo Estimado Até o Alvo Sem Frenagem (Métrica Educativa do Vídeo):**
   No ponto médio, se a nave não freasse, o tempo próprio restante aproximado para cruzar $L_{\text{contraída}}$ seria $\Delta\tau_{\text{no-brake}} = \frac{c}{\alpha}\left[\text{acosh}\left(1 + \frac{\alpha D_{\text{total}}}{c^2}\right) - \eta_{\text{max}}\right] \approx \frac{c}{\alpha}\ln(2) \approx 13\text{ s}$ para Proxima Centauri a $1,61 \times 10^6\text{ G}$.
6. **Perfil acelerar, cruzar e frear** (`coastEta` em `computeMissionProfile`): com rapidez de cruzeiro $\eta_c$ menor que a do ponto médio, o motor desliga em $\tau_1 = \frac{c}{\alpha}\eta_c$ e a nave segue por inércia (fase `coasting`), com $\frac{dx}{d\tau} = c\sinh\eta_c$ e $\frac{dt}{d\tau} = \cosh\eta_c$:
   $$L_{\text{cruzeiro}} = D_{\text{total}} - 2\frac{c^2}{\alpha}(\cosh\eta_c - 1), \quad \tau_{\text{total}} = 2\tau_1 + \frac{L_{\text{cruzeiro}}}{c\sinh\eta_c}, \quad t_{\text{total}} = 2\frac{c}{\alpha}\sinh\eta_c + \frac{L_{\text{cruzeiro}}}{c\tanh\eta_c}$$
   A frenagem começa em `brakeStartTau` $= \tau_{\text{total}} - \tau_1$ (o flip). Com $\eta_c$ acima da rapidez do ponto médio, o perfil é o Flip-and-Burn e `burnEndTau = brakeStartTau = tauHalf`.
7. **Equação do foguete** (`rocketMassRatio`): $\frac{m_0}{m_1} = e^{2\eta_{\max} c / v_e}$. Foguete de fótons ($v_e = c$): 38,8 para Proxima a 1 g e $6,9 \times 10^{12}$ para Andrômeda; fusão ideal ($v_e = 0,1c$): a mesma razão elevada à 10ª potência.
### 4.3 Catálogo de Destinos Pré-Configurados (`src/physics/destinations.ts`)

| ID | Nome | Distância ($D_{\text{total}}$) | Temp. Estrela ($K$) | Raio Estelar ($R_\odot$) | Aceleração Padrão Sugerida |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `proxima` | Proxima Centauri | $4.25\text{ ly}$ | $3042\text{ K}$ | $0.154$ | $1.61 \times 10^6\text{ G}$ (10 min de bordo) |
| `sirius` | Sirius A | $8.60\text{ ly}$ | $9940\text{ K}$ | $1.711$ | $1.61 \times 10^6\text{ G}$ |
| `trappist1` | TRAPPIST-1 | $39.6\text{ ly}$ | $2566\text{ K}$ | $0.119$ | $1.61 \times 10^6\text{ G}$ |
| `sgrA` | Centro Galáctico (Sagittarius A*) | $26700\text{ ly}$ | $12000\text{ K}$ (disco/aglomerado) | $15.0$ | $1.61 \times 10^6\text{ G}$ (~15.5 min de bordo) |
| `andromeda` | Galáxia de Andrômeda (M31) | $2.537 \times 10^6\text{ ly}$ | $5800\text{ K}$ (núcleo integrado) | $1000.0$ | $1.61 \times 10^6\text{ G}$ (~18.4 min de bordo) |

---
## 5. Especificação do Fragment Shader (`src/shaders/RelativisticSky.frag`)
Use exatamente a implementação abaixo como base para o material da esfera celeste (`THREE.BackSide`):
(É o conteúdo de `src/shaders/RelativisticSky.frag`; mantenha os dois em sincronia.)
```glsl
// Esfera celeste relativística V2 (CLAUDE.md §5).
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
uniform vec3  uTargetDir;
uniform float uTargetRadiusRad;
uniform float uTargetTemp;
uniform int   uTargetType;       // 0 = estrela, 1 = buraco negro (Sgr A*), 2 = galáxia (Andrômeda)

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

// ============================================================================
// 3. CORPO NEGRO DE PLANCK → CIE XYZ → sRGB LINEAR
// ============================================================================
float planckSafe(float lambdaNm, float tempK) {
    if (tempK <= 15.0) return 0.0;
    float x = 1.438776877e7 / (lambdaNm * tempK);
    if (x > 80.0) return 0.0;
    float lRatio = 550.0 / lambdaNm;
    float l5 = lRatio * lRatio * lRatio * lRatio * lRatio;
    float denom = (x < 1e-4) ? x : (exp(x) - 1.0);
    return l5 / max(denom, 1e-20);
}

float gaussianPiecewise(float x, float mu, float s1, float s2) {
    float s = (x < mu) ? s1 : s2;
    float d = (x - mu) * s;
    return exp(-0.5 * d * d);
}

vec3 wavelengthToXYZ(float lambdaNm) {
    float x = 1.056 * gaussianPiecewise(lambdaNm, 599.8, 0.0264, 0.0323)
            + 0.362 * gaussianPiecewise(lambdaNm, 442.0, 0.0624, 0.0374)
            - 0.065 * gaussianPiecewise(lambdaNm, 501.1, 0.0490, 0.0382);
    float y = 0.821 * gaussianPiecewise(lambdaNm, 568.8, 0.0213, 0.0247)
            + 0.286 * gaussianPiecewise(lambdaNm, 530.9, 0.0613, 0.0322);
    float z = 1.217 * gaussianPiecewise(lambdaNm, 437.0, 0.0845, 0.0278)
            + 0.681 * gaussianPiecewise(lambdaNm, 459.0, 0.0385, 0.0725);
    return vec3(max(x, 0.0), max(y, 0.0), max(z, 0.0));
}

vec3 sampleBlackbodySensor(float apparentTempK) {
    float scaleFactor = 1.0;
    if (uSensorMode == 1) scaleFactor = 12.0;
    else if (uSensorMode == 2) scaleFactor = 0.15;
    else if (uSensorMode == 3) scaleFactor = 0.01;
    float effectiveTemp = apparentTempK * scaleFactor;
    // Abaixo de ~254 K, x > 80 em todas as amostras (λ ≤ 708 nm) e o resultado
    // é exatamente 0: evita 64 exp() por pixel para a CMB em repouso.
    if (effectiveTemp < 250.0) return vec3(0.0);
    vec3 xyz = vec3(0.0);
    const int SAMPLES = 8;
    float dLambda = (730.0 - 380.0) / float(SAMPLES);
    for (int i = 0; i < SAMPLES; i++) {
        float lambda = 380.0 + (float(i) + 0.5) * dLambda;
        xyz += planckSafe(lambda, effectiveTemp) * wavelengthToXYZ(lambda);
    }
    xyz *= (dLambda * 0.0015);
    mat3 xyzToRgb = mat3(
         3.2404542, -0.9692660,  0.0556434,
        -1.5371385,  1.8760108, -0.2040259,
        -0.4985314,  0.0415560,  1.0572252
    );
    return max(xyzToRgb * xyz, vec3(0.0));
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
    float xProj = dot(rayDir, right) / max(radiusRad, 1e-30);
    float yProj = dot(rayDir, localUp) / max(radiusRad, 1e-30);
    float rNorm = length(vec2(xProj, yProj));

    vec3 result = vec3(0.0);
    if (rNorm <= 1.0) {
        float mu = sqrt(max(0.0, 1.0 - rNorm * rNorm));
        vec3 sphereNormal = normalize(xProj * right + yProj * localUp + mu * n);
        float granules = fbm(sphereNormal * 14.0 + vec3(0.0, 0.0, uTime * 0.04));
        float spots = smoothstep(0.35, 0.7, snoise(sphereNormal * 4.5));
        // Escurecimento de bordo: I(μ) = 1 − u(1 − μ^0,75), u = 0,68
        float limbDarkening = 1.0 - 0.68 * (1.0 - pow(mu, 0.75));
        float localTemp = baseTempK * (0.94 + 0.12 * granules - 0.18 * spots) * (0.75 + 0.25 * mu);
        coverage = 1.0 - smoothstep(0.96, 1.0, rNorm);
        result += sampleBlackbodySensor(localTemp * doppler) * limbDarkening * coverage;
    }

    float corona = exp(-max(rNorm - 0.95, 0.0) * 2.2) * 0.35;
    float spikeX = exp(-abs(xProj) * 18.0) * exp(-abs(yProj) * 1.2);
    float spikeY = exp(-abs(yProj) * 18.0) * exp(-abs(xProj) * 1.2);
    result += sampleBlackbodySensor(baseTempK * doppler) * (corona + (spikeX + spikeY) * 0.08);
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

// ============================================================================
// 5. CAMPO ESTELAR PROCEDURAL EM DUAS CAMADAS
// ============================================================================
vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yxx) * p3.zyx);
}

vec3 renderSky(RelativisticRay ray) {
    // Estrelas brilhantes (camada 0) e poeira estelar fina (camada 1)
    vec3 stars = vec3(0.0);
    for (int layer = 0; layer < 2; layer++) {
        float gridScale = (layer == 0) ? 130.0 : 320.0;
        float threshold = (layer == 0) ? 0.968 : 0.945;
        float sigma2    = (layer == 0) ? 1.6e-6 : 6.0e-7;
        vec3 cell = floor(ray.sourceDir * gridScale);
        vec3 rnd  = hash33(cell + float(layer) * 17.3);
        if (rnd.x > threshold) {
            vec3 starCenter = normalize(cell + 0.5 + (rnd - 0.5) * 0.65);
            float angDist2  = max(0.0, 2.0 - 2.0 * dot(ray.sourceDir, starCenter));
            float starTemp0 = mix(2800.0, 14000.0, pow(rnd.y, 2.2));
            float profile = exp(-angDist2 / sigma2);
            float beaming = clamp(ray.solidAngleJac * ray.psfDilution, 0.0, 65.0);
            stars += sampleBlackbodySensor(starTemp0 * ray.doppler) * profile * beaming * (0.15 + 0.85 * rnd.z);
        }
    }

    // Sol atrás e alvo à frente; os discos opacos escondem as estrelas atrás deles.
    float sunCoverage;
    vec3 sun = renderRealisticStarDisk(ray.sourceDir, uSunDir, uSunRadiusRad, T_SUN, ray.doppler, sunCoverage);
    float targetCoverage = 0.0;
    vec3 target;
    if (uTargetType == 0) {
        target = renderRealisticStarDisk(ray.sourceDir, uTargetDir, uTargetRadiusRad, uTargetTemp, ray.doppler, targetCoverage);
    } else if (uTargetType == 1) {
        target = renderBlackHoleTarget(ray.sourceDir, uTargetDir, uTargetRadiusRad, uTargetTemp, ray.doppler, targetCoverage);
    } else {
        target = renderGalaxyTarget(ray.sourceDir, uTargetDir, uTargetRadiusRad, uTargetTemp, ray.doppler);
    }
    float occlusion = max(sunCoverage, targetCoverage);
    return stars * (1.0 - occlusion) + sun + target * ray.psfDilution;
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
    // 2. Estrelas e corpos
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
```

**Notas de implementação:**
- **Eixo de voo exatamente em −Z:** `uForward = uTargetDir = (0,0,−1)` e `uSunDir = (0,0,1)`. Com o eixo alinhado a um eixo de coordenadas, `dPerp`, `sourceDir` e as projeções tangentes dos discos saem sem cancelamento em float32, mesmo para $\gamma \sim 10^{12}$ (Andrômeda).
- **Direção de cada pixel reconstruída de `gl_FragCoord`** com a base da câmera (`uCamRight`, `uCamUp`, `uCamForward`, `uTanHalfFov`, `uViewportSize`), calculada em 64 bits e com resíduos de ~10⁻¹⁶ zerados. Não é interpolada da esfera: a interpolação erra ~10⁻⁷ rad, o que no telescópio em x 10⁶ equivale a dezenas de pixels. A esfera `BackSide` só cobre a tela.
- **`uSunRadiusRad` e `uTargetRadiusRad`** são raios angulares no referencial de repouso, calculados em 64 bits em `src/physics/sky.ts`. O Sol fica a $1\text{ UA} + x(\tau)$ (a nave parte da órbita da Terra) e o alvo a $L_{\text{repouso}} + 60\,R_{\text{alvo}}$ (o motor termina no centro do alvo; a 60 raios ele ocupa ~35% do telescópio em x 13). A aberração sai do mapeamento `sourceDir`.
- **`uPsfAngleRad`** é o ângulo de um pixel físico de cada monitor: $2\tan(\text{FOV}/2)$ ÷ altura do buffer em px.
- **Ângulos pequenos** são calculados com `atan(|a×b|, a·b)`, não com `acos`, que em float32 só resolve cerca de $3 \times 10^{-4}$ rad perto de 1.
- **`smoothstep`** sempre com os limites em ordem crescente, e **`pow` nunca com base negativa** (indefinidos em GLSL): o anel de fótons e os arcos de lensing usam $x \cdot x$.
- **Alvos V2:** estrela (`uTargetType = 0`) com escurecimento de bordo $I(\mu) = 1 - 0{,}68(1 - \mu^{0,75})$, granulação FBM 3D animada por `uTime` (relógio real), manchas, coroa e spikes de difração; Sagittarius A* (`1`) com sombra, anel de fótons, disco inclinado com lensing e beaming rotacional; Andrômeda (`2`) com bojo e braços espirais logarítmicos. O disco estelar e a sombra do buraco negro são opacos (`coverage`) e escondem as estrelas atrás.
- **Olho e véu, só no para-brisa** (`pilotEye`): `uEyeSensitivity` $= 2^{-0,1 R}$ e `uGlareIntensity` $= 5{,}5\,(E/E_{\text{pico}})^{0,75}\,2^{-0,4 R}$, com $R$ a dessensibilização da retina em stops (§9). O véu final cai com $2^{-0,5 R}$: estoura o para-brisa no white-out da ida e vira névoa fraca com a mesma luz na frenagem. `uGlareColor` é a cor linear do corpo negro de $T_0 e^{\eta}$, calculada na CPU com luminância 1. Os instrumentos recebem 1 e 0.
- **Autoexposição do telescópio** (`src/physics/sensorResponse.ts`, que replica `sampleBlackbodySensor` na CPU): mede pelo pico da CMB diluído pela PSF ou pela superfície do alvo quando ele cobre ≥ 3 px.
- **Saída antecipada:** abaixo de 250 K, `sampleBlackbodySensor` retorna 0 sem amostrar Planck. Abaixo de cerca de 254 K todas as amostras já dariam $x > 80$, então o resultado não muda.
- **Tone mapping:** o shader aplica ACES e gama 2,2 na própria saída. Ao introduzir o Bloom do `@react-three/postprocessing`, a saída deve passar a ser HDR linear, com tone mapping e conversão de cor feitos no `EffectComposer`; senão a gama é aplicada duas vezes e o Bloom atua sobre cores já comprimidas.
---
## 6. Arquitetura de Diretórios Esperada
```text
relativistic-space-simulator/
├── .github/workflows/deploy.yml   # CI/CD automático para GitHub Pages
├── public/icons/                  # Ícones do PWA (SVG + PNG 192/512/maskable/apple-touch)
├── src/
│   ├── audio/
│   │   ├── FlightAudio.ts         # Sintetizador Web Audio: motor e alertas
│   │   ├── engineSound.ts         # Timbre do motor em função de γ e do empuxo + teste
│   │   ├── audioSettings.ts       # Som ligado/mudo (persistido no localStorage)
│   │   └── useFlightAudio.ts      # Liga o áudio ao store e aos eventos de voo
│   ├── physics/
│   │   ├── RelativityEngine.ts    # Cinemática hiperbólica 64-bit e uniforms
│   │   ├── RelativityEngine.test.ts # Testes unitários Vitest validando os marcos do vídeo
│   │   ├── destinations.ts        # Catálogo de estrelas e galáxias
│   │   ├── criticalEvents.ts      # Janelas críticas do Auto-Step Down (§7.2) + teste
│   │   ├── EyeAndPhotometry.ts    # Lux da CMB, olho do piloto, auto-zoom, v/c em % (§9) + teste
│   │   ├── blackbody.ts           # Luminância e cor de corpo negro na CPU + teste
│   │   ├── sensorResponse.ts      # Resposta do sensor do shader e autoexposição
│   │   └── sky.ts                 # Raios angulares do Sol e do alvo (64 bits) + sky.test.ts
│   ├── shaders/
│   │   ├── RelativisticSky.vert
│   │   └── RelativisticSky.frag
│   ├── components/
│   │   ├── RelativisticSky.tsx    # Esfera celeste + uniforms, compartilhada pelos monitores
│   │   ├── CockpitMonitor.tsx     # Moldura dos monitores PIP
│   │   ├── MainViewport.tsx       # Cena 3D principal (para-brisa do cockpit)
│   │   ├── RearCameraView.tsx     # Câmera traseira para o Sol ("REAR VIEW · x 12")
│   │   ├── RouteMapAndRearMonitor.tsx # Monitor direito: "ROUTE · LOG SCALE" / câmera traseira
│   │   ├── TelescopePIP.tsx       # Monitor esquerdo: auto-zoom "TELESCOPE · x N", IR / Visível / UV / Raios-X
│   │   ├── CenterHologramProjector.tsx # Hologramas contextuais no centro inferior (§9)
│   │   ├── ExplanationCard.tsx    # Cartão do modo Explicar: o efeito que acabou de começar (§10)
│   │   ├── ActiveEffectsPanel.tsx # Painel de efeitos ativos com explicações e fórmulas (§10)
│   │   ├── TeX.tsx                # Fórmula TeX renderizada pelo KaTeX
│   │   ├── useLiveExplainContext.ts # Estado do voo para as explicações, a 4 Hz
│   │   ├── FlightControls.tsx     # Alternância Modo Missão Flip-and-Burn vs. Modo Manual
│   │   ├── TelemetryHUD.tsx       # Relógios (Nave vs. Terra), gamma, distância contraída
│   │   └── SpectrumAnalyzer.tsx   # Gráfico Canvas 2D do pico de Planck da CMB vs. faixa visível
│   ├── store/
│   │   ├── useFlightStore.ts      # Estado global e loop de tempo próprio com Auto-Step Down + teste
│   │   ├── flightEvents.ts        # Marcos do voo e contagens regressivas + teste
│   │   ├── timeScales.ts          # Degraus de M_τ (0,1x a 1 ano/s) e Auto-Step Down + teste
│   │   └── useFlightLoop.ts       # requestAnimationFrame que chama tick(dt)
│   ├── ui/
│   │   ├── format.ts              # Formatação (relógios, distâncias, γ, c − v, milhares com espaço) + teste
│   │   ├── tex.ts                 # Números e unidades em TeX (vírgula decimal) + tex.test.ts
│   │   ├── explanations.ts        # Catálogo de efeitos: critérios físicos, textos e fórmulas (§10) + teste
│   │   ├── explainSettings.ts     # Modo Explicar (persistido) e painel aberto ao pausar
│   │   ├── hologramMode.ts        # Seleção automática do holograma + teste
│   │   └── routeScale.ts          # Escala logarítmica do mapa de rota
│   ├── App.tsx
│   └── main.tsx
├── CLAUDE.md
├── package.json
└── vite.config.ts
```
---
## 7. Regras de UX e Controles de Voo
1. **Dois Modos de Operação:**
   - **Modo Autopilot (Flip-and-Burn):** O usuário escolhe o destino, ajusta a aceleração própria $\alpha$ e dá a partida. Inclui barra de progresso da linha do tempo do voo ($\tau$ de $0$ a $\tau_{\text{total}}$) permitindo também arrastar (*scrub*) para qualquer instante da viagem.
     - **Aceleração:** "Demonstração" ($1.61 \times 10^6\text{ G}$, padrão), "1 g" (viagem tripulada: Proxima em 3,54 anos de bordo e 5,88 na Terra; Andrômeda em 28,6 anos de bordo) ou "Personalizada" (campo em g e slider log, de 0,1 g a $10^7$ g).
     - **Perfil:** "Acelerar e frear" (Flip-and-Burn) ou "Acelerar, cruzar e frear", com a velocidade de cruzeiro num slider de rapidez (sugestão: 0,9c). O resumo mostra a razão de massa do foguete de fótons.
   - **Modo Cruzeiro Livre (Manual):** O usuário controla diretamente um slider logarítmico de Rapidez $\eta \in [0, 18]$ (ou $\log_{10}\gamma \in [0, 7.5]$) para inspecionar estacionariamente qualquer regime óptico.
2. **Multiplicador de Tempo Próprio ($M_\tau$) com *Auto-Step Down*:**
   - Degraus de tempo próprio por segundo real (`src/store/timeScales.ts`): `0,1x`, `1x (Real Time)`, `5x`, `20x`, `100x`, `1 h/s`, `1 dia/s`, `1 sem/s`, `1 mês/s`, `1 ano/s`. Cada missão mostra 5 degraus: um abaixo e três acima do "natural", o que encaixa a viagem em ~10 min (demonstração: 0,1x a 100x, natural 1x; 1 g até Proxima: 1 h/s a 1 ano/s, natural 1 dia/s). Trocar de missão mantém o multiplicador se ele ainda está entre os 5; senão, vai para o natural.
   - Opção "Desacelerar nos eventos críticos" (quando a CMB atravessa o espectro visível em $\gamma \in [400, 15000]$ e na reta final antes do *Flip*): ao entrar na janela, M_τ cai para o maior degrau com que ela dura ≥ 20 s reais, nunca abaixo de 1x. Na demonstração, isso é sempre 1x.
   - **Durações na escala da missão** (`missionScaledS`): as janelas da demonstração (10 s antes do flip, contagens holográficas de 10 s, câmera traseira nos 20 s finais) valem $\max(d, \tau_{\text{total}}\,d/600\text{ s})$: iguais na demonstração, 1/60 da viagem nas longas (~21,6 dias antes do flip a 1 g até Proxima). Se o pico de $\gamma$ fica dentro da faixa da CMB, a janela da CMB é uma só, da entrada na ida à saída na volta.
3. **Comportamento implementado:**
   - O Auto-Step Down age na **entrada** de cada janela crítica (a da CMB acontece na aceleração e na frenagem). Se um frame longo pularia o início da janela, $\tau$ é posicionado exatamente nele. Dentro da janela, o usuário pode voltar a acelerar.
   - O Cruzeiro Livre começa na rapidez atual, pausa o Autopilot e congela a posição e os relógios. Só $\eta$ muda: Doppler, aberração, $\gamma$ e $L_{\text{contraída}}$.
   - Trocar o destino ou $\alpha$ reinicia a missão parada em $\tau = 0$.
4. **Áudio procedural:**
   - **Motor:** ruído marrom filtrado, zumbido dente-de-serra e sub-harmônico. O empuxo (Autopilot rodando, na aceleração ou na frenagem) liga o ronco; $\log_{10}\gamma$ sobe o tom e abre o filtro, saturando em $\gamma = 10^7$. No flip, o motor corta por 0,7 s.
   - **Contagem regressiva:** a partida tem 3 s reais de contagem (o botão aborta). Antes de cada marco em voo (entrada da CMB no visível, na aceleração e na frenagem; flip; chegada), soam bipes quando o tempo **real** restante, $(\tau_{\text{marco}} - \tau)/M_\tau$, cruza 3, 2 e 1 s. Cada marco tem um som próprio.
   - O loop (`tick`) emite os eventos e o áudio só os toca, então o scrub não dispara alertas. O áudio é liberado no primeiro gesto do usuário, como os navegadores exigem.
---
## 8. Critérios de Aceite (Testes Unitários Obrigatórios)
O arquivo `src/physics/RelativityEngine.test.ts` deve passar nos seguintes testes antes de considerar o motor concluído:
1. Para $D_{\text{total}} = 4.25\text{ ly}$ e $\alpha = 1.61 \times 10^6\text{ G}$:
   - O tempo próprio total $\tau_{\text{total}}$ deve ser $600\text{ s} \pm 5\text{ s}$ (~10 minutos).
   - O tempo da Terra $t_{\text{total}}$ deve ser $\approx 4.25\text{ anos}$.
   - No ponto médio ($\tau = \tau_{1/2}$), a distância contraída de Lorentz $L_{\text{contraída}}$ deve ser $19\text{ segundos-luz} \pm 1\text{ ls}$ ($\approx 5.7 \times 10^6\text{ km}$).
2. Para $\eta = 16.0$, `computeShaderKinematics(16.0).uOneMinusBeta` deve ser estritamente maior que zero ($\approx 2.533 \times 10^{-14}$) e nunca `0`.

---
## 9. Fotometria, Olho do Piloto e Cockpit V2
1. **Iluminância visível à frente** (`visibleLuxAhead`), calculada pela física: a luminância de Planck da CMB aberrada e desviada pelo Doppler, integrada sobre o hemisfério frontal,
   $$E = 2\pi \int_0^1 L_v\!\left(T_0\,D(u)\right)(1 - u)\,du, \quad u = 1 - \cos\theta, \quad D(u) = \frac{1}{\gamma(\delta + \beta u)}$$
   com $L_v = 683 \int B_\lambda\,\bar{y}(\lambda)\,d\lambda$. O cone quente encolhe com $1/\gamma^2$, então $E$ tem um pico universal de **11 069 lux** em $\gamma \approx 6\,955$ e vale **10 799 lux** em $\gamma = 9\,356$ (vídeo: 11 065 e 10 796).
2. **Olho do piloto**, integrado em tempo próprio ao longo da missão inteira (`computeEyeTimeline`). Por isso é determinístico: o scrub vê o mesmo estado do voo contínuo.
   - Pupila: Moon & Spencer (1944), $d = 4{,}9 - 3\tanh(0{,}4\log_{10}E)$; contrai em 0,5 s e dilata em 300 s.
   - Retina: alvo $\log_2(1 + E/0{,}7\text{ lux})$ stops; adapta-se à luz em 60 s e recupera-se no escuro em 1 200 s.
   - "N× DIMMER": a mesma luz do instante espelho da ida ($E(\tau) = E(\tau_{\text{total}} - \tau)$), vista com o olho de agora: $2^{R_{\text{agora}} - R_{\text{espelho}}}\,(d_{\text{espelho}}/d_{\text{agora}})^2$.
   - Marcos para Proxima em τ = 449 s (espelho do white-out em 150 s): pupila 2,13 mm, retina −12,8 stops, ≈ 1 290× mais escuro (vídeo: 2,14 mm, −12,9 stops, 1 260×).
   - No Cruzeiro Livre, o olho fica em equilíbrio com a luz atual.
3. **HUD superior:** transparente sobre o céu; fundo `bg-neutral-900/65 backdrop-blur-md` quando `isWhiteoutHudActive` (véu percebido > 0,25). Badge âmbar "EYE HAZARD · BRIGHT LIGHT AHEAD" com luz > 1 500 lux ou na aceleração com $\gamma \in [200, 12\,000]$. A velocidade usa `formatRelativisticSpeedPercent` ("99.999 999 999 994 9 %").
4. **Telescópio:** zoom $\max(13,\ \min(0{,}253\,\gamma,\ \text{zoom que põe o alvo em 35\% da altura}))$, relativo ao FOV de 70° do para-brisa.
5. **Monitor direito:** "ROUTE · LOG SCALE" (log a partir do Sol até HALFWAY, espelhado até o alvo) e "REAR VIEW · x 12" sozinho nos 20 s finais; botões AUTO / ROTA / TRÁS.
6. **Hologramas** (`selectHologramMode`, por critérios físicos), em ordem de prioridade:
   1. "DECELERATION IN" antes do início da frenagem; "DECELERATION COMPLETE IN" antes da chegada (10 s na demonstração, 1/60 da viagem nas longas, quando a contagem mostra o tempo de bordo restante, como "6,47 dias").
   2. Anéis do Sistema Solar: aceleração, 5–32 UA do Sol.
   3. "YOUR EYES": frenagem, $T_{\text{CMB}} \in (5\,000, 60\,000)$ K e fator "mais escuro" ≥ 2 (em viagens de anos o olho acompanha a luz e o fator fica em ~1).
   4. Espectro da CMB ("PEAK nm"): pico de Wien entre 260 e 980 nm.
   5. Curva de lux: aceleração, $T_{\text{CMB}} \in (15\,000, 180\,000)$ K.
   6. Blueshift do alvo: frenagem, $\gamma \in [8, 220]$.

---
## 10. Explicações dos Efeitos (Modo Explicar)
1. **Catálogo** (`src/ui/explanations.ts`): cada efeito tem um critério físico de atividade, válido para qualquer destino e $\alpha$, um resumo, parágrafos de "Saiba mais" e fórmulas em TeX com os valores do instante. Ordem do painel e prioridade do cartão: marcos do instante, depois óptica, depois cinemática.

   | Efeito | Ativo quando | Proxima a 1x (τ) |
   | :--- | :--- | :--- |
   | Rapidez η | $\eta > 0$ | 0 s |
   | Aberração | $\beta \ge 0{,}5$ | 10 s |
   | Doppler e beaming | $D_{\text{frente}} = e^{\eta} \ge 2{,}5$ | 17 s |
   | Dilatação do tempo | $\gamma \ge 2$ | 25 s |
   | Contração de Lorentz | $\gamma \ge 3$ | 34 s |
   | Sistema Solar | aceleração, 5,2–120 UA do Sol | 103 s |
   | CMB no visível | $\gamma \in [400, 15\,000]$ | 127 s |
   | Ofuscamento | $E \ge 1\,500$ lux | 147 s |
   | Cone quente | $\gamma$ acima do pico de lux ($\approx 6\,955$) | 181 s |
   | CMB em raios X | pico de Wien $\le 10$ nm | 220 s |
   | Flip | janela antes do início da frenagem (10 s na demonstração) | 289 s |
   | Inércia (motor desligado) | fase `coasting` do perfil com cruzeiro | — |
   | Frenagem | fase de frenagem | 299 s |
   | Olhos adaptados | frenagem, $T_{\text{CMB}} \in (5\,000, 60\,000)$ K e fator ≥ 2 | 409 s |
   | Alvo azulado | frenagem, $\gamma \in [8, 220]$ | 483 s |
   | Chegada | fase de chegada | 599 s |
   | Missão | sempre no Autopilot (só no painel) | — |
   | Combustível (equação do foguete) | sempre no Autopilot (só no painel) | — |

   Os limiares de γ também são atravessados pela viagem a 1 g até as estrelas próximas ($\gamma_{\max} \approx 3$), e na demonstração os cartões chegam com ≥ 6 s de intervalo, o tempo mínimo de cada um na tela.

2. **Cartão** (botão "💡 Explicar" ao lado da partida, ligado por padrão e persistido): o loop (`tick`) anuncia cada efeito na **transição** inativo → ativo, uma vez por missão, só no Autopilot. O scrub não anuncia e dispensa o cartão. A nova partida e a troca de missão zeram os anúncios. Cada cartão fica ≥ 6 s reais na tela (a 20x/100x mostra o mais recente ao fim do prazo). Ligar o modo no meio do voo mostra o efeito mais próprio do instante.
3. **Painel de efeitos ativos** (botão "∑ Efeitos", ou automático ao pausar com o modo Explicar ligado; retomar fecha, Esc fecha): todos os efeitos ativos com resumo, fórmulas com os valores atuais e "Saiba mais". Acompanha o scrub e o slider do Cruzeiro Livre a 4 Hz. O efeito vindo do cartão aparece destacado no topo até o instante mudar. Enquanto o painel está aberto, o holograma central se esconde. No celular, o painel ocupa a tela inteira e tem "▶ Retomar".
4. **Texto pt-BR:** vírgula decimal (`{,}` no TeX), milhares com espaço ("11 069", nunca "11.069") e durações por extenso ("22 min 28 s"). Todas as fórmulas passam no KaTeX em modo estrito em qualquer instante, destino e modo (teste em `explanations.test.ts`).
