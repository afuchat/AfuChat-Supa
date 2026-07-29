import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 250),
      setTimeout(() => setPhase(2), 600),
      setTimeout(() => setPhase(3), 1100),
      setTimeout(() => setPhase(4), 1600),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const features = [
    { label: "AfuMusic", desc: "Lock screen player", icon: "🎵" },
    { label: "Mini-apps", desc: "Built-in ecosystem", icon: "🎯" },
    { label: "AfuPay", desc: "Seamless payments", icon: "💳" },
    { label: "ACoin + XP", desc: "Rewards system", icon: "🪙" },
  ];

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      {/* Vibrant gradient background */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, #6C5CE7 0%, #00D9C0 100%)',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      />

      {/* Tech pattern overlay */}
      <motion.img
        src={`${import.meta.env.BASE_URL}images/tech-pattern.png`}
        alt=""
        className="absolute inset-0 w-full h-full object-cover opacity-20 mix-blend-overlay"
        initial={{ opacity: 0, scale: 1.2 }}
        animate={{ opacity: 0.2, scale: 1 }}
        transition={{ duration: 1.5 }}
      />

      {/* Animated circles */}
      <motion.div
        className="absolute w-[40vw] h-[40vw] rounded-full border-4 border-white/20"
        initial={{ scale: 0, rotate: 0 }}
        animate={{ scale: 1, rotate: 360 }}
        transition={{ duration: 2, ease: "easeOut" }}
      />
      <motion.div
        className="absolute w-[30vw] h-[30vw] rounded-full border-4 border-white/20"
        initial={{ scale: 0, rotate: 0 }}
        animate={{ scale: 1, rotate: -360 }}
        transition={{ duration: 2.5, ease: "easeOut", delay: 0.2 }}
      />

      {/* Main content */}
      <div className="relative z-10 text-center px-[8vw]">
        {/* Headline */}
        <motion.h2
          className="font-display font-bold text-white mb-[5vh]"
          style={{ fontSize: 'clamp(2rem, 6vw, 7rem)', lineHeight: 1, letterSpacing: '-0.02em' }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={phase >= 1 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.6, type: "spring", stiffness: 250, damping: 20 }}
        >
          Powered by
          <br />
          Innovation
        </motion.h2>

        {/* Feature cards - horizontal row */}
        <div className="flex items-center justify-center gap-[2vw] max-w-[80vw] mx-auto">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              className="bg-white/95 backdrop-blur-sm rounded-[1.2vw] p-[2vw] shadow-2xl flex-1 min-w-0"
              initial={{ opacity: 0, y: '8vh', rotateX: -90 }}
              animate={phase >= 2 ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: '8vh', rotateX: -90 }}
              transition={{ 
                duration: 0.6, 
                delay: i * 0.15,
                type: "spring",
                stiffness: 200,
                damping: 20
              }}
              style={{ perspective: '1000px' }}
            >
              <div className="text-[4vw] mb-[1vh]">{feature.icon}</div>
              <h3 className="font-display font-bold text-[#1E1E2E] mb-[0.5vh]" style={{ fontSize: 'clamp(1rem, 1.8vw, 2.5rem)' }}>
                {feature.label}
              </h3>
              <p className="font-body text-[#6B7280]" style={{ fontSize: 'clamp(0.7rem, 1vw, 1.3rem)' }}>
                {feature.desc}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Characters */}
        <motion.img
          src={`${import.meta.env.BASE_URL}images/character-3.png`}
          alt=""
          className="absolute bottom-[2vh] left-[8vw] w-[14vw] h-auto"
          initial={{ opacity: 0, x: '-10vw', rotate: -20 }}
          animate={phase >= 3 ? { opacity: 1, x: 0, rotate: 0 } : { opacity: 0, x: '-10vw', rotate: -20 }}
          transition={{ duration: 0.7, type: "spring", stiffness: 200, damping: 18 }}
        />
        <motion.img
          src={`${import.meta.env.BASE_URL}images/character-4.png`}
          alt=""
          className="absolute bottom-[2vh] right-[8vw] w-[14vw] h-auto"
          initial={{ opacity: 0, x: '10vw', rotate: 20 }}
          animate={phase >= 3 ? { opacity: 1, x: 0, rotate: 0 } : { opacity: 0, x: '10vw', rotate: 20 }}
          transition={{ duration: 0.7, type: "spring", stiffness: 200, damping: 18 }}
        />
      </div>

      {/* Exit animation - scale up */}
      <motion.div
        className="absolute inset-0 bg-[#FF6B9D]"
        initial={{ scale: 0, borderRadius: '50%' }}
        exit={{ scale: 3, borderRadius: '0%' }}
        transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
      />
    </div>
  );
}
