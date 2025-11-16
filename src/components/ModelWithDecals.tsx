// src/components/ModelWithDecals.tsx
import { useRef, useState, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js'
import { useDecalCommands } from '../hooks/useDecalCommands'
import { useDecals } from '../hooks/useDecals'
import { useModelCommands } from '../hooks/useModelCommands'
import { useDecalDrag } from '../hooks/useDecalDrag'
import { useModelReset } from '../hooks/useModelReset'

export type AssetRef = { type: 'logo' | 'text'; index: number }
export type DecalRec = {
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
    useModelReset({
        gltf,
        camera,
        modelRef
    })


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

    // Helper: create decal mesh and return mesh + material + texture
    // Helper: create decal mesh — accepts rotationDeg (deg around normal) and width (world units)
    const createDecalMesh = (
        hitObject: THREE.Object3D,
        point: THREE.Vector3,
        normal: THREE.Vector3,
        canvas: HTMLCanvasElement,
        width = 0.5,
        rotationDeg = 0,
        camera?: THREE.Camera
    ) => {
        // Normalize the normal
        const normalWorld = normal.clone().normalize()
        
        // Use camera's up vector as reference for consistent orientation
        // If camera is not provided, use world up (0, 1, 0) as fallback
        const worldUp = camera 
            ? new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize()
            : new THREE.Vector3(0, 1, 0)
        
        // Calculate right vector (tangent to surface)
        const right = new THREE.Vector3().crossVectors(normalWorld, worldUp).normalize()
        
        // If right is too small (normal is parallel to worldUp), use camera forward as reference
        if (right.length() < 0.1) {
            const cameraForward = camera 
                ? new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize()
                : new THREE.Vector3(0, 0, -1)
            right.crossVectors(normalWorld, cameraForward).normalize()
        }
        
        // Calculate the actual up vector on the surface (perpendicular to normal and right)
        const surfaceUp = new THREE.Vector3().crossVectors(right, normalWorld).normalize()
        
        // Build rotation matrix from right, surfaceUp, and normal
        const matrix = new THREE.Matrix4()
        matrix.makeBasis(right, surfaceUp, normalWorld)
        const q = new THREE.Quaternion().setFromRotationMatrix(matrix)

        // apply additional rotation around the normal (in-plane)
        const rotRad = (rotationDeg * Math.PI) / 180
        const qAroundNormal = new THREE.Quaternion().setFromAxisAngle(normalWorld, rotRad)

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

        const mat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            depthWrite: false,
            depthTest: false,
            // polygonOffset: true,
            // polygonOffsetFactor: -4,
            toneMapped: false,
        })

        const mesh = new THREE.Mesh(decalGeo, mat)
        mesh.userData.selectable = true
        mesh.renderOrder = 999999
        mesh.frustumCulled = false
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
        let normal = hit.face!.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
        
        // Flip normal if it's pointing away from camera (ensures decal faces camera)
        const cameraDir = camera.getWorldDirection(new THREE.Vector3())
        if (normal.dot(cameraDir) > 0) {
            normal.negate()
        }

        const canvas = makeCanvasForAsset(assetSelection)
        const size = 0.5

        // DecalGeometry wants a mesh
        const targetMesh = hit.object as THREE.Mesh

        const { mesh } = createDecalMesh(targetMesh, point, normal, canvas, size, 0, camera)

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
    useDecals({
        decals,
        decalsGroupRef,
        setDecals,
        setSelectedId,
        makeCanvasForAsset,
        createDecalMesh
    })

    // Model commands: zoom / rotate applied only to the loaded model (modelRef.children[0])
    useModelCommands({ modelRef })

    // direct drag: pointerdown on a decal initiates drag (move along model surface)
    useDecalDrag({
        gl,
        camera,
        raycaster,
        modelRef,
        decalsGroupRef,
        decals,
        setDecals,
        assetSelection,
        setSelectedId,
        createDecalMesh
    })


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

    useDecalCommands({
        gl,
        scene,
        camera,
        decals,
        decalsGroupRef,
        setDecals,
        bgColor
    })


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
