# CLAUDE.md — Relativistic Space Travel Simulator (Projeto Minda)
## 1. Visão Geral do Projeto
Simulador interativo de viagem espacial relativística em primeira pessoa (3D/WebGL), rodando diretamente no navegador a 60 FPS. O projeto reproduz e expande a física da viagem em tempo real até Proxima Centauri (e outros destinos cósmicos), demonstrando visual e quantitativamente:
- **Aberração Relativística da Luz** (compressão angular do campo estelar frontal e ilusão óptica de recuo na ignição).
- **Efeito Doppler Relativístico e Beaming** (deslocamento espectral de corpo negro de Planck das estrelas para o infravermelho e ultravioleta, e amplificação de brilho $D^4$).
- **Radiação Cósmica de Fundo (CMB)** deslocada das micro-ondas ($2,72548\text{ K}$) para o espectro visível humano em regimes ultrarrelativísticos ($\gamma \in [500, 30000]$) e sua posterior atenuação sub-pixel pela PSF óptica.
- **Dilatação Temporal e Contração Espacial de Lorentz** em tempo real.
- **Cockpit Multi-Monitor:** Para-brisa principal (visível humano 380–750 nm), Telescópio Multiespectral (Infravermelho, Visível, Ultravioleta, Raios-X) voltado para trás (o Sol) ou para a frente (o alvo) e o mapa da rota.
- **Céu real:** as 8 920 estrelas visíveis a olho nu (catálogo HYG) nas posições verdadeiras, com paralaxe ao longo da viagem, e a Via Láctea de um modelo 3D da galáxia, que muda rumo ao centro galáctico e a Andrômeda (§12).
- **Abertura e planejamento:** a tela inicial escolhe entre a viagem relativística e as sondas históricas (§11); a viagem começa no planejamento da missão (destino, piloto humano ou sonda robótica, aceleração com os limites de tolerância e perfil).
---
## 2. Stack Tecnológica e Configuração de Build
- **Runtime / Bundler:** Vite + TypeScript (strict mode).
- **UI & Estado:** React 18 + Zustand (gerenciamento do estado cinemático de 64 bits fora do ciclo de re-render pesado do React) + TailwindCSS (HUD, telemetria e controles). Fontes do painel empacotadas (`@fontsource/orbitron` nos rótulos, `@fontsource/share-tech-mono` nos números), só o subconjunto latino, no pré-cache do PWA.
- **Renderização 3D:** Three.js + `@react-three/fiber` + `@react-three/drei` + `@react-three/postprocessing` (efeito de Bloom HDR para ofuscamento da CMB e estrelas).
- **Testes:** Vitest para validação matemática do motor relativístico (`RelativityEngine.test.ts`).
- **Áudio:** Web Audio API pura (sem arquivos de som): motor procedural e alertas de contagem regressiva.
- **Fórmulas:** KaTeX nas explicações (§10), num chunk carregado à parte (`React.lazy`) para não atrasar o cockpit; as fontes `woff2` entram no pré-cache do PWA.
- **Dados das sondas (§11):** JPL Horizons, baixados uma vez por `npm run fetch:horizons` (`scripts/fetch-horizons.mjs`) para `src/probes/data/*.json` e versionados. O app publicado não acessa o JPL. Atrás do proxy do ambiente cloud, rode com `NODE_USE_ENV_PROXY=1` (o `fetch` do Node não lê `HTTPS_PROXY` sozinho). As missões que o Horizons não tem (Mariner 10, Vikings, Magellan, Apollo) são reconstruídas por `npm run reconstruct` (`scripts/reconstruct.mjs`, que carrega `src/probes/reconstruct/*.ts` pelo Vite) no mesmo formato.
- **Catálogo de estrelas (§12):** HYG v4.1 (astronexus, CC BY-SA 4.0), baixado por `npm run build:stars` (`scripts/build-star-catalog.mjs`, cache em `node_modules/.cache/hyg`) para `src/sky/data/bright-stars.json` (V ≤ 6,5) e versionado.
- **Web Workers:** a grade de estrelas (`src/sky/starCells.worker.ts`) e os mapas da Via Láctea (`src/sky/milkyWay.worker.ts`) são calculados fora da thread principal; o Vite empacota cada worker em seu próprio arquivo.
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

| ID | Nome | Distância ($D_{\text{total}}$) | Temp. ($K$) | Raio | Direção (α, δ J2000) | V da Terra | Aceleração Padrão Sugerida |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `proxima` | Proxima Centauri | $4.25\text{ ly}$ | $3042\text{ K}$ | $0.154\,R_\odot$ | 217,43°, −62,68° | 11,13 | $1.61 \times 10^6\text{ G}$ (10 min de bordo) |
| `sirius` | Sirius A | $8.60\text{ ly}$ | $9940\text{ K}$ | $1.711\,R_\odot$ | 101,29°, −16,72° | −1,46 | $1.61 \times 10^6\text{ G}$ |
| `trappist1` | TRAPPIST-1 | $39.6\text{ ly}$ | $2566\text{ K}$ | $0.119\,R_\odot$ | 346,62°, −5,04° | 18,8 | $1.61 \times 10^6\text{ G}$ |
| `sgrA` | Centro Galáctico (Sagittarius A*) | $26700\text{ ly}$ | $12000\text{ K}$ (disco/aglomerado) | $15.0\,R_\odot$ (sombra) | 266,42°, −29,01° | — | $1.61 \times 10^6\text{ G}$ (~15.5 min de bordo) |
| `andromeda` | Galáxia de Andrômeda (M31) | $2.537 \times 10^6\text{ ly}$ | $5800\text{ K}$ (núcleo integrado) | $10\text{ kpc}$ (disco: ~3° de céu da Terra) | 10,68°, +41,27° | — | $1.61 \times 10^6\text{ G}$ (~18.4 min de bordo) |

A direção orienta o céu real (§12); a magnitude V desenha o alvo estelar como estrela pontual enquanto o disco é menor que um pixel. Cada destino tem uma linha de descrição (`blurb`) para o planejamento.

---
## 5. Especificação do Fragment Shader (`src/shaders/RelativisticSky.frag`)
Use exatamente a implementação abaixo como base para o material da esfera celeste (`THREE.BackSide`):
(É o conteúdo de `src/shaders/RelativisticSky.frag`; mantenha os dois em sincronia.)
```glsl
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
        // Escurecimento de bordo: I(μ) = 1 − u(1 − μ^0,75), u = 0,68
        float limbDarkening = 1.0 - 0.68 * (1.0 - pow(mu, 0.75));
        float localTemp = baseTempK * (0.94 + 0.12 * granules - 0.18 * spots) * (0.75 + 0.25 * mu);
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
    float targetCoverage = 0.0;
    vec3 target;
    if (uTargetType == 0) {
        target = renderRealisticStarDisk(ray.sourceDir, uTargetDir, uTargetRadiusRad, uTargetTemp, ray.doppler, targetCoverage) * uTargetGain
               + renderPointSource(ray, uTargetDir, uTargetPointAmp, uTargetTemp, uTargetRadiusRad);
    } else if (uTargetType == 1) {
        target = renderBlackHoleTarget(ray.sourceDir, uTargetDir, uTargetRadiusRad, uTargetTemp, ray.doppler, targetCoverage);
    } else {
        target = renderGalaxyTarget(ray.sourceDir, uTargetDir, uTargetRadiusRad, uTargetTemp, ray.doppler) * uGalaxyGain;
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
```

