import React, { useEffect, useRef, useCallback } from "react";
import { FilterId, getLipColor } from "./filterDefs";

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  filter: FilterId;
  width: number;
  height: number;
}

const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const LIP_OUTER = [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185];
const LIP_INNER = [78,95,88,178,87,14,317,402,318,324,308,415,310,311,312,13,82,81,80,191];

const L_EYE = [33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7];
const R_EYE = [362,398,384,385,386,387,388,466,263,249,390,373,374,380,381,382];
const L_BROW = [70,63,105,66,107,55,65,52,53,46];
const R_BROW = [300,293,334,296,336,285,295,282,283,276];

const L_CHEEK_CENTER = 116;
const R_CHEEK_CENTER = 345;
const NOSE_TIP = 4;
const FOREHEAD = 10;

export default function FaceFilterOverlay({ videoRef, filter, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const loadingRef = useRef(false);

  const getLandmarkPt = useCallback((landmarks: any[], idx: number) => ({
    x: landmarks[idx].x * width,
    y: landmarks[idx].y * height,
  }), [width, height]);

  const drawFilter = useCallback((
    ctx: CanvasRenderingContext2D,
    landmarks: any[],
    activeFilter: FilterId
  ) => {
    ctx.clearRect(0, 0, width, height);
    if (activeFilter === "normal") return;

    const pt = (i: number) => getLandmarkPt(landmarks, i);
    const isLip = activeFilter.startsWith("lipstick");

    if (isLip) {
      const lipColor = getLipColor(activeFilter);
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.82;

      ctx.beginPath();
      const outerPts = LIP_OUTER.map(pt);
      ctx.moveTo(outerPts[0].x, outerPts[0].y);
      outerPts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = lipColor.replace("rgba(", "rgb(").replace(/,[\d.]+\)/, ")");
      ctx.fill();

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      outerPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = lipColor;
      ctx.fill();

      ctx.restore();
    }

    if (activeFilter === "blush") {
      const drawBlush = (cx: number, cy: number) => {
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 45);
        grad.addColorStop(0, "rgba(240,90,140,0.42)");
        grad.addColorStop(1, "rgba(240,90,140,0)");
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 50, 32, -0.2, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
      };
      const l = pt(L_CHEEK_CENTER);
      const r = pt(R_CHEEK_CENTER);
      drawBlush(l.x, l.y);
      drawBlush(r.x, r.y);
    }

    if (activeFilter === "sunglasses") {
      const getEyeBounds = (indices: number[]) => {
        const pts = indices.map(pt);
        const xs = pts.map(p => p.x);
        const ys = pts.map(p => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, cx: (minX+maxX)/2, cy: (minY+maxY)/2 };
      };
      const le = getEyeBounds(L_EYE);
      const re = getEyeBounds(R_EYE);

      const pad = 12;
      const frameTop = Math.min(le.y, re.y) - pad;
      const frameBot = Math.max(le.y+le.h, re.y+re.h) + pad;
      const frameH = frameBot - frameTop;

      const drawLens = (b: typeof le) => {
        ctx.save();
        const rw = b.w / 2 + pad;
        const rh = frameH / 2;
        const grad = ctx.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, rw);
        grad.addColorStop(0, "rgba(10,10,40,0.88)");
        grad.addColorStop(1, "rgba(5,5,25,0.95)");
        ctx.beginPath();
        ctx.ellipse(b.cx, b.cy, rw, rh, 0, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = "rgba(200,200,220,0.55)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      };

      drawLens(le);
      drawLens(re);

      ctx.save();
      ctx.strokeStyle = "rgba(180,180,200,0.6)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(le.cx + le.w/2 + pad, le.cy);
      ctx.lineTo(re.cx - re.w/2 - pad, re.cy);
      ctx.stroke();
      ctx.restore();
    }

    if (activeFilter === "beauty") {
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = "rgba(255,220,185,1)";
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    if (activeFilter === "vintage") {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "rgba(160,100,20,1)";
      ctx.fillRect(0, 0, width, height);
      const vgGrad = ctx.createRadialGradient(width/2, height/2, width*0.3, width/2, height/2, width*0.8);
      vgGrad.addColorStop(0, "rgba(0,0,0,0)");
      vgGrad.addColorStop(1, "rgba(0,0,0,0.45)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = vgGrad;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    if (activeFilter === "neon") {
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = "rgba(0,255,136,1)";
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = "rgba(0,255,136,0.9)";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(0,255,136,1)";
      ctx.shadowBlur = 8;

      const contourGroups = [LIP_OUTER, L_EYE, R_EYE, L_BROW, R_BROW];
      for (const group of contourGroups) {
        const pts = group.map(pt);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [width, height, getLandmarkPt]);

  useEffect(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    (async () => {
      try {
        const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });
        landmarkerRef.current = landmarker;
      } catch {
        loadingRef.current = false;
      }
    })();

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastTime = 0;

    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);

      const video = videoRef.current;
      if (!video || video.paused || video.readyState < 2) return;
      if (now - lastTime < 33) return;
      lastTime = now;

      const landmarker = landmarkerRef.current;
      if (!landmarker) {
        ctx.clearRect(0, 0, width, height);
        if (filter !== "normal") {
          ctx.save();
          ctx.globalAlpha = 0.15;
          ctx.fillStyle = "rgba(255,255,255,1)";
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
        }
        return;
      }

      try {
        const results = landmarker.detectForVideo(video, now);
        if (results.faceLandmarks?.length > 0) {
          drawFilter(ctx, results.faceLandmarks[0], filter);
        } else {
          ctx.clearRect(0, 0, width, height);
        }
      } catch {
        ctx.clearRect(0, 0, width, height);
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [filter, width, height, drawFilter, videoRef]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );
}
