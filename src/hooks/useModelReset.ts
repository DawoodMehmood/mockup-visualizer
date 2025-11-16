// src/hooks/useModelReset.ts
import { useEffect, type RefObject } from 'react'
import * as THREE from 'three'


export function useModelReset(params: {
    gltf: any
    camera: THREE.Camera
    modelRef: RefObject<THREE.Group<THREE.Object3DEventMap> | null>
}) {
    const { gltf, camera, modelRef } = params

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
}