**Notas de implementação:**
- **Eixo de voo exatamente em −Z:** `uForward = uTargetDir = (0,0,−1)` e `uSunDir = (0,0,1)`. Com o eixo alinhado a um eixo de coordenadas, `dPerp`, `sourceDir` e as projeções tangentes dos discos saem sem cancelamento em float32, mesmo para $\gamma \sim 10^{12}$ (Andrômeda).
- **Direção de cada pixel reconstruída de `gl_FragCoord`** com a base da câmera (`uCamRight`, `uCamUp`, `uCamForward`, `uTanHalfFov`, `uViewportSize`), calculada em 64 bits e com resíduos de ~10⁻¹⁶ zerados. Não é interpolada da esfera: a interpolação erra ~10⁻⁷ rad, o que no telescópio em x 10⁶ equivale a dezenas de pixels. A esfera `BackSide` só cobre a tela.
- **`uSunRadiusRad` e `uTargetRadiusRad`** são raios angulares no referencial de repouso, calculados em 64 bits em `src/physics/sky.ts`. O Sol fica a $1\text{ UA} + x(\tau)$ (a nave parte da órbita da Terra) e o alvo a $\sqrt{L_{\text{repouso}}^2 + s^2}$, com a parada $s$ de 3 raios para estrelas (o alvo ocupa mais da metade da altura do para-brisa na chegada), 8 para o buraco negro e 6 para a galáxia. A aberração sai do mapeamento `sourceDir`.
- **`uPsfAngleRad`** é o ângulo de um pixel físico de cada monitor: $2\tan(\text{FOV}/2)$ ÷ altura do buffer em px. Toda estrela pontual (catálogo, fundo, o alvo e o Sol de longe) usa σ = 1 pixel × D no referencial de repouso (`pointSigma`), com teto de 3×10⁻³ rad: fica com ~1 px em qualquer monitor e zoom.
- **Sensor por tabela:** `sampleBlackbodySensor` lê `uSensorLut`, 1 024 valores de log₁₀ da cor de `sensorRgb` (`src/physics/sensorResponse.ts`: 8 amostras de Planck × funções de cor CIE → sRGB linear) em log₁₀T de 2,35 a 15, interpolados no shader. Troca 64 exponenciais por pixel por duas leituras de textura; a autoexposição na CPU usa as mesmas funções.
- **Ângulos pequenos** são calculados com `atan(|a×b|, a·b)`, não com `acos`, que em float32 só resolve cerca de $3 \times 10^{-4}$ rad perto de 1.
- **`smoothstep`** sempre com os limites em ordem crescente, e **`pow` nunca com base negativa** (indefinidos em GLSL): o anel de fótons e os arcos de lensing usam $x \cdot x$.
- **Alvos:** estrela (`uTargetType = 0`) com escurecimento de bordo $I(\mu) = 1 - 0{,}68(1 - \mu^{0,75})$, granulação FBM 3D animada por `uTime` (relógio real), manchas, coroa e spikes de difração (que somem quando o disco passa de ~0,05 rad); as projeções no disco usam sen(raio), exatas também a 3 raios. Enquanto o disco é menor que um pixel, o alvo estelar aparece como estrela pontual de brilho `uTargetPointAmp` (pela magnitude V); o Sol também (`uSunPointAmp`, V = −26,74 a 1 UA). Sagittarius A* (`1`) com sombra, anel de fótons, disco inclinado com lensing e beaming rotacional; Andrômeda (`2`) com bojo e braços espirais logarítmicos e brilho superficial na escala da Via Láctea (`uGalaxyGain`). O disco estelar e a sombra do buraco negro são opacos (`coverage`) e escondem as estrelas atrás.
- **Estrela-alvo grande no para-brisa** (`resolvedTargetGain`): sem autoexposição, uma anã vermelha que ocupa meia tela ficaria escura; entre 0,6° e 2,9° de raio aparente, `uTargetGain` leva a superfície ao nível da autoexposição (só clareia), e o fundo perde brilho (`uBackgroundGain` = ganho^−0,3). Nos instrumentos com autoexposição, o fundo cai com (exposição padrão/exposição)^0,75 quando a exposição sobe por causa do alvo.
- **Céu real** (§12): `renderCatalogStar` lê a célula do cubo (`uStarCells`) e calcula direção e brilho da estrela pela posição atual da nave (`uShipOffset`); a Via Láctea (`milkyWaySample`) gira a direção de origem para o referencial galáctico (`uShipToGalactic`) e mistura os dois mapas mais próximos da nave; `renderBackgroundStars` desenha a população local (só onde `uStarDensity` > 1) e o pó de estrelas fracas da faixa. O brilho difuso tem um joelho (satura devagar acima de 0,25 depois da exposição), para o centro galáctico desviado para o azul não virar uma parede branca.
- **Olho e véu, só no para-brisa e só com piloto humano** (`pilotEye`): `uEyeSensitivity` $= 2^{-0,1 R}$ e `uGlareIntensity` $= 5{,}5\,(E/E_{\text{pico}})^{0,75}\,2^{-0,4 R}$, com $R$ a dessensibilização da retina em stops (§9). O véu final cai com $2^{-0,5 R}$: estoura o para-brisa no white-out da ida e vira névoa fraca com a mesma luz na frenagem. `uGlareColor` é a cor linear do corpo negro de $T_0 e^{\eta}$, calculada na CPU com luminância 1. Os instrumentos e a sonda robótica (câmera de bordo) recebem 1 e 0: na sonda, o cone quente da CMB é um ponto ofuscante, sem véu.
- **Autoexposição do telescópio voltado para a frente** (`src/physics/sensorResponse.ts`): mede pelo pico da CMB diluído pela PSF ou pela superfície do alvo quando ele cobre ≥ 3 px. Voltado para trás, a exposição é fixa (o Sol some no infravermelho, como deve).
- **Saída antecipada:** abaixo de 250 K, `sampleBlackbodySensor` retorna 0. Abaixo de cerca de 254 K todas as amostras de Planck já dariam $x > 80$, então o resultado não muda.
- **Tone mapping:** o shader aplica ACES e gama 2,2 na própria saída. Ao introduzir o Bloom do `@react-three/postprocessing`, a saída deve passar a ser HDR linear, com tone mapping e conversão de cor feitos no `EffectComposer`; senão a gama é aplicada duas vezes e o Bloom atua sobre cores já comprimidas.
---
## 6. Arquitetura de Diretórios Esperada
```text
relativistic-space-simulator/
├── .github/workflows/deploy.yml   # CI/CD automático para GitHub Pages
├── public/icons/                  # Ícones do PWA (SVG + PNG 192/512/maskable/apple-touch)
├── scripts/fetch-horizons.mjs     # Baixa e comprime as efemérides do JPL Horizons (§11)
├── scripts/reconstruct.mjs        # Grava as reconstruções de src/probes/reconstruct/ (§11)
├── scripts/build-star-catalog.mjs # Baixa o HYG e grava as estrelas com V ≤ 6,5 (§12)
├── src/
│   ├── audio/
│   │   ├── FlightAudio.ts         # Sintetizador Web Audio: motor e alertas
│   │   ├── engineSound.ts         # Timbre do motor em função de γ e do empuxo + teste
│   │   ├── audioSettings.ts       # Som ligado/mudo (persistido no localStorage)
│   │   └── useFlightAudio.ts      # Liga o áudio ao store e aos eventos de voo
│   ├── physics/
│   │   ├── RelativityEngine.ts    # Cinemática hiperbólica 64-bit e uniforms
│   │   ├── RelativityEngine.test.ts # Testes unitários Vitest validando os marcos do vídeo
│   │   ├── destinations.ts        # Catálogo de estrelas e galáxias (com direção no céu e magnitude)
│   │   ├── accelerationPresets.ts # Acelerações por tipo de nave e limites de tolerância (§7) + teste
│   │   ├── criticalEvents.ts      # Janelas críticas do Auto-Step Down (§7.2) + teste
│   │   ├── EyeAndPhotometry.ts    # Lux da CMB, olho do piloto, auto-zoom, v/c em % (§9) + teste
│   │   ├── blackbody.ts           # Luminância e cor de corpo negro na CPU + teste
│   │   ├── sensorResponse.ts      # Sensor do shader (cor e tabela), autoexposição e ganho do alvo grande + teste
│   │   └── sky.ts                 # Raios angulares do Sol e do alvo, distância de parada (64 bits) + sky.test.ts
│   ├── sky/                       # Céu real (§12)
│   │   ├── data/bright-stars.json # 8 920 estrelas do HYG (V ≤ 6,5): α, δ, V, B−V, distância
│   │   ├── skyFrame.ts            # ICRS, galáctico e referencial da nave (alvo em −Z) + teste
│   │   ├── starCells.ts           # Catálogo numa grade de células sobre um cubo, com paralaxe + teste
│   │   ├── galaxyModel.ts         # Modelo 3D da Via Láctea e mapas do brilho difuso + teste
│   │   ├── skyResources.ts        # Texturas e uniforms compartilhados pelos monitores
│   │   ├── starCells.worker.ts, milkyWay.worker.ts, skyMapMessages.ts
│   ├── shaders/
│   │   ├── RelativisticSky.vert
│   │   └── RelativisticSky.frag
│   ├── probes/                    # Simulador de sondas (§11), carregado sob demanda em #sondas
│   │   ├── data/                  # Uma tabela por sonda/nave, planets.json, moons.json, small-bodies.json, planet-fixtures.json
│   │   ├── reconstruct/           # Só para o script: cônicas, sobrevoos e decimação (common), Mariner 10, Vikings e
│   │   │                          # Magellan (interplanetary), integrador Terra–Lua–Sol (integrator) e Apollo (apollo)
│   │   ├── ephemeris.ts           # Tabelas do Horizons; interpolação de Kepler com correção de Hermite
│   │   ├── kepler.ts              # Propagação em variáveis universais, Lambert (com voltas), período, cônica + teste
│   │   ├── rotation.ts            # Rotação IAU de Marte, Vênus e Lua: pontos da superfície que giram + teste
│   │   ├── planets.ts             # Planetas: Kepler (Mercúrio–Marte) e tabelas (Júpiter–Plutão) + teste
│   │   ├── bodies.ts              # Todos os corpos: planetas, luas (série de Fourier) e corpos pequenos
│   │   ├── probes.ts              # Trajetórias, janelas de encontro, sobrevoo, captura e periélio + teste
│   │   ├── venera.ts              # Venera 7 e 13 reconstruídas por Lambert e hipérboles
│   │   ├── missions.ts            # Catálogo das 17 sondas e 9 Apollo, companheiras e eventos + missions.test.ts
│   │   ├── eventExplanations.ts   # Explicações e fórmulas de cada evento (sondas)
│   │   ├── apolloExplanations.ts  # Explicações das Apollo: tripulações, queimas, pouso, reentrada
│   │   ├── sceneMath.ts           # Escala log/real, foco, referencial e pontos dos rastros, distância da câmera
│   │   ├── useProbeStore.ts       # Data, ritmo, foco, escala e loop com desaceleração nos encontros
│   │   ├── SolarSystemScene.tsx   # Cena R3F com origem flutuante: Sol, planetas, luas, corpos pequenos, sondas
│   │   ├── ProbesApp.tsx          # Layout do modo Sondas
│   │   ├── ProbeHUD.tsx, ProbeControls.tsx, ProbeEvents.tsx
│   │   ├── time.ts, vec3.ts       # Dias desde J2000 e vetores em 64 bits
│   ├── components/
│   │   ├── SplashScreen.tsx       # Abertura: viagem relativística ou sondas históricas
│   │   ├── MissionPlanner.tsx     # Planejamento: destino, piloto ou sonda, aceleração, perfil (§7)
│   │   ├── RelativisticCockpit.tsx # Layout do cockpit (#viagem)
│   │   ├── CockpitFrame.tsx       # Colunas do para-brisa (tela larga)
│   │   ├── RelativisticSky.tsx    # Esfera celeste + uniforms, compartilhada pelos monitores
│   │   ├── CockpitMonitor.tsx     # Telas penduradas e suas teclas
│   │   ├── MainViewport.tsx       # Cena 3D principal (para-brisa do cockpit)
│   │   ├── RouteMonitor.tsx       # Monitor direito: "Rota · escala log" e o progresso
│   │   ├── TelescopePIP.tsx       # Monitor esquerdo: telescópio TRÁS/FRENTE com auto-zoom, VIS / IV / UV / RX
│   │   ├── CenterHologramProjector.tsx # Hologramas contextuais no centro inferior (§9)
│   │   ├── ExplanationCard.tsx    # Cartão do modo Explicar: o efeito que acabou de começar (§10)
│   │   ├── ActiveEffectsPanel.tsx # Painel de efeitos ativos com explicações e fórmulas (§10)
│   │   ├── TeX.tsx                # Fórmula TeX renderizada pelo KaTeX
│   │   ├── useLiveExplainContext.ts # Estado do voo para as explicações, a 4 Hz
│   │   ├── InstrumentPanel.tsx    # Painel: missão, partida, linha do tempo, M_τ, mostrador de γ, motor, teclas
│   │   ├── TelemetryHUD.tsx       # Console de teto: velocidade, γ, relógios, distâncias e avisos
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
│   │   ├── appMode.ts             # Tela pela âncora da URL: abertura (#inicio), #viagem ou #sondas
│   │   ├── cockpitUi.ts           # Estado da interface do cockpit: planejamento, telescópio, painel
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
1. **Telas:** a abertura (`#inicio`, ou sem âncora) escolhe entre a viagem relativística (`#viagem`) e as sondas (`#sondas`, §11). O cockpit carrega sob demanda; ao entrar, abre o **planejamento da missão** por cima dele.
2. **Planejamento** (`MissionPlanner.tsx`), em três colunas (empilhadas no celular, com o embarque fixo no rodapé):
   - **Destino:** os cinco da §4.3, com distância, tipo e uma linha de descrição.
   - **Nave:** "Piloto humano" (o para-brisa passa pelo olho do piloto, §9) ou "Sonda robótica" (câmeras de bordo, sem olho nem véu, sem o holograma dos olhos).
   - **Aceleração** (`src/physics/accelerationPresets.ts`), por tipo de nave, cada uma com a proteção, a tolerância e o tempo de viagem para o destino escolhido:
     - Tripulada: 1 g (gravidade da Terra, anos), 1,5 g (dias a semanas), 3 g deitado (horas), 6 g com traje anti-G (~10 min), 10 g com imersão em líquido (até ~3 dias, no limite), 30 g com imersão e ventilação líquida (minutos a horas) e 1,61 × 10⁶ g (hipotética: ninguém sobreviveria; mostra o que um piloto veria).
     - Robótica: 0,3 g (sonda convencional), 100 g (sonda reforçada), 10 000 g (eletrônica encapsulada), 30 000 g (nanossonda tipo Starshot) e 1,61 × 10⁶ g (hipotética: nenhum material aguenta).
     - "Personalizada": campo em g e slider log, de 0,1 g a $10^7$ g, com a tolerância da faixa (humanos: anos até 1,2 g, semanas até 1,5 g, ~3 dias até 10 g, horas até 50 g; máquinas: contínua até 60 000 g).
     - O veredito compara o maior empuxo contínuo (a viagem inteira no Flip-and-Burn, cada queima com cruzeiro) com a tolerância: ✓ suportável, ⚠ além do limite ("a tripulação não chegaria viva") ou ✕ hipotética.
   - **Perfil:** "Acelerar e frear" (Flip-and-Burn) ou "Acelerar, cruzar e frear", com a velocidade de cruzeiro num slider de rapidez (sugestão: 0,9c). O resumo mostra tempos de bordo e na Terra, γ e velocidade máximos e a razão de massa do foguete de fótons.
   - O padrão é a demonstração clássica: Proxima, 1,61 × 10⁶ g, piloto humano (hipotético). "Embarcar" aplica a missão parada em τ = 0; "⚙ Planejar" no painel reabre o planejamento.
