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
- **Deploy:** GitHub Pages via GitHub Actions (`vite.config.ts` configurado com `base: './'`).
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
// Esfera celeste relativística (CLAUDE.md §5).
// Convenção: o eixo de voo é exatamente −Z (uForward = (0,0,−1), Sol em +Z,
// alvo em −Z). Com o eixo alinhado a um eixo de coordenadas, dPerp e a direção
// de origem saem sem cancelamento em float32, mesmo para γ ~ 10¹².
precision highp float;
varying vec3 vWorldDir;
uniform float uBeta;
uniform float uGamma;
uniform float uOneMinusBeta;
uniform vec3  uForward;
uniform vec3  uSunDir;
uniform float uSunRadiusRad;
uniform vec3  uTargetDir;
uniform float uTargetRadiusRad;
uniform float uTargetTemp;
// 0 = Visível (380-750nm), 1 = Infravermelho, 2 = Ultravioleta, 3 = Raios-X
uniform int   uSensorMode;
uniform float uPsfAngleRad;
uniform float uExposure;
const float T_CMB_0 = 2.72548;
const float T_SUN   = 5778.0;
struct RelativisticRay {
    vec3  sourceDir;
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
    vec3 srcDir    = normalize(srcUnnorm);
    float effectiveGammaCone = uGamma * uPsfAngleRad;
    float psfDilution = 1.0 / (1.0 + effectiveGammaCone * effectiveGammaCone * exp(-sin2Theta * uGamma * uGamma));
    RelativisticRay ray;
    ray.sourceDir     = srcDir;
    ray.doppler       = D;
    ray.solidAngleJac = D * D;
    ray.psfDilution   = psfDilution;
    return ray;
}
// Ângulo entre direções sem acos: acos(x) perto de x = 1 só resolve ~3×10⁻⁴ rad
// em float32; atan(|a×b|, a·b) mantém precisão relativa em ângulos pequenos.
float angleBetween(vec3 a, vec3 b) {
    return atan(length(cross(a, b)), dot(a, b));
}
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
vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yxx) * p3.zyx);
}
vec3 renderStarfield(RelativisticRay ray) {
    vec3 stars = vec3(0.0);
    float gridScale = 140.0;
    vec3 cell = floor(ray.sourceDir * gridScale);
    vec3 rnd  = hash33(cell);
    if (rnd.x > 0.965) {
        vec3 starCenter = normalize(cell + 0.5 + (rnd - 0.5) * 0.6);
        float angDist2  = max(0.0, 2.0 - 2.0 * dot(ray.sourceDir, starCenter));
        float starTemp0 = mix(3000.0, 12000.0, pow(rnd.y, 2.0));
        float apparentTemp = starTemp0 * ray.doppler;
        float profile = exp(-angDist2 / 1.8e-6);
        float beaming = clamp(ray.solidAngleJac * ray.psfDilution, 0.0, 50.0);
        stars += sampleBlackbodySensor(apparentTemp) * profile * beaming * (0.2 + 0.8 * rnd.z);
    }
    vec3 bodies = vec3(0.0);
    float occlusion = 0.0;
    float angSun = angleBetween(ray.sourceDir, normalize(uSunDir));
    if (angSun < uSunRadiusRad * 4.0) {
        float limb = 1.0 - smoothstep(uSunRadiusRad * 0.85, uSunRadiusRad, angSun);
        float corona = exp(-angSun / max(uSunRadiusRad * 0.6, 1e-5)) * 0.15;
        bodies += sampleBlackbodySensor(T_SUN * ray.doppler) * (limb + corona);
        occlusion = max(occlusion, limb);
    }
    float angTarget = angleBetween(ray.sourceDir, normalize(uTargetDir));
    if (angTarget < uTargetRadiusRad * 4.0) {
        float limb = 1.0 - smoothstep(uTargetRadiusRad * 0.85, uTargetRadiusRad, angTarget);
        float corona = exp(-angTarget / max(uTargetRadiusRad * 0.6, 1e-5)) * 0.25;
        bodies += sampleBlackbodySensor(uTargetTemp * ray.doppler) * (limb + corona) * ray.psfDilution;
        occlusion = max(occlusion, limb);
    }
    // Os discos do Sol e do alvo são opacos: escondem as estrelas atrás deles.
    return stars * (1.0 - occlusion) + bodies;
}
vec3 acesToneMapping(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main() {
    RelativisticRay ray = computeRelativisticRay(vWorldDir, uForward);
    float cmbApparentTemp = T_CMB_0 * ray.doppler;
    vec3 cmbRadiance = sampleBlackbodySensor(cmbApparentTemp) * ray.psfDilution * 0.35;
    vec3 starRadiance = renderStarfield(ray);
    vec3 mappedColor = acesToneMapping((cmbRadiance + starRadiance) * uExposure);
    gl_FragColor = vec4(pow(mappedColor, vec3(1.0 / 2.2)), 1.0);
}
```

**Notas de implementação:**
- **Eixo de voo exatamente em −Z:** `uForward = uTargetDir = (0,0,−1)` e `uSunDir = (0,0,1)`. Com o eixo alinhado a um eixo de coordenadas, `dPerp` e `sourceDir` saem sem cancelamento em float32, mesmo para $\gamma \sim 10^{12}$ (Andrômeda).
- **`uSunRadiusRad` e `uTargetRadiusRad`** são raios angulares no referencial de repouso, calculados em 64 bits em `src/physics/sky.ts`. O Sol fica a $1\text{ UA} + x(\tau)$, porque a nave parte da órbita da Terra. O alvo fica a $L_{\text{repouso}} + 10\,R_{\text{alvo}}$, porque o motor termina no centro do alvo. A aberração (ampliação $e^{\eta}$ atrás, compressão $e^{-\eta}$ à frente) sai do mapeamento `sourceDir`.
- **`uPsfAngleRad`** é o ângulo de um pixel físico de cada monitor: FOV vertical ÷ (altura em px × DPR).
- **Ângulos pequenos** são calculados com `atan(|a×b|, a·b)`, não com `acos`, que em float32 só resolve cerca de $3 \times 10^{-4}$ rad perto de 1.
- **`smoothstep`** recebe os limites em ordem crescente (`1 − smoothstep(0,85R, R, θ)`), porque a ordem invertida é indefinida em GLSL.
- **Os discos do Sol e do alvo são opacos** e escondem as estrelas atrás deles.
- **Saída antecipada:** abaixo de 250 K, `sampleBlackbodySensor` retorna 0 sem amostrar Planck. Abaixo de cerca de 254 K todas as amostras já dariam $x > 80$, então o resultado não muda.
- **Tone mapping:** o shader aplica ACES e gama 2,2 na própria saída. Ao introduzir o Bloom do `@react-three/postprocessing`, a saída deve passar a ser HDR linear, com tone mapping e conversão de cor feitos no `EffectComposer`; senão a gama é aplicada duas vezes e o Bloom atua sobre cores já comprimidas.
---
## 6. Arquitetura de Diretórios Esperada
```text
relativistic-space-simulator/
├── .github/workflows/deploy.yml   # CI/CD automático para GitHub Pages
├── src/
│   ├── physics/
│   │   ├── RelativityEngine.ts    # Cinemática hiperbólica 64-bit e uniforms
│   │   ├── RelativityEngine.test.ts # Testes unitários Vitest validando os marcos do vídeo
│   │   ├── destinations.ts        # Catálogo de estrelas e galáxias
│   │   └── sky.ts                 # Raios angulares do Sol e do alvo (64 bits) + sky.test.ts
│   ├── shaders/
│   │   ├── RelativisticSky.vert
│   │   └── RelativisticSky.frag
│   ├── components/
│   │   ├── RelativisticSky.tsx    # Esfera celeste + uniforms, compartilhada pelos monitores
│   │   ├── CockpitMonitor.tsx     # Moldura dos monitores PIP
│   │   ├── MainViewport.tsx       # Cena 3D principal (para-brisa do cockpit)
│   │   ├── RearCameraPIP.tsx      # Monitor traseiro (visão do Sol e redshift IR)
│   │   ├── TelescopePIP.tsx       # Monitor esquerdo (seletor IR / Visível / UV / Raios-X)
│   │   ├── FlightControls.tsx     # Alternância Modo Missão Flip-and-Burn vs. Modo Manual
│   │   ├── TelemetryHUD.tsx       # Relógios (Nave vs. Terra), gamma, distância contraída
│   │   └── SpectrumAnalyzer.tsx   # Gráfico Canvas 2D do pico de Planck da CMB vs. faixa visível
│   ├── store/
│   │   └── useFlightStore.ts      # Estado global e loop de tempo próprio com Auto-Step Down
│   ├── App.tsx
│   └── main.tsx
├── CLAUDE.md
├── package.json
└── vite.config.ts
```
---
## 7. Regras de UX e Controles de Voo
1. **Dois Modos de Operação:**
   - **Modo Autopilot (Flip-and-Burn):** O usuário escolhe o destino, ajusta a aceleração própria $\alpha$ (padrão $1.61 \times 10^6\text{ G}$) e dá a partida. Inclui barra de progresso da linha do tempo do voo ($\tau$ de $0$ a $\tau_{\text{total}}$) permitindo também arrastar (*scrub*) para qualquer instante da viagem.
   - **Modo Cruzeiro Livre (Manual):** O usuário controla diretamente um slider logarítmico de Rapidez $\eta \in [0, 18]$ (ou $\log_{10}\gamma \in [0, 7.5]$) para inspecionar estacionariamente qualquer regime óptico.
2. **Multiplicador de Tempo Próprio ($M_\tau$) com *Auto-Step Down*:**
   - Botões de escala de tempo próprio: `0.1x`, `1x (Real Time)`, `5x`, `20x`, `100x`.
   - Opção "Reduzir automaticamente para 1x em eventos críticos" (quando a CMB atravessa o espectro visível em $\gamma \in [400, 15000]$ e nos 10 segundos finais antes do *Flip* de desaceleração).
---
## 8. Critérios de Aceite (Testes Unitários Obrigatórios)
O arquivo `src/physics/RelativityEngine.test.ts` deve passar nos seguintes testes antes de considerar o motor concluído:
1. Para $D_{\text{total}} = 4.25\text{ ly}$ e $\alpha = 1.61 \times 10^6\text{ G}$:
   - O tempo próprio total $\tau_{\text{total}}$ deve ser $600\text{ s} \pm 5\text{ s}$ (~10 minutos).
   - O tempo da Terra $t_{\text{total}}$ deve ser $\approx 4.25\text{ anos}$.
   - No ponto médio ($\tau = \tau_{1/2}$), a distância contraída de Lorentz $L_{\text{contraída}}$ deve ser $19\text{ segundos-luz} \pm 1\text{ ls}$ ($\approx 5.7 \times 10^6\text{ km}$).
2. Para $\eta = 16.0$, `computeShaderKinematics(16.0).uOneMinusBeta` deve ser estritamente maior que zero ($\approx 2.533 \times 10^{-14}$) e nunca `0`.
