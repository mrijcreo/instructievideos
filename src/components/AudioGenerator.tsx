'use client'

import { useState, useRef } from 'react'
import { saveAs } from 'file-saver'

interface Slide {
  slideNumber: number
  title: string
  content: string
  script?: string
}

interface AudioGeneratorProps {
  slides: Slide[]
  className?: string
}

interface AudioFile {
  slideNumber: number
  title: string
  audioBlob: Blob
  audioUrl: string
  duration?: number
}

// Gemini TTS voices with descriptions
const GEMINI_VOICES = [
  { name: 'Kore', description: 'Warm, vriendelijk (mannelijk)' },
  { name: 'Charon', description: 'Professioneel, zakelijk (mannelijk)' },
  { name: 'Fenrir', description: 'Krachtig, autoritair (mannelijk)' },
  { name: 'Aoede', description: 'Melodieus, elegant (vrouwelijk)' },
  { name: 'Puck', description: 'Speels, energiek (mannelijk)' },
  { name: 'Callisto', description: 'Kalm, betrouwbaar (vrouwelijk)' },
  { name: 'Dione', description: 'Warm, moederlijk (vrouwelijk)' },
  { name: 'Ganymede', description: 'Jong, enthousiast (mannelijk)' },
  { name: 'Titan', description: 'Diep, imposant (mannelijk)' },
  { name: 'Zephyr', description: 'Licht, luchtig (vrouwelijk)' }
]

const EMOTION_STYLES = [
  { value: 'neutral', label: '😐 Neutraal', description: 'Standaard, natuurlijke toon' },
  { value: 'happy', label: '😊 Gelukkig', description: 'Vrolijk en positief' },
  { value: 'excited', label: '🎉 Enthousiast', description: 'Energiek en opgewonden' },
  { value: 'calm', label: '😌 Kalm', description: 'Rustig en ontspannen' },
  { value: 'professional', label: '💼 Professioneel', description: 'Zakelijk en formeel' },
  { value: 'friendly', label: '🤝 Vriendelijk', description: 'Warm en toegankelijk' },
  { value: 'informative', label: '📚 Informatief', description: 'Educatief en duidelijk' }
]

