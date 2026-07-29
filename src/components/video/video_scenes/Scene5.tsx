import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 600),
      setTimeout(() => setPhase(3), 1100),
      setTimeout(() => setPhase(4), 1700),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const stats = [
    { value: "10M+", label: "Users" },
    { value: "5M+", label: "Daily Messages" },
    { value: "1M+", label: "Videos Watched" },
  ];

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      {/* Multi-layer gradient background */}
      <motion.div
        className="absolute inset-0 animate-gradient"
        style={{
          background: 'linear-gradient(135deg, #6C5CE7 0%, #00D9C0 50%, #FF6B9D 100%)',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      />

      {/* Radial overlay */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(circle at 50% 50%, transparent 0%, rgba(30,30,46,0.3) 100%)',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      />

      {/* Floating characters - community feel */}
      <motion.img
        src={`${import.meta.env.BASE_URL}images/character-1.png`}
        alt=""
        className="absolute top-[12vh] left-[8vw] w-[10vw] h-auto"
        initial={{ opacity: 0, y: '-5vh', rotate: -15 }}
        animate={phase >= 2 ? { opacity: 0.9, y: 0, rotate: -8 } : { opacity: 0, y: '-5vh', rotate: -15 }}
        transition={{ duration: 0.7, type: "spring", stiffness: 200 }}
      />
      <motion.img
        src={`${import.meta.env.BASE_URL}images/character-2.png`}
        alt=""
        className="absolute top-[15vh] right-[10vw] w-[11vw] h-auto"
        initial={{ opacity: 0, y: '-5vh', rotate: 15 }}
        animate={phase >= 2 ? { opacity: 0.9, y: 0, rotate: 8 } : { opacity: 0, y: '-5vh', rotate: 15 }}
        transition={{ duration: 0.7, type: "spring", stiffness: 200, delay: 0.1 }}
      />
      <motion.img
        src={`${import.meta.env.BASE_URL}images/character-3.png`}
        alt=""
        className="absolute bottom-[10vh] left-[12vw] w-[12vw] h-auto"
        initial={{ opacity: 0, y: '5vh', rotate: 10 }}
        animate={phase >= 2 ? { opacity: 0.9, y: 0, rotate: 5 } : { opacity: 0, y: '5vh', rotate: 10 }}
        transition={{ duration: 0.7, type: "spring", stiffness: 200, delay: 0.2 }}
      />
      <motion.img
        src={`${import.meta.env.BASE_URL}images/character-4.png`}
        alt=""
        className="absolute bottom-[12vh] right-[8vw] w-[10vw] h-auto"
        initial={{ opacity: 0, y: '5vh', rotate: -10 }}
        animate={phase >= 2 ? { opacity: 0.9, y: 0, rotate: -5 } : { opacity: 0, y: '5vh', rotate: -10 }}
        transition={{ duration: 0.7, type: "spring", stiffness: 200, delay: 0.3 }}
      />

      {/* Main content */}
      <div className="relative z-10 text-center px-[8vw]">
        {/* Main headline */}
        <motion.h2
          className="font-display font-bold text-white mb-[4vh]"
          style={{ fontSize: 'clamp(2.5rem, 8vw, 10rem)', lineHeight: 0.9, letterSpacing: '-0.04em' }}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={phase >= 1 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.7 }}
          transition={{ duration: 0.7, type: "spring", stiffness: 250, damping: 20 }}
        >
          Join the
          <br />
          Community
        </motion.h2>

        {/* Stats row */}
        <motion.div
          className="flex items-center justify-center gap-[4vw] mb-[5vh]"
          initial={{ opacity: 0, y: '5vh' }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: '5vh' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          {stats.map((stat, i) => (
            <motion.div
              key={i}
              className="text-center"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={phase >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.5, delay: i * 0.15, type: "spring", stiffness: 300 }}
            >
              <div className="font-display font-bold text-white mb-[0.5vh]" style={{ fontSize: 'clamp(2rem, 4vw, 5rem)', letterSpacing: '-0.02em' }}>
                {stat.value}
              </div>
              <div className="font-body font-medium text-white/80" style={{ fontSize: 'clamp(0.9rem, 1.5vw, 2rem)' }}>
                {stat.label}
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA (visual only, no interaction) */}
        <motion.div
          className="inline-block bg-white rounded-full px-[4vw] py-[2vh] shadow-2xl"
          initial={{ opacity: 0, y: '3vh' }}
          animate={phase >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: '3vh' }}
          transition={{ duration: 0.5, type: "spring", stiffness: 300, damping: 20 }}
          whileHover={{ scale: 1.05 }}
        >
          <p className="font-display font-bold text-gradient-brand" style={{ fontSize: 'clamp(1.2rem, 2.5vw, 3.5rem)' }}>
            Download AfuChat
          </p>
        </motion.div>

        {/* Platform badge */}
        <motion.div
          className="mt-[2vh] flex items-center justify-center gap-[2vw]"
          initial={{ opacity: 0 }}
          animate={phase >= 4 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <div className="bg-white/20 backdrop-blur-sm rounded-full px-[2vw] py-[1vh]">
            <span className="font-body font-semibold text-white" style={{ fontSize: 'clamp(0.8rem, 1.3vw, 1.8rem)' }}>
              🤖 Android
            </span>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-full px-[2vw] py-[1vh]">
            <span className="font-body font-semibold text-white" style={{ fontSize: 'clamp(0.8rem, 1.3vw, 1.8rem)' }}>
              Built with React Native
            </span>
          </div>
        </motion.div>
      </div>

      {/* Exit animation - fade to brand color */}
      <motion.div
        className="absolute inset-0 bg-[#6C5CE7]"
        initial={{ opacity: 0 }}
        exit={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      />
    </div>
  );
}
