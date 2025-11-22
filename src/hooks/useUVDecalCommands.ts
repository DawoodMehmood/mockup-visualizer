import { useEffect } from 'react';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

export function useUVDecalCommands(params: {
    gl: any;
    scene: THREE.Scene;
    camera: THREE.Camera;
    decals: any[]; // keep same DecalRec type
    setDecals: (fn: (prev: any[]) => any[]) => void;
    bgColor: string;
    materialMapRef: React.MutableRefObject<Map<string, { canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, tex: THREE.CanvasTexture }>>;
}) {
    const { gl, scene, camera, decals, setDecals, bgColor, materialMapRef } = params;

    useEffect(() => {
        const handler = (e: any) => {
            switch (e.type) {
                case 'exportPNG': {
                    const prevSize = gl.getSize(new THREE.Vector2());
                    const prevPixelRatio = gl.getPixelRatio();
                    const prevBackground = scene.background ? scene.background.clone() : null;
                    try {
                        const dpr = Math.min(window.devicePixelRatio || 1, 2);
                        const h = Math.floor(window.innerHeight * dpr);
                        const w = Math.floor(h * (camera.aspect || window.innerWidth / window.innerHeight));
                        gl.setPixelRatio(dpr);
                        gl.setSize(w, h, false);
                        scene.background = null;
                        gl.render(scene, camera);
                        const url = gl.domElement.toDataURL('image/png');
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'mockup.png';
                        a.click();
                        a.remove();
                    } finally {
                        gl.setSize(prevSize.x, prevSize.y, false);
                        gl.setPixelRatio(prevPixelRatio);
                        scene.background = prevBackground ?? new THREE.Color(bgColor);
                    }
                    break;
                }

                case 'exportGLB': {
                    const exporter = new GLTFExporter();
                    const exportScene = scene.clone(true);
                    exporter.parse(
                        exportScene,
                        (result) => {
                            let blob: Blob;
                            if (result instanceof ArrayBuffer) blob = new Blob([result], { type: 'application/octet-stream' });
                            else blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'mockup.glb';
                            a.click();
                            URL.revokeObjectURL(url);
                        },
                        { binary: true } as any
                    );
                    break;
                }

                case 'clearDecals': {
                    // Clear all material canvases
                    materialMapRef.current.forEach(mc => {
                        mc.ctx.clearRect(0, 0, mc.canvas.width, mc.canvas.height);
                        mc.tex.needsUpdate = true;
                    });
                    setDecals([]);
                    window.dispatchEvent(new CustomEvent('decalRemoved', { detail: { id: null } }));
                    break;
                }
            }
        };

        window.addEventListener('exportPNG', handler);
        window.addEventListener('exportGLB', handler);
        window.addEventListener('clearDecals', handler);
        return () => {
            window.removeEventListener('exportPNG', handler);
            window.removeEventListener('exportGLB', handler);
            window.removeEventListener('clearDecals', handler);
        };
    }, [gl, scene, camera, decals, setDecals, bgColor, materialMapRef]);
}