3. **Multiplicador de Tempo Próprio ($M_\tau$) com *Auto-Step Down*:**
   - Escada (`src/store/timeScales.ts`): `0,01x`, `0,03x`, `0,1x`, `0,3x`, `1x`, `5x`, `20x`, `100x`, `10 min/s`, `1 h/s`, `6 h/s`, `1 dia/s`, `1 sem/s`, `1 mês/s`, `3 meses/s`, `1 ano/s`, `5 anos/s`, `25 anos/s`: da câmera lenta a $10^7$ g aos séculos de Andrômeda a 0,1 g. O painel percorre a escada com ◀ ▶, mostra quanto falta na tela ("≈ 21 min até a chegada") e tem ⟲ para o degrau "natural", o que encaixa a viagem em ~10 min (demonstração: 1x; 1 g até Proxima: 1 dia/s; 1 g até Andrômeda: 1 mês/s). Trocar de missão mantém o multiplicador se a nova viagem durar de 20 s a 3 h na tela; senão, vai para o natural.
   - Opção "Desacelerar nos eventos" (quando a CMB atravessa o espectro visível em $\gamma \in [400, 15000]$ e na reta final antes do *Flip*): ao entrar na janela, M_τ cai para o maior degrau com que ela dura ≥ 20 s reais, nunca abaixo de 1x. Não há degrau entre 1x e 5x: na demonstração, isso é sempre 1x.
   - **Durações na escala da missão** (`missionScaledS`): as janelas da demonstração (10 s antes do flip, contagens holográficas de 10 s) valem $\max(d, \tau_{\text{total}}\,d/600\text{ s})$: iguais na demonstração, 1/60 da viagem nas longas (~21,6 dias antes do flip a 1 g até Proxima). Se o pico de $\gamma$ fica dentro da faixa da CMB, a janela da CMB é uma só, da entrada na ida à saída na volta.
   - O Auto-Step Down age na **entrada** de cada janela crítica (a da CMB acontece na aceleração e na frenagem). Se um frame longo pularia o início da janela, $\tau$ é posicionado exatamente nele. Dentro da janela, o usuário pode voltar a acelerar.
   - Trocar o destino, $\alpha$, o perfil ou a nave reinicia a missão parada em $\tau = 0$.
