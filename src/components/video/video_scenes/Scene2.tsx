import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 600),
      setTimeout(() => setPhase(3), 1000),
      setTimeout(() => setPhase(4), 1400),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const features = [
    { icon: "💬", label: "Real-time Chat" },
    { icon: "📹", label: "Video Feed" },
    { icon: "📖", label: "Stories" },
    { icon: "🤖", label: "AfuAI Assistant" },
  ];

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#FAFBFC] via-white to-[#F0F1F5]">
      {/* Background pattern */}
      <motion.div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, #6C5CE7 1px, transparent 0)`,
          backgroundSize: '40px 40px',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.05 }}
        transition={{ duration: 0.8 }}
      />

      {/* Floating orbs */}
      <motion.img
        src={`${import.meta.env.BASE_URL}images/orb-1.png`}
        alt=""
        className="absolute top-[10vh] left-[15vw] w-[8vw] h-auto opacity-60 animate-float"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 0.6, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.2 }}
      />
      <motion.img
        src={`${import.meta.env.BASE_URL}images/orb-2.png`}
        alt=""
        className="absolute bottom-[15vh] right-[12vw] w-[10vw] h-auto opacity-50 animate-float-slow"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 0.5, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.4 }}
      />

      {/* Main content container */}
      <div className="relative z-10 flex items-center justify-between w-full px-[8vw] gap-[6vw]">
        {/* Left: Character + phone */}
        <motion.div
          className="flex-1 flex items-center justify-center"
          initial={{ opacity: 0, x: '-10vw' }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: '-10vw' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="relative">
            <motion.img
              src={`${import.meta.env.BASE_URL}images/character-5.png`}
              alt=""
              className="w-[28vw] h-auto"
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />
            {/* Phone mockup overlay */}
            <motion.div
              className="absolute top-[20%] right-[-5vw] w-[12vw] h-[18vh] bg-gradient-to-br from-purple-500 to-teal-400 rounded-[1.5vw] shadow-2xl"
              initial={{ scale: 0, rotate: -15 }}
              animate={phase >= 2 ? { scale: 1, rotate: -8 } : { scale: 0, rotate: -15 }}
              transition={{ duration: 0.5, type: "spring", stiffness: 300, damping: 20 }}
            >
              <div className="absolute inset-[0.3vw] bg-white rounded-[1.2vw] overflow-hidden">
                <div className="h-full bg-gradient-to-b from-purple-50 to-teal-50 flex items-center justify-center">
                  <span className="text-[2vw]">💬</span>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Right: Headline + feature grid */}
        <div className="flex-1 flex flex-col items-start">
          <motion.h2
            className="font-display font-bold text-[#1E1E2E] mb-[3vh]"
            style={{ fontSize: 'clamp(2rem, 5vw, 6rem)', lineHeight: 1, letterSpacing: '-0.02em' }}
            initial={{ opacity: 0, y: '5vh' }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: '5vh' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            Everything
            <br />
            <span className="text-gradient-brand">You Need</span>
          </motion.h2>

          {/* Feature cards */}
          <div className="grid grid-cols-2 gap-[1.5vw] w-full max-w-[35vw]">
            {features.map((feature, i) => (
              <motion.div
                key={i}
                className="bg-white rounded-[1vw] p-[1.5vw] shadow-lg border border-[#E5E7EB]"
                initial={{ opacity: 0, scale: 0.8, y: '3vh' }}
                animate={phase >= 3 ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.8, y: '3vh' }}
                transition={{ duration: 0.4, delay: i * 0.1, type: "spring", stiffness: 300, damping: 25 }}
              >
                <div className="text-[3vw] mb-[0.5vh]">{feature.icon}</div>
                <p className="font-body font-semibold text-[#1E1E2E]" style={{ fontSize: 'clamp(0.8rem, 1.2vw, 1.5rem)' }}>
                  {feature.label}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Exit wipe */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-[#6C5CE7] to-[#00D9C0]"
        initial={{ x: '100%' }}
        exit={{ x: 0 }}
        transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
      />
    </div>
  );
}
