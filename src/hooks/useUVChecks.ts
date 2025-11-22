// src/hooks/useUVChecks.ts
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'

export type UVProblem =
    | 'NO_UVS'
    | 'UV_OUT_OF_BOUNDS'
    | 'UV_DEGENERATE'
    | 'UNIFORMITY_ISSUE'
    | 'MULTI_UV_SETS'

export type MeshUVReport = {
    name: string
    uuid: string
    hasUvs: boolean
    uvCount: number
    uvMin: [number, number]
    uvMax: [number, number]
    uvOutOfBounds: boolean
    uvArea: number         // sum of UV-triangle areas (in UV units)
    worldArea: number      // sum of world triangle areas (world units^2)
    texelDensityEstimate?: number // sqrt(worldArea / uvArea) — larger => more world units per UV unit
    problems: UVProblem[]
}

export type UVReport = {
    meshes: MeshUVReport[]
    ok: boolean
    summaryProblems: Set<string>
}

/**
 * useUVChecks
 * - gltf: loaded GLTF (from useGLTF)
 * - options.textureSize: the target texture size you plan to write into (used for guidance)
 * - onResult: optional callback called with UVReport
 */
export function useUVChecks(params: {
    gltf: any | null
    textureSize?: number
    onResult?: (r: UVReport) => void
}) {
    const { gltf, textureSize = 4096, onResult } = params
    const [report, setReport] = useState<UVReport | null>(null)

    useEffect(() => {
        if (!gltf?.scene) {
            setReport(null)
            onResult?.(null as any)
            return
        }

        const meshes: MeshUVReport[] = []

        gltf.scene.traverse((child: any) => {
            if (!child.isMesh || !child.geometry) return
            const geom = child.geometry as THREE.BufferGeometry

            const posAttr = geom.getAttribute('position')
            const uvAttr = geom.getAttribute('uv')

            const meshReport: MeshUVReport = {
                name: child.name || (child as any).uuid || 'mesh',
                uuid: (child as any).uuid,
                hasUvs: !!uvAttr,
                uvCount: uvAttr ? uvAttr.count : 0,
                uvMin: [Infinity, Infinity],
                uvMax: [-Infinity, -Infinity],
                uvOutOfBounds: false,
                uvArea: 0,
                worldArea: 0,
                problems: []
            }

            if (!uvAttr) {
                meshReport.problems.push('NO_UVS')
                meshes.push(meshReport)
                return
            }

            // Read buffers
            const positions = posAttr.array
            const uvs = uvAttr.array
            const index = geom.index ? geom.index.array : null
            const triCount = index ? index.length / 3 : positions.length / (3 * 3)

            // Helper to read a vertex
            const readPos = (i: number) => {
                return new THREE.Vector3(
                    positions[i * 3 + 0],
                    positions[i * 3 + 1],
                    positions[i * 3 + 2]
                )
            }
            const readUV = (i: number) => {
                return new THREE.Vector2(
                    uvs[i * 2 + 0],
                    uvs[i * 2 + 1]
                )
            }

            const triCountLoop = index ? index.length / 3 : positions.length / 9
            let uvAreaSum = 0
            let worldAreaSum = 0

            for (let ti = 0; ti < triCountLoop; ti++) {
                let a: number, b: number, c: number
                if (index) {
                    a = index[ti * 3 + 0]
                    b = index[ti * 3 + 1]
                    c = index[ti * 3 + 2]
                } else {
                    a = ti * 3 + 0
                    b = ti * 3 + 1
                    c = ti * 3 + 2
                }

                const vA = readPos(a)
                const vB = readPos(b)
                const vC = readPos(c)

                const uvA = readUV(a)
                const uvB = readUV(b)
                const uvC = readUV(c)

                // update uv min/max and out-of-bounds
                for (const uv of [uvA, uvB, uvC]) {
                    meshReport.uvMin[0] = Math.min(meshReport.uvMin[0], uv.x)
                    meshReport.uvMin[1] = Math.min(meshReport.uvMin[1], uv.y)
                    meshReport.uvMax[0] = Math.max(meshReport.uvMax[0], uv.x)
                    meshReport.uvMax[1] = Math.max(meshReport.uvMax[1], uv.y)
                    if (uv.x < 0 || uv.x > 1 || uv.y < 0 || uv.y > 1) meshReport.uvOutOfBounds = true
                }

                // UV triangle area (signed)
                const uvEdge1 = new THREE.Vector2().subVectors(uvB, uvA)
                const uvEdge2 = new THREE.Vector2().subVectors(uvC, uvA)
                const uvTriArea = Math.abs(uvEdge1.x * uvEdge2.y - uvEdge1.y * uvEdge2.x) * 0.5
                uvAreaSum += uvTriArea

                // World triangle area
                const e1 = new THREE.Vector3().subVectors(vB, vA)
                const e2 = new THREE.Vector3().subVectors(vC, vA)
                const cross = new THREE.Vector3().crossVectors(e1, e2)
                const worldTriArea = 0.5 * cross.length()
                worldAreaSum += worldTriArea
            }

            meshReport.uvArea = uvAreaSum
            meshReport.worldArea = worldAreaSum

            // basic texel density estimate (units of world per UV unit)
            if (uvAreaSum > 1e-10) {
                const texelDensity = Math.sqrt(worldAreaSum / uvAreaSum) // worldunits per UV-unit
                meshReport.texelDensityEstimate = texelDensity
                // heuristics for warnings:
                if (texelDensity < 0.05 || texelDensity > 500) {
                    meshReport.problems.push('UNIFORMITY_ISSUE')
                }
            } else {
                meshReport.problems.push('UV_DEGENERATE')
            }

            if (meshReport.uvOutOfBounds) meshReport.problems.push('UV_OUT_OF_BOUNDS')

            meshes.push(meshReport)
        })

        // Aggregate summary
        const summaryProblems = new Set<string>()
        for (const m of meshes) {
            for (const p of m.problems) summaryProblems.add(p)
        }

        const ok = meshes.length > 0 && summaryProblems.size === 0

        const r: UVReport = { meshes, ok, summaryProblems }
        setReport(r)
        onResult?.(r)
        // also emit a global event so UI/other hooks can pick it up
        try { window.dispatchEvent(new CustomEvent('uvCheckResult', { detail: r })) } catch { }

    }, [gltf])

    return { report }
}
