import { AnimatePresence } from "framer-motion";
import { useVideoPlayer } from "../../lib/video/hooks";
import { Scene1 } from "./video_scenes/Scene1";
import { Scene2 } from "./video_scenes/Scene2";
import { Scene3 } from "./video_scenes/Scene3";
import { Scene4 } from "./video_scenes/Scene4";
import { Scene5 } from "./video_scenes/Scene5";
import { Scene6 } from "./video_scenes/Scene6";

// Define lengths of each scene in ms (total ~45-60s)
// 6 scenes, maybe 7.5 to 10 seconds each
const SCENE_DURATIONS = [
  8000, // Scene 1: Welcome
  8000, // Scene 2: Dashboard
  9000, // Scene 3: Check-in
  9000, // Scene 4: Messages
  8000, // Scene 5: Community & courses
  8000, // Scene 6: Wrap
];

export function VideoTemplate() {
  const { currentScene } = useVideoPlayer(SCENE_DURATIONS);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0A0A0A] text-white flex items-center justify-center font-sans">
      {/* Global persistent elements (backgrounds, ambient noise) */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#d4af37] via-[#0A0A0A] to-[#050505]"></div>
      
      {/* Scene Content */}
      <div className="relative z-10 w-full h-full flex items-center justify-center">
        <AnimatePresence mode="popLayout">
          {currentScene === 0 && <Scene1 key="scene1" />}
          {currentScene === 1 && <Scene2 key="scene2" />}
          {currentScene === 2 && <Scene3 key="scene3" />}
          {currentScene === 3 && <Scene4 key="scene4" />}
          {currentScene === 4 && <Scene5 key="scene5" />}
          {currentScene === 5 && <Scene6 key="scene6" />}
        </AnimatePresence>
      </div>
    </div>
  );
}
