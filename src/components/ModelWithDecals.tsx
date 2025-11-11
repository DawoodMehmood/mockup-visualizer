// src/components/ModelWithDecals.tsx
import { useRef, useState, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

type AssetRef = { type: 'logo' | 'text'; index: number }
type DecalRec = {
    id: string
    mesh: THREE.Mesh
    // size stored as decal width (world units). We won't use mesh.scale for visual size.
    sizeForDecal: number
    canvas: HTMLCanvasElement
    meta: AssetRef
    text?: string
    font?: string
    color?: string

    // important surface attachment info:
    hitObject?: THREE.Object3D   // the mesh we projected onto
    position?: THREE.Vector3    // world-space decal center point
    normal?: THREE.Vector3      // world-space normal at hit point
    rotDeg?: number             // in-plane rotation (degrees) around normal
    fontSize?: number           // for text canvases (px)
}

export default function ModelWithDecals({ glbUrl, logos, texts, assetSelection, bgColor }: {
    glbUrl: string | null
    logos: File[]
    texts: string[]
    assetSelection: AssetRef | null
    bgColor: string
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
            // use fontSize from opts if provided, otherwise fallback to adaptive
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
                ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h)
                if (opts?.color) {
                    ctx.fillStyle = opts.color;
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.fillRect(0, 0, SIZE, SIZE);
                }
            } else {
                ctx.fillStyle = '#cccccc'
                ctx.fillRect(SIZE * 0.25, SIZE * 0.25, SIZE * 0.5, SIZE * 0.5)
            }
        }
        return canvas
    }

    // Helper: create decal mesh and return mesh + material + texture
    // Helper: create decal mesh — accepts rotationDeg (deg around normal) and width (world units)
    const createDecalMesh = (
        hitObject: THREE.Object3D,
        point: THREE.Vector3,
        normal: THREE.Vector3,
        canvas: HTMLCanvasElement,
        width = 0.5,
        rotationDeg = 0
    ) => {
        // base orientation: rotate up (0,0,1) to the surface normal
        const up = new THREE.Vector3(0, 0, 1)
        const q = new THREE.Quaternion().setFromUnitVectors(up, normal.clone().normalize())

        // apply additional rotation around the normal (in-plane)
        // create a quaternion that rotates around the normal by rotationDeg
        const rotRad = (rotationDeg * Math.PI) / 180
        const qAroundNormal = new THREE.Quaternion().setFromAxisAngle(normal.clone().normalize(), rotRad)

        // combined rotation: first align to normal, then rotate in-plane
        const finalQuat = q.clone().multiply(qAroundNormal)
        const euler = new THREE.Euler().setFromQuaternion(finalQuat, 'XYZ')

        // depth small; keep depth proportional to width (thin)
        const depth = Math.max(0.01, width * 0.15)
        const OFFSET = 0.001; // 1mm offset to prevent clipping
        const placementPoint = point.clone().add(normal.clone().multiplyScalar(OFFSET));

        const decalGeo = new DecalGeometry(
            hitObject as any,
            placementPoint,
            euler,
            new THREE.Vector3(width, width, depth)
        );

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
        const mainMesh = modelRef.current?.children[0]; // might be a Group

        // DecalGeometry wants a mesh
        // if the model node is a Group, take the first mesh or flatten the children
        const meshes: THREE.Mesh[] = [];
        mainMesh!.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh);
        });

        // pick the first mesh, or consider applying decal to all meshes
        const targetMesh = meshes[0]; // simple fix: use first mesh

        const { mesh } = createDecalMesh(targetMesh, point, normal, canvas, size)

        // after creating mesh and adding to decal group:
        decalsGroupRef.current!.add(mesh)

        const id = THREE.MathUtils.generateUUID()
        const rec: DecalRec = {
            id,
            mesh,
            sizeForDecal: size,            // width in world units
            canvas,
            meta: assetSelection,
            text: assetSelection.type === 'text' ? texts[assetSelection.index] : undefined,
            font: undefined,
            color: undefined,
            // store hit info for future re-creation
            hitObject: hit.object,
            position: point.clone(),
            normal: normal.clone(),
            rotDeg: 0,
            fontSize: assetSelection.type === 'text' ? Math.max(32, Math.min(96, Math.floor(280 / Math.max(1, (texts[assetSelection.index] || '').length)))) : undefined,
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
                    const c2 = makeCanvasForAsset(rec.meta, {
                        text: rec.text,
                        font: rec.font,
                        fontSize: rec.fontSize,   // important: pass current size
                        color: rec.color
                    })
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
                case 'setSize': { // used for logos (size in world units)
                    const newSize = Number(data?.size ?? rec.sizeForDecal ?? 0.5)
                    // recreate decal geometry at saved hit point
                    const hitObj = rec.hitObject ?? rec.mesh // fallback
                    const pos = rec.position ?? rec.mesh.getWorldPosition(new THREE.Vector3())
                    const normal = rec.normal ?? new THREE.Vector3(0, 0, 1)

                    // keep same canvas texture (we may need to recreate canvas for text separately)
                    // remove old mesh safely
                    rec.mesh.geometry.dispose()
                        ; (rec.mesh.material as any).map?.dispose?.()
                        ; (rec.mesh.material as any).dispose?.()
                    decalsGroupRef.current?.remove(rec.mesh)

                    // create new decal geometry with same canvas and rotation
                    const { mesh: newMesh } = createDecalMesh(hitObj as any, pos.clone(), normal.clone(), rec.canvas, newSize, rec.rotDeg ?? 0)
                    decalsGroupRef.current!.add(newMesh)

                    // update record
                    rec.mesh = newMesh
                    rec.sizeForDecal = newSize
                    setDecals(prev => prev.map(p => p.id === rec.id ? rec : p))
                    window.dispatchEvent(new CustomEvent('decalUpdated', { detail: { id: rec.id, size: newSize } }))
                    break
                }

                case 'setFontSize': { // used for text - newFontPx passed in data.fontSize
                    if (rec.meta.type !== 'text') break
                    const fontPx = Number(data?.fontSize ?? rec.fontSize ?? 48)
                    // recreate the canvas with new font size
                    const newCanvas = makeCanvasForAsset(rec.meta, {
                        text: rec.text ?? '',
                        font: rec.font,       // just the family
                        fontSize: fontPx,     // pass the size separately
                        color: rec.color
                    })
                    // remove old mesh
                    rec.mesh.geometry.dispose()
                        ; (rec.mesh.material as any).map?.dispose?.()
                        ; (rec.mesh.material as any).dispose?.()
                    decalsGroupRef.current?.remove(rec.mesh)

                    const hitObj2 = rec.hitObject ?? rec.mesh
                    const pos2 = rec.position ?? rec.mesh.getWorldPosition(new THREE.Vector3())
                    const normal2 = rec.normal ?? new THREE.Vector3(0, 0, 1)

                    // create new mesh using same world sizeForDecal and rotation
                    const { mesh: newMesh2 } = createDecalMesh(hitObj2 as any, pos2.clone(), normal2.clone(), newCanvas, rec.sizeForDecal ?? 0.5, rec.rotDeg ?? 0)
                    decalsGroupRef.current!.add(newMesh2)

                    rec.mesh = newMesh2
                    rec.canvas = newCanvas
                    rec.fontSize = fontPx
                    setDecals(prev => prev.map(p => p.id === rec.id ? rec : p))
                    window.dispatchEvent(new CustomEvent('decalUpdated', { detail: { id: rec.id, fontSize: fontPx } }))
                    break
                }

                case 'setRotation': {
                    const rotationDeg = Number(data?.rotationDeg ?? 0)
                    // recreate geometry rotated in-plane around the normal
                    const hitObjR = rec.hitObject ?? rec.mesh
                    const posR = rec.position ?? rec.mesh.getWorldPosition(new THREE.Vector3())
                    const normalR = rec.normal ?? new THREE.Vector3(0, 0, 1)

                    // remove old
                    rec.mesh.geometry.dispose()
                        ; (rec.mesh.material as any).map?.dispose?.()
                        ; (rec.mesh.material as any).dispose?.()
                    decalsGroupRef.current?.remove(rec.mesh)

                    // create new geometry with rotationDeg applied
                    const { mesh: newMeshR } = createDecalMesh(hitObjR as any, posR.clone(), normalR.clone(), rec.canvas, rec.sizeForDecal ?? 0.5, rotationDeg)
                    decalsGroupRef.current!.add(newMeshR)

                    rec.mesh = newMeshR
                    rec.rotDeg = rotationDeg
                    setDecals(prev => prev.map(p => p.id === rec.id ? rec : p))
                    window.dispatchEvent(new CustomEvent('decalUpdated', { detail: { id: rec.id, rotationDeg } }))
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

    // direct drag: pointerdown on a decal initiates drag (move along model surface)
    useEffect(() => {
        let activeDragId: string | null = null

        const onPointerMove = (ev: PointerEvent) => {
            if (!activeDragId) return
            ev.stopPropagation()
            const rec = decals.find(d => d.id === activeDragId)
            if (!rec || !modelRef.current) return
            const rect = gl.domElement.getBoundingClientRect()
            const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
            const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
            raycaster.setFromCamera(new THREE.Vector2(x, y), camera)
            const hits = raycaster.intersectObjects(modelRef.current.children, true)
            if (!hits.length) return
            const hit = hits[0]
            const newPoint = hit.point.clone()
            const normal = hit.face!.normal.clone().transformDirection(hit.object.matrixWorld).normalize()

            // create new decal geometry at newPoint keeping scale & rotation
            const { mesh: newMesh } = createDecalMesh(hit.object, newPoint, normal, rec.canvas, rec.sizeForDecal ?? 0.5)
            newMesh.scale.copy(rec.mesh.scale)
            newMesh.rotation.copy(rec.mesh.rotation)
            // add and remove old mesh
            decalsGroupRef.current!.add(newMesh)
            rec.mesh.geometry.dispose()
                ; (rec.mesh.material as any).map?.dispose?.()
                ; (rec.mesh.material as any).dispose?.()
            decalsGroupRef.current!.remove(rec.mesh)
            rec.mesh = newMesh
            rec.hitObject = hit.object
            rec.position = newPoint.clone()
            rec.normal = normal.clone()
            setDecals(prev => prev.map(p => p.id === rec.id ? rec : p))
            window.dispatchEvent(new CustomEvent('decalUpdated', { detail: { id: rec.id } }))
        }

        const onPointerUp = (ev: PointerEvent) => {
            if (activeDragId) ev.stopPropagation()
            activeDragId = null
            window.removeEventListener('pointermove', onPointerMove)
            window.removeEventListener('pointerup', onPointerUp)
            // re-enable OrbitControls
            const controls = (gl as any).controls
            if (controls) controls.enabled = true
        }

        const onPointerDown = (ev: PointerEvent) => {
            if (!modelRef.current || !!assetSelection) return

            const rect = gl.domElement.getBoundingClientRect()
            const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
            const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
            raycaster.setFromCamera(new THREE.Vector2(x, y), camera)
            const hits = raycaster.intersectObjects(decalsGroupRef.current?.children ?? [], true)
            const pick = hits.find(h => h.object.userData.selectable)
            if (!pick) return

            const found = decals.find(d => d.mesh === pick.object || d.mesh === pick.object.parent)
            if (!found) return

            ev.stopPropagation() // <- key: stop event from reaching OrbitControls
            activeDragId = found.id

            // disable OrbitControls while dragging
            const controls = (gl as any).controls
            if (controls) controls.enabled = false

            window.addEventListener('pointermove', onPointerMove)
            window.addEventListener('pointerup', onPointerUp)

            setSelectedId(found.id)
            window.dispatchEvent(new CustomEvent('decalSelected', { detail: found.id }))
        }


        // listen on the canvas DOM element
        const canvasEl = gl.domElement
        canvasEl.addEventListener('pointerdown', onPointerDown)
        return () => {
            canvasEl.removeEventListener('pointerdown', onPointerDown)
            window.removeEventListener('pointermove', onPointerMove)
            window.removeEventListener('pointerup', onPointerUp)
        }
    }, [decals, modelRef, assetSelection, camera, gl, raycaster])


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
                if (!gl || !scene || !camera) return;

                // Save original state
                const prevSize = gl.getSize(new THREE.Vector2());
                const prevPixelRatio = gl.getPixelRatio();
                const prevBackground = scene.background ? scene.background.clone() : null;

                try {
                    // DPR and target size (preserve aspect)
                    const dpr = Math.min(window.devicePixelRatio || 1, 2);

                    // Try to use camera.aspect if it's a PerspectiveCamera; otherwise fall back to renderer size
                    const isPersp = (camera as any).isPerspectiveCamera || (camera as THREE.PerspectiveCamera).isPerspectiveCamera;
                    const aspect = isPersp
                        ? (camera as THREE.PerspectiveCamera).aspect
                        : (prevSize.x && prevSize.y) ? (prevSize.x / prevSize.y) : (window.innerWidth / window.innerHeight);

                    const h = Math.floor(window.innerHeight * dpr);
                    const w = Math.floor(h * aspect);

                    gl.setPixelRatio(dpr);
                    gl.setSize(w, h, false);

                    // Make background transparent for export
                    scene.background = null;
                    gl.render(scene, camera);

                    const url = gl.domElement.toDataURL('image/png');

                    // trigger download
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'mockup.png';
                    a.click();
                    a.remove();
                } finally {
                    // Restore original renderer + scene background
                    gl.setSize(prevSize.x, prevSize.y, false);
                    gl.setPixelRatio(prevPixelRatio);
                    if (prevBackground) scene.background = prevBackground;
                    else scene.background = new THREE.Color(bgColor); // fallback if you want to keep bgColor variable
                }
            }
            else if (e.type === 'exportGLB') {
                // --- GLB Export ---
                const exporter = new GLTFExporter()

                // Clone scene so original stays untouched
                const exportScene = scene.clone(true)
                if (decalsGroupRef.current) {
                    exportScene.add(decalsGroupRef.current.clone(true))
                }

                exporter.parse(
                    exportScene,
                    (result) => {
                        let blob: Blob
                        if (result instanceof ArrayBuffer) {
                            blob = new Blob([result], { type: 'application/octet-stream' })
                        } else {
                            const output = JSON.stringify(result, null, 2)
                            blob = new Blob([output], { type: 'text/plain' })
                        }

                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = 'mockup.glb'
                        a.click()
                        URL.revokeObjectURL(url)
                    },
                    { binary: true } as any// export as .glb
                )
            }

            else if (e.type === 'clearDecals') {
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
        window.addEventListener('exportGLB', handler)
        window.addEventListener('clearDecals', handler)
        return () => {
            window.removeEventListener('exportPNG', handler)
            window.removeEventListener('exportGLB', handler)
            window.removeEventListener('clearDecals', handler)
        }
    }, [decals, gl, scene, camera])


    // UI anchor for selected decal (compute world position each frame)
    useFrame(() => {
        if (!selectedId) {
            return
        }
        const rec = decals.find(d => d.id === selectedId)
        if (!rec) {
            return
        }
        const p = new THREE.Vector3()
        rec.mesh.getWorldPosition(p)
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
        </group>
    )
}
