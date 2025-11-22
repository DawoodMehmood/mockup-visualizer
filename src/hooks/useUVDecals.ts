// src/hooks/useUVDecals.ts
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { AssetRef } from '../components/ModelWithDecals';

type DecalRec = {
    id: string;
    materialUUID: string;
    px: number;
    py: number;
    sizePx?: number;
    rotationDeg?: number;
    canvas?: HTMLCanvasElement;
    meta: AssetRef;
    text?: string;
    font?: string;
    color?: string;
};

export function useUVDecals(params: {
    decals: DecalRec[];
    setDecals: (fn: (prev: DecalRec[]) => DecalRec[]) => void;
    makeCanvasForAsset: (asset: AssetRef, opts?: any) => HTMLCanvasElement;
}) {
    const { decals, setDecals, makeCanvasForAsset } = params;

    const materialMapRef = useRef<Map<string, any>>(new Map());

    // Auto-sync from painter
    useEffect(() => {
        const sync = () => {
            if (window.__materialCanvases) {
                materialMapRef.current = window.__materialCanvases;
            }
        };
        sync();
        window.addEventListener('materialMapReady', sync);
        return () => window.removeEventListener('materialMapReady', sync);
    }, []);

    // We'll get the material canvases from useUVPainter or useUVDrag
    // For now, assume they're available globally or passed in
    // Better: expose from useUVPainter and import here, but for simplicity:
    useEffect(() => {
        const handler = () => {
            // Copy current map from global (set by useUVPainter)
            // @ts-ignore
            materialMapRef.current = window.__materialCanvases || new Map();
        };
        window.addEventListener('materialMapReady', handler);
        return () => window.removeEventListener('materialMapReady', handler);
    }, []);

    // Redraw a single decal with current size/rotation
    const redrawDecal = (decal: DecalRec) => {
        const mc = materialMapRef.current.get(decal.materialUUID);
        if (!mc) return;

        const { ctx, canvas: materialCanvas, tex } = mc;
        const { px, py, sizePx = 512, rotationDeg = 0 } = decal;

        // Regenerate asset canvas (with text/color if needed)
        const assetCanvas = makeCanvasForAsset(decal.meta, {
            text: decal.text,
            font: decal.font,
            color: decal.color,
        });

        const scale = sizePx / 512; // assuming base asset is 512
        const sx = 512 * scale;
        const sy = (assetCanvas.height / assetCanvas.width) * sx;

        // Save context
        ctx.save();

        // Clear previous decal area (optional: improves quality)
        const margin = 100;
        ctx.clearRect(px - sx / 2 - margin, py - sy / 2 - margin, sx + margin * 2, sy + margin * 2);

        // Move to center, rotate, flip (for correct orientation)
        ctx.translate(px, py);
        ctx.rotate((rotationDeg * Math.PI) / 180);
        ctx.scale(1, -1); // Flip to match our placement logic

        // Draw centered
        ctx.drawImage(assetCanvas, -sx / 2, -sy / 2, sx, sy);

        ctx.restore();

        tex.needsUpdate = true;
    };

    useEffect(() => {
        const onUpdated = (ev: any) => {
            const payload = ev.detail;
            if (!payload?.id) return;

            setDecals(prev => prev.map(d =>
                d.id === payload.id ? { ...d, ...payload } : d
            ));

            // Find and redraw
            const decal = decals.find(d => d.id === payload.id) ||
                [...decals].reverse().find(d => d.id === payload.id);
            if (decal) {
                // Merge with latest payload
                const updated = { ...decal, ...payload };
                redrawDecal(updated);
            }
        };

        const onPlaced = (ev: any) => {
            // Optional: redraw on place too
            const d = ev.detail;
            if (d?.id) redrawDecal(d);
        };

        window.addEventListener('decalUpdated', onUpdated);
        window.addEventListener('decalPlaced', onPlaced);

        return () => {
            window.removeEventListener('decalUpdated', onUpdated);
            window.removeEventListener('decalPlaced', onPlaced);
        };
    }, [decals, setDecals]);

    // Also handle delete
    useEffect(() => {
        const handler = (ev: any) => {
            const { id } = ev.detail ?? {};
            if (!id) return;

            const decal = decals.find(d => d.id === id);
            if (!decal) return;

            const mc = materialMapRef.current.get(decal.materialUUID);
            if (mc) {
                // Optional: clear area on delete
                const { ctx } = mc;
                const { px, py, sizePx = 512 } = decal;
                const s = sizePx * 1.5;
                ctx.clearRect(px - s / 2, py - s / 2, s, s);
                mc.tex.needsUpdate = true;
            }

            setDecals(prev => prev.filter(d => d.id !== id));
            window.dispatchEvent(new CustomEvent('decalRemoved', { detail: { id } }));
        };

        window.addEventListener('decalCommand', handler);
        return () => window.removeEventListener('decalCommand', handler);
    }, [decals, setDecals]);
}