import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 3000),
      setTimeout(() => setPhase(4), 5000), // check mark
      setTimeout(() => setPhase(5), 7500), // exit
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-[#0A0A0A]"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: phase >= 5 ? 0 : 1, scale: phase >= 5 ? 0.9 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
    >
      <div className="relative w-full max-w-[80vw] aspect-video mx-auto flex">
        
        {/* Left Side: Copy */}
        <div className="flex-1 flex flex-col justify-center px-[5vw] z-10">
          <motion.div
            initial={{ opacity: 0, x: "-3vw" }}
            animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: "-3vw" }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <h1 className="text-[4vw] text-white mb-[1.5vw] leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
              Stay accountable<br/>every week.
            </h1>
            <p className="text-neutral-400 text-[1.2vw] max-w-[25vw]">
              Log your weight, sleep, and energy levels. Submit before your coach's deadline.
            </p>
          </motion.div>
        </div>

        {/* Right Side: Form Mockup */}
        <div className="flex-1 flex items-center justify-center relative">
          
          <motion.div
            className="w-[28vw] bg-[#141414] border border-[#d4af37]/20 rounded-[1.5vw] p-[2.5vw] shadow-2xl relative"
            initial={{ opacity: 0, y: "4vw", rotateX: 10, perspective: 1000 }}
            animate={phase >= 1 ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: "4vw", rotateX: 10 }}
            transition={{ duration: 1, type: "spring", bounce: 0.2 }}
          >
            <h3 className="text-white text-[1.2vw] font-medium mb-[2vw]">Weekly Check-in</h3>

            <div className="space-y-[1vw]">
              {[
                { label: "Morning Weight", val: "172.4 lbs" },
                { label: "Sleep Quality", val: "8 / 10" },
                { label: "Energy Levels", val: "High" }
              ].map((item, i) => (
                <motion.div
                  key={i}
                  className="bg-[#0A0A0A] rounded-[0.8vw] p-[1vw] border border-white/5"
                  initial={{ opacity: 0, x: "1.5vw" }}
                  animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: "1.5vw" }}
                  transition={{ duration: 0.5, delay: i * 0.2 }}
                >
                  <span className="text-neutral-500 text-[0.8vw] block mb-[0.2vw]">{item.label}</span>
                  <motion.span 
                    className="text-[#d4af37] text-[1vw] font-medium"
                    initial={{ opacity: 0 }}
                    animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
                    transition={{ duration: 0.3, delay: 0.5 + i * 0.2 }}
                  >
                    {item.val}
                  </motion.span>
                </motion.div>
              ))}
            </div>

            {/* Submit Button */}
            <motion.div
              className="mt-[2vw] w-full h-[3.5vw] rounded-[0.8vw] bg-[#d4af37] flex items-center justify-center relative overflow-hidden"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={phase >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.5, delay: 1 }}
            >
              <motion.span
                className="text-black font-semibold text-[1vw] absolute"
                initial={{ y: 0, opacity: 1 }}
                animate={phase >= 4 ? { y: "-2vw", opacity: 0 } : { y: 0, opacity: 1 }}
              >
                Submit to Coach
              </motion.span>
              
              <motion.div
                className="absolute text-black font-bold text-[1.5vw]"
                initial={{ y: "2vw", opacity: 0 }}
                animate={phase >= 4 ? { y: 0, opacity: 1 } : { y: "2vw", opacity: 0 }}
              >
                ✓
              </motion.div>
            </motion.div>

          </motion.div>

        </div>
      </div>
    </motion.div>
  );
}
