const SOUND_PATHS = {
  button: "/sounds/button.mp3",
  ding: "/sounds/ding.mp3",
  "game-menu": "/sounds/game-menu.mp3",
  happy: "/sounds/happy.mp3",
  join: "/sounds/join.mp3",
  notification: "/sounds/notification.mp3",
  "paper-fold": "/sounds/paper-fold.mp3",
  pop: "/sounds/pop.mp3",
  gudok: "/sounds/gudok.mp3?v=20260505-2",
};

function playErrorTone() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return;

  const ctx = new AudioContextCtor();
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.36);
  gain.connect(ctx.destination);

  [220, 165].forEach((frequency, idx) => {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(frequency, ctx.currentTime + idx * 0.14);
    osc.connect(gain);
    osc.start(ctx.currentTime + idx * 0.14);
    osc.stop(ctx.currentTime + idx * 0.14 + 0.12);
  });

  setTimeout(() => ctx.close().catch(() => {}), 600);
}

const FALLBACK_SOUNDS = {
  "sharp-pop": "pop",
  "short-beep": "button",
  beep: "gudok",
};

export function playGameSound(sound) {
  if (!sound || sound === "off" || typeof Audio === "undefined") return;

  const resolvedSound = FALLBACK_SOUNDS[sound] || sound;
  if (resolvedSound === "error") {
    try {
      playErrorTone();
    } catch {
      // Audio playback is optional feedback, not part of the game state.
    }
    return;
  }

  const src = SOUND_PATHS[resolvedSound];
  if (!src) return;

  try {
    const audio = new Audio(src);
    audio.currentTime = 0;
    audio.play().catch(() => {
      // Browsers may block audio before user interaction; the game should continue silently.
    });
  } catch {
    // Audio playback is optional feedback, not part of the game state.
  }
}
