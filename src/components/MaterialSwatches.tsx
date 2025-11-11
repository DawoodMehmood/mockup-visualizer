import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { collectMaterials, sampleMaterialColor, type MaterialGroup } from '../utils/materialUtils'

export default function MaterialSwatches({
    modelRoot,
    onMaterialGroups,
}: {
    modelRoot: THREE.Object3D | null
    onMaterialGroups?: (groups: MaterialGroup[]) => void
}) {
    const [groups, setGroups] = useState<MaterialGroup[]>([])

    useEffect(() => {
        if (!modelRoot) {
            setGroups([])
            onMaterialGroups?.([])
            return
        }
        const gs = collectMaterials(modelRoot)
        // sample colors for materials (async)
        Promise.all(
            gs.map(async (g) => {
                g.sampleColor = await sampleMaterialColor(g.material as any)
                return g
            })
        ).then((arr) => {
            setGroups(arr)
            onMaterialGroups?.(arr)
        })
    }, [modelRoot])

    const applyColor = (group: MaterialGroup, hex: string) => {
        const mat = group.material as THREE.MeshStandardMaterial;

        // If the material has no map, simply set color
        if (!mat.map) {
            if (mat.color) {
                mat.color.set(hex)
            } else {
                // if a weird material, try to set 'color' field anyway
                mat.color = new THREE.Color(hex)
            }
            mat.needsUpdate = true
            // update sample color shown
            setGroups((prev) => prev.map((p) => (p.id === group.id ? { ...p, sampleColor: hex } : p)))
            return
        }

        if (mat.color) mat.color.set(hex)
        else mat.color = new THREE.Color(hex)
        mat.needsUpdate = true

        setGroups((prev) => prev.map((p) => (p.id === group.id ? { ...p, sampleColor: hex } : p)))

        // const mat = group.material as THREE.MeshStandardMaterial;
        // mat.map = null;

        // // Set the base color
        // if (!mat.color) mat.color = new THREE.Color(hex);
        // else mat.color.set(hex);

        // // Optional: set emissive for "unlit" effect
        // mat.emissive.set(hex);
        // mat.emissiveIntensity = 1;

        // // Neutralize PBR interference
        // mat.metalness = 0;
        // mat.roughness = 1; // or 0.5 depending on preference
        // mat.transparent = false;
        // mat.depthWrite = true;
        // mat.toneMapped = false;

        // mat.needsUpdate = true;

        // setGroups(prev =>
        //     prev.map(p => (p.id === group.id ? { ...p, sampleColor: hex } : p))
        // );
    }

    if (!modelRoot) return null

    return (
        <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">Available colors</h3>
            <div className="space-y-2 max-h-screen overflow-auto">
                {groups.map((g) => (
                    <div key={g.id} className="flex items-center gap-2 p-2 rounded">
                        <div className="flex-1 text-xs">{g.name}</div>
                        <input
                            type="color"
                            value={g.sampleColor ?? '#888888'}
                            onChange={(e) => applyColor(g, e.target.value)}
                            className='w-40 cursor-pointer'
                        />
                    </div>
                ))}
            </div>
        </div>
    )
}
