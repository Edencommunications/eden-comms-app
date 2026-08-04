import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function Scene2() {
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
      initial={{ clipPath: "circle(0% at 50% 50%)" }}
      animate={{ clipPath: phase >= 4 ? "circle(0% at 50% 50%)" : "circle(150% at 50% 50%)" }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="relative w-full max-w-[80vw] aspect-video mx-auto flex items-center justify-center flex-col">
        
        <motion.div
          className="absolute -top-[10vw] -right-[10vw] w-[40vw] h-[40vw] rounded-full bg-[#d4af37]/5 blur-[8vw]"
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Content Container */}
        <div className="flex flex-col items-center w-full z-10 px-[5vw]">
          
          <motion.h2
            className="text-[#d4af37] tracking-widest text-[1vw] uppercase mb-[4vw]"
            initial={{ opacity: 0, y: "-2vw" }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: "-2vw" }}
            transition={{ duration: 0.8 }}
          >
            Your Dashboard
          </motion.h2>

          {/* Dashboard UI Mockup */}
          <motion.div
            className="w-full max-w-[60vw] bg-[#0A0A0A] border border-white/10 rounded-[1.5vw] p-[3vw] shadow-2xl flex flex-col gap-[2vw]"
            initial={{ opacity: 0, scale: 0.9, y: "3vw" }}
            animate={phase >= 1 ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.9, y: "3vw" }}
            transition={{ duration: 1, type: "spring", stiffness: 80, damping: 20 }}
          >
            {/* Header */}
            <div className="flex justify-between items-end border-b border-white/5 pb-[1.5vw]">
              <motion.div
                initial={{ opacity: 0, x: "-2vw" }}
                animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: "-2vw" }}
                transition={{ duration: 0.6 }}
              >
                <h1 className="text-[2vw] text-white mb-[0.5vw]" style={{ fontFamily: "'Playfair Display', serif" }}>
                  Phase 1: Foundation
                </h1>
                <p className="text-neutral-500 text-[1vw]">Started Oct 12 • 12 Weeks</p>
              </motion.div>

              <motion.div
                className="bg-[#1A1A1A] border border-[#d4af37]/30 px-[1.5vw] py-[0.8vw] rounded-full flex items-center gap-[0.8vw]"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={phase >= 2 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.6, delay: 0.2, type: "spring" }}
              >
                <div className="w-[0.6vw] h-[0.6vw] rounded-full bg-[#d4af37] animate-pulse" />
                <span className="text-[0.9vw] font-medium text-white">Check-in due Friday</span>
              </motion.div>
            </div>

            {/* Content Row */}
            <div className="flex gap-[2vw]">
              {/* Left Column */}
              <div className="flex-1 space-y-[1vw]">
                <motion.div
                  className="h-[8vw] bg-[#141414] rounded-[1vw] border border-white/5 p-[1.5vw] flex flex-col justify-center relative overflow-hidden"
                  initial={{ opacity: 0, y: "1.5vw" }}
                  animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: "1.5vw" }}
                  transition={{ duration: 0.5 }}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-[0.3vw] bg-[#d4af37]" />
                  <span className="text-neutral-400 text-[0.8vw] uppercase tracking-wider mb-[0.5vw]">Today's Protocol</span>
                  <span className="text-white font-medium text-[1.2vw]">Hypertrophy Block A</span>
                  <span className="text-neutral-500 text-[0.9vw] mt-[0.3vw]">45 mins • Upper Body</span>
                </motion.div>
                
                <motion.div
                  className="h-[8vw] bg-[#141414] rounded-[1vw] border border-white/5 p-[1.5vw] flex flex-col justify-center"
                  initial={{ opacity: 0, y: "1.5vw" }}
                  animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: "1.5vw" }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                >
                  <span className="text-neutral-400 text-[0.8vw] uppercase tracking-wider mb-[0.5vw]">Nutrition</span>
                  <span className="text-white font-medium text-[1.2vw]">2400 kcal • 180g Protein</span>
                </motion.div>
              </div>

              {/* Right Column (Metrics Graph Mock) */}
              <motion.div
                className="flex-1 bg-[#141414] rounded-[1vw] border border-white/5 p-[1.5vw] flex flex-col"
                initial={{ opacity: 0, x: "1.5vw" }}
                animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: "1.5vw" }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                <div className="flex justify-between items-center mb-[1.5vw]">
                  <span className="text-neutral-400 text-[0.8vw] uppercase tracking-wider">Weight Trend</span>
                  <span className="text-[#d4af37] text-[1vw]">-1.2 lbs</span>
                </div>
                <div className="flex-1 flex items-end gap-[0.8vw] h-full">
                  {[40, 50, 45, 60, 55, 75, 85].map((h, i) => (
                    <motion.div
                      key={i}
                      className="flex-1 bg-gradient-to-t from-[#d4af37]/20 to-[#d4af37] rounded-t-sm"
                      initial={{ height: "0%" }}
                      animate={phase >= 3 ? { height: `${h}%` } : { height: "0%" }}
                      transition={{ duration: 0.8, delay: 0.3 + i * 0.05, ease: "easeOut" }}
                    />
                  ))}
                </div>
              </motion.div>
            </div>
            
          </motion.div>

        </div>
      </div>
    </motion.div>
  );
}
