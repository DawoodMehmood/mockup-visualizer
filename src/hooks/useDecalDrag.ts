// src/hooks/useDecalDrag.ts
import { useEffect } from 'react'
import * as THREE from 'three'
import type { DecalRec } from '../components/ModelWithDecals'
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js'

export function useDecalDrag(params: {
    gl: any
    camera: THREE.Camera
    raycaster: THREE.Raycaster
    modelRef: React.MutableRefObject<THREE.Group | null>
    decalsGroupRef: React.MutableRefObject<THREE.Group | null>
    decals: DecalRec[]
    setDecals: (fn: (prev: DecalRec[]) => DecalRec[]) => void
    assetSelection: any
    setSelectedId: (id: string | null) => void
    createDecalMesh: (
        hitObject: THREE.Object3D,
        point: THREE.Vector3,
        normal: THREE.Vector3,
        canvas: HTMLCanvasElement,
        width?: number,
        rotationDeg?: number
    ) => {
        mesh: THREE.Mesh<DecalGeometry, THREE.MeshStandardMaterial, THREE.Object3DEventMap>;
        mat: THREE.MeshStandardMaterial;
        tex: THREE.CanvasTexture;
        euler: THREE.Euler;
    }
}) {
    const { gl, camera, raycaster, modelRef, decalsGroupRef, decals, setDecals, assetSelection, setSelectedId, createDecalMesh } = params

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
}
