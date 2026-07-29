import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 700),
      setTimeout(() => setPhase(3), 1200),
      setTimeout(() => setPhase(4), 1800),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const premiumFeatures = [
    "Premium & Platinum Tiers",
    "Exclusive Status Goods",
    "Avatar Rings & Items",
    "Priority Support",
  ];

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#1E1E2E] via-[#2D2640] to-[#1E1E2E]">
      {/* Animated gradient orbs */}
      <motion.div
        className="absolute w-[35vw] h-[35vw] rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(circle, #FF6B9D, transparent)' }}
        animate={{ 
          x: ['-15vw', '15vw', '-15vw'],
          y: ['-10vh', '10vh', '-10vh'],
          scale: [1, 1.2, 1]
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute w-[30vw] h-[30vw] rounded-full opacity-25 blur-3xl"
        style={{ background: 'radial-gradient(circle, #00D9C0, transparent)' }}
        animate={{ 
          x: ['15vw', '-15vw', '15vw'],
          y: ['10vh', '-10vh', '10vh'],
          scale: [1.2, 1, 1.2]
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Main content split layout */}
      <div className="relative z-10 w-full h-full flex items-center">
        {/* Left side - Character showcase */}
        <motion.div
          className="flex-1 flex items-center justify-center pl-[8vw]"
          initial={{ opacity: 0, x: '-10vw' }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: '-10vw' }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="relative">
            {/* Glow ring */}
            <motion.div
              className="absolute inset-[-2vw] rounded-full"
              style={{
                background: 'linear-gradient(135deg, #FFD700, #FFA500, #FF6B9D)',
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            />
            <motion.div
              className="absolute inset-[-1.5vw] rounded-full bg-[#1E1E2E]"
            />
            
            {/* Character */}
            <motion.img
              src={`${import.meta.env.BASE_URL}images/character-6.png`}
              alt=""
              className="relative w-[25vw] h-auto rounded-full"
              initial={{ scale: 0, rotate: -180 }}
              animate={phase >= 2 ? { scale: 1, rotate: 0 } : { scale: 0, rotate: -180 }}
              transition={{ duration: 0.8, type: "spring", stiffness: 200, damping: 18 }}
            />

            {/* Floating badge */}
            <motion.div
              className="absolute top-0 right-[-3vw] bg-gradient-to-br from-yellow-400 to-orange-500 rounded-[0.8vw] px-[1.5vw] py-[0.8vh] shadow-2xl"
              initial={{ scale: 0, rotate: 12 }}
              animate={phase >= 3 ? { scale: 1, rotate: 12 } : { scale: 0, rotate: 12 }}
              transition={{ duration: 0.5, type: "spring", stiffness: 300, damping: 15, delay: 0.2 }}
            >
              <p className="font-display font-bold text-white" style={{ fontSize: 'clamp(0.8rem, 1.5vw, 2rem)' }}>
                PLATINUM
              </p>
            </motion.div>
          </div>
        </motion.div>

        {/* Right side - Premium features */}
        <div className="flex-1 flex flex-col items-start justify-center pr-[8vw]">
          <motion.div
            className="mb-[2vh]"
            initial={{ opacity: 0, x: '5vw' }}
            animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: '5vw' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="inline-block bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full px-[2vw] py-[1vh] mb-[2vh]">
              <span className="font-body font-bold text-[#1E1E2E]" style={{ fontSize: 'clamp(0.7rem, 1.2vw, 1.5rem)' }}>
                ✨ PREMIUM
              </span>
            </div>
          </motion.div>

          <motion.h2
            className="font-display font-bold text-white mb-[3vh]"
            style={{ fontSize: 'clamp(2rem, 5vw, 6rem)', lineHeight: 1, letterSpacing: '-0.02em' }}
            initial={{ opacity: 0, y: '5vh' }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: '5vh' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            Stand Out
            <br />
            <span className="text-gradient-vibrant">Get Noticed</span>
          </motion.h2>

          <div className="space-y-[1.5vh]">
            {premiumFeatures.map((feature, i) => (
              <motion.div
                key={i}
                className="flex items-center gap-[1vw]"
                initial={{ opacity: 0, x: '5vw' }}
                animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: '5vw' }}
                transition={{ duration: 0.4, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="w-[1.5vw] h-[1.5vw] rounded-full bg-gradient-to-br from-teal-400 to-cyan-300 flex-shrink-0" />
                <p className="font-body font-medium text-white/90" style={{ fontSize: 'clamp(1rem, 1.8vw, 2.5rem)' }}>
                  {feature}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Exit transition - split reveal */}
      <motion.div
        className="absolute inset-0 bg-white"
        initial={{ clipPath: 'inset(0 50% 0 50%)' }}
        exit={{ clipPath: 'inset(0 0% 0 0%)' }}
        transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
      />
    </div>
  );
}
