import React, { useEffect, useRef, useState } from 'react';

const GRID_COLS = 64;
const GRID_ROWS = 96;
const PIXEL_SIZE = 7;
const WIDTH = GRID_COLS * PIXEL_SIZE;
const HEIGHT = GRID_ROWS * PIXEL_SIZE;
const BRUSH_RADIUS = 9.5;

const LYRICS_TIMELINE = [
  { start: 0.0, end: 4.5, text: "So, please, please, please" },
  { start: 5.0, end: 7.5, text: "Let me, let me, let me" },
  { start: 8.0, end: 13.5, text: "Let me get what I want this time" },
];

export default function App() {
  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  const blocksRef = useRef([]);
  const prevMouseRef = useRef(null);
  const mousePosRef = useRef({ x: -100, y: -100, active: false });

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // ၁။ ပုံကို ဖတ်ယူပြီး 64x96 Pixel Blocks များ ဖန်တီးခြင်း
  useEffect(() => {
    const img = new Image();
    img.src = '/the_kiss.png';
    img.onload = () => {
      const offCanvas = document.createElement('canvas');
      offCanvas.width = GRID_COLS;
      offCanvas.height = GRID_ROWS;
      const offCtx = offCanvas.getContext('2d');
      offCtx.filter = 'contrast(130%) saturate(150%)';
      offCtx.drawImage(img, 0, 0, GRID_COLS, GRID_ROWS);

      const imgData = offCtx.getImageData(0, 0, GRID_COLS, GRID_ROWS).data;
      const blocks = [];

      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const idx = (r * GRID_COLS + c) * 4;
          const rVal = imgData[idx];
          const gVal = imgData[idx + 1];
          const bVal = imgData[idx + 2];
          const gray = Math.round(0.299 * rVal + 0.587 * gVal + 0.114 * bVal);

          blocks.push({
            c,
            r,
            baseX: c * PIXEL_SIZE,
            baseY: r * PIXEL_SIZE,
            x: c * PIXEL_SIZE,
            y: r * PIXEL_SIZE,
            vx: 0,
            vy: 0,
            origColor: [rVal, gVal, bVal],
            bwColor: [gray, gray, gray],
            paintStage: 0,
            paintedTarget: 0,
            currentBlend: 0,
            inCurrentStroke: false,
            isGold: rVal > 140 && gVal > 100 && bVal < 110,
            phase: Math.random() * Math.PI * 2,
          });
        }
      }
      blocksRef.current = blocks;
    };
  }, []);

  // ၂။ Four-Stage Painting စုတ်တံ Logic
  const paintStroke = (x0, y0, x1, y1) => {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.floor(dist / (PIXEL_SIZE * 0.4)));
    const touched = new Set();
    const stageBlends = { 1: 0.25, 2: 0.5, 3: 0.75, 4: 1.0 };

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = (x0 + (x1 - x0) * t) / PIXEL_SIZE;
      const py = (y0 + (y1 - y0) * t) / PIXEL_SIZE;

      blocksRef.current.forEach((b, index) => {
        const d = Math.hypot(b.c - px, b.r - py);
        if (d <= BRUSH_RADIUS) {
          touched.add(index);
          if (!b.inCurrentStroke) {
            b.inCurrentStroke = true;
            if (b.paintStage < 4) {
              b.paintStage += 1;
              b.paintedTarget = stageBlends[b.paintStage];
            }
          }
        }
      });
    }

    blocksRef.current.forEach((b, index) => {
      if (!touched.has(index)) b.inCurrentStroke = false;
    });
  };

  // ၃။ 60FPS Animation Loop
  useEffect(() => {
    let animId;
    const startTime = performance.now();

    const render = (now) => {
      const elapsed = (now - startTime) / 1000;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#121212';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      const { x: mx, y: my, active: mActive } = mousePosRef.current;

      blocksRef.current.forEach((b) => {
        if (Math.abs(b.paintedTarget - b.currentBlend) > 0.001) {
          b.currentBlend += (b.paintedTarget - b.currentBlend) * 0.14;
        }

        const floatX = Math.sin(elapsed * 1.8 + b.r * 0.15 + b.phase * 0.2) * 0.7;
        const floatY = Math.cos(elapsed * 2.2 + b.c * 0.15 + b.phase * 0.2) * 1.0;
        const targetX = b.baseX + floatX;
        const targetY = b.baseY + floatY;

        if (mActive) {
          const dx = b.x + PIXEL_SIZE / 2 - mx;
          const dy = b.y + PIXEL_SIZE / 2 - my;
          const d = Math.hypot(dx, dy);
          if (d > 0 && d < 28) {
            const force = ((28 - d) / 28) * 1.65;
            b.vx += (dx / d) * force;
            b.vy += (dy / d) * force;
          }
        }

        b.vx = (b.vx + (targetX - b.x) * 0.1) * 0.8;
        b.vy = (b.vy + (targetY - b.y) * 0.1) * 0.8;
        b.x += b.vx;
        b.y += b.vy;

        let [r, g, bCol] = b.origColor;
        if (b.isGold && b.currentBlend > 0.6) {
          const shimmer = Math.sin(elapsed * 4.5 + b.phase);
          if (shimmer > 0.4) {
            const boost = (shimmer - 0.4) * 65 * b.currentBlend;
            r = Math.min(255, r + boost);
            g = Math.min(255, g + boost);
            bCol = Math.min(255, bCol + boost * 0.5);
          }
        }

        const [bwR, bwG, bwB] = b.bwColor;
        const finalR = Math.round(bwR + (r - bwR) * b.currentBlend);
        const finalG = Math.round(bwG + (g - bwG) * b.currentBlend);
        const finalB = Math.round(bwB + (bCol - bwB) * b.currentBlend);

        ctx.fillStyle = `rgb(${finalR}, ${finalG}, ${finalB})`;
        ctx.fillRect(b.x, b.y, PIXEL_SIZE, PIXEL_SIZE);
      });

      // ၄။ Synced Fading Lyrics
      if (audioRef.current && !audioRef.current.paused) {
        const currentSec = audioRef.current.currentTime;
        const activeLyric = LYRICS_TIMELINE.find(
          (l) => currentSec >= l.start && currentSec <= l.end
        );
        if (activeLyric) {
          let alpha = 1.0;
          if (currentSec - activeLyric.start < 0.5) {
            alpha = (currentSec - activeLyric.start) / 0.5;
          } else if (activeLyric.end - currentSec < 0.5) {
            alpha = (activeLyric.end - currentSec) / 0.5;
          }

          ctx.save();
          ctx.font = 'italic 18px Georgia';
          ctx.textAlign = 'center';
          const textWidth = ctx.measureText(activeLyric.text).width;

          ctx.fillStyle = `rgba(15, 15, 15, ${alpha * 0.75})`;
          ctx.fillRect(WIDTH / 2 - textWidth / 2 - 12, HEIGHT - 48, textWidth + 24, 30);

          ctx.fillStyle = `rgba(245, 245, 245, ${alpha})`;
          ctx.fillText(activeLyric.text, WIDTH / 2, HEIGHT - 27);
          ctx.restore();
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  // ဖုန်း Screen အရွယ်အစား ပြောင်းလဲသော်လည်း ထိတွေ့နေရာ အတိအကျရစေရန် တွက်ချက်ခြင်း
  const handlePointerMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // ဖုန်း Screen ကို စတင်ထိလိုက်သည်နှင့် သီချင်းစဖွင့်ခြင်း
    if (!isPlaying && audioRef.current) {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }

    mousePosRef.current = { x, y, active: true };
    if (prevMouseRef.current) {
      paintStroke(prevMouseRef.current.x, prevMouseRef.current.y, x, y);
    } else {
      paintStroke(x, y, x, y);
    }
    prevMouseRef.current = { x, y };
  };

  const handlePointerEnd = () => {
    mousePosRef.current.active = false;
    prevMouseRef.current = null;
  };

  const handleReset = () => {
    blocksRef.current.forEach((b) => {
      b.paintStage = 0;
      b.paintedTarget = 0;
      b.currentBlend = 0;
      b.inCurrentStroke = false;
    });
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#0e0e0e', minHeight: '100vh', justifyContent: 'center', padding: '16px', boxSizing: 'border-box', color: '#fff', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      <audio ref={audioRef} src="/music.wav" loop muted={isMuted} playsInline />
      
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        style={{
          width: '100%',
          maxWidth: `${WIDTH}px`,
          height: 'auto',
          borderRadius: '8px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.8)',
          cursor: 'crosshair',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
        onPointerDown={handlePointerMove}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      />

      <div style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
        <button onClick={handleReset} style={btnStyle}>Reset</button>
        <button onClick={() => setIsMuted(!isMuted)} style={btnStyle}>
          {isMuted ? 'Unmute' : 'Mute'}
        </button>
      </div>
    </div>
  );
}

const btnStyle = {
  padding: '10px 20px',
  background: '#222',
  color: '#f5d061',
  border: '1px solid #444',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '15px',
};
