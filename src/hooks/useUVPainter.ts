// src/hooks/useUVPainter.ts
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { AssetRef } from '../components/ModelWithDecals'

declare global {
    interface Window {
        __materialCanvases?: Map<string, any>;
    }
}

type MaterialCanvas = {
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D
    tex: THREE.CanvasTexture
    sourceImage?: any
}

export function useUVPainter(params: {
    gl: any
    camera: THREE.Camera
    raycaster: THREE.Raycaster
    modelRef: React.MutableRefObject<THREE.Group | null>
    makeCanvasForAsset: (asset: AssetRef, opts?: { text?: string; font?: string; color?: string; fontSize?: number }) => HTMLCanvasElement
    textureSize?: number
}) {
    const { gl, camera, raycaster, modelRef, makeCanvasForAsset, textureSize = 4096 } = params
    const materialMapRef = useRef<Map<string, MaterialCanvas>>(new Map())

    // helper for material canvas
    const ensureMaterialCanvas = (mat: THREE.Material | null): MaterialCanvas | null => {
        if (!mat) return null
        const key = mat.uuid
        if (materialMapRef.current.has(key)) return materialMapRef.current.get(key)!

        const existingMap = (mat as any).map as THREE.Texture | undefined

        // Determine canvas size from original texture
        let width = 2048
        let height = 2048
        if (existingMap?.image) {
            const img = existingMap.image
            width = img.naturalWidth || img.width || img.videoWidth || 2048
            height = img.naturalHeight || img.height || img.videoHeight || 2048
        }

        // Optional: round to power of two for performance (not required anymore)
        // But keep original size for max quality
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')!

        // Copy original texture
        if (existingMap?.image) {
            try {
                ctx.drawImage(existingMap.image, 0, 0, width, height)
            } catch (e) {
                console.warn('Could not copy original texture (CORS?): ', e)
                ctx.fillStyle = '#ffffff'
                ctx.fillRect(0, 0, width, height)
            }
        } else {
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, width, height)
        }

        const tex = new THREE.CanvasTexture(canvas)
        tex.flipY = false
        tex.colorSpace = THREE.SRGBColorSpace
        tex.needsUpdate = true

        // Replace material map
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshBasicMaterial) {
            mat.map = tex
            mat.needsUpdate = true
        }

        const mc: MaterialCanvas = { canvas, ctx, tex, sourceImage: existingMap?.image }
        materialMapRef.current.set(key, mc)
        return mc
    }

    useEffect(() => {
        window.__materialCanvases = materialMapRef.current;
    }, []);

    useEffect(() => {
        const onPlace = (e: any) => {
            try {
                const payload = e?.detail ?? {}
                const pointer = payload.pointerEvent
                const sizePx = Number(payload.sizePx ?? 512)
                const asset: AssetRef = payload.asset
                const meta = payload.meta

                if (!pointer || !modelRef.current) return

                // IMPORTANT: use gl.domElement if available — otherwise fallback to document.body
                const dom = gl?.domElement ?? document.body
                const rect = dom.getBoundingClientRect()

                // Pointer -> NDC mapping (use clientX/Y relative to canvas)
                const ndc = new THREE.Vector2(
                    ((pointer.clientX - rect.left) / rect.width) * 2 - 1,
                    -((pointer.clientY - rect.top) / rect.height) * 2 + 1
                )
                raycaster.setFromCamera(ndc, camera)
                const hits = raycaster.intersectObjects(modelRef.current.children, true)
                if (!hits.length) return
                const hit = hits[0]
                if (!hit.uv || !hit.object) return

                // Choose correct material (use face.materialIndex if present)
                if (!(hit.object instanceof THREE.Mesh)) return
                const mesh = hit.object as THREE.Mesh

                let chosenMaterial: THREE.Material | null = null
                if (Array.isArray(mesh.material)) {
                    const matIndex = (hit.face && (hit as any).face?.materialIndex) ?? (hit as any).faceMaterialIndex ?? 0
                    chosenMaterial = mesh.material[matIndex] ?? mesh.material[0]
                } else {
                    chosenMaterial = mesh.material as THREE.Material
                }
                if (!chosenMaterial) return

                // Raw uv from intersection
                const uv = hit.uv!

                // Ensure backing canvas
                const mc = ensureMaterialCanvas(chosenMaterial)
                if (!mc) return

                const { canvas } = mc

                const px = Math.floor(uv.x * canvas.width)
                const py = Math.floor(uv.y * canvas.height)

                console.log('UV:', uv.x.toFixed(3), uv.y.toFixed(3))
                console.log('Placing at canvas coord (top-left origin):', px, py)


                // Build asset canvas and draw it centered at px,py
                const assetRef = asset ?? meta
                if (!assetRef) return
                const assetCanvas = makeCanvasForAsset(assetRef)

                const sx = Math.round(sizePx)
                const sy = Math.round(sizePx * (assetCanvas.height / assetCanvas.width))

                mc.ctx.save()
                mc.ctx.translate(px, py)
                mc.ctx.scale(1, -1)
                mc.ctx.globalCompositeOperation = 'source-over'
                // Draw the asset canvas, but offset by half height because we flipped
                mc.ctx.drawImage(
                    assetCanvas,
                    -sx / 2,
                    -sy / 2,  // now negative because we're flipped
                    sx,
                    sy
                )

                mc.ctx.restore()

                mc.tex.needsUpdate = true
                try { (chosenMaterial as any).needsUpdate = true } catch { }

                // Dispatch with debugging info
                const id = THREE.MathUtils.generateUUID()
                const thumb = mc.canvas.toDataURL('image/png')
                const detail = {
                    id,
                    thumb,
                    meta: assetRef,
                    uv: { x: uv.x, y: uv.y },
                    px,
                    py,
                    sizePx,
                    materialUUID: (chosenMaterial as any).uuid,
                }
                // useful to inspect in console
                console.debug('decalPlaced debug:', detail)
                window.dispatchEvent(new CustomEvent('decalPlaced', { detail }))

            } catch (err) {
                console.warn('uvPlaceRequest failed', err)
            }
        }

        window.addEventListener('uvPlaceRequest', onPlace)
        return () => {
            window.removeEventListener('uvPlaceRequest', onPlace)
        }
    }, [gl, camera, raycaster, modelRef, makeCanvasForAsset, textureSize])
}
