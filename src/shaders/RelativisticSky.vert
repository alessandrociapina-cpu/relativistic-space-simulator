// A esfera só cobre a tela; a direção de cada pixel é reconstruída no
// fragment shader a partir de gl_FragCoord e da base da câmera.
void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // Céu no infinito: profundidade máxima, nunca recortado pelo far plane.
    gl_Position.z = gl_Position.w;
}
