import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2500),
      setTimeout(() => setPhase(3), 4500),
      setTimeout(() => setPhase(4), 6500), // exit
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: phase >= 4 ? 0 : 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
      transition={{ duration: 1.2 }}
    >
      <div className="relative w-full max-w-[80vw] aspect-video mx-auto flex items-center justify-center">
        
        {/* Animated Background Ring */}
        <motion.div
          className="absolute rounded-full border border-[#d4af37]/20"
          initial={{ width: "20vw", height: "20vw", opacity: 0 }}
          animate={{
            width: phase >= 1 ? "60vw" : "20vw",
            height: phase >= 1 ? "60vw" : "20vw",
            opacity: phase >= 1 ? 1 : 0,
            rotate: 45
          }}
          transition={{ duration: 3, ease: "easeOut" }}
        />

        {/* Content Container */}
        <div className="flex flex-col md:flex-row items-center justify-between w-full px-[5vw] z-10 gap-[4vw]">
          
          {/* Text Left */}
          <div className="flex flex-col gap-[2vw] flex-1">
            <motion.div
              initial={{ opacity: 0, y: "3vw" }}
              animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: "3vw" }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="text-[#d4af37] font-semibold tracking-widest text-[1vw] uppercase mb-[1vw] block">
                Welcome to Eden
              </span>
              <h1 
                className="text-[4.5vw] text-white leading-[1.1] font-medium"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                You've been<br/>invited.
              </h1>
            </motion.div>
            
            <motion.p
              className="text-[1.2vw] text-neutral-400 max-w-[25vw] mt-[1vw] font-light leading-relaxed"
              initial={{ opacity: 0 }}
              animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 1 }}
            >
              Check your email for your credentials, log in, and start your premium coaching experience.
            </motion.p>
          </div>

          {/* Phone Mockup Right */}
          <motion.div
            className="flex-1 flex justify-end"
            initial={{ opacity: 0, x: "5vw", scale: 0.9 }}
            animate={phase >= 2 ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: "5vw", scale: 0.9 }}
            transition={{ duration: 1, type: "spring", stiffness: 100, damping: 20 }}
          >
            <div className="w-[20vw] h-[42vw] bg-[#0A0A0A] border border-[#d4af37]/30 rounded-[2.5vw] shadow-2xl shadow-[#d4af37]/10 flex flex-col items-center justify-center p-[2vw] relative overflow-hidden">
              <div className="absolute top-0 w-full h-[5vw] bg-gradient-to-b from-[#d4af37]/10 to-transparent"></div>
              
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={phase >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="w-[4.5vw] h-[4.5vw] rounded-[1vw] bg-gradient-to-tr from-[#d4af37] to-[#e6c86a] mb-[2vw] shadow-lg shadow-[#d4af37]/20 flex items-center justify-center"
              >
                <span className="text-black font-bold text-[2vw]" style={{ fontFamily: "'Playfair Display', serif" }}>E</span>
              </motion.div>

              <div className="w-full space-y-[1vw]">
                <motion.div 
                  className="w-full h-[3vw] rounded-[0.8vw] bg-[#1A1A1A] border border-white/5"
                  initial={{ width: "0%" }}
                  animate={phase >= 3 ? { width: "100%" } : { width: "0%" }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                />
                <motion.div 
                  className="w-full h-[3vw] rounded-[0.8vw] bg-[#1A1A1A] border border-white/5"
                  initial={{ width: "0%" }}
                  animate={phase >= 3 ? { width: "100%" } : { width: "0%" }}
                  transition={{ duration: 0.6, delay: 0.6 }}
                />
                <motion.div 
                  className="w-full h-[3vw] rounded-[0.8vw] bg-[#d4af37] shadow-lg shadow-[#d4af37]/20 mt-[1.5vw]"
                  initial={{ opacity: 0, y: "1vw" }}
                  animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: "1vw" }}
                  transition={{ duration: 0.4, delay: 1 }}
                />
              </div>
            </div>
          </motion.div>

        </div>
      </div>
    </motion.div>
  );
}
