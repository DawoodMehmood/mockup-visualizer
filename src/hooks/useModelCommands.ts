// src/hooks/useModeCommands.ts
import { useEffect, type RefObject } from 'react'
import * as THREE from 'three'


export function useModelCommands(params: {
    modelRef: RefObject<THREE.Group<THREE.Object3DEventMap> | null>
}) {
    const { modelRef } = params

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
}
