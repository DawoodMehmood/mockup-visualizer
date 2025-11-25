// src/hooks/useModeCommands.ts
import { useEffect, type RefObject } from 'react'
import * as THREE from 'three'


export function useModelCommands(params: {
    containerRef: RefObject<THREE.Group<THREE.Object3DEventMap> | null>
}) {
    const { containerRef } = params

    useEffect(() => {
        const handler = (ev: any) => {
            const { action, delta, axis, deg } = ev.detail || {}
            if (!containerRef.current) return
            const container = containerRef.current

            if (action === 'zoom' && typeof delta === 'number') {
                const current = container.scale.x
                const newScale = THREE.MathUtils.clamp(current * delta, 0.2, 5)
                container.scale.setScalar(newScale)
            } else if (action === 'rotate' && axis && typeof deg === 'number') {
                const rad = (deg * Math.PI) / 180
                if (axis === 'y') container.rotateY(rad)
                else if (axis === 'x') container.rotateX(rad)
                else if (axis === 'z') container.rotateZ(rad)
            } else if (action === 'resetTransform') {
                container.scale.set(1, 1, 1)
                container.rotation.set(0, 0, 0)
                container.position.set(0, 0, 0)
            }
        }
        window.addEventListener('modelCommand', handler)
        return () => window.removeEventListener('modelCommand', handler)
    }, [containerRef])
}
