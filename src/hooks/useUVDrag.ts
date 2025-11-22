import { useEffect } from 'react';
import * as THREE from 'three';

export function useUVDrag(params: {
    gl: any;
    camera: THREE.Camera;
    raycaster: THREE.Raycaster;
    modelRef: React.MutableRefObject<THREE.Group | null>;
    decals: any[];
    setDecals: (fn: (prev: any[]) => any[]) => void;
    setSelectedId: (id: string | null) => void;
    materialMapRef: React.MutableRefObject<Map<string, { canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, tex: THREE.CanvasTexture }>>;
}) {
    const { gl, camera, raycaster, modelRef, decals, setDecals, setSelectedId, materialMapRef } = params;

    useEffect(() => {
        let activeDragId: string | null = null;
        let pointerIdHeld: number | null = null;
        let latestXY: { x: number; y: number } | null = null;
        let scheduled = false;

        const processLatest = () => {
            scheduled = false;
            if (!activeDragId || !latestXY || !modelRef.current) return;

            const rect = gl.domElement.getBoundingClientRect();
            const v2 = new THREE.Vector2(
                ((latestXY.x - rect.left) / rect.width) * 2 - 1,
                -((latestXY.y - rect.top) / rect.height) * 2 + 1
            );
            raycaster.setFromCamera(v2, camera);

            const rec = decals.find(d => d.id === activeDragId);
            if (!rec) return;

            const hits = raycaster.intersectObjects(modelRef.current.children, true);
            if (!hits.length || !hits[0].uv) return;

            const hit = hits[0];
            const uv = hit.uv;
            if (!(hit.object instanceof THREE.Mesh)) return;
            const mesh = hit.object;

            // if mesh has multiple materials, pick the first (fallback)
            let material: THREE.Material;
            if (Array.isArray(mesh.material)) {
                const index = (hit as any).faceMaterialIndex ?? 0;
                material = mesh.material[index];
            } else {
                material = mesh.material;
            }

            const mc = materialMapRef.current.get(material.uuid);
            if (!mc) return;

            const sizePx = rec.sizePx ?? 512;
            const px = Math.round(uv.x * mc.canvas.width);
            const py = Math.round((1 - uv.y) * mc.canvas.height);

            // Draw the asset onto the material canvas
            mc.ctx.save();
            mc.ctx.globalCompositeOperation = 'source-over';
            mc.ctx.translate(px - sizePx / 2, py - sizePx / 2);
            mc.ctx.drawImage(rec.canvas, 0, 0, sizePx, sizePx);
            mc.ctx.restore();

            mc.tex.needsUpdate = true;
        };

        const onPointerMove = (ev: PointerEvent) => {
            if (!activeDragId) return;
            ev.preventDefault();
            latestXY = { x: ev.clientX, y: ev.clientY };
            if (!scheduled) {
                scheduled = true;
                requestAnimationFrame(processLatest);
            }
        };

        const onPointerUp = (ev: PointerEvent) => {
            if (activeDragId) ev.stopPropagation();
            if (pointerIdHeld !== null && ev.pointerId === pointerIdHeld) {
                gl.domElement.releasePointerCapture?.(pointerIdHeld);
            }
            activeDragId = null;
            pointerIdHeld = null;
            latestXY = null;
            scheduled = false;
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
        };

        const onPointerDown = (ev: PointerEvent) => {
            if (!modelRef.current) return;

            gl.domElement.setPointerCapture?.(ev.pointerId);
            pointerIdHeld = ev.pointerId;

            const rect = gl.domElement.getBoundingClientRect();
            const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

            const hits = raycaster.intersectObjects(modelRef.current.children, true);
            if (!hits.length) return;

            // check if any hit matches decal
            for (const hit of hits) {
                const found = decals.find(d => d.id === hit.object.userData.decalId);
                if (found) {
                    ev.stopPropagation();
                    ev.preventDefault();
                    activeDragId = found.id;
                    setSelectedId(found.id);
                    window.dispatchEvent(new CustomEvent('decalSelected', { detail: found.id }));
                    break;
                }
            }

            window.addEventListener('pointermove', onPointerMove, { passive: false });
            window.addEventListener('pointerup', onPointerUp);
        };

        gl.domElement.addEventListener('pointerdown', onPointerDown);
        return () => {
            gl.domElement.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
        };
    }, [decals, modelRef, camera, gl, raycaster, setDecals, setSelectedId, materialMapRef]);
}
