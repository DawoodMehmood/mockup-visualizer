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
}) {
    const { gl, camera, raycaster, modelRef, decalsGroupRef, decals, setDecals, assetSelection, setSelectedId } = params

    useEffect(() => {
        let activeDragId: string | null = null
        let pointerIdHeld: number | null = null
        let latestXY: { x: number; y: number } | null = null

        const processLatest = () => {
            if (!activeDragId || !latestXY || !modelRef.current) return

            const rect = gl.domElement.getBoundingClientRect()
            const v2 = new THREE.Vector2(
                ((latestXY.x - rect.left) / rect.width) * 2 - 1,
                -((latestXY.y - rect.top) / rect.height) * 2 + 1
            )
            raycaster.setFromCamera(v2, camera)

            const rec = decals.find(d => d.id === activeDragId)
            if (!rec) return

            // Temporarily disable decal raycasting
            const decalMeshes = new Set(decals.map(d => d.mesh))
            const originalRaycasts = new Map<THREE.Mesh, any>()
            for (const mesh of decalMeshes) {
                if (mesh.raycast) {
                    originalRaycasts.set(mesh, mesh.raycast)
                    mesh.raycast = () => { }
                }
            }

            const hits = raycaster.intersectObjects(modelRef.current!.children, true)

            for (const [mesh, originalRaycast] of originalRaycasts) {
                mesh.raycast = originalRaycast
            }

            if (!hits.length) return

            const hit = hits[0]
            const point = hit.point.clone()

            // USE THE RAW OUTWARD NORMAL — NEVER FLIP IT!
            const normalWorld = hit.face!.normal.clone()
                .transformDirection(hit.object.matrixWorld)
                .normalize()

            // ———— EXACT SAME ORIENTATION LOGIC AS PLACEMENT ————
            const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize()

            let tangent = new THREE.Vector3().crossVectors(camUp, normalWorld).normalize()
            if (tangent.lengthSq() < 0.01) {
                const camDir = camera.getWorldDirection(new THREE.Vector3())
                tangent = new THREE.Vector3().crossVectors(camDir, normalWorld).normalize()
            }

            const bitangent = new THREE.Vector3().crossVectors(normalWorld, tangent).normalize()

            const matrix = new THREE.Matrix4()
            matrix.makeBasis(tangent, bitangent, normalWorld)

            let finalQuat = new THREE.Quaternion().setFromRotationMatrix(matrix)

            // Apply saved in-plane rotation
            if (rec.rotDeg !== undefined && rec.rotDeg !== 0) {
                const rotRad = THREE.MathUtils.degToRad(rec.rotDeg)
                const qRot = new THREE.Quaternion().setFromAxisAngle(normalWorld, rotRad)
                finalQuat = finalQuat.multiply(qRot)
            }

            const euler = new THREE.Euler().setFromQuaternion(finalQuat, 'XYZ')

            // ———— DECAL BOX (same as placement) ————
            const width = rec.sizeForDecal ?? 0.5
            const padding = 1.5
            const depthPadding = 4
            const depth = Math.max(0.01, width * 0.15)

            const placementPoint = point.clone().add(normalWorld.clone().multiplyScalar(0.005))

            const newGeo = new DecalGeometry(
                hit.object as THREE.Mesh,
                placementPoint,
                euler,
                new THREE.Vector3(width * padding, width * padding, depth * depthPadding)
            )

            // Fix for rotating container: transform geometry to container's local space
            if (decalsGroupRef.current && decalsGroupRef.current.parent) {
                const container = decalsGroupRef.current.parent
                const inverseMatrix = container.matrixWorld.clone().invert()
                newGeo.applyMatrix4(inverseMatrix)
            }

            if (rec.mesh.geometry) rec.mesh.geometry.dispose()
            rec.mesh.geometry = newGeo

            // Update stored hit info
            rec.hitObject = hit.object
            rec.position = placementPoint.clone()
            rec.normal = normalWorld.clone()
            rec.localPosition = hit.object.worldToLocal(placementPoint.clone())
            rec.localNormal = normalWorld.clone().transformDirection(hit.object.matrixWorld.clone().invert()).normalize()

            // Trigger update only if moved significantly
            const prevPos = rec.position
            const moved = !prevPos || prevPos.distanceTo(placementPoint) > 0.001

            if (moved) {
                setDecals(prev => prev.map(p => p.id === rec.id ? { ...rec } : p))
                window.dispatchEvent(new CustomEvent('decalUpdated', { detail: { id: rec.id } }))
            }
        }

        const onPointerMove = (ev: PointerEvent) => {
            if (!activeDragId) return
            ev.preventDefault()
            latestXY = { x: ev.clientX, y: ev.clientY }
            processLatest()
        }

        const onPointerUp = (ev: PointerEvent) => {
            if (activeDragId) {
                ev.stopPropagation()
                // Update baseLocalRotation for the dragged decal so future rotations work correctly
                const rec = decals.find(d => d.id === activeDragId)
                if (rec && rec.hitObject && rec.mesh) {
                    const normalWorld = rec.normal!.clone().normalize()
                    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize()
                    let tangent = new THREE.Vector3().crossVectors(camUp, normalWorld).normalize()
                    if (tangent.lengthSq() < 0.01) {
                        const camDir = camera.getWorldDirection(new THREE.Vector3())
                        tangent = new THREE.Vector3().crossVectors(camDir, normalWorld).normalize()
                    }
                    const bitangent = new THREE.Vector3().crossVectors(normalWorld, tangent).normalize()
                    const matrix = new THREE.Matrix4()
                    matrix.makeBasis(tangent, bitangent, normalWorld)
                    let finalQuat = new THREE.Quaternion().setFromRotationMatrix(matrix)

                    // Apply saved in-plane rotation
                    if (rec.rotDeg !== undefined && rec.rotDeg !== 0) {
                        const rotRad = THREE.MathUtils.degToRad(rec.rotDeg)
                        const qRot = new THREE.Quaternion().setFromAxisAngle(normalWorld, rotRad)
                        finalQuat = finalQuat.multiply(qRot)
                    }

                    // Now compute baseLocalRotation relative to hitObject
                    const qRotInv = new THREE.Quaternion().setFromAxisAngle(normalWorld, -THREE.MathUtils.degToRad(rec.rotDeg ?? 0))
                    const baseWorldQuat = finalQuat.clone().multiply(qRotInv)

                    const objWorldQuat = new THREE.Quaternion()
                    rec.hitObject.getWorldQuaternion(objWorldQuat)

                    const baseLocalRotation = objWorldQuat.clone().invert().multiply(baseWorldQuat)

                    // Update record
                    rec.baseLocalRotation = baseLocalRotation
                    setDecals(prev => prev.map(p => p.id === rec.id ? { ...rec } : p))
                }
            }
            if (pointerIdHeld !== null && ev.pointerId === pointerIdHeld) {
                try { gl.domElement.releasePointerCapture(pointerIdHeld) } catch { }
            }
            activeDragId = null
            pointerIdHeld = null
            latestXY = null
            window.removeEventListener('pointermove', onPointerMove)
            window.removeEventListener('pointerup', onPointerUp)
            const controls = (gl as any).controls
            if (controls) controls.enabled = true
            try { gl.domElement.style.touchAction = '' } catch { }
        }

        const onPointerDown = (ev: PointerEvent) => {
            if (!modelRef.current || !!assetSelection) return

            try { gl.domElement.setPointerCapture(ev.pointerId); pointerIdHeld = ev.pointerId } catch { }

            const rect = gl.domElement.getBoundingClientRect()
            const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
            const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
            raycaster.setFromCamera(new THREE.Vector2(x, y), camera)

            const hits = raycaster.intersectObjects(decalsGroupRef.current?.children ?? [], true)
            const pick = hits.find(h => h.object.userData.selectable)
            if (!pick) {
                try { gl.domElement.releasePointerCapture(ev.pointerId); pointerIdHeld = null } catch { }
                return
            }

            const found = decals.find(d => d.mesh === pick.object || d.mesh === pick.object.parent)
            if (!found) return

            ev.stopPropagation()
            ev.preventDefault()

            activeDragId = found.id
            latestXY = null // prevents jump on first move

            const controls = (gl as any).controls
            if (controls) controls.enabled = false
            gl.domElement.style.touchAction = 'none'

            window.addEventListener('pointermove', onPointerMove, { passive: false })
            window.addEventListener('pointerup', onPointerUp)

            setSelectedId(found.id)
            window.dispatchEvent(new CustomEvent('decalSelected', { detail: { id: found.id } }))
        }

        const canvasEl = gl.domElement
        canvasEl.addEventListener('pointerdown', onPointerDown)
        return () => {
            canvasEl.removeEventListener('pointerdown', onPointerDown)
        }
    }, [decals, modelRef, assetSelection, camera, gl, raycaster, setDecals, setSelectedId, decalsGroupRef])
}