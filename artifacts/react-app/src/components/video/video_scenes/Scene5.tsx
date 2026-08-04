import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000), // community
      setTimeout(() => setPhase(3), 3500), // courses
      setTimeout(() => setPhase(4), 6500), // exit
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-[#0A0A0A]"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: phase >= 4 ? 0 : 1, scale: phase >= 4 ? 1.1 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
    >
      <div className="relative w-full max-w-[80vw] aspect-video mx-auto flex items-center justify-center flex-col z-10">
        
        <motion.div
          initial={{ opacity: 0, y: "-2vw" }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: "-2vw" }}
          transition={{ duration: 0.8 }}
          className="text-center mb-[4vw]"
        >
          <span className="text-[#d4af37] tracking-widest text-[1vw] uppercase mb-[1vw] block">
            More than just a plan
          </span>
          <h2 className="text-[4vw] text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
            Learn and connect.
          </h2>
        </motion.div>

        <div className="flex gap-[3vw] w-full max-w-[70vw] px-[3vw]">
          
          {/* Community Feed Mock */}
          <motion.div
            className="flex-1 bg-[#141414] border border-white/5 rounded-[1.5vw] p-[2vw] relative overflow-hidden"
            initial={{ opacity: 0, x: "-3vw", rotateY: -10, perspective: 1000 }}
            animate={phase >= 2 ? { opacity: 1, x: 0, rotateY: 0 } : { opacity: 0, x: "-3vw", rotateY: -10 }}
            transition={{ duration: 0.8, type: "spring" }}
          >
            <div className="absolute top-0 right-0 w-[10vw] h-[10vw] bg-[#d4af37]/10 blur-[4vw]" />
            <h3 className="text-white font-medium mb-[2vw] text-[1.2vw]">Community Feed</h3>
            
            <div className="space-y-[1vw]">
              {[1, 2].map((i) => (
                <div key={i} className="bg-[#0A0A0A] rounded-[1vw] p-[1.2vw] border border-white/5">
                  <div className="flex items-center gap-[1vw] mb-[1vw]">
                    <div className="w-[2.5vw] h-[2.5vw] rounded-full bg-white/10" />
                    <div>
                      <div className="w-[6vw] h-[0.5vw] bg-white/20 rounded mb-[0.5vw]" />
                      <div className="w-[4vw] h-[0.5vw] bg-white/10 rounded" />
                    </div>
                  </div>
                  <div className="space-y-[0.5vw]">
                    <div className="w-full h-[0.5vw] bg-white/10 rounded" />
                    <div className="w-3/4 h-[0.5vw] bg-white/10 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Courses & Recipes Mock */}
          <motion.div
            className="flex-1 bg-[#141414] border border-white/5 rounded-[1.5vw] p-[2vw] relative overflow-hidden"
            initial={{ opacity: 0, x: "3vw", rotateY: 10, perspective: 1000 }}
            animate={phase >= 3 ? { opacity: 1, x: 0, rotateY: 0 } : { opacity: 0, x: "3vw", rotateY: 10 }}
            transition={{ duration: 0.8, type: "spring", delay: 0.2 }}
          >
            <div className="absolute bottom-0 left-0 w-[10vw] h-[10vw] bg-[#d4af37]/10 blur-[4vw]" />
            <h3 className="text-white font-medium mb-[2vw] text-[1.2vw]">Library</h3>

            <div className="grid grid-cols-2 gap-[1vw]">
              <div className="bg-[#0A0A0A] rounded-[1vw] aspect-square border border-white/5 p-[1vw] flex flex-col justify-end">
                <span className="text-[#d4af37] text-[1.5vw] mb-[0.5vw]">📚</span>
                <span className="text-white text-[0.9vw]">Nutrition Masterclass</span>
              </div>
              <div className="bg-[#0A0A0A] rounded-[1vw] aspect-square border border-white/5 p-[1vw] flex flex-col justify-end">
                <span className="text-[#d4af37] text-[1.5vw] mb-[0.5vw]">🍳</span>
                <span className="text-white text-[0.9vw]">High-Protein Recipes</span>
              </div>
              <div className="bg-[#0A0A0A] rounded-[1vw] aspect-square border border-white/5 p-[1vw] flex flex-col justify-end">
                <span className="text-[#d4af37] text-[1.5vw] mb-[0.5vw]">💪</span>
                <span className="text-white text-[0.9vw]">Form Library</span>
              </div>
              <div className="bg-[#0A0A0A] rounded-[1vw] aspect-square border border-white/5 p-[1vw] flex flex-col justify-end">
                <span className="text-[#d4af37] text-[1.5vw] mb-[0.5vw]">🧘‍♀️</span>
                <span className="text-white text-[0.9vw]">Mobility Routines</span>
              </div>
            </div>
          </motion.div>

        </div>
      </div>
    </motion.div>
  );
}
