"use client";

import React, { useEffect, useRef, useState } from "react";
// @ts-ignore
import Pose from "@mediapipe/pose/pose";

type Camera = any;

/** Tipo de resultado que nos provee MediaPipe Pose. */
type Results = {
  image:
    | HTMLCanvasElement
    | HTMLImageElement
    | HTMLVideoElement
    | ImageBitmap
    | GpuBuffer;
  poseLandmarks?: {
    x: number;
    y: number;
    z: number;
    visibility?: number;
  }[];
};

/** Estructura para el búfer de la GPU (dimensiones). */
interface GpuBuffer {
  width: number;
  height: number;
}

/** Secuencia de Surya Namaskar A (Ashtanga) */
const SURYA_A_SEQUENCE = [
  "Tadasana",
  "Urdhva Hastasana",
  "Uttanasana",
  "Ardha Uttanasana",
  "Chaturanga",
  "Urdhva Mukha Svanasana",
  "Adho Mukha Svanasana",
  "Ardha Uttanasana",
  "Uttanasana",
  "Urdhva Hastasana",
  "Tadasana"
];

/** Estructura para historial de detecciones */
type PoseHistory = {
  pose: string;
  timestamp: Date;
  isCorrect: boolean;
};

export default function HomePage() {
  /** Referencias al video y al canvas donde dibujaremos. */
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /** Estados para Pose y Camera (MediaPipe). */
  const [poseDetector, setPoseDetector] = useState<typeof Pose | null>(null);
  const [camera, setCamera] = useState<Camera | null>(null);

  /** Índice de secuencia, repeticiones, postura actual. */
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [repetitions, setRepetitions] = useState(0);
  const [currentPose, setCurrentPose] = useState("None");

  /** Estados para dispositivos de video y start/stop del análisis. */
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [isStarted, setIsStarted] = useState(false);

  /** Historial de posturas detectadas. */
  const [poseHistory, setPoseHistory] = useState<PoseHistory[]>([]);

  /**
   * 1) Al montar, pedimos acceso a la cámara y listamos dispositivos.
   */
  useEffect(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      console.error("La API de mediaDevices no está disponible en este navegador.");
      return;
    }

    // Primero pedimos permisos de la cámara
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        // Paramos el stream una vez conseguidos los permisos
        stream.getTracks().forEach((track) => track.stop());
        // Ahora enumeramos dispositivos
        return navigator.mediaDevices.enumerateDevices();
      })
      .then((devices) => {
        const videoDevices = devices.filter(
          (device) => device.kind === "videoinput"
        );
        console.log("Cámaras disponibles:", videoDevices);
        setDevices(videoDevices);
        if (videoDevices.length > 0) {
          // Seleccionamos la primera por defecto
          setSelectedDevice(videoDevices[0].deviceId);
        }
      })
      .catch((err) => {
        console.error("Error al obtener acceso o enumerar la cámara:", err);
      });
  }, []);

  /**
   * 2) Inicializamos MediaPipe Pose (asincrónicamente).
   */
  useEffect(() => {
    if (typeof window !== "undefined") {
      import("@mediapipe/pose").then(({ Pose }) => {
        const pose = new Pose({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });
        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        pose.onResults(onResults);
        setPoseDetector(pose);
      });
    }
  }, []);

  /**
   * 3) Encendemos la cámara y vinculamos con el poseDetector cuando el usuario hace "Iniciar".
   */
  useEffect(() => {
    if (poseDetector && !camera && isStarted && selectedDevice) {
      const videoElement = videoRef.current;
      const canvasElement = canvasRef.current;

      if (videoElement && canvasElement) {
        const constraints = {
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user", // o "environment" si quieres usar la cámara trasera
            deviceId: { exact: selectedDevice }
          }
        };

        navigator.mediaDevices
          .getUserMedia(constraints)
          .then((stream) => {
            videoElement.srcObject = stream;

            // Esperamos a que el video tenga metadata (resolución, etc.)
            return new Promise((resolve) => {
              videoElement.onloadedmetadata = () => {
                canvasElement.width = videoElement.videoWidth;
                canvasElement.height = videoElement.videoHeight;
                resolve(stream);
              };
            });
          })
          .then(() => {
            // Creamos la "cámara virtual" de MediaPipe, que procesa frames y se los pasa al poseDetector
            return import("@mediapipe/camera_utils").then(({ Camera }) => {
              const newCamera = new Camera(videoElement, {
                onFrame: async () => {
                  if (poseDetector) {
                    await poseDetector.send({ image: videoElement });
                  }
                },
                width: 640,
                height: 480
              });
              newCamera.start();
              setCamera(newCamera);
            });
          })
          .catch((err) => {
            console.error("Error al configurar la cámara:", err);
          });
      }
    }

    // Limpieza al desmontar o cambiar de cámara
    return () => {
      if (camera) camera.stop();
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [poseDetector, camera, selectedDevice, isStarted]);

  /**
   * 4) onResults se llama cada vez que MediaPipe encuentra landmarks en un frame.
   */
  function onResults(results: Results) {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;

    const canvasCtx = canvasElement.getContext("2d");
    if (!canvasCtx) return;

    // Limpiamos el canvas en cada frame
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Dibujamos la imagen de fondo
    if (
      results.image instanceof HTMLCanvasElement ||
      results.image instanceof HTMLImageElement ||
      results.image instanceof HTMLVideoElement ||
      results.image instanceof ImageBitmap
    ) {
      canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    }

    // Si hay landmarks, dibujamos y detectamos la pose
    if (results.poseLandmarks) {
      drawConnections(canvasCtx, results.poseLandmarks, canvasElement);
      drawLandmarks(canvasCtx, results.poseLandmarks, canvasElement);

      const detectedPose = detectPoseName(results.poseLandmarks, canvasElement.width, canvasElement.height);
      setCurrentPose(detectedPose);
      updateSequence(detectedPose);
    }

    canvasCtx.restore();
  }

  /**
   * Dibuja los landmarks (puntos) en el canvas.
   */
  function drawLandmarks(
    ctx: CanvasRenderingContext2D,
    landmarks: Results["poseLandmarks"],
    canvas: HTMLCanvasElement
  ) {
    if (!landmarks) return;
    ctx.fillStyle = "red";
    for (let i = 0; i < landmarks.length; i++) {
      const { x, y } = landmarks[i];
      ctx.beginPath();
      ctx.arc(x * canvas.width, y * canvas.height, 5, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  /**
   * Dibuja conexiones básicas entre hombros, codos, etc.
   */
  function drawConnections(
    ctx: CanvasRenderingContext2D,
    landmarks: Results["poseLandmarks"],
    canvas: HTMLCanvasElement
  ) {
    if (!landmarks) return;

    const connections = [
      [11, 13, 15], // Brazo izquierdo
      [12, 14, 16], // Brazo derecho
      [23, 25, 27], // Pierna izquierda
      [24, 26, 28], // Pierna derecha
      [11, 12], // Conexión hombros
      [23, 24], // Conexión caderas
      [11, 23], // Lado izquierdo tronco
      [12, 24]  // Lado derecho tronco
    ];

    ctx.strokeStyle = "yellow";
    ctx.lineWidth = 2;
    connections.forEach((triplet) => {
      ctx.beginPath();
      triplet.forEach((idx, i) => {
        const point = landmarks[idx];
        if (!point) return;
        const x = point.x * canvas.width;
        const y = point.y * canvas.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
  }

  /**
   * Función para calcular ángulo entre 3 puntos (a, b, c).
   * b es el vértice donde medimos el ángulo.
   */
  function calculateAngle(a: any, b: any, c: any) {
    if (!a || !b || !c) return 0;
    const radians =
      Math.atan2(c.y - b.y, c.x - b.x) -
      Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180) / Math.PI);
    if (angle > 180) angle = 360 - angle;
    return angle;
  }

  /**
   * Función principal para detectar las posturas con un enfoque "de perfil".
   * Ajustar tolerancias según resultados.
   */
  function detectPoseName(
    landmarks: Results["poseLandmarks"],
    canvasWidth: number,
    canvasHeight: number
  ): string {
    if (!landmarks) return "Unknown";

    // Nombres de landmarks
    const LS = landmarks[11]; // Left Shoulder
    const RS = landmarks[12]; // Right Shoulder
    const LE = landmarks[13]; // Left Elbow
    const RE = landmarks[14]; // Right Elbow
    const LW = landmarks[15]; // Left Wrist
    const RW = landmarks[16]; // Right Wrist
    const LH = landmarks[23]; // Left Hip
    const RH = landmarks[24]; // Right Hip
    const LK = landmarks[25]; // Left Knee
    const RK = landmarks[26]; // Right Knee
    const LA = landmarks[27]; // Left Ankle
    const RA = landmarks[28]; // Right Ankle
    const NOSE = landmarks[0]; // Nose

    // Ángulos principales
    const leftElbowAngle = calculateAngle(LS, LE, LW);
    const rightElbowAngle = calculateAngle(RS, RE, RW);
    const leftShoulderAngle = calculateAngle(LH, LS, LE);
    const rightShoulderAngle = calculateAngle(RH, RS, RE);
    const leftHipAngle = calculateAngle(LS, LH, LK);
    const rightHipAngle = calculateAngle(RS, RH, RK);
    const leftKneeAngle = calculateAngle(LH, LK, LA);
    const rightKneeAngle = calculateAngle(RH, RK, RA);

    // Helper de rango
    const inRange = (val: number, target: number, tol = 25) =>
      Math.abs(val - target) <= tol;

    // Verificar si la persona está de perfil
    const isProfileView = Math.abs(LS.x - RS.x) < 0.2;

    // Tadasana (postura de pie erguido)
    if (
      inRange(leftElbowAngle, 180, 25) &&
      inRange(rightElbowAngle, 180, 25) &&
      inRange(leftShoulderAngle, 40, 35) && // hombro relajado
      inRange(rightShoulderAngle, 40, 35) &&
      inRange(leftHipAngle, 180, 30) &&
      inRange(rightHipAngle, 180, 30) &&
      inRange(leftKneeAngle, 180, 25) &&
      inRange(rightKneeAngle, 180, 25)
    ) {
      return "Tadasana";
    }

    // Urdhva Hastasana (brazos elevados)
    if (
      inRange(leftShoulderAngle, 180, 35) &&
      inRange(rightShoulderAngle, 180, 35) &&
      inRange(leftElbowAngle, 180, 25) &&
      inRange(rightElbowAngle, 180, 25) &&
      inRange(leftKneeAngle, 180, 25) &&
      inRange(rightKneeAngle, 180, 25)
    ) {
      return "Urdhva Hastasana";
    }

    // Uttanasana (flexión hacia adelante)
    if (
      inRange(leftHipAngle, 90, 30) &&
      inRange(rightHipAngle, 90, 30) &&
      inRange(leftKneeAngle, 180, 25) &&
      inRange(rightKneeAngle, 180, 25)
    ) {
      return "Uttanasana";
    }

    // Ardha Uttanasana (media flexión)
    if (
      inRange(leftHipAngle, 90, 40) &&
      inRange(rightHipAngle, 90, 40) &&
      inRange(leftKneeAngle, 180, 25) &&
      inRange(rightKneeAngle, 180, 25) &&
      // hombro algo elevado (aprox 90°).
      (inRange(leftShoulderAngle, 90, 45) || inRange(rightShoulderAngle, 90, 45))
    ) {
      return "Ardha Uttanasana";
    }

    // Chaturanga (vista de perfil)
    if (
      isProfileView &&
      inRange(leftElbowAngle, 90, 30) &&
      inRange(rightElbowAngle, 90, 30) &&
      Math.abs(LS.y - RH.y) < 0.15 && // Cuerpo horizontal
      RH.y > RK.y && // Cuerpo por encima de las rodillas
      NOSE.y < LS.y // Mirada al frente
    ) {
      return "Chaturanga";
    }

    // Urdhva Mukha Svanasana (vista de perfil)
    if (
      isProfileView &&
      inRange(leftElbowAngle, 165, 30) &&
      inRange(rightElbowAngle, 165, 30) &&
      RH.y > LS.y && // Caderas bajas
      RK.y > RH.y && // Rodillas más bajas que caderas
      NOSE.y < LS.y // Mirada hacia arriba
    ) {
      return "Urdhva Mukha Svanasana";
    }

    // Adho Mukha Svanasana (vista de perfil)
    if (
      isProfileView &&
      inRange(leftElbowAngle, 180, 30) &&
      inRange(rightElbowAngle, 180, 30) &&
      RH.y < LS.y && // Caderas elevadas
      RH.y > RK.y && // Forma de V invertida
      NOSE.y > LS.y // Mirada hacia abajo
    ) {
      return "Adho Mukha Svanasana";
    }

    return "Unknown";
  }

  /**
   * 5) Actualiza la secuencia según la pose detectada.
   *    Lleva conteo de repeticiones y el índice de la secuencia.
   */
  function updateSequence(detectedPose: string) {
    if (detectedPose === "Unknown") return;

    const expectedPose = SURYA_A_SEQUENCE[sequenceIndex];
    const isCorrect = detectedPose === expectedPose;

    // Actualizamos historial
    setPoseHistory((prev) =>
      [
        ...prev,
        {
          pose: detectedPose,
          timestamp: new Date(),
          isCorrect
        }
      ].slice(-10) // Máximo 10 entradas
    );

    // Si la pose actual coincide con la esperada en la secuencia
    if (isCorrect) {
      let confirmCount = 0;
      const needed = 10; // frames que se necesitan para "confirmar" la postura

      const interval = setInterval(() => {
        if (currentPose === expectedPose) {
          confirmCount++;
          if (confirmCount >= needed) {
            clearInterval(interval);
            const nextIndex = sequenceIndex + 1;
            // Si llegamos al final de la secuencia
            if (nextIndex >= SURYA_A_SEQUENCE.length) {
              setRepetitions((r) => r + 1);
              setSequenceIndex(0);
              // Vibramos un poco si el navegador lo soporta
              if ("vibrate" in navigator) {
                navigator.vibrate(200);
              }
            } else {
              setSequenceIndex(nextIndex);
            }
          }
        } else {
          clearInterval(interval);
        }
      }, 50);
    }
  }

  /**
   * Función para traducir nombres de posturas a Sánscrito/Español.
   */
  function translatePoseName(
    pose: string
  ): { sanskrit: string; spanish: string } {
    const translations: { [key: string]: { sanskrit: string; spanish: string } } =
      {
        Tadasana: {
          sanskrit: "ताडासन (Tāḍāsana)",
          spanish: "Postura de la Montaña"
        },
        "Urdhva Hastasana": {
          sanskrit: "ऊर्ध्व हस्तासन (Ūrdhva Hastāsana)",
          spanish: "Brazos Elevados"
        },
        Uttanasana: {
          sanskrit: "उत्तानासन (Uttānāsana)",
          spanish: "Flexión Hacia Adelante"
        },
        "Ardha Uttanasana": {
          sanskrit: "अर्ध उत्तानासन (Ardha Uttānāsana)",
          spanish: "Media Flexión"
        },
        Chaturanga: {
          sanskrit: "चतुरङ्ग दण्डासन (Chaturanga Daṇḍāsana)",
          spanish: "Postura de Plancha"
        },
        "Urdhva Mukha Svanasana": {
          sanskrit: "ऊर्ध्व मुख श्वानासन (Ūrdhva Mukha Śvānāsana)",
          spanish: "Perro Mirando Hacia Arriba"
        },
        "Adho Mukha Svanasana": {
          sanskrit: "अधो मुख श्वानासन (Adho Mukha Śvānāsana)",
          spanish: "Perro Mirando Hacia Abajo"
        },
        Unknown: {
          sanskrit: "अज्ञात (Desconocida)",
          spanish: "Desconocida"
        }
      };
    return translations[pose] || { sanskrit: pose, spanish: pose };
  }

  /**
   * Cambio de cámara (dispositivo)
   */
  const handleDeviceChange = async (deviceId: string) => {
    // Detenemos la cámara actual
    if (camera) {
      camera.stop();
      setCamera(null);
    }
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setSelectedDevice(deviceId);

    // Si estamos en modo "iniciado", reiniciamos la cámara
    if (isStarted) {
      setIsStarted(false);
      setTimeout(() => setIsStarted(true), 100);
    }
  };

  /**
   * Botón Iniciar/Detener
   */
  const handleStartStop = () => {
    if (isStarted && camera) {
      camera.stop();
      setCamera(null);
    }
    setIsStarted(!isStarted);
  };

  return (
    <main className="min-h-screen bg-green-50 p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold text-center mb-6 sm:mb-8 text-green-800">
          Surya Namaskar A - Saludo al Sol
        </h1>

        {/* Grid principal */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 md:gap-8">
          {/* Panel Izquierdo: Cámara y Controles */}
          <div className="space-y-4">
            {/* Controles de Cámara */}
            <div className="bg-white rounded-xl shadow-lg p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={selectedDevice}
                  onChange={(e) => handleDeviceChange(e.target.value)}
                  className="flex-1 px-3 py-2 border border-green-200 rounded-lg text-sm sm:text-base focus:ring-green-500 focus:border-green-500"
                  disabled={isStarted}
                >
                  {devices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Cámara ${device.deviceId}`}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleStartStop}
                  className={`px-4 py-2 rounded-lg font-medium text-white transition-colors
                    ${isStarted 
                      ? "bg-red-500 hover:bg-red-600" 
                      : "bg-green-600 hover:bg-green-700"
                    }`}
                >
                  {isStarted ? "Detener" : "Iniciar"}
                </button>
              </div>
            </div>

            {/* Vista de Cámara */}
            <div className="bg-white rounded-xl shadow-lg p-4">
              <div className="relative aspect-[4/3] bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  style={{ display: "none" }}
                  autoPlay
                  playsInline
                />
                <canvas ref={canvasRef} className="w-full h-full" />
              </div>
            </div>
          </div>

          {/* Panel Derecho: Estado y Progreso */}
          <div className="space-y-4">
            {/* Progreso General */}
            <div className="bg-white rounded-xl shadow-lg p-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
                <h2 className="text-xl font-semibold text-green-800">
                  Progreso
                </h2>
                <div className="flex items-center gap-2 text-green-700">
                  <span className="text-2xl font-bold">{repetitions}</span>
                  <span className="text-sm">Saludos Completados</span>
                </div>
              </div>
              
              {/* Barra de Progreso */}
              <div className="space-y-2">
                <div className="w-full bg-green-100 rounded-full h-3">
                  <div
                    className="bg-green-600 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${(sequenceIndex / SURYA_A_SEQUENCE.length) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-sm text-green-700">
                  <span>Postura {sequenceIndex + 1}</span>
                  <span>Total {SURYA_A_SEQUENCE.length}</span>
                </div>
              </div>
            </div>

            {/* Posturas Actual y Siguiente */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Postura Actual */}
              <div className="bg-green-100 rounded-xl shadow-lg p-4">
                <h3 className="text-sm font-medium text-green-800 mb-1">
                  Postura Actual
                </h3>
                <p className="text-lg font-bold text-green-900">
                  {translatePoseName(currentPose).sanskrit}
                </p>
                <p className="text-sm text-green-700">
                  {translatePoseName(currentPose).spanish}
                </p>
              </div>

              {/* Siguiente Postura */}
              <div className="bg-green-50 rounded-xl shadow-lg p-4">
                <h3 className="text-sm font-medium text-green-700 mb-1">
                  Siguiente Postura
                </h3>
                <p className="text-lg font-bold text-green-800">
                  {translatePoseName(
                    SURYA_A_SEQUENCE[(sequenceIndex + 1) % SURYA_A_SEQUENCE.length]
                  ).sanskrit}
                </p>
                <p className="text-sm text-green-600">
                  {translatePoseName(
                    SURYA_A_SEQUENCE[(sequenceIndex + 1) % SURYA_A_SEQUENCE.length]
                  ).spanish}
                </p>
              </div>
            </div>

            {/* Historial */}
            <div className="bg-white rounded-xl shadow-lg p-4">
              <h2 className="text-xl font-semibold text-green-800 mb-4">
                Posturas Completadas
              </h2>
              <div className="space-y-2 max-h-[40vh] overflow-y-auto scrollbar-thin scrollbar-thumb-green-200 scrollbar-track-green-50">
                {poseHistory.slice().reverse().map((entry, index) => (
                  <div
                    key={index}
                    className="bg-green-50 rounded-lg p-3 border border-green-100"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-green-800 truncate">
                          {translatePoseName(entry.pose).sanskrit}
                        </p>
                        <p className="text-sm text-green-600 truncate">
                          {translatePoseName(entry.pose).spanish}
                        </p>
                      </div>
                      <span className="text-xs text-green-500 whitespace-nowrap">
                        {entry.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
