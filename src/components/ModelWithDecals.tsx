// src/components/ModelWithDecals.tsx
import { useRef, useState, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useModelCommands } from '../hooks/useModelCommands'
import { useModelReset } from '../hooks/useModelReset'
import { useUVChecks } from '../hooks/useUVChecks'
import { useUVPainter } from '../hooks/useUVPainter'
import { useUVDecals } from '../hooks/useUVDecals'
import { useUVDecalCommands } from '../hooks/useUVDecalCommands'
import { useUVDrag } from '../hooks/useUVDrag'


export type AssetRef = { type: 'logo' | 'text'; index: number }
export type DecalRec = {
    id: string
    materialUUID?: string
    uv?: THREE.Vector2
    px?: number
    py?: number
    sizePx?: number
    rotationDeg?: number
    canvas?: HTMLCanvasElement
    meta: AssetRef
    thumb?: string
    // optional text/font/color stored for edits
    text?: string
    font?: string
    color?: string
}

export default function ModelWithDecals({ glbUrl, logos, texts, assetSelection, bgColor }: {
    glbUrl: string | null
    logos: File[]
    texts: string[]
    assetSelection: AssetRef | null
    bgColor: string
}) {
    const containerRef = useRef<THREE.Group | null>(null)
    const modelRef = useRef<THREE.Group | null>(null)
    const { camera, gl, scene } = useThree()
    const [decals, setDecals] = useState<DecalRec[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const raycaster = useMemo(() => new THREE.Raycaster(), [])
    const logoImgsRef = useRef<(HTMLImageElement | null)[]>([])
    const gltf = useGLTF(glbUrl ?? '')

    const materialMapRef = useRef<Map<string, {
        canvas: HTMLCanvasElement,
        ctx: CanvasRenderingContext2D,
        tex: THREE.CanvasTexture
    }>>(new Map());



    // Build logo image objects for canvas drawing
    useEffect(() => {
        logoImgsRef.current = logos.map(f => {
            const img = new Image()
            img.src = URL.createObjectURL(f)
            img.crossOrigin = 'anonymous'
            return img
        })
    }, [logos])

    // Ensure container/model group exist
    useEffect(() => {
        if (!containerRef.current) containerRef.current = new THREE.Group()
        if (!modelRef.current) modelRef.current = new THREE.Group()
        if (!containerRef.current.children.includes(modelRef.current)) containerRef.current.add(modelRef.current)
    }, [])

    // When the GLTF changes, clear previous model and set new into modelRef
    useModelReset({
        gltf,
        camera,
        modelRef
    })

    useEffect(() => {
        if (!gltf) {
            setDecals([])
        }
    }, [gltf])

    // Helper: build canvas for an asset (text or logo)
    const makeCanvasForAsset = (asset: AssetRef, opts?: { text?: string; font?: string; color?: string; fontSize?: number }) => {
        const SIZE = 512
        const canvas = document.createElement('canvas')
        canvas.width = SIZE
        canvas.height = SIZE
        const ctx = canvas.getContext('2d')!
        ctx.clearRect(0, 0, SIZE, SIZE)

        if (asset.type === 'text') {
            const t = opts?.text ?? texts[asset.index] ?? 'Text'
            const color = opts?.color ?? '#000000'
            const fontChoice = opts?.font ?? 'sans-serif'
            const fontSize = opts?.fontSize ?? Math.max(32, Math.min(96, Math.floor(280 / Math.max(1, t.length))))
            ctx.fillStyle = color
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.font = `bold ${fontSize}px ${fontChoice}`
            ctx.fillText(t, SIZE / 2, SIZE / 2)
        } else {
            const img = logoImgsRef.current[asset.index]
            if (img && img.complete && img.naturalWidth) {
                const scale = Math.min(SIZE / img.width, SIZE / img.height) * 0.9
                const w = img.width * scale
                const h = img.height * scale
                const x = (SIZE - w) / 2
                const y = (SIZE - h) / 2
                ctx.drawImage(img, x, y, w, h)
            } else {
                ctx.fillStyle = '#cccccc'
                ctx.fillRect(SIZE * 0.25, SIZE * 0.25, SIZE * 0.5, SIZE * 0.5)
            }
        }
        return canvas
    }

    // Run UV checks and emit result (App listens and will set decalMode)
    useUVChecks({
        gltf,
        textureSize: 4096,
        onResult: (r) => {
            try {
                window.dispatchEvent(new CustomEvent('uvCheckResult', { detail: r }))
            } catch { }
        }
    })

    // The UV painter handles actual painting and decal command updates (delete/resize/rotate)
    // UV painter handles actual painting
    useUVPainter({
        gl,
        camera,
        raycaster,
        modelRef,
        makeCanvasForAsset,
        textureSize: 4096,
    })

    // drag support
    useUVDrag({
        gl,
        camera,
        raycaster,
        modelRef,
        decals,
        setDecals,
        setSelectedId,
        materialMapRef,
    })

    // decal commands (delete/update/clear/export)
    useUVDecalCommands({
        gl,
        scene,
        camera,
        decals,
        setDecals,
        bgColor,
        materialMapRef,
    })

    // manage decal state (updates via commands)
    useUVDecals({
        decals,
        setDecals,
        makeCanvasForAsset,
    })


    // When user clicks in the scene we either request a UV placement or do nothing
    const onPointerDown = (e: any) => {
        e.stopPropagation();
        if (!assetSelection) return;
        window.dispatchEvent(new CustomEvent('uvPlaceRequest', {
            detail: { pointerEvent: e, sizePx: 1024, asset: assetSelection }
        }));
        window.dispatchEvent(new CustomEvent('clearAssetSelection'));
    }


    // Listen for decalPlaced / decalRemoved / decalUpdated events from painter to update local list for UI
    useEffect(() => {
        const broadcast = () => {

            window.dispatchEvent(new CustomEvent('decalsStateUpdate', {
                detail: { decals: decals, selectedId }
            }))
        }

        const onPlaced = (ev: any) => {
            const d = ev.detail
            if (!d?.id) return

            const rec: DecalRec = {
                id: d.id,
                materialUUID: d.materialUUID,
                uv: d.uv ? new THREE.Vector2(d.uv.x, d.uv.y) : undefined,
                px: d.px,
                py: d.py,
                sizePx: d.sizePx ?? 512,
                rotationDeg: d.rotationDeg ?? 0,
                meta: d.meta,
                thumb: d.thumb,
                canvas: d.canvas,
                text: d.text,
                font: d.font,
                color: d.color,
            }

            setDecals(prev => [rec, ...prev])
            setSelectedId(d.id)
            broadcast()
        }

        const onRemoved = (ev: any) => {
            const id = ev.detail?.id
            setDecals(prev => prev.filter(p => p.id !== id))
            if (selectedId === id) setSelectedId(null)
            broadcast()
        }

        const onUpdated = (ev: any) => {
            const payload = ev.detail
            setDecals(prev => prev.map(d => d.id === payload.id ? { ...d, ...payload } : d))
            broadcast()
        }

        window.addEventListener('decalPlaced', onPlaced)
        window.addEventListener('decalRemoved', onRemoved)
        window.addEventListener('decalUpdated', onUpdated)

        return () => {
            window.removeEventListener('decalPlaced', onPlaced)
            window.removeEventListener('decalRemoved', onRemoved)
            window.removeEventListener('decalUpdated', onUpdated)
        }
    }, [selectedId, decals])



    // Side-panel selection -> select decal by id
    useEffect(() => {
        const handler = (e: any) => {
            const id = e.detail?.id
            if (!id) return
            setSelectedId(id)
        }
        window.addEventListener('selectDecalById', handler)
        return () => window.removeEventListener('selectDecalById', handler)
    }, [])

    // Model commands (zoom/rotate) still active
    useModelCommands({ modelRef })

    // UI anchor for selected decal (no mesh to sample; we keep listing only)
    useFrame(() => {
        // nothing required here for UV mode right now
    })

    return (
        <group
            ref={(g) => {
                if (!g) return
                if (!containerRef.current) {
                    containerRef.current = new THREE.Group()
                    modelRef.current = new THREE.Group()
                    containerRef.current.add(modelRef.current)
                }
                if (containerRef.current.parent !== g) g.add(containerRef.current)
            }}
            onPointerDown={onPointerDown}
        >
        </group>
    )
}