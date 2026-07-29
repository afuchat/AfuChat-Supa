import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 500),
      setTimeout(() => setPhase(3), 900),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      {/* Animated gradient background */}
      <motion.div
        className="absolute inset-0 animate-gradient"
        style={{
          background: 'linear-gradient(135deg, #6C5CE7 0%, #00D9C0 50%, #FF6B9D 100%)',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.6 }}
      />

      {/* Floating orbs */}
      <motion.div
        className="absolute w-[30vw] h-[30vw] rounded-full blur-3xl opacity-40"
        style={{ background: 'radial-gradient(circle, #00D9C0, transparent)' }}
        initial={{ x: '-20vw', y: '-10vh', scale: 0 }}
        animate={{ x: '-10vw', y: '5vh', scale: 1 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.div
        className="absolute w-[25vw] h-[25vw] rounded-full blur-3xl opacity-30"
        style={{ background: 'radial-gradient(circle, #FF6B9D, transparent)' }}
        initial={{ x: '20vw', y: '10vh', scale: 0 }}
        animate={{ x: '15vw', y: '-5vh', scale: 1 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      />

      {/* Main content */}
      <div className="relative z-10 text-center px-[8vw]">
        {/* Logo / Brand mark */}
        <motion.div
          className="mb-[3vh]"
          initial={{ scale: 0, rotate: -180 }}
          animate={phase >= 1 ? { scale: 1, rotate: 0 } : { scale: 0, rotate: -180 }}
          transition={{ duration: 0.6, type: "spring", stiffness: 300, damping: 20 }}
        >
          <div className="w-[12vw] h-[12vw] mx-auto rounded-[2vw] bg-white shadow-2xl flex items-center justify-center">
            <span className="font-display font-bold text-[5vw] text-gradient-brand">A</span>
          </div>
        </motion.div>

        {/* Main headline */}
        <motion.h1
          className="font-display font-bold text-white mb-[2vh]"
          style={{ fontSize: 'clamp(2rem, 7vw, 8rem)', lineHeight: 0.95, letterSpacing: '-0.03em' }}
          initial={{ opacity: 0, y: '5vh' }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: '5vh' }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          AfuChat
        </motion.h1>

        {/* Subline */}
        <motion.p
          className="font-body font-medium text-white/90 max-w-[50vw] mx-auto"
          style={{ fontSize: 'clamp(1rem, 2vw, 2.5rem)' }}
          initial={{ opacity: 0, y: '3vh' }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: '3vh' }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          The all-in-one social app that connects, entertains, and empowers
        </motion.p>
      </div>

      {/* Character elements */}
      <motion.img
        src={`${import.meta.env.BASE_URL}images/character-1.png`}
        alt=""
        className="absolute bottom-[5vh] left-[5vw] w-[15vw] h-auto"
        initial={{ opacity: 0, y: '10vh', rotate: -10 }}
        animate={phase >= 2 ? { opacity: 1, y: 0, rotate: 0 } : { opacity: 0, y: '10vh', rotate: -10 }}
        transition={{ duration: 0.6, type: "spring", stiffness: 200, damping: 20, delay: 0.3 }}
      />
      <motion.img
        src={`${import.meta.env.BASE_URL}images/character-2.png`}
        alt=""
        className="absolute bottom-[5vh] right-[5vw] w-[15vw] h-auto"
        initial={{ opacity: 0, y: '10vh', rotate: 10 }}
        animate={phase >= 2 ? { opacity: 1, y: 0, rotate: 0 } : { opacity: 0, y: '10vh', rotate: 10 }}
        transition={{ duration: 0.6, type: "spring", stiffness: 200, damping: 20, delay: 0.4 }}
      />

      {/* Exit animation prep */}
      <motion.div
        className="absolute inset-0 bg-white"
        initial={{ scaleY: 0 }}
        exit={{ scaleY: 1 }}
        style={{ originY: 0 }}
        transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}
      />
    </div>
  );
}
