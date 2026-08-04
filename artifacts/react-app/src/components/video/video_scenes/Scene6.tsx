import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 3500),
      setTimeout(() => setPhase(4), 6500), // exit
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-[#050505]"
      initial={{ opacity: 0 }}
      animate={{ opacity: phase >= 4 ? 0 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.5 }}
    >
      {/* Dynamic Background */}
      <motion.div
        className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#d4af37]/20 via-transparent to-transparent"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: phase >= 1 ? 1.5 : 0.8, opacity: phase >= 1 ? 1 : 0 }}
        transition={{ duration: 4, ease: "easeOut" }}
      />

      <div className="relative z-10 w-full max-w-[80vw] aspect-video mx-auto flex flex-col items-center justify-center text-center">
        
        <motion.div
          initial={{ opacity: 0, y: "2vw" }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: "2vw" }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="w-[6vw] h-[6vw] mx-auto rounded-[1.5vw] bg-gradient-to-tr from-[#d4af37] to-[#e6c86a] mb-[2vw] shadow-2xl shadow-[#d4af37]/30 flex items-center justify-center">
            <span className="text-black font-bold text-[3vw]" style={{ fontFamily: "'Playfair Display', serif" }}>E</span>
          </div>
          
          <h1 className="text-[4.5vw] text-white mb-[1.5vw] leading-[1.1]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Everything connected.<br />Everything guided.
          </h1>
        </motion.div>

        <motion.p
          className="text-[1.2vw] text-neutral-400 max-w-[35vw] mb-[3vw] font-light"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 1 }}
        >
          Your coach has the full picture. Log in now and begin your journey.
        </motion.p>

        {/* Fake CTA (not interactive) */}
        <motion.div
          className="px-[2.5vw] py-[1vw] rounded-full bg-[#d4af37] text-black font-semibold tracking-wide text-[1vw]"
          initial={{ opacity: 0, scale: 0.9, y: "1.5vw" }}
          animate={phase >= 3 ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.9, y: "1.5vw" }}
          transition={{ duration: 0.8, type: "spring" }}
        >
          Log in to your account
        </motion.div>

      </div>
    </motion.div>
  );
}
