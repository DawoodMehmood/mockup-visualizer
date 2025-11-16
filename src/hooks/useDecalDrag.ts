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
        let scheduled = false

        // inside your processLatest function (replace existing implementation)
        const processLatest = () => {
            scheduled = false
            if (!activeDragId || !latestXY || !modelRef.current) return

            const rect = gl.domElement.getBoundingClientRect()
            const v2 = new THREE.Vector2(
                ((latestXY.x - rect.left) / rect.width) * 2 - 1,
                -((latestXY.y - rect.top) / rect.height) * 2 + 1
            )
            raycaster.setFromCamera(v2, camera)

            const rec = decals.find(d => d.id === activeDragId)
            if (!rec) return

            // Temporarily disable raycasting on all decal meshes (efficient - no scene manipulation)
            const decalMeshes = new Set(decals.map(d => d.mesh))
            const originalRaycasts = new Map<THREE.Mesh, any>()
            for (const mesh of decalMeshes) {
                if (mesh.raycast) {
                    originalRaycasts.set(mesh, mesh.raycast)
                    mesh.raycast = () => {} // Disable raycasting
                }
            }

            // Raycast against model children, recursively
            const modelChildren = modelRef.current.children.filter(child => 
                child !== decalsGroupRef.current
            )
            const hits = raycaster.intersectObjects(modelChildren, true)
            
            // Restore raycast methods
            for (const [mesh, originalRaycast] of originalRaycasts) {
                mesh.raycast = originalRaycast
            }

            if (!hits.length) {
                return // No surface found, keep drag alive but don't update
            }

            const hit = hits[0]
            const worldPoint = hit.point.clone()

            // compute world-space normal for the hit triangle
            let normalWorld = hit.face!.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
            const cameraDir = camera.getWorldDirection(new THREE.Vector3())
            if (normalWorld.dot(cameraDir) > 0) {
                normalWorld.negate()
            }

            // Update decal position immediately - no threshold checks for smooth dragging
            try {
                const width = rec.sizeForDecal ?? 0.5
                const depth = Math.max(0.01, width * 0.15)
                const OFFSET = 0.0015
                const placementPoint = worldPoint.clone().add(normalWorld.clone().multiplyScalar(OFFSET))

                // Improved orientation calculation for consistent decal orientation
                // Use camera's up vector as reference for consistent orientation
                const worldUp = new THREE.Vector3(0, 1, 0).applyQuaternion((camera as any).quaternion).normalize()
                
                // Calculate right vector (tangent to surface)
                const right = new THREE.Vector3().crossVectors(normalWorld, worldUp).normalize()
                
                // If right is too small (normal is parallel to worldUp), use camera forward as reference
                if (right.length() < 0.1) {
                    const cameraForward = new THREE.Vector3(0, 0, -1).applyQuaternion((camera as any).quaternion).normalize()
                    right.crossVectors(normalWorld, cameraForward).normalize()
                }
                
                // Calculate the actual up vector on the surface (perpendicular to normal and right)
                const surfaceUp = new THREE.Vector3().crossVectors(right, normalWorld).normalize()
                
                // Build rotation matrix from right, surfaceUp, and normal
                const matrix = new THREE.Matrix4()
                matrix.makeBasis(right, surfaceUp, normalWorld)
                const qAlign = new THREE.Quaternion().setFromRotationMatrix(matrix)
                
                // Apply in-plane rotation around the normal
                const rotRad = ((rec.rotDeg ?? 0) * Math.PI) / 180
                const qAroundNormal = new THREE.Quaternion().setFromAxisAngle(normalWorld, rotRad)
                const finalQuat = qAlign.clone().multiply(qAroundNormal)
                const euler = new THREE.Euler().setFromQuaternion(finalQuat, 'XYZ')

                const newGeo = new DecalGeometry(hit.object as any, placementPoint, euler, new THREE.Vector3(width, width, depth))

                if (rec.mesh.geometry) rec.mesh.geometry.dispose()
                rec.mesh.geometry = newGeo

                // Check if position changed significantly before updating
                const prevPos = rec.position ? rec.position.clone() : null
                const hasChanged = !prevPos || prevPos.distanceTo(placementPoint) > 0.001

                rec.hitObject = hit.object
                rec.position = placementPoint.clone()
                rec.normal = normalWorld.clone()

                rec.mesh.renderOrder = 999999
                rec.mesh.frustumCulled = false
                if ((rec.mesh.material as any).depthTest !== false) {
                    (rec.mesh.material as any).depthTest = false
                    ; (rec.mesh.material as any).depthWrite = false
                    ; (rec.mesh.material as any).needsUpdate = true
                }

                // Only update state if decal actually changed position significantly (reduces unnecessary re-renders)
                if (hasChanged) {
                    setDecals(prev => prev.map(p => p.id === rec.id ? rec : p))
                    window.dispatchEvent(new CustomEvent('decalUpdated', { detail: { id: rec.id } }))
                }
            } catch (err) {
                console.warn('decal drag update failed', err)
            }
        }


        const onPointerMove = (ev: PointerEvent) => {
            if (!activeDragId) return
            ev.preventDefault()
            latestXY = { x: ev.clientX, y: ev.clientY }
            // Always schedule an update to ensure smooth continuous movement
            if (!scheduled) {
                scheduled = true
                requestAnimationFrame(processLatest)
            }
        }

        const onPointerUp = (ev: PointerEvent) => {
            if (activeDragId) ev.stopPropagation()
            if (pointerIdHeld !== null && ev.pointerId === pointerIdHeld) {
                try { gl.domElement.releasePointerCapture?.(pointerIdHeld) } catch { }
            }
            activeDragId = null
            pointerIdHeld = null
            latestXY = null
            scheduled = false
            window.removeEventListener('pointermove', onPointerMove)
            window.removeEventListener('pointerup', onPointerUp)
            const controls = (gl as any).controls
            if (controls) controls.enabled = true
            // restore touch action if you changed it
            try { gl.domElement.style.touchAction = '' } catch { }
        }

        const onPointerDown = (ev: PointerEvent) => {
            if (!modelRef.current || !!assetSelection) return

            // try to capture pointer so moves outside canvas still come here
            try { gl.domElement.setPointerCapture?.(ev.pointerId); pointerIdHeld = ev.pointerId } catch { }

            const rect = gl.domElement.getBoundingClientRect()
            const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
            const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
            raycaster.setFromCamera(new THREE.Vector2(x, y), camera)

            const hits = raycaster.intersectObjects(decalsGroupRef.current?.children ?? [], true)
            const pick = hits.find(h => h.object.userData.selectable)
            if (!pick) {
                try { gl.domElement.releasePointerCapture?.(ev.pointerId); pointerIdHeld = null } catch { }
                return
            }

            const found = decals.find(d => d.mesh === pick.object || d.mesh === pick.object.parent)
            if (!found) {
                try { gl.domElement.releasePointerCapture?.(ev.pointerId); pointerIdHeld = null } catch { }
                return
            }

            ev.stopPropagation()
            ev.preventDefault()

            activeDragId = found.id

            // disable orbit controls while dragging
            const controls = (gl as any).controls
            if (controls) controls.enabled = false

            // prevent browser gestures from interrupting on touch
            gl.domElement.style.touchAction = 'none'

            window.addEventListener('pointermove', onPointerMove, { passive: false })
            window.addEventListener('pointerup', onPointerUp)

            // DON'T update immediately on pointer down - wait for pointer move
            // This prevents the decal from jumping to the click position
            latestXY = null

            setSelectedId(found.id)
            window.dispatchEvent(new CustomEvent('decalSelected', { detail: found.id }))
        }

        const canvasEl = gl.domElement
        canvasEl.style.touchAction = canvasEl.style.touchAction || 'none'
        canvasEl.addEventListener('pointerdown', onPointerDown)
        return () => {
            canvasEl.removeEventListener('pointerdown', onPointerDown)
            window.removeEventListener('pointermove', onPointerMove)
            window.removeEventListener('pointerup', onPointerUp)
        }
    }, [decals, modelRef, assetSelection, camera, gl, raycaster, setDecals, setSelectedId, decalsGroupRef])
}
