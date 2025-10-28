// == Non compliant Code Example

return (
  <>
    // ruleid: gci36-javascript-autoplay-should-be-avoided-for-video-and-audio-content
    <video src="video.mp4" autoplay/>
    <video src="video.mp4" preload="auto"/>
    <video src="video.mp4" autoplay preload="auto"/>
  </>
)

return (
  <>
    // ruleid: gci36-javascript-autoplay-should-be-avoided-for-video-and-audio-content
    <audio controls src="audiofile.mp3" autoplay></audio>
  </>
)

// == Compliant Solution

return (
  // ok: gci36-javascript-autoplay-should-be-avoided-for-video-and-audio-content
  <video src="video.mp4" preload="none"/>
)

return (
  // ok: gci36-javascript-autoplay-should-be-avoided-for-video-and-audio-content
  <audio controls src="audiofile.mp3" preload="none"></audio>
)
