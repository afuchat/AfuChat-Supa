import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 700),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[#6C5CE7]">
      {/* Animated gradient pulses */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(circle at 30% 40%, #00D9C0 0%, transparent 50%), radial-gradient(circle at 70% 60%, #FF6B9D 0%, transparent 50%)',
        }}
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Center logo lockup */}
      <div className="relative z-10 flex flex-col items-center">
        {/* App icon */}
        <motion.div
          className="mb-[3vh]"
          initial={{ scale: 0, rotate: -180 }}
          animate={phase >= 1 ? { scale: 1, rotate: 0 } : { scale: 0, rotate: -180 }}
          transition={{ duration: 0.8, type: "spring", stiffness: 250, damping: 18 }}
        >
          <div className="w-[18vw] h-[18vw] rounded-[3vw] bg-white shadow-2xl flex items-center justify-center">
            <span className="font-display font-bold text-gradient-brand" style={{ fontSize: 'clamp(3rem, 8vw, 10rem)' }}>
              A
            </span>
          </div>
        </motion.div>

        {/* Brand name */}
        <motion.h1
          className="font-display font-bold text-white mb-[1vh]"
          style={{ fontSize: 'clamp(3rem, 7vw, 9rem)', letterSpacing: '-0.03em' }}
          initial={{ opacity: 0, y: '3vh' }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: '3vh' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          AfuChat
        </motion.h1>

        {/* Tagline */}
        <motion.p
          className="font-body font-medium text-white/90"
          style={{ fontSize: 'clamp(1rem, 2vw, 2.5rem)' }}
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Connect. Share. Thrive.
        </motion.p>
      </div>

      {/* Exit fade to first scene */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-[#6C5CE7] via-[#00D9C0] to-[#FF6B9D]"
        initial={{ opacity: 0 }}
        exit={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      />
    </div>
  );
}