export default function AudioGenerator({ slides, className = '' }: AudioGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [currentSlide, setCurrentSlide] = useState(0)
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([])
  const [selectedVoice, setSelectedVoice] = useState(GEMINI_VOICES[0])
  const [selectedEmotion, setSelectedEmotion] = useState(EMOTION_STYLES[0])
  const [useMicrosoftTTS, setUseMicrosoftTTS] = useState(false)
  const [microsoftSpeed, setMicrosoftSpeed] = useState(1.0)
  const [showSettings, setShowSettings] = useState(false)
  const [error, setError] = useState<string>('')
  
  const audioRefs = useRef<{ [key: number]: HTMLAudioElement }>({})

  const speedOptions = [
    { label: '🐌 Langzaam', value: 0.75 },
    { label: '📚 Normaal', value: 1.0 },
    { label: '⚡ Snel', value: 1.5 },
    { label: '🚀 Allersnelst', value: 2.0 }
  ]

  const generateMicrosoftTTS = async (text: string, slideNumber: number): Promise<AudioFile> => {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject(new Error('Browser ondersteunt geen TTS'))
        return
      }

      const utterance = new SpeechSynthesisUtterance(text)
      
      // Find best Dutch voice
      const voices = window.speechSynthesis.getVoices()
      const dutchVoice = voices.find(voice => 
        voice.lang.startsWith('nl') || voice.name.toLowerCase().includes('dutch')
      ) || voices[0]
      
      if (dutchVoice) {
        utterance.voice = dutchVoice
        utterance.lang = dutchVoice.lang
      } else {
        utterance.lang = 'nl-NL'
      }
      
      utterance.rate = microsoftSpeed
      utterance.pitch = 1.0
      utterance.volume = 1.0

      // Create audio recording
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const destination = audioContext.createMediaStreamDestination()
      const mediaRecorder = new MediaRecorder(destination.stream)
      const audioChunks: Blob[] = []

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data)
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' })
        const audioUrl = URL.createObjectURL(audioBlob)
        
        const slide = slides.find(s => s.slideNumber === slideNumber)
        resolve({
          slideNumber,
          title: slide?.title || `Slide ${slideNumber}`,
          audioBlob,
          audioUrl
        })
      }

      utterance.onstart = () => {
        mediaRecorder.start()
      }

      utterance.onend = () => {
        setTimeout(() => {
          mediaRecorder.stop()
          audioContext.close()
        }, 100)
      }

      utterance.onerror = (event) => {
        reject(new Error(`TTS fout: ${event.error}`))
      }

      window.speechSynthesis.speak(utterance)
    })
  }

  const generateGeminiTTS = async (text: string, slideNumber: number): Promise<AudioFile> => {
    const response = await fetch('/api/generate-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text,
        voiceName: selectedVoice.name,
        emotion: selectedEmotion.value
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'TTS generatie mislukt')
    }

    const data = await response.json()
    
    // Convert base64 to blob
    const audioData = atob(data.audioData)
    const audioArray = new Uint8Array(audioData.length)
    for (let i = 0; i < audioData.length; i++) {
      audioArray[i] = audioData.charCodeAt(i)
    }
    
    const audioBlob = new Blob([audioArray], { type: 'audio/wav' })
    const audioUrl = URL.createObjectURL(audioBlob)
    
    const slide = slides.find(s => s.slideNumber === slideNumber)
    return {
      slideNumber,
      title: slide?.title || `Slide ${slideNumber}`,
      audioBlob,
      audioUrl
    }
  }

  const generateAllAudio = async () => {
    if (slides.length === 0) {
      setError('Geen slides beschikbaar voor audio generatie')
      return
    }

    setIsGenerating(true)
    setGenerationProgress(0)
    setCurrentSlide(0)
    setError('')
    setAudioFiles([])

    try {
      const newAudioFiles: AudioFile[] = []

      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i]
        setCurrentSlide(i + 1)
        
        if (!slide.script || slide.script.trim().length === 0) {
          console.warn(`Slide ${slide.slideNumber} heeft geen script, wordt overgeslagen`)
          continue
        }

        console.log(`🔊 Generating audio for slide ${slide.slideNumber}/${slides.length}`)

        try {
          let audioFile: AudioFile
          
          if (useMicrosoftTTS) {
            audioFile = await generateMicrosoftTTS(slide.script, slide.slideNumber)
          } else {
            audioFile = await generateGeminiTTS(slide.script, slide.slideNumber)
          }
          
          newAudioFiles.push(audioFile)
          setAudioFiles([...newAudioFiles])
          
        } catch (slideError) {
          console.error(`Fout bij slide ${slide.slideNumber}:`, slideError)
          setError(`Fout bij slide ${slide.slideNumber}: ${slideError instanceof Error ? slideError.message : 'Onbekende fout'}`)
        }

        // Update progress
        const progress = ((i + 1) / slides.length) * 100
        setGenerationProgress(progress)

        // Small delay between generations to prevent overwhelming the API
        if (i < slides.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      console.log(`✅ Audio generation complete: ${newAudioFiles.length}/${slides.length} slides`)

    } catch (error) {
      console.error('❌ Audio generation failed:', error)
      setError('Fout bij audio generatie: ' + (error instanceof Error ? error.message : 'Onbekende fout'))
    } finally {
      setIsGenerating(false)
      setCurrentSlide(0)
    }
  }

  const playAudio = (slideNumber: number) => {
    const audioFile = audioFiles.find(af => af.slideNumber === slideNumber)
    if (!audioFile) return

    // Stop all other audio first
    Object.values(audioRefs.current).forEach(audio => {
      if (audio && !audio.paused) {
        audio.pause()
        audio.currentTime = 0
      }
    })

    // Play selected audio
    if (!audioRefs.current[slideNumber]) {
      audioRefs.current[slideNumber] = new Audio(audioFile.audioUrl)
    }
    
    const audio = audioRefs.current[slideNumber]
    audio.play().catch(error => {
      console.error('Audio playback error:', error)
      setError('Fout bij afspelen audio')
    })
  }

  const downloadAudio = (slideNumber: number) => {
    const audioFile = audioFiles.find(af => af.slideNumber === slideNumber)
    if (!audioFile) return

    const fileName = `Slide_${slideNumber}_${audioFile.title.replace(/[^a-z0-9]/gi, '_')}.wav`
    saveAs(audioFile.audioBlob, fileName)
  }

  const downloadAllAudio = () => {
    if (audioFiles.length === 0) return

    // Create a zip file would be ideal, but for now download individually
    audioFiles.forEach((audioFile, index) => {
      setTimeout(() => {
        downloadAudio(audioFile.slideNumber)
      }, index * 500) // Stagger downloads
    })
  }

  const playAllSequentially = () => {
    if (audioFiles.length === 0) return

    let currentIndex = 0
    
    const playNext = () => {
      if (currentIndex >= audioFiles.length) return

      const audioFile = audioFiles[currentIndex]
      const audio = new Audio(audioFile.audioUrl)
      
      audio.onended = () => {
        currentIndex++
        setTimeout(playNext, 1000) // 1 second pause between slides
      }
      
      audio.onerror = () => {
        console.error(`Error playing slide ${audioFile.slideNumber}`)
        currentIndex++
        playNext()
      }
      
      console.log(`🔊 Playing slide ${audioFile.slideNumber}: ${audioFile.title}`)
      audio.play()
    }
    
    playNext()
  }

  const clearAllAudio = () => {
    // Stop all audio
    Object.values(audioRefs.current).forEach(audio => {
      if (audio) {
        audio.pause()
        audio.currentTime = 0
      }
    })
    
    // Revoke object URLs to free memory
    audioFiles.forEach(audioFile => {
      URL.revokeObjectURL(audioFile.audioUrl)
    })
    
    setAudioFiles([])
    audioRefs.current = {}
  }

  if (slides.length === 0) {
    return (
      <div className={`bg-gray-50 border border-gray-200 rounded-lg p-6 text-center ${className}`}>
        <div className="text-gray-500">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 14.142M9 9a3 3 0 000 6h6a3 3 0 000-6H9z" />
          </svg>
          <p className="text-lg font-medium">Geen slides beschikbaar</p>
          <p className="text-sm">Upload eerst een PowerPoint en genereer scripts om audio te maken</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-white rounded-2xl shadow-xl p-8 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-2xl font-bold text-gray-800 flex items-center">
            <svg className="w-8 h-8 text-blue-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 14.142M9 9a3 3 0 000 6h6a3 3 0 000-6H9z" />
            </svg>
            Audio Generator
          </h3>
          <p className="text-gray-600">
            Genereer audio voor alle {slides.length} slides met TTS
          </p>
        </div>
        
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center space-x-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>Instellingen</span>
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h4 className="text-lg font-semibold text-blue-800 mb-4">🔧 TTS Instellingen</h4>
          
          {/* TTS Engine Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">TTS Engine</label>
              <div className="space-y-3">
                <div 
                  className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${
                    !useMicrosoftTTS ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                  }`}
                  onClick={() => setUseMicrosoftTTS(false)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-800">🤖 Gemini AI TTS</div>
                      <div className="text-sm text-gray-600">Hoogste kwaliteit, 30 stemmen</div>
                    </div>
                    <div className={`w-4 h-4 rounded-full ${!useMicrosoftTTS ? 'bg-blue-500' : 'bg-gray-300'}`} />
                  </div>
                </div>
                
                <div 
                  className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${
                    useMicrosoftTTS ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300'
                  }`}
                  onClick={() => setUseMicrosoftTTS(true)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-800">🎤 Microsoft TTS</div>
                      <div className="text-sm text-gray-600">Browser native, snelheidscontrole</div>
                    </div>
                    <div className={`w-4 h-4 rounded-full ${useMicrosoftTTS ? 'bg-green-500' : 'bg-gray-300'}`} />
                  </div>
                </div>
              </div>
            </div>

            {/* Engine-specific settings */}
            <div>
              {!useMicrosoftTTS ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Gemini Stem</label>
                    <select
                      value={selectedVoice.name}
                      onChange={(e) => {
                        const voice = GEMINI_VOICES.find(v => v.name === e.target.value)
                        if (voice) setSelectedVoice(voice)
                      }}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {GEMINI_VOICES.map(voice => (
                        <option key={voice.name} value={voice.name}>
                          {voice.name} - {voice.description}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Emotie</label>
                    <select
                      value={selectedEmotion.value}
                      onChange={(e) => {
                        const emotion = EMOTION_STYLES.find(em => em.value === e.target.value)
                        if (emotion) setSelectedEmotion(emotion)
                      }}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {EMOTION_STYLES.map(emotion => (
                        <option key={emotion.value} value={emotion.value}>
                          {emotion.label} - {emotion.description}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Spraaksnelheid</label>
                  <div className="grid grid-cols-2 gap-2">
                    {speedOptions.map(option => (
                      <button
                        key={option.value}
                        onClick={() => setMicrosoftSpeed(option.value)}
                        className={`px-3 py-2 text-sm rounded-lg transition-all ${
                          microsoftSpeed === option.value
                            ? 'bg-green-600 text-white'
                            : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-red-800 font-medium">Fout</span>
          </div>
          <p className="text-red-700 text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Generation Progress */}
      {isGenerating && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-blue-800 font-medium">
              🔊 Audio wordt gegenereerd... ({currentSlide}/{slides.length})
            </span>
            <span className="text-blue-600 text-sm">
              {Math.round(generationProgress)}%
            </span>
          </div>
          
          <div className="w-full bg-blue-200 rounded-full h-3 mb-3">
            <div 
              className="bg-blue-600 h-3 rounded-full transition-all duration-500"
              style={{ width: `${generationProgress}%` }}
            />
          </div>
          
          <p className="text-blue-700 text-sm">
            {useMicrosoftTTS ? 'Microsoft TTS' : `Gemini TTS (${selectedVoice.name}, ${selectedEmotion.label})`}
          </p>
        </div>
      )}

      {/* Main Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4 mb-8">
        <button
          onClick={generateAllAudio}
          disabled={isGenerating || slides.filter(s => s.script?.trim()).length === 0}
          className="px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-3"
        >
          {isGenerating ? (
            <>
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Genereren...</span>
            </>
          ) : (
            <>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 14.142M9 9a3 3 0 000 6h6a3 3 0 000-6H9z" />
              </svg>
              <span>🔊 Genereer Audio voor Alle Slides</span>
            </>
          )}
        </button>

        {audioFiles.length > 0 && (
          <button
            onClick={clearAllAudio}
            className="px-6 py-3 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium"
          >
            🗑️ Wis Alle Audio
          </button>
        )}
      </div>

      {/* Audio Files List */}
      {audioFiles.length > 0 && (
        <div className="space-y-6">
          {/* Bulk Actions */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-green-800">
                  ✅ {audioFiles.length} audio bestanden gegenereerd
                </h4>
                <p className="text-green-700 text-sm">
                  Speel individueel af, download of speel alles achter elkaar af
                </p>
              </div>
              
              <div className="flex items-center space-x-3">
                <button
                  onClick={playAllSequentially}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center space-x-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m2 4H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>▶️ Speel Alles</span>
                </button>
                
                <button
                  onClick={downloadAllAudio}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center space-x-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>📥 Download Alles</span>
                </button>
              </div>
            </div>
          </div>

          {/* Individual Audio Files */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {audioFiles.map((audioFile) => (
              <div key={audioFile.slideNumber} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h5 className="font-medium text-gray-800">
                      Slide {audioFile.slideNumber}
                    </h5>
                    <p className="text-sm text-gray-600 truncate" title={audioFile.title}>
                      {audioFile.title}
                    </p>
                  </div>
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    {audioFile.slideNumber}
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => playAudio(audioFile.slideNumber)}
                    className="flex-1 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium flex items-center justify-center space-x-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m2 4H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>▶️ Afspelen</span>
                  </button>
                  
                  <button
                    onClick={() => downloadAudio(audioFile.slideNumber)}
                    className="px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm"
                    title="Download audio"
                  >
                    📥
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Section */}
      <div className="mt-8 bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-gray-700">
            <p className="font-medium mb-1">💡 Audio Generator Tips:</p>
            <ul className="space-y-1 text-gray-600">
              <li>• <strong>Gemini TTS:</strong> Hoogste kwaliteit, 30 stemmen, emotie-ondersteuning</li>
              <li>• <strong>Microsoft TTS:</strong> Sneller, browser native, snelheidscontrole</li>
              <li>• Audio wordt gegenereerd voor slides met scripts</li>
              <li>• Download individuele bestanden of speel alles achter elkaar af</li>
              <li>• Gebruik de instellingen om stem en emotie aan te passen</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}