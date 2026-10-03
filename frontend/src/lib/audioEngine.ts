let audio: HTMLAudioElement | null = null

export function getAudioEngine() {
  if (!audio) audio = new Audio()
  return audio
}

export function resumeAudio() {
  return getAudioEngine().play()
}

export function setAudioRate(rate: number) {
  if (audio) audio.playbackRate = rate
}
