import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 3000),
      setTimeout(() => setPhase(4), 4500), // voice memo
      setTimeout(() => setPhase(5), 7500), // exit
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-[#050505]"
      initial={{ x: "100%" }}
      animate={{ x: phase >= 5 ? "-100%" : "0%" }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="relative w-full max-w-[80vw] aspect-video mx-auto flex flex-col items-center justify-center">
        
        {/* Title */}
        <motion.h2
          className="text-[3.5vw] text-white mb-[4vw] text-center"
          style={{ fontFamily: "'Playfair Display', serif" }}
          initial={{ opacity: 0, y: "2vw" }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: "2vw" }}
          transition={{ duration: 0.8 }}
        >
          Direct access to your coach.
        </motion.h2>

        {/* Chat Mockup */}
        <motion.div
          className="w-full max-w-[50vw] bg-[#0A0A0A] border border-white/10 rounded-[1.5vw] p-[2vw] shadow-2xl flex flex-col gap-[1.5vw] relative"
          initial={{ opacity: 0, y: "3vw", scale: 0.95 }}
          animate={phase >= 1 ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: "3vw", scale: 0.95 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          {/* Message 1: Client */}
          <motion.div
            className="self-end bg-[#d4af37]/10 border border-[#d4af37]/30 text-white rounded-[1.5vw] rounded-tr-[0.2vw] px-[1.5vw] py-[1vw] max-w-[80%]"
            initial={{ opacity: 0, x: "1.5vw", scale: 0.9 }}
            animate={phase >= 2 ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: "1.5vw", scale: 0.9 }}
            transition={{ type: "spring", bounce: 0.4 }}
          >
            <p className="text-[1vw]">Hey coach! The form review on those squats really helped today. Felt way better.</p>
          </motion.div>

          {/* Message 2: Coach text */}
          <motion.div
            className="self-start bg-[#141414] border border-white/5 text-white rounded-[1.5vw] rounded-tl-[0.2vw] px-[1.5vw] py-[1vw] max-w-[80%] flex items-start gap-[1vw]"
            initial={{ opacity: 0, x: "-1.5vw", scale: 0.9 }}
            animate={phase >= 3 ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: "-1.5vw", scale: 0.9 }}
            transition={{ type: "spring", bounce: 0.4 }}
          >
            <div className="w-[2vw] h-[2vw] rounded-full bg-gradient-to-br from-[#d4af37] to-[#8a7224] flex-shrink-0 flex items-center justify-center">
              <span className="text-black text-[0.8vw] font-bold">C</span>
            </div>
            <p className="text-[1vw] pt-[0.2vw] text-neutral-300">That's what I like to hear! Let's bump the weight up 5lbs next week.</p>
          </motion.div>

          {/* Message 3: Coach Voice Memo */}
          <motion.div
            className="self-start bg-[#141414] border border-white/5 text-white rounded-[1.5vw] rounded-tl-[0.2vw] p-[1vw] max-w-[80%] flex flex-col gap-[0.8vw] ml-[3vw]"
            initial={{ opacity: 0, y: "1vw" }}
            animate={phase >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: "1vw" }}
            transition={{ type: "spring", bounce: 0.4 }}
          >
            <div className="flex items-center gap-[0.8vw]">
              <div className="w-[2.5vw] h-[2.5vw] rounded-full bg-[#d4af37] flex items-center justify-center text-black pl-[0.2vw] text-[1vw]">
                ▶
              </div>
              <div className="flex-1 flex gap-[0.2vw] items-center h-[1vw]">
                {[1, 2, 4, 3, 5, 2, 4, 6, 4, 2, 1].map((h, i) => (
                  <motion.div
                    key={i}
                    className="w-[0.2vw] bg-[#d4af37]/60 rounded-full"
                    initial={{ height: "0.2vw" }}
                    animate={phase >= 4 ? { height: `${h * 0.4}vw` } : { height: "0.2vw" }}
                    transition={{ duration: 0.5, delay: 0.2 + i * 0.05 }}
                  />
                ))}
              </div>
              <span className="text-[0.8vw] text-neutral-500">0:12</span>
            </div>
            
            <motion.div 
              className="bg-black/30 rounded-[0.5vw] p-[0.8vw] text-[0.85vw] text-neutral-400 italic"
              initial={{ opacity: 0 }}
              animate={phase >= 4 ? { opacity: 1 } : { opacity: 0 }}
              transition={{ delay: 1 }}
            >
              Transcript: "Also, make sure you're getting enough carbs before that session..."
            </motion.div>
          </motion.div>

        </motion.div>
      </div>
    </motion.div>
  );
}
