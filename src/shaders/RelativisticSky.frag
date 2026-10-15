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
