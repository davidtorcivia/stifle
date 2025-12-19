/**
 * Stifle organic smoke shader - simplified, fast, smooth.
 */

(function () {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false });
    if (!gl) { canvas.style.display = 'none'; return; }

    const vs = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

    const fs = `
        precision highp float;
        uniform vec2 res;
        uniform float t;
        uniform float dark;

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        float noise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                       mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
        }

        float fbm(vec2 p) {
            return noise(p) * 0.5 + noise(p * 2.0) * 0.3 + noise(p * 4.0) * 0.2;
        }

        void main() {
            vec2 uv = gl_FragCoord.xy / res;
            vec2 p = uv * vec2(res.x / res.y, 1.0) * 1.5;

            float time = t * 0.025;

            // Simple domain warp
            vec2 q = vec2(fbm(p + time), fbm(p + vec2(5.0, time * 0.7)));
            float f = fbm(p + q * 2.0);

            // Colors - light mode has more contrast
            vec3 bg = mix(vec3(0.96, 0.94, 0.92), vec3(0.10, 0.085, 0.08), dark);
            vec3 smoke = mix(vec3(0.78, 0.74, 0.70), vec3(0.18, 0.15, 0.14), dark);

            // Light mode gets stronger blend
            float strength = mix(1.2, 0.9, dark);
            vec3 col = mix(bg, smoke, f * strength);

            // Vignette
            col *= 1.0 - length(uv - 0.5) * 0.25 * dark;

            // Strong dithering
            col += (hash(gl_FragCoord.xy + t) - 0.5) / 128.0;

            gl_FragColor = vec4(col, 1.0);
        }
    `;

    const compile = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); return sh; };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const resLoc = gl.getUniformLocation(prog, "res");
    const tLoc = gl.getUniformLocation(prog, "t");
    const darkLoc = gl.getUniformLocation(prog, "dark");

    const resize = () => {
        const dpr = Math.min(devicePixelRatio || 1, 2);
        canvas.width = innerWidth * dpr;
        canvas.height = innerHeight * dpr;
        gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const darkMatch = matchMedia('(prefers-color-scheme: dark)');
    addEventListener("resize", resize);
    resize();

    const offset = Math.random() * 3000;
    const start = Date.now();

    (function loop() {
        gl.uniform2f(resLoc, canvas.width, canvas.height);
        gl.uniform1f(tLoc, (Date.now() - start) * 0.001 + offset);
        gl.uniform1f(darkLoc, darkMatch.matches ? 1.0 : 0.0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        requestAnimationFrame(loop);
    })();
})();
