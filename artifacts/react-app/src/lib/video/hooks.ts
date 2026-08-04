import { useState, useEffect } from 'react';

export function useVideoPlayer(sceneDurations: number[]) {
  const [currentScene, setCurrentScene] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    if (!isPlaying) return;

    const duration = sceneDurations[currentScene];
    const timer = setTimeout(() => {
      setCurrentScene((prev) => (prev + 1) % sceneDurations.length);
    }, duration);

    return () => clearTimeout(timer);
  }, [currentScene, isPlaying, sceneDurations]);

  return { currentScene, isPlaying };
}