4. **Áudio procedural:**
   - **Motor:** ruído marrom filtrado, zumbido dente-de-serra e sub-harmônico. O empuxo (voo rodando, na aceleração ou na frenagem) liga o ronco; $\log_{10}\gamma$ sobe o tom e abre o filtro, saturando em $\gamma = 10^7$. No flip, o motor corta por 0,7 s.
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
## 9. Fotometria, Olho do Piloto e Cockpit V3
1. **Iluminância visível à frente** (`visibleLuxAhead`), calculada pela física: a luminância de Planck da CMB aberrada e desviada pelo Doppler, integrada sobre o hemisfério frontal,
   $$E = 2\pi \int_0^1 L_v\!\left(T_0\,D(u)\right)(1 - u)\,du, \quad u = 1 - \cos\theta, \quad D(u) = \frac{1}{\gamma(\delta + \beta u)}$$
   com $L_v = 683 \int B_\lambda\,\bar{y}(\lambda)\,d\lambda$. O cone quente encolhe com $1/\gamma^2$, então $E$ tem um pico universal de **11 069 lux** em $\gamma \approx 6\,955$ e vale **10 799 lux** em $\gamma = 9\,356$ (vídeo: 11 065 e 10 796).
2. **Olho do piloto** (só com piloto humano), integrado em tempo próprio ao longo da missão inteira (`computeEyeTimeline`). Por isso é determinístico: o scrub vê o mesmo estado do voo contínuo.
   - Pupila: Moon & Spencer (1944), $d = 4{,}9 - 3\tanh(0{,}4\log_{10}E)$; contrai em 0,5 s e dilata em 300 s.
   - Retina: alvo $\log_2(1 + E/0{,}7\text{ lux})$ stops; adapta-se à luz em 60 s e recupera-se no escuro em 1 200 s.
   - "N× mais fraca": a mesma luz do instante espelho da ida ($E(\tau) = E(\tau_{\text{total}} - \tau)$), vista com o olho de agora: $2^{R_{\text{agora}} - R_{\text{espelho}}}\,(d_{\text{espelho}}/d_{\text{agora}})^2$.
   - Marcos para Proxima em τ = 449 s (espelho do white-out em 150 s): pupila 2,13 mm, retina −12,8 stops, ≈ 1 290× mais escuro (vídeo: 2,14 mm, −12,9 stops, 1 260×).
