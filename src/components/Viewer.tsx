// src/components/Viewer.tsx
import React, { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, Html } from '@react-three/drei'
import ModelWithDecals from './ModelWithDecals'
import { FiLoader } from 'react-icons/fi'

export default function Viewer({ glbUrl, logos, texts, assetSelection, bgColor = '#0f172a' }: any) {
    return (
        <Canvas shadows camera={{ position: [0, 1.5, 3], fov: 50 }} >
            {/* set background color for the scene */}
            <color attach="background" args={[bgColor]} />
            <ambientLight intensity={0.6} />
            <directionalLight intensity={0.8} position={[5, 10, 7]} />
            <Suspense fallback={<Html center>
                <FiLoader size={30} className="animate-spin text-white" />
            </Html>}>
                {glbUrl && (
                    <ModelWithDecals
                        glbUrl={glbUrl}
                        logos={logos}
                        texts={texts}
                        assetSelection={assetSelection}
                        bgColor={bgColor}
                    />
                )}
                <Environment preset="studio" />
            </Suspense>

            <OrbitControls
                enablePan={false}
                enableZoom={true}
                enableRotate={true}

                // ---- horizontal (azimuth) ----
                minAzimuthAngle={-Infinity}
                maxAzimuthAngle={Infinity}

                // ---- vertical (polar) ----
                minPolarAngle={Math.PI / 2 - (15 * Math.PI / 180)}
                maxPolarAngle={Math.PI / 2 + (15 * Math.PI / 180)}

                enableDamping
                dampingFactor={0.1}
            />
        </Canvas>
    )
}
