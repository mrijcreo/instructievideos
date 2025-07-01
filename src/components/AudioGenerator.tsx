'use client'

import { useState, useRef } from 'react'
import { saveAs } from 'file-saver'
import JSZip from 'jszip'

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
  const [currentStep, setCurrentStep] = useState<'settings' | 'generate' | 'download'>('settings')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [currentSlide, setCurrentSlide] = useState(0)
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([])
  const [selectedVoice, setSelectedVoice] = useState(GEMINI_VOICES[0])
  const [selectedEmotion, setSelectedEmotion] = useState(EMOTION_STYLES[0])
  const [useMicrosoftTTS, setUseMicrosoftTTS] = useState(false)
  const [microsoftSpeed, setMicrosoftSpeed] = useState(1.0)
  const [error, setError] = useState<string>('')
  const [isCreatingZip, setIsCreatingZip] = useState(false)
  
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

    setCurrentStep('generate')
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
      
      if (newAudioFiles.length > 0) {
        setCurrentStep('download')
      }

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

  const downloadAllAudioAsZip = async () => {
    if (audioFiles.length === 0) return

    setIsCreatingZip(true)
    setError('')

    try {
      console.log('📦 Creating ZIP file with', audioFiles.length, 'audio files...')
      
      const zip = new JSZip()
      
      // Add each audio file to the ZIP
      for (const audioFile of audioFiles) {
        const fileName = `Slide_${audioFile.slideNumber.toString().padStart(2, '0')}_${audioFile.title.replace(/[^a-z0-9]/gi, '_')}.wav`
        console.log(`📁 Adding to ZIP: ${fileName}`)
        zip.file(fileName, audioFile.audioBlob)
      }
      
      // Add a README file with information
      const readmeContent = `Presentatie Audio Bestanden
==============================

Gegenereerd op: ${new Date().toLocaleString('nl-NL')}
Aantal slides: ${audioFiles.length}
TTS Engine: ${useMicrosoftTTS ? 'Microsoft TTS' : 'Gemini AI TTS'}
${!useMicrosoftTTS ? `Stem: ${selectedVoice.name} (${selectedVoice.description})` : ''}
${!useMicrosoftTTS ? `Emotie: ${selectedEmotion.label}` : ''}
${useMicrosoftTTS ? `Snelheid: ${microsoftSpeed}x` : ''}

Bestanden:
${audioFiles.map(af => `- Slide_${af.slideNumber.toString().padStart(2, '0')}_${af.title.replace(/[^a-z0-9]/gi, '_')}.wav`).join('\n')}

Instructies:
- Speel de bestanden af in volgorde voor een complete presentatie
- Elk bestand bevat het script voor één slide
- Gebruik een mediaspeler die WAV bestanden ondersteunt
`
      
      zip.file('README.txt', readmeContent)
      
      console.log('🔄 Generating ZIP file...')
      
      // Generate the ZIP file
      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {
          level: 6
        }
      })
      
      // Create filename with timestamp
      const now = new Date()
      const timestamp = now.toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '-')
      const zipFileName = `Presentatie_Audio_${timestamp}.zip`
      
      console.log('💾 Downloading ZIP file:', zipFileName)
      
      // Download the ZIP file
      saveAs(zipBlob, zipFileName)
      
      console.log('✅ ZIP download complete!')
      
    } catch (error) {
      console.error('❌ ZIP creation failed:', error)
      setError('Fout bij maken van ZIP bestand: ' + (error instanceof Error ? error.message : 'Onbekende fout'))
    } finally {
      setIsCreatingZip(false)
    }
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
    setCurrentStep('settings')
  }

  const goBackToSettings = () => {
    setCurrentStep('settings')
    setError('')
  }

  const goBackToGenerate = () => {
    setCurrentStep('generate')
    setError('')
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
            📦 Download Audio in ZIP
          </h3>
          <p className="text-gray-600">
            Kies je TTS instellingen en genereer audio voor alle {slides.length} slides
          </p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center mb-8">
        <div className="flex items-center space-x-4">
          {/* Step 1: Settings */}
          <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
            currentStep === 'settings' ? 'bg-blue-100 text-blue-800' : 
            audioFiles.length > 0 || currentStep !== 'settings' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
          }`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${
              currentStep === 'settings' ? 'bg-blue-600 text-white' : 
              audioFiles.length > 0 || currentStep !== 'settings' ? 'bg-green-600 text-white' : 'bg-gray-400 text-white'
            }`}>
              1
            </span>
            <span className="font-medium">⚙️ TTS Instellingen</span>
          </div>

          <div className="w-8 h-0.5 bg-gray-300"></div>

          {/* Step 2: Generate */}
          <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
            currentStep === 'generate' ? 'bg-blue-100 text-blue-800' : 
            audioFiles.length > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
          }`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${
              currentStep === 'generate' ? 'bg-blue-600 text-white' : 
              audioFiles.length > 0 ? 'bg-green-600 text-white' : 'bg-gray-400 text-white'
            }`}>
              2
            </span>
            <span className="font-medium">🎙️ Audio Genereren</span>
          </div>

          <div className="w-8 h-0.5 bg-gray-300"></div>

          {/* Step 3: Download */}
          <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
            currentStep === 'download' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
          }`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${
              currentStep === 'download' ? 'bg-blue-600 text-white' : 'bg-gray-400 text-white'
            }`}>
              3
            </span>
            <span className="font-medium">📦 Download ZIP</span>
          </div>
        </div>
      </div>

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

      {/* Step 1: TTS Settings */}
      {currentStep === 'settings' && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h4 className="text-lg font-semibold text-blue-800 mb-4">🔧 Stap 1: TTS Instellingen</h4>
            
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
                        <div className="text-sm text-gray-600">Hoogste kwaliteit, 30 stemmen, emoties</div>
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

            <div className="flex justify-center">
              <button
                onClick={generateAllAudio}
                disabled={slides.filter(s => s.script?.trim()).length === 0}
                className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <span>Ga naar Audio Generatie</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Generate Audio */}
      {currentStep === 'generate' && (
        <div className="space-y-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <h4 className="text-lg font-semibold text-green-800 mb-4">🎙️ Stap 2: Audio Genereren</h4>
            
            {/* Settings Summary */}
            <div className="bg-white border border-green-200 rounded-lg p-4 mb-6">
              <h5 className="font-medium text-green-800 mb-2">Gekozen Instellingen:</h5>
              <div className="text-sm text-green-700 space-y-1">
                <p><strong>TTS Engine:</strong> {useMicrosoftTTS ? '🎤 Microsoft TTS' : '🤖 Gemini AI TTS'}</p>
                {!useMicrosoftTTS && (
                  <>
                    <p><strong>Stem:</strong> {selectedVoice.name} ({selectedVoice.description})</p>
                    <p><strong>Emotie:</strong> {selectedEmotion.label}</p>
                  </>
                )}
                {useMicrosoftTTS && (
                  <p><strong>Snelheid:</strong> {microsoftSpeed}x</p>
                )}
                <p><strong>Slides:</strong> {slides.length} slides met scripts</p>
              </div>
              
              <div className="flex items-center space-x-3 mt-4">
                <button
                  onClick={goBackToSettings}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                >
                  ← Wijzig Instellingen
                </button>
              </div>
            </div>

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

            {/* Generate Button */}
            {!isGenerating && audioFiles.length === 0 && (
              <div className="text-center">
                <button
                  onClick={generateAllAudio}
                  disabled={slides.filter(s => s.script?.trim()).length === 0}
                  className="px-8 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-3 mx-auto"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 14.142M9 9a3 3 0 000 6h6a3 3 0 000-6H9z" />
                  </svg>
                  <span>🎙️ Start Audio Generatie</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Download Audio */}
      {currentStep === 'download' && audioFiles.length > 0 && (
        <div className="space-y-6">
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
            <h4 className="text-lg font-semibold text-purple-800 mb-4">📦 Stap 3: Download Audio</h4>
            
            {/* Success Message */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-green-800 font-medium">
                  ✅ {audioFiles.length} audio bestanden succesvol gegenereerd!
                </span>
              </div>
              <p className="text-green-700 text-sm mt-1">
                Alle audio bestanden zijn klaar voor download in een ZIP bestand
              </p>
            </div>

            {/* ZIP Creation Progress */}
            {isCreatingZip && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                <div className="flex items-center space-x-3">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-blue-800 font-medium">
                    📦 ZIP bestand wordt gemaakt met {audioFiles.length} audio bestanden...
                  </span>
                </div>
                <p className="text-blue-700 text-sm mt-2 ml-9">
                  Even geduld, alle audio bestanden worden ingepakt voor download
                </p>
              </div>
            )}

            {/* Download Actions */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
                <button
                  onClick={downloadAllAudioAsZip}
                  disabled={isCreatingZip}
                  className="px-8 py-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-3"
                >
                  {isCreatingZip ? (
                    <>
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>ZIP maken...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                      </svg>
                      <span>📦 Download Alle Audio als ZIP</span>
                    </>
                  )}
                </button>

                <button
                  onClick={playAllSequentially}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center space-x-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m2 4H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>▶️ Test: Speel Alles Af</span>
                </button>
              </div>

              <div className="flex items-center justify-center space-x-4">
                <button
                  onClick={goBackToGenerate}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                >
                  ← Terug naar Generatie
                </button>

                <button
                  onClick={clearAllAudio}
                  className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm"
                >
                  🗑️ Wis Alle Audio
                </button>
              </div>
            </div>

            {/* Individual Audio Files Preview */}
            <div className="mt-6">
              <h5 className="font-medium text-purple-800 mb-3">Audio Bestanden Preview:</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {audioFiles.map((audioFile) => (
                  <div key={audioFile.slideNumber} className="bg-white border border-purple-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h6 className="font-medium text-gray-800 text-sm">
                          Slide {audioFile.slideNumber}
                        </h6>
                        <p className="text-xs text-gray-600 truncate" title={audioFile.title}>
                          {audioFile.title}
                        </p>
                      </div>
                      <div className="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                        {audioFile.slideNumber}
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => playAudio(audioFile.slideNumber)}
                        className="flex-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium hover:bg-purple-200 transition-colors flex items-center justify-center space-x-1"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m2 4H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>▶️</span>
                      </button>
                      
                      <button
                        onClick={() => downloadAudio(audioFile.slideNumber)}
                        className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200 transition-colors"
                        title="Download individueel"
                      >
                        📥
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
            <p className="font-medium mb-1">💡 Audio Generator Workflow:</p>
            <ul className="space-y-1 text-gray-600">
              <li>• <strong>Stap 1:</strong> Kies TTS engine (Gemini AI of Microsoft) en configureer instellingen</li>
              <li>• <strong>Stap 2:</strong> Genereer audio voor alle slides met je gekozen instellingen</li>
              <li>• <strong>Stap 3:</strong> Download alle audio bestanden in één ZIP bestand met README</li>
              <li>• <strong>📦 ZIP bevat:</strong> Alle WAV bestanden + README met instructies</li>
              <li>• <strong>🎵 Audio kwaliteit:</strong> Gemini AI = hoogste kwaliteit, Microsoft = sneller</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}