3. **Cockpit** (estilo nave de ficção científica, tudo em português; fontes Orbitron e Share Tech Mono):
   - **Console de teto** (`TelemetryHUD`): visores de velocidade (`formatRelativisticSpeedPercent`, "99.999 999 999 994 9 %", e c − v), γ e η, relógios da nave e da Terra, distância no referencial da Terra e contraída. Selos: fase, "🧑‍🚀 Piloto humano" ou "🤖 Sonda robótica · sem tripulação", destino, contagem da ignição, "⚠ Ofuscamento · luz forte à frente" (só com piloto; luz > 1 500 lux ou aceleração com $\gamma \in [200, 12\,000]$), "CMB no visível" e "Flip em". Com o véu percebido > 0,25 (`isWhiteoutHudActive`), o console e os hologramas ganham fundo fosco.
   - **Telas penduradas** no console por duas hastes e inclinadas para o centro na tela larga: o telescópio à esquerda, a rota à direita. Na tela larga, colunas laterais (`CockpitFrame`) ligam o teto ao painel.
   - **Painel de instrumentos** (`InstrumentPanel`, recolhível): placa da missão (destino, α, nave, veredito, "⚙ Planejar", 🛰 sondas, ⌂ abertura), botão redondo de partida (Partida / Pausar / Retomar / Repetir / Abortar), linha do tempo, M_τ com ◀ ▶ ⟲, "Desacelerar nos eventos", mostrador analógico de γ em escala log (1 a 10¹³, com a faixa da CMB visível em âmbar), lâmpada do motor (Empuxo / Flip / Inércia / Desligado) e as teclas Explicar, Efeitos e Som. No celular: partida, linha do tempo e M_τ em cima, teclas e planejamento embaixo.
