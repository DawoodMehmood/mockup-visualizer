// src/components/ModelWithDecals.tsx
import React, { useRef, useState, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, Html } from '@react-three/drei'
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js'

type AssetRef = { type: 'logo' | 'text'; index: number }
type DecalRec = {
    id: string
    mesh: THREE.Mesh
    size: number
    canvas: HTMLCanvasElement
    meta: AssetRef
    text?: string
    font?: string
    color?: string
}

export default function ModelWithDecals({ glbUrl, logos, texts, assetSelection }: {
    glbUrl: string | null
    logos: File[]
    texts: string[]
    assetSelection: AssetRef | null
}) {
    const containerRef = useRef<THREE.Group | null>(null) // top-level container that will be attached once
    const modelRef = useRef<THREE.Group | null>(null) // group for the model node
    const decalsGroupRef = useRef<THREE.Group | null>(null) // group for decal meshes
    const { camera, gl, scene } = useThree()
    const [decals, setDecals] = useState<DecalRec[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const raycaster = useMemo(() => new THREE.Raycaster(), [])
    const logoImgsRef = useRef<(HTMLImageElement | null)[]>([])
    const gltf = useGLTF(glbUrl ?? '')

    // Build logo image objects for canvas drawing
    useEffect(() => {
        logoImgsRef.current = logos.map(f => {
            const img = new Image()
            img.src = URL.createObjectURL(f)
            img.crossOrigin = 'anonymous'
            return img
        })
    }, [logos])

    // Ensure container/model/decals groups exist
    useEffect(() => {
        if (!containerRef.current) {
            containerRef.current = new THREE.Group()
        }
        if (!modelRef.current) modelRef.current = new THREE.Group()
        if (!decalsGroupRef.current) decalsGroupRef.current = new THREE.Group()
        // attach children to container
        if (!containerRef.current.children.includes(modelRef.current)) containerRef.current.add(modelRef.current)
        if (!containerRef.current.children.includes(decalsGroupRef.current)) containerRef.current.add(decalsGroupRef.current)
    }, [])

    // When the GLTF changes, clear previous model and set new into modelRef
    useEffect(() => {
        if (!modelRef.current) return

        // clear previous model
        modelRef.current.clear()

        if (!gltf?.scene) {
            // no model: notify listeners
            window.dispatchEvent(new CustomEvent('modelReady', { detail: { model: null } }))
            return
        }

        // clone incoming scene
        const modelNode = gltf.scene.clone(true)

        // reset transforms
        modelNode.position.set(0, 0, 0)
        modelNode.rotation.set(0, 0, 0)
        modelNode.scale.set(1, 1, 1)

        // compute bounding box of original model
        let bbox = new THREE.Box3().setFromObject(modelNode)
        const size = new THREE.Vector3()
        bbox.getSize(size)
        const maxDim = Math.max(size.x, size.y, size.z)

        // Desired size in world units for the model's largest dimension
        const desiredSize = 2 // tweakable: makes all models roughly the same visible size

        // compute uniform scale to normalize the model
        const scaleFactor = maxDim > 0 ? (desiredSize / maxDim) : 1
        modelNode.scale.setScalar(scaleFactor)

        // after scaling, recompute bounding box and recenter the model at origin
        bbox = new THREE.Box3().setFromObject(modelNode)
        const center = bbox.getCenter(new THREE.Vector3())
        modelNode.position.sub(center)

        // add to modelRef
        modelRef.current.add(modelNode)

        // Fit camera to the normalized model:
        // compute camera distance so the model fits in the view based on FOV
        const persp = camera as THREE.PerspectiveCamera
        const fov = (persp.fov ?? 50) * (Math.PI / 180)
        // use the bbox size after scaling
        const scaledSize = (() => {
            const s = new THREE.Vector3()
            bbox.getSize(s)
            return Math.max(s.x, s.y, s.z, 0.0001)
        })()

        // distance formula: make sure model comfortably fits; multiplier adds padding
        const distance = Math.abs(scaledSize / (2 * Math.tan(fov / 2))) * 1.6

        // place camera at a consistent, readable offset
        camera.position.set(0, distance * 0.7, distance)
        camera.lookAt(0, 0, 0)
        persp.updateProjectionMatrix()

        // notify the app / MaterialSwatches about the loaded model root
        window.dispatchEvent(new CustomEvent('modelReady', { detail: { model: modelRef.current } }))
    }, [gltf, camera])


    // Helper: build canvas for an asset (text or logo)
    const makeCanvasForAsset = (asset: AssetRef, opts?: { text?: string; font?: string; color?: string }) => {
        const SIZE = 512
        const canvas = document.createElement('canvas')
        canvas.width = SIZE
        canvas.height = SIZE
        const ctx = canvas.getContext('2d')!
        ctx.clearRect(0, 0, SIZE, SIZE)

        if (asset.type === 'text') {
            const t = opts?.text ?? texts[asset.index] ?? 'Text'
            const color = opts?.color ?? '#ffffff'
            const fontChoice = opts?.font ?? 'sans-serif'
            // adaptive font size
            const baseSize = Math.max(32, Math.min(96, Math.floor(280 / Math.max(1, t.length))))
            ctx.fillStyle = color
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.font = `bold ${baseSize}px ${fontChoice}`
            ctx.fillText(t, SIZE / 2, SIZE / 2)
        } else {
            const img = logoImgsRef.current[asset.index]
            if (img && img.complete && img.naturalWidth) {
                const scale = Math.min(SIZE / img.width, SIZE / img.height) * 0.9
                const w = img.width * scale
                const h = img.height * scale
                ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h)
                if (opts?.color) {
                    ctx.globalCompositeOperation = 'multiply'
                    ctx.fillStyle = opts.color
                    ctx.fillRect(0, 0, SIZE, SIZE)
                    ctx.globalCompositeOperation = 'destination-atop'
                    ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h)
                    ctx.globalCompositeOperation = 'source-over'
                }
            } else {
                ctx.fillStyle = '#cccccc'
                ctx.fillRect(SIZE * 0.25, SIZE * 0.25, SIZE * 0.5, SIZE * 0.5)
            }
        }
        return canvas
    }

    // Helper: create decal mesh and return mesh + material + texture
    const createDecalMesh = (hitObject: THREE.Object3D, point: THREE.Vector3, normal: THREE.Vector3, canvas: HTMLCanvasElement, size = 0.5) => {
        const up = new THREE.Vector3(0, 0, 1)
        const q = new THREE.Quaternion().setFromUnitVectors(up, normal)
        const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ')
        const decalGeo = new DecalGeometry(hitObject as any, point, euler, new THREE.Vector3(size, size, size))

        const tex = new THREE.CanvasTexture(canvas)
            ; (tex as any).encoding = (THREE as any).sRGBEncoding ?? (THREE as any).SRGBColorSpace
            ; (tex as any).needsUpdate = true

        const mat = new THREE.MeshStandardMaterial({
            map: tex,
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            alphaTest: 0.01,
        })

        const mesh = new THREE.Mesh(decalGeo, mat)
        mesh.userData.selectable = true
        mesh.renderOrder = 999
        return { mesh, mat, tex, euler }
    }

    // Place a decal on model when pointer down (one-time placement). Raycast against the actual model node.
    const onPointerDown = (e: any) => {
        e.stopPropagation()
        if (!modelRef.current || !decalsGroupRef.current || !assetSelection || !gltf?.scene) return
        const rect = gl.domElement.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(new THREE.Vector2(x, y), camera)

        // intersect against modelRef only (so decals and other things don't block)
        const intersects = raycaster.intersectObjects(modelRef.current.children, true)
        if (!intersects.length) return
        const hit = intersects[0]
        const point = hit.point.clone()
        const normal = hit.face!.normal.clone().transformDirection(hit.object.matrixWorld).normalize()

        const canvas = makeCanvasForAsset(assetSelection)
        const size = 0.5
        const { mesh } = createDecalMesh(hit.object, point, normal, canvas, size)

        // add decal into decalsGroup (so model transforms don't affect decals)
        decalsGroupRef.current!.add(mesh)

        const id = THREE.MathUtils.generateUUID()
        const rec: DecalRec = {
            id,
            mesh,
            size,
            canvas,
            meta: assetSelection,
            text: assetSelection.type === 'text' ? texts[assetSelection.index] : undefined,
            font: undefined,
            color: undefined,
        }

        setDecals(prev => [...prev, rec])
        setSelectedId(id)

        const thumb = canvas.toDataURL('image/png')
        window.dispatchEvent(new CustomEvent('decalPlaced', { detail: { id, thumb, meta: rec.meta, text: rec.text, font: rec.font, color: rec.color } }))

        // clear selection in App to avoid repeated pasting
        window.dispatchEvent(new CustomEvent('clearAssetSelection'))
    }

    // Click to select a decal (raycast against decalsGroup)
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (!decalsGroupRef.current) return
            const rect = gl.domElement.getBoundingClientRect()
            const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
            const y = -((e.clientY - rect.top) / rect.height) * 2 + 1
            raycaster.setFromCamera(new THREE.Vector2(x, y), camera)
            const hits = raycaster.intersectObjects(decalsGroupRef.current.children, true)
            const pick = hits.find(h => h.object.userData.selectable)
            if (!pick) {
                setSelectedId(null)
                return
            }
            const found = decals.find(d => d.mesh === pick.object || d.mesh === pick.object.parent)
            if (found) {
                setSelectedId(found.id)
                window.dispatchEvent(new CustomEvent('decalSelected', { detail: { id: found.id } }))
            }
        }
        window.addEventListener('click', handler)
        return () => window.removeEventListener('click', handler)
    }, [decals, camera, gl, raycaster])

    // Handle decalCommand events coming from the side panel (delete/update)
    useEffect(() => {
        const handler = (ev: any) => {
            const { id, action, data } = ev.detail || {}
            if (!id || !action) return
            const recIdx = decals.findIndex(d => d.id === id)
            if (recIdx === -1) return
            const rec = decals[recIdx]

            switch (action) {
                case 'delete': {
                    rec.mesh.geometry.dispose()
                        ; (rec.mesh.material as any).map?.dispose?.()
                        ; (rec.mesh.material as any).dispose?.()
                    decalsGroupRef.current?.remove(rec.mesh)
                    setDecals(prev => prev.filter(p => p.id !== id))
                    setSelectedId(null)
                    window.dispatchEvent(new CustomEvent('decalRemoved', { detail: { id } }))
                    break
                }
                case 'updateText': {
                    if (rec.meta.type !== 'text') break
                    rec.text = data.text
                    const canvas = makeCanvasForAsset(rec.meta, { text: rec.text, font: rec.font, color: rec.color })
                    const newTex = new THREE.CanvasTexture(canvas)
                        ; (newTex as any).encoding = (THREE as any).sRGBEncoding
                        ; (newTex as any).needsUpdate = true
                        ; (rec.mesh.material as any).map = newTex
                    rec.canvas = canvas
                    window.dispatchEvent(new CustomEvent('decalUpdated', { detail: { id, text: rec.text } }))
                    break
                }
                case 'updateFont': {
                    if (rec.meta.type !== 'text') break
                    rec.font = data.font
                    const c2 = makeCanvasForAsset(rec.meta, { text: rec.text, font: rec.font, color: rec.color })
                        ; (rec.mesh.material as any).map = new THREE.CanvasTexture(c2)
                        ; ((rec.mesh.material as any).map as any).needsUpdate = true
                    rec.canvas = c2
                    window.dispatchEvent(new CustomEvent('decalUpdated', { detail: { id, font: rec.font } }))
                    break
                }
                case 'updateColor': {
                    rec.color = data.color
                    const c3 = makeCanvasForAsset(rec.meta, { text: rec.text, font: rec.font, color: rec.color })
                        ; (rec.mesh.material as any).map = new THREE.CanvasTexture(c3)
                        ; ((rec.mesh.material as any).map as any).needsUpdate = true
                    rec.canvas = c3
                    window.dispatchEvent(new CustomEvent('decalUpdated', { detail: { id, color: rec.color } }))
                    break
                }
                default:
                    break
            }
        }
        window.addEventListener('decalCommand', handler)
        return () => window.removeEventListener('decalCommand', handler)
    }, [decals])

    // Model commands: zoom / rotate applied only to the loaded model (modelRef.children[0])
    useEffect(() => {
        const handler = (ev: any) => {
            const { action, delta, axis, deg } = ev.detail || {}
            if (!modelRef.current) return
            const theModel = modelRef.current.children[0] as THREE.Object3D | undefined
            if (!theModel) return

            if (action === 'zoom' && typeof delta === 'number') {
                const current = theModel.scale.x
                const newScale = THREE.MathUtils.clamp(current * delta, 0.2, 5)
                theModel.scale.setScalar(newScale)
            } else if (action === 'rotate' && axis && typeof deg === 'number') {
                const rad = (deg * Math.PI) / 180
                if (axis === 'y') theModel.rotateY(rad)
                else if (axis === 'x') theModel.rotateX(rad)
                else if (axis === 'z') theModel.rotateZ(rad)
            }
        }
        window.addEventListener('modelCommand', handler)
        return () => window.removeEventListener('modelCommand', handler)
    }, [modelRef])

    // Drag mechanics: startDecalDrag triggers pointermove based manipulation (move/scale/rotate)
    const dragState = useRef<{ type: 'move' | 'scale' | 'rotate' | null; id?: string; startX?: number; startY?: number; startScale?: number; startRot?: number }>({ type: null })

    useEffect(() => {
        const onPointerMove = (ev: PointerEvent) => {
            const ds = dragState.current
            if (!ds.type || !ds.id) return
            const rec = decals.find(d => d.id === ds.id)
            if (!rec) return
            const rect = gl.domElement.getBoundingClientRect()
            if (ds.type === 'scale') {
                const dy = ev.clientY - (ds.startY ?? ev.clientY)
                const factor = 1 + dy * -0.002 // upward drag increases size
                const newScale = (ds.startScale ?? rec.mesh.scale.x) * factor
                rec.mesh.scale.setScalar(Math.max(0.05, Math.min(10, newScale)))
                window.dispatchEvent(new CustomEvent('decalUpdated', { detail: { id: rec.id } }))
            } else if (ds.type === 'rotate') {
                const dx = ev.clientX - (ds.startX ?? ev.clientX)
                const deg = dx * 0.3
                rec.mesh.rotation.z = (ds.startRot ?? rec.mesh.rotation.z) + (deg * Math.PI / 180)
                window.dispatchEvent(new CustomEvent('decalUpdated', { detail: { id: rec.id } }))
            } else if (ds.type === 'move') {
                // raycast to model to find new hit point
                const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
                const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
                raycaster.setFromCamera(new THREE.Vector2(x, y), camera)
                // intersect with modelRef children (we want model surface)
                if (!modelRef.current) return
                const hits = raycaster.intersectObjects(modelRef.current.children, true)
                if (!hits.length) return
                const hit = hits[0]
                const newPoint = hit.point.clone()
                const normal = hit.face!.normal.clone().transformDirection(hit.object.matrixWorld).normalize()

                // create a new decal mesh at newPoint, preserve scale and rotation
                const { mesh: newMesh } = createDecalMesh(hit.object, newPoint, normal, rec.canvas, rec.size)
                newMesh.scale.copy(rec.mesh.scale)
                newMesh.rotation.copy(rec.mesh.rotation)
                decalsGroupRef.current!.add(newMesh)

                // remove old
                rec.mesh.geometry.dispose()
                    ; (rec.mesh.material as any).map?.dispose?.()
                    ; (rec.mesh.material as any).dispose?.()
                decalsGroupRef.current!.remove(rec.mesh)

                // replace
                rec.mesh = newMesh
                setDecals(prev => prev.map(p => p.id === rec.id ? rec : p))
                window.dispatchEvent(new CustomEvent('decalUpdated', { detail: { id: rec.id } }))
            }
        }

        const onPointerUp = () => {
            dragState.current = { type: null }
            window.removeEventListener('pointermove', onPointerMove)
            window.removeEventListener('pointerup', onPointerUp)
        }

        const startHandler = (ev: any) => {
            const { type, id, clientX, clientY } = ev.detail || {}
            if (!type || !id) return
            dragState.current = { type, id, startX: clientX, startY: clientY, startScale: decals.find(d => d.id === id)?.mesh.scale.x, startRot: decals.find(d => d.id === id)?.mesh.rotation.z }
            window.addEventListener('pointermove', onPointerMove)
            window.addEventListener('pointerup', onPointerUp)
        }

        window.addEventListener('startDecalDrag', startHandler)
        return () => {
            window.removeEventListener('startDecalDrag', startHandler)
            window.removeEventListener('pointermove', onPointerMove)
            window.removeEventListener('pointerup', onPointerUp)
        }
    }, [decals, camera, gl, raycaster])

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

    // Export & clear events
    useEffect(() => {
        const handler = (e: any) => {
            if (e.type === 'exportPNG') {
                const prev = gl.getSize(new THREE.Vector2())
                const dpr = Math.min(window.devicePixelRatio, 2)
                const w = Math.floor(window.innerWidth * dpr)
                const h = Math.floor(window.innerHeight * dpr)
                gl.setSize(w, h, false)
                gl.render(scene, camera)
                const url = gl.domElement.toDataURL('image/png')
                gl.setSize(prev.x, prev.y, false)
                const a = document.createElement('a')
                a.href = url
                a.download = 'mockup.png'
                a.click()
                a.remove()
            } else if (e.type === 'clearDecals') {
                decals.forEach(d => {
                    d.mesh.geometry.dispose()
                        ; (d.mesh.material as any).map?.dispose?.()
                        ; (d.mesh.material as any).dispose?.()
                    decalsGroupRef.current?.remove(d.mesh)
                })
                setDecals([])
                setSelectedId(null)
                window.dispatchEvent(new CustomEvent('decalRemoved', { detail: { id: null } }))
            }
        }
        window.addEventListener('exportPNG', handler)
        window.addEventListener('clearDecals', handler)
        return () => {
            window.removeEventListener('exportPNG', handler)
            window.removeEventListener('clearDecals', handler)
        }
    }, [decals, gl, scene, camera])

    // UI anchor for selected decal (compute world position each frame)
    const [uiPos, setUiPos] = useState<THREE.Vector3 | null>(null)
    useFrame(() => {
        if (!selectedId) {
            setUiPos(null)
            return
        }
        const rec = decals.find(d => d.id === selectedId)
        if (!rec) {
            setUiPos(null)
            return
        }
        const p = new THREE.Vector3()
        rec.mesh.getWorldPosition(p)
        setUiPos(p)
    })

    // Render container group once and rely on modelRef & decalsGroupRef being children of it.
    // We don't render decal primitives separately because we add meshes into decalsGroupRef manually.
    return (
        <group
            ref={(g) => {
                if (!g) return
                // make sure container is created and attached only once
                if (!containerRef.current) {
                    containerRef.current = new THREE.Group()
                    modelRef.current = new THREE.Group()
                    decalsGroupRef.current = new THREE.Group()
                    containerRef.current.add(modelRef.current)
                    containerRef.current.add(decalsGroupRef.current)
                }
                // attach containerRef to this react group if not already attached
                if (containerRef.current.parent !== g) {
                    g.add(containerRef.current)
                }
            }}
            onPointerDown={onPointerDown}
        >
            {/* We no longer render gltf directly here; modelRef holds the model which is mounted into containerRef */}
            {/* Render nothing for decals because they are children of decalsGroupRef which is a child of containerRef */}
            {/* In-canvas handles for selected decal */}
            {selectedId && uiPos && (
                <Html position={uiPos} center>
                    <div style={{ transform: 'translateY(-140%)', pointerEvents: 'auto' }} className="flex gap-1 p-1 bg-white/95 rounded shadow-lg">
                        <button
                            title="Delete"
                            onClick={() => window.dispatchEvent(new CustomEvent('decalCommand', { detail: { id: selectedId, action: 'delete' } }))}
                            className="p-1 bg-red-600 rounded"
                        >
                            🗑
                        </button>

                        <button
                            title="Rotate (drag)"
                            onPointerDown={(ev) => {
                                ev.stopPropagation()
                                window.dispatchEvent(new CustomEvent('startDecalDrag', { detail: { type: 'rotate', id: selectedId, clientX: ev.clientX, clientY: ev.clientY } }))
                            }}
                            className="p-1 bg-gray-800 rounded text-white"
                        >
                            🔄
                        </button>

                        <button
                            title="Scale (drag)"
                            onPointerDown={(ev) => {
                                ev.stopPropagation()
                                window.dispatchEvent(new CustomEvent('startDecalDrag', { detail: { type: 'scale', id: selectedId, clientX: ev.clientX, clientY: ev.clientY } }))
                            }}
                            className="p-1 bg-gray-800 rounded text-white"
                        >
                            ↔️
                        </button>

                        <button
                            title="Move (drag)"
                            onPointerDown={(ev) => {
                                ev.stopPropagation()
                                window.dispatchEvent(new CustomEvent('startDecalDrag', { detail: { type: 'move', id: selectedId, clientX: ev.clientX, clientY: ev.clientY } }))
                            }}
                            className="p-1 bg-gray-800 rounded text-white"
                        >
                            ✥
                        </button>
                    </div>
                </Html>
            )}
        </group>
    )
}
