"use client";  // Para usar Hooks y APIs del navegador en Next.js 13 (App Router)

import React, { useEffect, useRef, useState } from "react";
//import { Pose as Pose, Results } from "@mediapipe/pose/pose";
// @ts-ignore
import Pose from "@mediapipe/pose/pose";
type Camera = any; // Podrías crear tu propia definición en lugar de 'any'

// Actualizar la definición del tipo Results
type Results = {
  image: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement | ImageBitmap | GpuBuffer;
  poseLandmarks?: {
    x: number;
    y: number;
    z: number;
    visibility?: number;
  }[];
};

// También necesitamos definir GpuBuffer ya que no está disponible globalmente
interface GpuBuffer {
  width: number;
  height: number;
}

// 1. Definimos la secuencia de Surya Namaskar A (versión simplificada)
const SURYA_A_SEQUENCE = [
  "Samasthiti", 
  "Urdhva Vriksasana", 
  "Uttanasana",
  "Ardha Uttanasana",
  "Chaturanga Dandasana",
  "Urdhva Mukha Svanasana",
  "Adho Mukha Svanasana",
  "Ardha Uttanasana",
  "Uttanasana",
  "Urdhva Vriksasana",
  "Samasthiti"
];

export default function HomePage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [poseDetector, setPoseDetector] = useState<typeof Pose | null>(null);
  const [camera, setCamera] = useState<Camera | null>(null);

  // Estados para la secuencia y conteo
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [repetitions, setRepetitions] = useState(0);
  const [currentPose, setCurrentPose] = useState("None");

  // Agregar nuevos estados
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [isStarted, setIsStarted] = useState(false);

  // Agregar efecto para obtener las cámaras disponibles
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices()
      .then(devices => {
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setDevices(videoDevices);
        if (videoDevices.length > 0) {
          setSelectedDevice(videoDevices[0].deviceId);
        }
      });
  }, []);

  // 2. Inicializar MediaPipe Pose
  useEffect(() => {
    if (typeof window !== "undefined") {
      import("@mediapipe/pose").then(({ Pose }) => {
        const pose = new Pose({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
        });

        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        pose.onResults(onResults);
        setPoseDetector(pose);
      });
    }
  }, []);

  // Modificar el efecto de la cámara para manejar mejor el dispositivo seleccionado
  useEffect(() => {
    if (poseDetector && !camera && isStarted && selectedDevice) {
      const videoElement = videoRef.current;
      const canvasElement = canvasRef.current;

      if (videoElement && canvasElement) {
        // Primero obtener el stream específico para el dispositivo seleccionado
        navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: selectedDevice },
            width: 640,
            height: 480
          }
        }).then((stream) => {
          videoElement.srcObject = stream;
          videoElement.addEventListener("loadedmetadata", () => {
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
          });

          import("@mediapipe/camera_utils").then(({ Camera }) => {
            const newCamera = new Camera(videoElement, {
              onFrame: async () => {
                if (poseDetector) {
                  await poseDetector.send({ image: videoElement });
                }
              },
              width: 640,
              height: 480,
            });
            newCamera.start();
            setCamera(newCamera);
          });
        }).catch(err => {
          console.error("Error accessing camera:", err);
        });
      }
    }

    // Cleanup function
    return () => {
      if (camera) {
        camera.stop();
      }
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [poseDetector, camera, selectedDevice, isStarted]);

  // 4. Función onResults: callback de MediaPipe
  function onResults(results: Results) {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;

    const canvasCtx = canvasElement.getContext("2d");
    if (!canvasCtx) return;

    // Dibujar la imagen en el canvas
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Asegurarnos de que la imagen sea de un tipo compatible con drawImage
    if (results.image instanceof HTMLCanvasElement ||
        results.image instanceof HTMLImageElement ||
        results.image instanceof HTMLVideoElement ||
        results.image instanceof ImageBitmap) {
      canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    }

    // Si hay landmarks, los dibujamos y detectamos la postura
    if (results.poseLandmarks) {
      drawLandmarks(canvasCtx, results.poseLandmarks, canvasElement);
      const poseName = detectPoseName(results.poseLandmarks, canvasElement.width, canvasElement.height);
      setCurrentPose(poseName);
      
      // Actualizar secuencia
      updateSequence(poseName);
    }

    canvasCtx.restore();
  }

  // 5. Dibujo de landmarks en el canvas
  function drawLandmarks(
    ctx: CanvasRenderingContext2D,
    landmarks: Results["poseLandmarks"],
    canvas: HTMLCanvasElement
  ) {
    if (!landmarks) return;
    ctx.fillStyle = "red";

    // Dibuja un círculo en cada landmark
    for (let i = 0; i < landmarks.length; i++) {
      const { x, y } = landmarks[i];
      const px = x * canvas.width;
      const py = y * canvas.height;

      ctx.beginPath();
      ctx.arc(px, py, 5, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  // 6. Función para detectar el nombre de la postura actual
  function detectPoseName(
    landmarks: Results["poseLandmarks"],
    canvasWidth: number,
    canvasHeight: number
  ): string {
    if (!landmarks) return "Unknown";

    // Aquí podrías calcular ángulos y distancias
    // Ejemplo: detección muy simple usando cadera/hombros
    const leftShoulder = landmarks[11];  // PoseLandmark.LEFT_SHOULDER = 11
    const rightShoulder = landmarks[12]; // PoseLandmark.RIGHT_SHOULDER = 12
    const leftHip = landmarks[23];      // PoseLandmark.LEFT_HIP = 23
    const rightHip = landmarks[24];     // PoseLandmark.RIGHT_HIP = 24

    // Distancia horizontal entre hombros
    const shoulderDist = Math.abs(leftShoulder.x - rightShoulder.x);

    // Distancia vertical hombro-cadera
    const torsoHeight = Math.abs(leftShoulder.y - leftHip.y);

    // Un ejemplo: si hombros están muy juntos y caderas y hombros están a la misma altura,
    // podríamos inferir algo como Samasthiti
    // ¡Estos valores son 100% arbitrarios para la DEMO!
    if (shoulderDist < 0.03 && torsoHeight > 0.2) {
      return "Samasthiti";
    }
    // Ejemplo: si hombros muy separados y cadera a menor Y (brazo alzado)
    else if (shoulderDist > 0.06 && torsoHeight < 0.15) {
      return "Urdhva Vriksasana";
    }
    // etc. 
    // Añade más funciones o reglas para Uttanasana, Chaturanga, etc.
    // Normalmente usarías "calculateAngle" para hombro-codo-muñeca, cadera-rodilla-tobillo, etc.

    return "Unknown";
  }

  // 7. Lógica para actualizar la secuencia y contar repeticiones
  function updateSequence(currentDetectedPose: string) {
    // Si la postura detectada coincide con la que esperamos en SURYA_A_SEQUENCE[sequenceIndex]
    if (currentDetectedPose === SURYA_A_SEQUENCE[sequenceIndex]) {
      // Avanzar al siguiente
      const nextIndex = sequenceIndex + 1;
      // Si llegamos al final de la secuencia, incrementamos repeticiones y volvemos a 0
      if (nextIndex >= SURYA_A_SEQUENCE.length) {
        setRepetitions((prev) => prev + 1);
        setSequenceIndex(0);
      } else {
        setSequenceIndex(nextIndex);
      }
    }
  }

  // Función actualizada para cambiar de cámara
  const handleDeviceChange = async (deviceId: string) => {
    // Detener la cámara actual si existe
    if (camera) {
      camera.stop();
      setCamera(null);
    }
    
    // Detener el stream de video actual si existe
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }

    setSelectedDevice(deviceId);

    // Si estamos en modo iniciado, reiniciamos la cámara automáticamente
    if (isStarted) {
      setIsStarted(false);
      setTimeout(() => setIsStarted(true), 100);
    }
  };

  // Función para iniciar/detener
  const handleStartStop = () => {
    if (isStarted && camera) {
      camera.stop();
      setCamera(null);
    }
    setIsStarted(!isStarted);
  };

  return (
    <main className="w-full h-screen flex flex-col items-center justify-center">
      <h1 className="text-2xl mb-4">Surya Namaskar A (Next 13 + TS + MediaPipe)</h1>

      <div className="mb-4 flex gap-4 items-center">
        <select 
          value={selectedDevice}
          onChange={(e) => handleDeviceChange(e.target.value)}
          className="p-2 border rounded"
          disabled={isStarted}
        >
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Camera ${device.deviceId}`}
            </option>
          ))}
        </select>

        <button
          onClick={handleStartStop}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          {isStarted ? 'Stop' : 'Start'}
        </button>
      </div>

      <div className="mb-2">
        <p>Current Pose: <strong>{currentPose}</strong></p>
        <p>Sequence step: {sequenceIndex} / {SURYA_A_SEQUENCE.length - 1}</p>
        <p>Repetitions: {repetitions}</p>
      </div>

      {/* Contenedor relativo para superponer canvas sobre video */}
      <div style={{ position: "relative" }}>
        <video
          ref={videoRef}
          style={{ display: "none" }}
          autoPlay
          playsInline
        />
        <canvas ref={canvasRef} />
      </div>
    </main>
  );
}