4. **Telescópio** (TRÁS, padrão, ou FRENTE; sensores VIS / IV / UV / RX):
   - À frente: zoom $\max(1,\ \min(\max(13,\ 0{,}253\,\gamma),\ \text{zoom que põe o alvo em 35\% da altura}))$, relativo ao FOV de 70° do para-brisa: acompanha o cone comprimido e abre abaixo de x 13 na reta final, quando o alvo cresce. Autoexposição.
   - Atrás: zoom que põe o Sol em 35% da altura, de x 13 a x 400 (atrás, a aberração amplia por $e^{\eta}$: $\tan(\theta'/2) = e^{\eta}\tan(\theta/2)$). Exposição fixa: o Sol avermelha e some do visível (no IV, continua).
5. **Monitor direito:** "Rota · escala log" (log a partir do Sol até METADE, espelhado até o alvo), com os marcos (distância de Saturno, Nuvem de Oort), o estado do motor, as distâncias "DO SOL" e "ATÉ" o alvo e o progresso em percurso, tempo de bordo e tempo da Terra.
6. **Hologramas** (`selectHologramMode`, por critérios físicos), em ordem de prioridade:
   1. "FRENAGEM EM" antes do início da frenagem; "CHEGADA EM" antes da chegada (10 s na demonstração, 1/60 da viagem nas longas, quando a contagem mostra o tempo de bordo restante, como "6,47 dias").
   2. Anéis do Sistema Solar ("DISTÂNCIA DO SOL"): aceleração, 5–32 UA do Sol.
   3. "Seus olhos depois do clarão" (só com piloto humano): frenagem, $T_{\text{CMB}} \in (5\,000, 60\,000)$ K e fator "mais fraca" ≥ 2 (em viagens de anos o olho acompanha a luz e o fator fica em ~1). Mostra a mesma luz em dois momentos: na ida (τ espelho, olho ofuscado: pupila e sensibilidade da retina) e agora (pupila, retina "N× menos sensível", a luz "N× mais fraca").
   4. Espectro da CMB ("CMB À FRENTE · T", "PICO EM nm"): pico de Wien entre 260 e 980 nm.
   5. Curva de lux ("LUZ VISÍVEL À FRENTE"): aceleração, $T_{\text{CMB}} \in (15\,000, 180\,000)$ K.
   6. Desvio para o azul do alvo ("COR REAL" × "VISTA AGORA"): frenagem, $\gamma \in [8, 220]$.

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
   | Ofuscamento (olho do piloto ou ponto ofuscante na câmera da sonda) | $E \ge 1\,500$ lux | 147 s |
   | Cone quente | $\gamma$ acima do pico de lux ($\approx 6\,955$) | 181 s |
   | CMB em raios X | pico de Wien $\le 10$ nm | 220 s |
   | Flip | janela antes do início da frenagem (10 s na demonstração) | 289 s |
   | Inércia (motor desligado) | fase `coasting` do perfil com cruzeiro | — |
   | Frenagem | fase de frenagem | 299 s |
   | Olhos adaptados (só com piloto) | frenagem, $T_{\text{CMB}} \in (5\,000, 60\,000)$ K e fator ≥ 2 | 409 s |
   | Alvo azulado | frenagem, $\gamma \in [8, 220]$ | 483 s |
   | Chegada | fase de chegada | 599 s |
   | Missão | sempre (só no painel) | — |
   | Combustível (equação do foguete) | sempre (só no painel) | — |

   Os limiares de γ também são atravessados pela viagem a 1 g até as estrelas próximas ($\gamma_{\max} \approx 3$), e na demonstração os cartões chegam com ≥ 6 s de intervalo, o tempo mínimo de cada um na tela.

2. **Cartão** (botão "💡 Explicar" ao lado da partida, ligado por padrão e persistido): o loop (`tick`) anuncia cada efeito na **transição** inativo → ativo, uma vez por missão. O scrub não anuncia e dispensa o cartão. A nova partida e a troca de missão zeram os anúncios. Cada cartão fica ≥ 6 s reais na tela (a 20x/100x mostra o mais recente ao fim do prazo). Ligar o modo no meio do voo mostra o efeito mais próprio do instante.
3. **Painel de efeitos ativos** (botão "∑ Efeitos", ou automático ao pausar com o modo Explicar ligado; retomar fecha, Esc fecha): todos os efeitos ativos com resumo, fórmulas com os valores atuais e "Saiba mais". Acompanha o scrub a 4 Hz. O efeito vindo do cartão aparece destacado no topo até o instante mudar. Enquanto o painel está aberto, o holograma central se esconde. No celular, o painel ocupa a tela inteira e tem "▶ Retomar".
4. **Texto pt-BR:** vírgula decimal (`{,}` no TeX), milhares com espaço ("11 069", nunca "11.069") e durações por extenso ("22 min 28 s"). Todas as fórmulas passam no KaTeX em modo estrito em qualquer instante, destino e tipo de nave (teste em `explanations.test.ts`). Os textos mudam com a nave: na sonda robótica, câmeras em vez de olhos.

---
## 11. Simulador de Sondas (`#sondas`)
O segundo modo do app: um Sistema Solar dinâmico com as trajetórias de 17 sondas (1970 a 2035) e das 9 missões Apollo à Lua (1968 a 1972). Abre pela tela inicial ou pelo 🛰 do painel do cockpit; as sondas têm "🚀 Viagem relativística" e "⌂ Início". O modo carrega sob demanda (`React.lazy`) e o áudio do cockpit é suspenso enquanto ele está fora da tela.

1. **Missões** (`missions.ts`): o seletor tem dois grupos.
   - **Sondas**, em ordem de lançamento: Venera 7, Pioneer 10, Pioneer 11, Mariner 10, Viking 1 e 2 (com os módulos de pouso), Voyager 2, Voyager 1, Venera 13, Magellan, Galileo (com a sonda atmosférica), Cassini (com a Huygens), Rosetta, New Horizons, Dawn, Juno e Parker Solar Probe.
   - **Apollo**: 8, 10, 11, 12, 13, 14, 15, 16 e 17 (as 7 e 9 ficaram na órbita da Terra), com os módulos lunares (Snoopy, Eagle, Intrepid, Antares, Falcon, Orion, Challenger) como companheiros.
   - As companheiras são trajetórias próprias, desenhadas junto da nave-mãe; antes da separação ficam nela.
2. **Dados do JPL** (`scripts/fetch-horizons.mjs`, respostas em cache em `node_modules/.cache/horizons`): vetores do JPL Horizons na eclíptica J2000 (ICRF), em UA e UA/dia (janelas em km e km/s), tempo em dias desde J2000 (TDB ≈ UTC).
   - **Interpolação** (`ephemeris.ts`, a mesma no script): entre duas amostras, a órbita de Kepler em torno do corpo central propagada da primeira (`kepler.ts`), mais uma correção cúbica de Hermite que leva exatamente ao estado da segunda. A cônica cobre a curvatura (periélios, passagens rentes) e a correção, as perturbações suaves. Uma amostra só fica se a interpolação sem ela errar mais que **150 km** no espaço interplanetário, **15 km** nos sobrevoos, **50 km** nas órbitas em torno de planetas, **5 km** em torno de Vesta e Ceres e **0,5 km** em torno do cometa. O enxugamento usa os números já arredondados como no JSON (numa órbita baixa, o arredondamento também erra).
   - **Janelas de encontro**: partida da Terra, sobrevoos (planetas, luas, asteroides, Arrokoth), órbitas (Galileo e Juno em Júpiter, Cassini em Saturno, Rosetta no cometa, Dawn em Vesta e Ceres) guardadas **relativas ao corpo**. Na tela, a sonda vale corpo(t) + trajetória relativa, então o encontro passa no lugar exato mesmo que o corpo tenha erro. A posição relativa se mistura com a heliocêntrica nas bordas (25% da janela, ou 15 dias na entrada das órbitas); janelas de lua ficam dentro da do planeta e se misturam sobre ela. Galileo e Cassini terminam onde a trajetória cruza o nível de 1 bar. Um encontro pode ter tipo explícito (`kind`), GM próprio (`gm: 0` nas descidas freadas) ou ser um **pouso** (`site`: latitude e longitude), em que o módulo fica num ponto da superfície que gira com o corpo (`rotation.ts`, modelos da IAU).
   - Asteroides integrados não servem de centro no Horizons: a trajetória relativa a Gaspra, Ida e Lutécia é a diferença das heliocêntricas. O trecho de Šteins nos dados é uma previsão da ESA anterior ao sobrevoo (~580 km; o real foi ~800 km).
3. **Corpos** (`bodies.ts`): planetas (`planets.ts`: Kepler de Standish para Mercúrio–Marte, erro de 1 000 a 45 000 km; tabelas dos baricentros para Júpiter–Plutão, de 1968 a 2037, interpoladas com μ = GM☉ + GM do planeta); **luas** (Lua, Io, Europa, Ganimedes, Calisto, Encélado, Titã, Tritão, Caronte) por uma **série de Fourier** relativa ao centro do planeta, ajustada pelo script aos vetores de 1968 a 2036: frequências achadas uma a uma no pico do espectro do resíduo (FFT com janela de Hann, refinada por seção áurea) e amplitudes por mínimos quadrados, até o erro máximo ficar abaixo de 100 km ou chegar a 60 termos (erro de 3 a 140 km; ~20 KB no total); **corpos pequenos** (cometa 67P, Arrokoth, Šteins, Lutécia, Gaspra, Ida, Vesta e Ceres) por tabelas nos anos das missões, com a órbita desenhada pela cônica do estado.
4. **Reconstruções**: o Horizons não tem as sondas soviéticas, a Mariner 10, as Vikings, a Magellan nem as Apollo. Elas são reconstruídas pela mecânica orbital a partir das datas da missão, e o painel marca "Rota reconstruída".
   - **Veneras** (`venera.ts`, no app): arco de Lambert entre a Terra na injeção e Vênus na entrada da atmosfera; hipérbole de saída a partir de 200 km na direção de v∞; hipérbole de chegada mirando o lado voltado para a Terra até 125 km; descida e tempo de transmissão no solo (23 min e 127 min). C₃ de 8,6 e 16,2 km²/s² e entrada a 11,5 e 11,2 km/s.
   - As demais saem de `npm run reconstruct` (`src/probes/reconstruct/`), gravadas no formato das tabelas do JPL com os números da reconstrução em `reconstruction`. Manobras são duas amostras (antes em t, depois em t + 10⁻⁶ dia, propagada esse instante): na interpolação, a diferença de velocidade entre uma amostra e a cônica que chega a ela é multiplicada pela duração do trecho. O enxugamento tem pontos de controle a cada 1/8 de volta (no máximo 2 dias) e arredonda a 1 m e 0,1 mm/s.
   - **Mariner 10** (`interplanetary.ts`): Lambert Terra → Vênus → Mercúrio; o sobrevoo de Vênus sai das duas hipérboles (5 741 km de altitude; real: 5 768 km). Os três encontros com Mercúrio (703, 48 069 e 327 km) ficam numa órbita de 176 dias, duas voltas de Mercúrio: o plano de cada sobrevoo é o que devolve a sonda mais perto dele, e uma correção de rota no meio de cada volta (12,6 e 22,7 m/s) acerta o encontro.
   - **Vikings**: Lambert até Marte, captura a 1 500 km no plano que contém v∞ e o local de pouso (inclinação de 36,9°; real: 37,9°), ajuste no periapse para a órbita de ~1 sol que passa sobre o local no instante do pouso. O módulo: separação, queda por Lambert até 244 km (~4,6 km/s), descida freada ao longo do grande círculo até o local, e o ponto da superfície até o último contato.
   - **Magellan**: transferência do tipo IV (Lambert com uma volta), captura numa órbita de 294 km × 3,26 h com inclinação de 85,5° (Δv de 2,61 km/s), aerofrenagem de ~760 passagens (1,6 m/s cada) até 180 × 541 km (94 min), e o mergulho final em 13/10/1994.
   - **Apollo** (`apollo.ts` e `integrator.ts`): integração numérica (Dormand–Prince 5(4)) no referencial geocêntrico com a Terra, a Lua (a mesma série do app) e o Sol, termos indiretos incluídos.
     - Ida: de trás para frente a partir do periselênio a 111 km no instante histórico da LOI, num plano retrógrado que contém o local de pouso no pouso e na decolagem; o tiro acha o ponto e a velocidade do periselênio que caem no perigeu de 185 km no instante da TLI. Se não houver solução nesse plano, a chegada vem um pouco inclinada e a LOI corrige o plano (Apollo 17: 11,9°).
     - Na Lua: LOI para 111 × 312 km, LOI-2 com fase para a DOI, DOI meia volta antes do PDI, descida motorizada (desaceleração constante) até o local, superfície, subida até 17 × 83 km em 7,2 min e transferência de 130° até o CSM (TPI 43 min antes da TPF); ajustes de fase do CSM para o encontro e para a TEI.
     - Volta: a TEI no ponto da órbita em que ela sai mais barata (ajuste de fase depois da acoplagem), com tiro até a interface de entrada (121,9 km, −6,5°) no instante histórico; componente fora do plano só quando necessária. Depois a reentrada (~2 300 km sobre o solo) e a amerissagem.
     - Apollo 13: periselênio do retorno livre a 254 km (no plano de menor inclinação por Fra Mauro em que a conta fecha) e a queima PC+2.
     - Resultados na Apollo 11: TLI de 3,16 km/s (real: 3,18), LOI de 0,885 km/s (0,889), DOI de 22,9 m/s (23,3), TEI de 1,005 km/s (1,001), entrada a 11,03 km/s (11,03).
5. **Análises** (`probes.ts`), todas pelos dados:
   - **Sobrevoo** (`analyzeFlyby`): maior aproximação por seção áurea; v∞² = v² − 2μ/r; deflexão medida contra a da hipérbole, sin(δ/2) = 1/(1 + r_p v∞²/μ), com erro < 1° (< 3° rente ao planeta, por causa do achatamento); velocidade em relação ao Sol antes e depois por |V_planeta + v∞|. Numa lua, o efeito na órbita em torno do planeta: período antes e depois pela energia (Juno: Ganimedes 53 → 43 dias, Europa → 38, Io → 33).
   - **Captura** (`analyzeCapture`): energia relativa ao planeta três dias antes (hipérbole) e depois (elipse) do primeiro periapse: v∞, Δv instantâneo no periapse, período e apoapse (Juno: 518 m/s e 53,4 dias; Cassini: 117 dias; Galileo: a freada soma Io e o motor; Vikings e Magellan pelas reconstruções).
   - **Periélio** (`analyzePerihelion`): Parker a 9,86 raios solares e ~191 km/s em 24/12/2024.
6. **Eventos** (`missions.ts`): lançamentos, sobrevoos (numerados quando se repetem), inserções em órbita, separação e entrada/pouso das companheiras, pousos (Veneras, Vikings, Philae), fins de missão, últimos contatos, marcos fixos (Pálido Ponto Azul, heliopausas, SL-9, Grand Finale, hibernação da Rosetta, coroa solar, mapeamento e aerofrenagem da Magellan, Dawn em Vesta e Ceres) e marcos calculados (dia-luz da Voyager 1 em 18/11/2026; a New Horizons passa a distância da Lua ~8 h depois da injeção). Nas Apollo: lançamento, TLI, LOI, separação do LM, pouso, decolagem, acoplagem, TEI, reentrada e amerissagem, mais o Nascer da Terra (8), a passagem a 15 km (10), o primeiro passo (11), a explosão, o recorde de distância e a PC+2 (13) e o último passo (17). Cada evento tem explicação com fórmulas (`eventExplanations.ts`, `apolloExplanations.ts`), todas válidas no KaTeX estrito.
7. **Cena** (`SolarSystemScene.tsx`): eclíptica no plano XY, norte para cima, **origem flutuante** e depth buffer logarítmico.
   - Planetas, luas, corpos pequenos e sondas têm tamanho mínimo na tela; uma lua só aparece quando se afasta do planeta ≥ 10 px.
   - **Rastros** (`trailPoints` em `sceneMath.ts`), calculados aos poucos depois da primeira imagem (a missão escolhida primeiro): um ponto a cada ~3° de giro em torno do corpo central do momento, sem passar de 1/4 do tempo para percorrer a distância atual (uma aproximação quase reta não pula o sobrevoo) nem de 1 dia dentro de uma janela de encontro (a escala log mistura duas escalas ali). Órbitas mais curtas que 5 dias que duram anos (Vikings, Magellan, Dawn) guardam uma volta a cada 10 dias, com lacunas, e a cena desenha na hora a volta mais recente; um módulo pousado não tem rastro na superfície.
   - Na escala real com foco num corpo (ou numa sonda em encontro), os rastros ficam no **referencial do corpo** (que o acompanha sem girar) e mostram só o trecho das janelas com ele: a órbita em torno de Júpiter ou da Lua aparece como órbita, e os sobrevoos antigos se sobrepõem. A sonda escolhida tem rastro forte e a rota inteira apagada; as demais, rastro fraco.
   - **Escala "Log"**: R = 10 log₁₀(1 + r/0,5 UA); um sistema planetário inteiro (luas e sondas nas janelas) usa a escala tangencial do planeta, sem achatar as órbitas. **"Real"** é a escala linear; perto de um corpo (< 0,005 UA) as órbitas heliocêntricas somem.
8. **Tempo** (`useProbeStore.ts`): de 01/12/1968 a 2035, em ritmos de 1 min/s a 1 ano/s. Com "Desacelerar nos encontros", cada encontro da sonda escolhida (±3 dias) passa a 6 h/s e o cartão abre; nas Apollo, cada evento (±20 min) passa a 1 min/s. Os eventos das outras missões não interrompem. Ir a um evento pausa e põe a câmera perto do corpo em escala real (~60 raios, 40 numa lua, 8 nos pousos das sondas, 6 nas Apollo, a órbita de captura inteira, o Sol no periélio) ou na sonda.
9. **Painel**: seletor com as sondas e as Apollo (anos e uma linha cada). Nas sondas: distância do corpo do encontro, do Sol e da Terra, tempo do sinal, velocidade contra o escape solar e os selos "Escapando do Sistema Solar", "Espaço interestelar", "Em órbita de…", "No solo de…", "Rota reconstruída", "Sem contato desde…" e "Previsão" (depois de hoje). Nas Apollo: a fase do voo (órbita da Terra, rumo à Lua, órbita da Lua, rumo à Terra, reentrada), o módulo lunar separado ou na superfície, distâncias da Terra e da Lua, velocidade em relação à Terra e tempo de missão. Depois do fim: "Missão encerrada" ou "Fim dos dados do JPL".

---
## 12. Céu Real (`src/sky/`)
O céu de fundo da viagem relativística é o de verdade, visto da posição da nave: as estrelas do catálogo com paralaxe, a Via Láctea de um modelo 3D da galáxia e mais estrelas onde a densidade é maior. O shader aplica aberração e Doppler a tudo, pela direção de origem de cada pixel (§5).

1. **Referencial da nave** (`skyFrame.ts`): o alvo, pela ascensão reta e declinação J2000 (§4.3), fica exatamente em −Z; o polo norte galáctico, projetado, em +Y, e a Via Láctea fica na horizontal rumo ao centro galáctico. ICRS → galáctico pela matriz do Hipparcos. A nave anda ao longo de −Z, do Sol ao alvo.
2. **Estrelas do catálogo** (`starCells.ts`, `starCells.worker.ts`): as 8 920 estrelas do HYG v4.1 com V ≤ 6,5, cada uma com posição 3D (distância pela paralaxe; desconhecida, 1 000 pc), cor pelo índice B−V (Ballesteros) e brilho aparente $10^{-0{,}4V} d^2$.
   - Grade de 128 × 128 células em cada face de um cubo (~0,7°): cada célula guarda a estrela que mais contribui no seu centro, com a posição relativa à nave na montagem e temperatura e luminosidade empacotadas num float32 exato ($\lfloor T/10\rfloor \cdot 1024 + 100(\log_{10}L + 2)$). O shader lê uma célula por pixel e calcula direção e brilho pela posição atual da nave: paralaxe e $1/d^2$ exatos entre montagens.
   - A grade é remontada num worker (~20 ms) quando a nave anda 0,2% da distância da estrela mais próxima, no máximo a cada 150 ms. O alvo sai do catálogo (Sirius, quando é o destino) e é desenhado à parte.
   - Brilho de exibição $2{,}2\,(L/d^2)^{0,8}$ (V = 0 → 2,2) e PSF de 1 pixel, com halo nas mais brilhantes que V ≈ 2. Chegando a Proxima, Alfa Centauri A e B, a ~0,18 ano-luz, viram as estrelas mais brilhantes do céu; rumo ao centro galáctico ou a Andrômeda, o catálogo fica para trás e se apaga.
3. **Via Láctea** (`galaxyModel.ts`, `milkyWay.worker.ts`): emissividade estelar em unidades da vizinhança solar, integrada ao longo de cada raio e atenuada pela poeira já atravessada.
   - Componentes: disco fino exponencial ($h_R$ = 2,6 kpc, $h_z$ = 300 pc) com quatro braços logarítmicos de 12,5° (Sagitário 1,3 kpc por dentro do Sol) e um vazio interno; disco espesso; barra inclinada de 27° com a ponta perto do Sol em l > 0; aglomerado nuclear em torno de Sgr A* (~10⁶ L☉/pc³ a 1 pc, núcleo de 1,5 pc, some além de ~20 pc). O centro do modelo é a posição de Sgr A*, a 26 700 anos-luz: a viagem termina exatamente nele.
   - Poeira: $A_V$ ≈ 1 mag/kpc no plano perto do Sol, escala de altura ~110 pc, nuvens de ruído 3D e a Bolha Local (sem poeira nos primeiros ~80 pc). Da Terra, o trecho mais brilhante fica nas janelas rumo ao centro (nuvens de Sagitário) e o próprio centro some atrás da poeira.
   - Integração: dentro da esfera de 25 kpc, 96 passos geométricos a partir do observador; fora dela, só o trecho do raio dentro da esfera, com passo proporcional à altura sobre o plano.
   - Mapas equirretangulares em coordenadas galácticas (o shader gira a direção da nave com `uShipToGalactic`): o da Terra (256 × 128) serve a todos os destinos; nas viagens longas, mapas de 192 × 96 em pontos da rota (a cada ×1,8 desde 100 anos-luz; rumo ao centro, também a cada ×1,8 da distância que falta), calculados um por vez, primeiro os mais próximos da nave, e misturados em pares no shader. Cada mapa leva 1 a 2 s no worker; em textura RG half-float com log₁₀ do brilho e a fração do bojo (a cor: 6 800 K no disco, 5 600 K no bojo).
   - Brilho de exibição: $x = I/I_{\text{ref}}$ com $I_{\text{ref}}$ = 4 (o disco no plano visto da Terra), $0{,}07\,x$ abaixo de 1 (polos escuros) e $0{,}07\,x^{0,2}$ acima (no aglomerado nuclear, $x \sim 10^4$, o céu inteiro brilha). O valor ε é invariante: o shader multiplica pelo corpo negro do disco ou do bojo deslocado pelo Doppler.
   - A caminho de Andrômeda, a densidade de estrelas cai para ~0 em dezenas de milhares de anos-luz, e a Via Láctea vira uma galáxia lá atrás (o brilho superficial não cai com a distância).
4. **Estrelas de fundo** (no shader): a população local aparece só onde a densidade de estrelas na posição da nave (`relativeStarDensity`, de 1 perto do Sol a ~10⁷ no núcleo) passa a da vizinhança solar, cada vez mais densa e brilhante rumo ao centro galáctico; o pó de estrelas fracas segue o brilho da Via Láctea na direção.
5. **Testes:** `skyFrame.test.ts` (Sgr A* e o polo galáctico, alvo em −Z), `starCells.test.ts` (catálogo, Alfa Centauri na chegada a Proxima, alvo excluído, empacotamento, grade), `galaxyModel.test.ts` (faixa × polos, nuvens de Sagitário, densidade e brilho no núcleo, Andrômeda), `sensorResponse.test.ts` (tabela do sensor com erro < 1%).

