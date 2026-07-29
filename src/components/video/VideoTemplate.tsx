import { AnimatePresence } from "framer-motion";
import { useVideoPlayer } from "@/lib/video/hooks";
import { Scene1 } from "./video_scenes/Scene1";
import { Scene2 } from "./video_scenes/Scene2";
import { Scene3 } from "./video_scenes/Scene3";
import { Scene4 } from "./video_scenes/Scene4";
import { Scene5 } from "./video_scenes/Scene5";
import { Scene6 } from "./video_scenes/Scene6";

export function VideoTemplate() {
  const { currentScene } = useVideoPlayer({
    durations: {
      scene1: 3500,
      scene2: 4000,
      scene3: 4500,
      scene4: 4000,
      scene5: 5000,
      scene6: 3000,
    },
    loop: true,
  });

  const scenes = [
    <Scene1 key="scene-1" />,
    <Scene2 key="scene-2" />,
    <Scene3 key="scene-3" />,
    <Scene4 key="scene-4" />,
    <Scene5 key="scene-5" />,
    <Scene6 key="scene-6" />,
  ];

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden noise">
      <AnimatePresence mode="sync">
        {scenes[currentScene]}
      </AnimatePresence>
    </div>
  );
}
