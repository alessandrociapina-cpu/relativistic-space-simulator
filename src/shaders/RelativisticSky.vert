varying vec3 vWorldDir;

void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    // Direção de observação a partir da câmera (normalizada no fragment shader).
    vWorldDir = worldPos.xyz - cameraPosition;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
    // Céu no infinito: profundidade máxima, nunca recortado pelo far plane.
    gl_Position.z = gl_Position.w;
}
