'use client'

import { useState, useRef } from 'react'
import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx'
import SlideEditor from './SlideEditor'
import AudioGenerator from './AudioGenerator'

interface Slide {
  slideNumber: number
  title: string
  content: string
  script?: string
}

interface ProcessingStatus {
  stage: 'idle' | 'extracting' | 'generating' | 'adding-notes' | 'complete'
  progress: number
  message: string
}

type WorkflowMode = 'generate' | 'upload' | null

export default function PowerPointProcessor() {
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>(null)
  const [slides, setSlides] = useState<Slide[]>([])
  const [status, setStatus] = useState<ProcessingStatus>({
    stage: 'idle',
    progress: 0,
    message: ''
  })
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadedScript, setUploadedScript] = useState<string>('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [generatedScript, setGeneratedScript] = useState<string>('')
  const [scriptStyle, setScriptStyle] = useState<'professional' | 'casual' | 'educational'>('educational')
  const [scriptLength, setScriptLength] = useState<'beknopt' | 'normaal' | 'uitgebreid'>('beknopt')
  const [useTutoyeren, setUseTutoyeren] = useState(true)
  const [isRegeneratingAll, setIsRegeneratingAll] = useState(false)
  const [showAudioGenerator, setShowAudioGenerator] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scriptInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pptx')) {
      alert('Alleen .pptx bestanden zijn toegestaan!')
      return
    }

    setUploadedFile(file)
    setStatus({
      stage: 'extracting',
      progress: 10,
      message: 'PowerPoint wordt geanalyseerd met AI...'
    })

    try {
      const formData = new FormData()
      formData.append('file', file)

      console.log('🚀 Starting enhanced PowerPoint extraction...')

      const response = await fetch('/api/extract-slides', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Fout bij het extraheren van slides')
      }

      const data = await response.json()
      console.log('✅ Extraction successful:', data)
      
      if (!data.slides || data.slides.length === 0) {
        throw new Error('Geen slides gevonden in het PowerPoint bestand.')
      }

      setSlides(data.slides)
      
      setStatus({
        stage: 'extracting',
        progress: 50,
        message: `${data.slides.length} slides succesvol geanalyseerd!`
      })

      // BELANGRIJKE WIJZIGING: Alleen automatisch script genereren in 'generate' workflow
      if (workflowMode === 'generate') {
        await generateScript(data.slides)
      } else if (workflowMode === 'upload') {
        // In upload workflow: check of we al een script hebben
        if (uploadedScript) {
          // Beide bestanden zijn er, verwerk ze samen
          console.log('🔄 Both files available, processing script with slides...')
          await processUploadedScript(data.slides, uploadedScript)
        } else {
          // Wacht op script upload
          console.log('⏳ PowerPoint loaded, waiting for script...')
          setStatus({
            stage: 'idle',
            progress: 0,
            message: ''
          })
        }
      }

    } catch (error) {
      console.error('❌ Upload error:', error)
      setStatus({
        stage: 'idle',
        progress: 0,
        message: 'Fout bij uploaden: ' + (error instanceof Error ? error.message : 'Onbekende fout')
      })
      alert(`Fout bij het verwerken van PowerPoint:\n\n${error instanceof Error ? error.message : 'Onbekende fout'}`)
    }
  }

  const handleScriptUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.txt')) {
      alert('Alleen .txt bestanden zijn toegestaan voor scripts!')
      return
    }

    try {
      const text = await file.text()
      setUploadedScript(text)
      
      console.log('📄 Script uploaded:', text.length, 'characters')
      
      // BELANGRIJKE WIJZIGING: Alleen verwerken als we ook slides hebben
      if (slides.length > 0) {
        console.log('🔄 Both files available, processing script with current slides...')
        await processUploadedScript(slides, text)
      } else {
        // Reset status zodat gebruiker weet dat script is geladen
        console.log('⏳ Script loaded, waiting for PowerPoint...')
        setStatus({
          stage: 'idle',
          progress: 0,
          message: ''
        })
      }
    } catch (error) {
      console.error('Script upload error:', error)
      alert('Fout bij het uploaden van script: ' + (error instanceof Error ? error.message : 'Onbekende fout'))
    }
  }

  // BELANGRIJKE WIJZIGING: Accepteer slides en script als parameters
  const processUploadedScript = async (slidesToProcess: Slide[], scriptText: string = uploadedScript) => {
    console.log('🔄 Processing uploaded script with slides:', {
      slidesCount: slidesToProcess.length,
      scriptLength: scriptText.length,
      firstSlideTitle: slidesToProcess[0]?.title
    })

    setStatus({
      stage: 'generating',
      progress: 60,
      message: 'Script wordt verwerkt en toegewezen aan slides...'
    })

    try {
      // Split script into sections based on slide markers or paragraphs
      const scriptSections = parseScriptForSlides(scriptText, slidesToProcess.length)
      
      console.log('📝 Script sections parsed:', {
        sectionsCount: scriptSections.length,
        firstSection: scriptSections[0]?.substring(0, 100) + '...'
      })
      
      const updatedSlides = slidesToProcess.map((slide, index) => ({
        ...slide,
        script: scriptSections[index] || `Script voor slide ${slide.slideNumber}`
      }))
      
      setSlides(updatedSlides)
      
      const fullScript = updatedSlides.map((s, i) => 
        `=== SLIDE ${s.slideNumber}: ${s.title} ===\n\n${s.script}`
      ).join('\n\n\n')
      
      setGeneratedScript(fullScript)
      
      console.log('✅ Script successfully assigned to slides')
      
      setStatus({
        stage: 'complete',
        progress: 100,
        message: `Script succesvol toegewezen aan ${updatedSlides.length} slides!`
      })

    } catch (error) {
      console.error('❌ Script processing error:', error)
      setStatus({
        stage: 'idle',
        progress: 0,
        message: 'Fout bij script verwerking: ' + (error instanceof Error ? error.message : 'Onbekende fout')
      })
    }
  }

  const parseScriptForSlides = (script: string, slideCount: number): string[] => {
    console.log('🔍 Parsing script for', slideCount, 'slides')
    
    // Try to detect slide markers first
    const slideMarkers = script.match(/(?:slide\s*\d+|===\s*slide\s*\d+|^\d+\.)/gmi)
    
    if (slideMarkers && slideMarkers.length >= slideCount) {
      console.log('📋 Found slide markers, splitting by markers')
      // Split by slide markers
      const sections = script.split(/(?=slide\s*\d+|===\s*slide\s*\d+|^\d+\.)/mi)
      return sections.slice(1, slideCount + 1).map(section => section.trim())
    }
    
    // Fallback: split by paragraphs
    const paragraphs = script.split(/\n\s*\n/).filter(p => p.trim().length > 0)
    
    if (paragraphs.length >= slideCount) {
      console.log('📋 Splitting by paragraphs')
      return paragraphs.slice(0, slideCount)
    }
    
    // If not enough paragraphs, distribute text evenly
    console.log('📋 Distributing text evenly across slides')
    const words = script.split(/\s+/)
    const wordsPerSlide = Math.ceil(words.length / slideCount)
    const sections: string[] = []
    
    for (let i = 0; i < slideCount; i++) {
      const start = i * wordsPerSlide
      const end = Math.min((i + 1) * wordsPerSlide, words.length)
      sections.push(words.slice(start, end).join(' '))
    }
    
    return sections
  }

  const generateScript = async (slidesToProcess: Slide[] = slides) => {
    if (slidesToProcess.length === 0) return

    setStatus({
      stage: 'generating',
      progress: 60,
      message: 'Gemini 2.5 Pro genereert professioneel script...'
    })

    try {
      const response = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slides: slidesToProcess,
          style: scriptStyle,
          length: scriptLength,
          useTutoyeren: useTutoyeren
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Fout bij het genereren van script')
      }

      const data = await response.json()
      
      const updatedSlides = slidesToProcess.map((slide, index) => ({
        ...slide,
        script: data.scripts[index] || ''
      }))
      
      setSlides(updatedSlides)
      
      const fullScript = updatedSlides.map((s, i) => 
        `=== SLIDE ${s.slideNumber}: ${s.title} ===\n\n${s.script}`
      ).join('\n\n\n')
      
      setGeneratedScript(fullScript)
      
      setStatus({
        stage: 'complete',
        progress: 100,
        message: `Script succesvol gegenereerd!`
      })

    } catch (error) {
      console.error('❌ Script generation error:', error)
      setStatus({
        stage: 'idle',
        progress: 0,
        message: 'Fout bij script generatie: ' + (error instanceof Error ? error.message : 'Onbekende fout')
      })
      alert(`Script generatie mislukt:\n\n${error instanceof Error ? error.message : 'Onbekende fout'}`)
    }
  }

  // NEW: Regenerate all scripts function
  const regenerateAllScripts = async () => {
    if (slides.length === 0) return

    setIsRegeneratingAll(true)

    try {
      console.log('🔄 Regenerating all scripts with current settings:', {
        style: scriptStyle,
        length: scriptLength,
        tutoyeren: useTutoyeren,
        slideCount: slides.length
      })

      const response = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slides: slides,
          style: scriptStyle,
          length: scriptLength,
          useTutoyeren: useTutoyeren
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Fout bij het regenereren van alle scripts')
      }

      const data = await response.json()
      
      const updatedSlides = slides.map((slide, index) => ({
        ...slide,
        script: data.scripts[index] || ''
      }))
      
      setSlides(updatedSlides)
      
      const fullScript = updatedSlides.map((s, i) => 
        `=== SLIDE ${s.slideNumber}: ${s.title} ===\n\n${s.script}`
      ).join('\n\n\n')
      
      setGeneratedScript(fullScript)
      
      console.log('✅ All scripts regenerated successfully')

    } catch (error) {
      console.error('❌ All scripts regeneration error:', error)
      alert('Fout bij het regenereren van alle scripts: ' + (error instanceof Error ? error.message : 'Onbekende fout'))
    } finally {
      setIsRegeneratingAll(false)
    }
  }

  const handleScriptUpdate = (slideNumber: number, newScript: string) => {
    setSlides(prev => prev.map(slide => 
      slide.slideNumber === slideNumber 
        ? { ...slide, script: newScript }
        : slide
    ))
    
    // Update full script
    const updatedSlides = slides.map(slide => 
      slide.slideNumber === slideNumber 
        ? { ...slide, script: newScript }
        : slide
    )
    
    const fullScript = updatedSlides.map((s, i) => 
      `=== SLIDE ${s.slideNumber}: ${s.title} ===\n\n${s.script}`
    ).join('\n\n\n')
    setGeneratedScript(fullScript)
  }

  // Download PowerPoint with notes only
  const downloadWithNotesOnly = async () => {
    if (!uploadedFile || slides.length === 0) return

    setStatus({
      stage: 'adding-notes',
      progress: 80,
      message: 'PowerPoint wordt voorbereid met scripts in notities...'
    })

    try {
      const formData = new FormData()
      formData.append('file', uploadedFile)
      formData.append('slides', JSON.stringify(slides))

      const response = await fetch('/api/add-notes', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Fout bij het toevoegen van notities aan PowerPoint')
      }

      const blob = await response.blob()
      const fileName = uploadedFile.name.replace('.pptx', '_met_scripts.pptx')
      
      saveAs(blob, fileName)
      
      setStatus({
        stage: 'complete',
        progress: 100,
        message: 'PowerPoint gedownload met scripts in notities!'
      })

    } catch (error) {
      console.error('Download error:', error)
      setStatus({
        stage: 'idle',
        progress: 0,
        message: 'Fout bij downloaden: ' + (error instanceof Error ? error.message : 'Onbekende fout')
      })
    }
  }

  const downloadScriptAsTxt = () => {
    if (!generatedScript) return
    const blob = new Blob([generatedScript], { type: 'text/plain;charset=utf-8' })
    const fileName = uploadedFile 
      ? uploadedFile.name.replace('.pptx', '_script.txt')
      : 'presentatie_script.txt'
    saveAs(blob, fileName)
  }

  const downloadScriptAsExcel = () => {
    if (!slides.length) return

    const worksheetData = [['Script']]
    slides.forEach(slide => {
      worksheetData.push([slide.script || 'Geen script gegenereerd'])
    })

    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)
    const columnWidths = [{ wch: 120 }]
    worksheet['!cols'] = columnWidths

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Scripts')

    const fileName = uploadedFile 
      ? uploadedFile.name.replace('.pptx', '_scripts.xlsx')
      : 'presentatie_scripts.xlsx'

    XLSX.writeFile(workbook, fileName)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      const file = files[0]
      if (file.name.toLowerCase().endsWith('.pptx')) {
        handleFileUpload(file)
      } else if (file.name.toLowerCase().endsWith('.txt')) {
        handleScriptUpload(file)
      } else {
        alert('Alleen .pptx en .txt bestanden zijn toegestaan!')
      }
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const resetApp = () => {
    setWorkflowMode(null)
    setSlides([])
    setUploadedFile(null)
    setUploadedScript('')
    setGeneratedScript('')
    setUseTutoyeren(true)
    setIsRegeneratingAll(false)
    setShowAudioGenerator(false)
    setStatus({ stage: 'idle', progress: 0, message: '' })
  }

  const goBackToSettings = () => {
    setStatus({ stage: 'idle', progress: 0, message: '' })
    setGeneratedScript('')
    setUseTutoyeren(true)
    setIsRegeneratingAll(false)
    setShowAudioGenerator(false)
    const slidesWithoutScripts = slides.map(slide => ({
      ...slide,
      script: undefined
    }))
    setSlides(slidesWithoutScripts)
  }

  const getScriptLengthDescription = (length: string) => {
    switch (length) {
      case 'beknopt': return 'Korte, bondige scripts (15-30 sec per slide)'
      case 'normaal': return 'Standaard scripts (30-45 sec per slide)'
      case 'uitgebreid': return 'Uitgebreide scripts (45-60 sec per slide)'
      default: return ''
    }
  }

  const getScriptStyleDescription = (style: string) => {
    switch (style) {
      case 'professional': return 'Zakelijk, formeel en overtuigend'
      case 'casual': return 'Informeel, toegankelijk en persoonlijk'
      case 'educational': return 'Educatief, duidelijk en leerzaam'
      default: return ''
    }
  }

  // Helper function to check if we can proceed with processing
  const canProcessFiles = () => {
    if (workflowMode === 'generate') {
      return uploadedFile && slides.length > 0
    } else if (workflowMode === 'upload') {
      return uploadedFile && slides.length > 0 && uploadedScript
    }
    return false
  }

  // Workflow Selection Screen
  if (workflowMode === null) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">
          Kies je Workflow
        </h2>
        
        <p className="text-lg text-gray-600 text-center mb-8">
          Hoe wil je je PowerPoint presentatie verwerken?
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Generate Script Option */}
          <div 
            className="border-2 border-blue-200 rounded-xl p-6 hover:border-blue-400 hover:shadow-lg transition-all cursor-pointer group"
            onClick={() => setWorkflowMode('generate')}
          >
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-200 transition-colors">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              
              <h3 className="text-xl font-bold text-blue-800 mb-3">
                🤖 Script Genereren
              </h3>
              
              <p className="text-blue-600 mb-4">
                Upload je PowerPoint en laat AI een professioneel script genereren
              </p>
              
              <div className="text-sm text-blue-500 space-y-1">
                <div>✅ AI analyseert je slides</div>
                <div>✅ Genereert aangepast script</div>
                <div>✅ Keuze uit stijlen en lengtes</div>
                <div>✅ Tutoyeren optie</div>
              </div>
            </div>
          </div>

          {/* Upload Script Option */}
          <div 
            className="border-2 border-green-200 rounded-xl p-6 hover:border-green-400 hover:shadow-lg transition-all cursor-pointer group"
            onClick={() => setWorkflowMode('upload')}
          >
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-green-200 transition-colors">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
              </div>
              
              <h3 className="text-xl font-bold text-green-800 mb-3">
                📄 Script Uploaden
              </h3>
              
              <p className="text-green-600 mb-4">
                Upload je eigen script (.txt) en PowerPoint om ze te combineren
              </p>
              
              <div className="text-sm text-green-500 space-y-1">
                <div>✅ Upload bestaand script</div>
                <div>✅ Upload PowerPoint</div>
                <div>✅ Automatische toewijzing</div>
                <div>✅ Download met notities</div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center mt-8">
          <p className="text-gray-500 text-sm">
            Beide opties ondersteunen Word export, script bewerking en audio generatie
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Workflow Header */}
      <div className="bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              workflowMode === 'generate' ? 'bg-blue-100' : 'bg-green-100'
            }`}>
              {workflowMode === 'generate' ? (
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
              )}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-800">
                {workflowMode === 'generate' ? '🤖 Script Genereren Workflow' : '📄 Script Upload Workflow'}
              </h2>
              <p className="text-gray-600">
                {workflowMode === 'generate' 
                  ? 'Upload PowerPoint → AI genereert script → Download met notities + Audio'
                  : 'Upload script + PowerPoint → Combineer → Download met notities + Audio'
                }
              </p>
            </div>
          </div>
          <button
            onClick={resetApp}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            🔄 Andere Workflow
          </button>
        </div>
      </div>

      {/* Upload Section */}
      {(status.stage === 'idle') && (
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
            {workflowMode === 'generate' 
              ? (uploadedFile ? 'Wijzig Instellingen & Regenereer Script' : 'Upload je PowerPoint Presentatie')
              : 'Upload je Bestanden'
            }
          </h2>
          
          {/* Upload Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* PowerPoint Status */}
            <div className={`border-2 rounded-lg p-4 ${
              uploadedFile ? 'border-blue-200 bg-blue-50' : 'border-gray-200'
            }`}>
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  uploadedFile ? 'bg-blue-100' : 'bg-gray-100'
                }`}>
                  <svg className={`w-5 h-5 ${uploadedFile ? 'text-blue-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className={`font-medium ${uploadedFile ? 'text-blue-800' : 'text-gray-700'}`}>
                    PowerPoint (.pptx)
                  </p>
                  {uploadedFile ? (
                    <div>
                      <p className="text-blue-600 text-sm">{uploadedFile.name}</p>
                      <p className="text-blue-500 text-xs">{slides.length} slides geëxtraheerd</p>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">Nog niet geüpload</p>
                  )}
                </div>
              </div>
            </div>

            {/* Script Status - Only for upload workflow */}
            {workflowMode === 'upload' && (
              <div className={`border-2 rounded-lg p-4 ${
                uploadedScript ? 'border-green-200 bg-green-50' : 'border-gray-200'
              }`}>
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    uploadedScript ? 'bg-green-100' : 'bg-gray-100'
                  }`}>
                    <svg className={`w-5 h-5 ${uploadedScript ? 'text-green-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className={`font-medium ${uploadedScript ? 'text-green-800' : 'text-gray-700'}`}>
                      Script (.txt)
                    </p>
                    {uploadedScript ? (
                      <div>
                        <p className="text-green-600 text-sm">Script geladen</p>
                        <p className="text-green-500 text-xs">{uploadedScript.split(' ').length} woorden</p>
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">Nog niet geüpload</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Upload Workflow Status Message */}
          {workflowMode === 'upload' && (uploadedFile || uploadedScript) && !canProcessFiles() && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <div className="flex items-center space-x-3">
                <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <div className="text-yellow-800">
                  <p className="font-medium">Wacht op beide bestanden</p>
                  <p className="text-sm">
                    {!uploadedFile && !uploadedScript && 'Upload zowel een PowerPoint (.pptx) als een script (.txt) bestand'}
                    {uploadedFile && !uploadedScript && 'PowerPoint geladen! Upload nu een script (.txt) bestand'}
                    {!uploadedFile && uploadedScript && 'Script geladen! Upload nu een PowerPoint (.pptx) bestand'}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Settings - Only for generate workflow */}
          {workflowMode === 'generate' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Script Stijl</label>
                  <select
                    value={scriptStyle}
                    onChange={(e) => setScriptStyle(e.target.value as any)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="professional">🎯 Professioneel</option>
                    <option value="casual">😊 Informeel</option>
                    <option value="educational">📚 Educatief</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">{getScriptStyleDescription(scriptStyle)}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Script Lengte</label>
                  <select
                    value={scriptLength}
                    onChange={(e) => setScriptLength(e.target.value as any)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="beknopt">⚡ Beknopt</option>
                    <option value="normaal">📝 Normaal</option>
                    <option value="uitgebreid">📖 Uitgebreid</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">{getScriptLengthDescription(scriptLength)}</p>
                </div>
              </div>

              {/* Tutoyeren Option */}
              <div className="mb-8">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id="tutoyeren"
                      checked={useTutoyeren}
                      onChange={(e) => setUseTutoyeren(e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="tutoyeren" className="flex items-center space-x-2 text-sm font-medium text-gray-700 cursor-pointer">
                      <span>👥 Tutoyeren (jij/jouw i.p.v. u/uw)</span>
                      <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">STANDAARD</span>
                    </label>
                  </div>
                  <p className="text-xs text-gray-600 mt-2 ml-7">
                    Gebruik informele aanspreekvorm in het script voor een persoonlijkere benadering
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Action buttons */}
          {canProcessFiles() && workflowMode === 'generate' ? (
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
              <button
                onClick={() => generateScript(slides)}
                className="px-8 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-lg"
              >
                🔄 Regenereer Script met Nieuwe Instellingen
              </button>
              
              <button
                onClick={resetApp}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                📁 Upload Andere Presentatie
              </button>
            </div>
          ) : canProcessFiles() && workflowMode === 'upload' ? (
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
              <button
                onClick={() => processUploadedScript(slides, uploadedScript)}
                className="px-8 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-lg"
              >
                🔄 Verwerk Script en PowerPoint
              </button>
              
              <button
                onClick={resetApp}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                📁 Upload Andere Bestanden
              </button>
            </div>
          ) : (
            <div
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 ${
                isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div className="flex flex-col items-center space-y-4">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                
                <div>
                  <p className="text-xl font-medium text-gray-700">
                    {workflowMode === 'generate' 
                      ? 'Sleep je PowerPoint hier naartoe'
                      : 'Sleep je bestanden hier naartoe'
                    }
                  </p>
                  <p className="text-gray-500 mt-2">of klik om bestanden te selecteren</p>
                  <p className="text-sm text-blue-600 mt-2 font-medium">
                    {workflowMode === 'generate' 
                      ? '🤖 Powered by Gemini 2.5 Pro'
                      : '📄 Upload .pptx en .txt bestanden'
                    }
                  </p>
                </div>
                
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    📊 Selecteer PowerPoint (.pptx)
                  </button>
                  
                  {workflowMode === 'upload' && (
                    <button
                      onClick={() => scriptInputRef.current?.click()}
                      className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                    >
                      📄 Selecteer Script (.txt)
                    </button>
                  )}
                </div>
                
                <p className="text-sm text-gray-400">
                  {workflowMode === 'generate' 
                    ? 'Ondersteunt alleen .pptx bestanden • AI-powered extractie'
                    : 'PowerPoint (.pptx) + Script (.txt) • Automatische combinatie'
                  }
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Processing Status */}
      {status.stage !== 'idle' && status.stage !== 'complete' && (
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center">
            <div className="loading-spinner mx-auto mb-4"></div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">{status.message}</h3>
            
            <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
              <div 
                className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${status.progress}%` }}
              ></div>
            </div>
            <p className="text-gray-600">{status.progress}% voltooid</p>
          </div>
        </div>
      )}

      {/* Results */}
      {slides.length > 0 && status.stage === 'complete' && (
        <div className="space-y-6">
          {/* Action Buttons */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <div className="flex flex-col space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">
                  {workflowMode === 'generate' ? 'Script Gegenereerd! 🎉' : 'Script Toegewezen! 🎉'}
                </h3>
                <p className="text-gray-600">
                  {slides.length} slides verwerkt • {generatedScript.split(' ').length} woorden script
                </p>
                {workflowMode === 'generate' && (
                  <p className="text-sm text-blue-600">
                    Stijl: {scriptStyle === 'professional' ? '🎯 Professioneel' : scriptStyle === 'casual' ? '😊 Informeel' : '📚 Educatief'} • 
                    Lengte: {scriptLength === 'beknopt' ? '⚡ Beknopt (15-30s)' : scriptLength === 'normaal' ? '📝 Normaal (30-45s)' : '📖 Uitgebreid (45-60s)'}
                    {useTutoyeren && ' • 👥 Tutoyeren'}
                  </p>
                )}
              </div>

              {/* NEW: Regenerate All Scripts Section */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-purple-800 flex items-center">
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      🔄 Alle Scripts Hergenereren
                    </h4>
                    <p className="text-purple-600 text-sm mt-1">
                      Genereer alle scripts opnieuw met de huidige instellingen ({scriptStyle}, {scriptLength}{useTutoyeren ? ', tutoyeren' : ''})
                    </p>
                  </div>
                  <button
                    onClick={regenerateAllScripts}
                    disabled={isRegeneratingAll}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    {isRegeneratingAll ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Regenereren...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>Hergenereer Alle Scripts</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* NEW: Audio Generator Toggle */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-blue-800 flex items-center">
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 14.142M9 9a3 3 0 000 6h6a3 3 0 000-6H9z" />
                      </svg>
                      🔊 Audio Generator
                    </h4>
                    <p className="text-blue-600 text-sm mt-1">
                      Genereer audio voor alle slides met TTS (Microsoft + Gemini AI)
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAudioGenerator(!showAudioGenerator)}
                    className={`px-4 py-2 rounded-lg transition-colors font-medium flex items-center space-x-2 ${
                      showAudioGenerator 
                        ? 'bg-blue-600 text-white hover:bg-blue-700' 
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 14.142M9 9a3 3 0 000 6h6a3 3 0 000-6H9z" />
                    </svg>
                    <span>{showAudioGenerator ? 'Verberg Audio Generator' : 'Toon Audio Generator'}</span>
                  </button>
                </div>
              </div>
              
              {/* Download Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <button
                  onClick={goBackToSettings}
                  className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors font-medium"
                >
                  ⚙️ Wijzig Instellingen
                </button>
                
                <button
                  onClick={downloadWithNotesOnly}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  📄 Download PowerPoint + Scripts
                </button>
                
                <button
                  onClick={() => setShowAudioGenerator(!showAudioGenerator)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  🔊 Audio Generator
                </button>
                
                <button
                  onClick={resetApp}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
                >
                  🆕 Nieuwe Presentatie
                </button>
              </div>
            </div>
          </div>

          {/* Audio Generator */}
          {showAudioGenerator && (
            <AudioGenerator slides={slides} />
          )}

          {/* Individual Slide Editors */}
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h3 className="text-2xl font-bold text-gray-800 mb-6">Slides met Scripts</h3>
            
            <div className="space-y-8">
              {slides.map((slide, index) => (
                <div key={slide.slideNumber} className="border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow">
                  <SlideEditor
                    slide={slide}
                    onScriptUpdate={handleScriptUpdate}
                    scriptStyle={scriptStyle}
                    scriptLength={scriptLength}
                    useTutoyeren={useTutoyeren}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Full Script */}
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-800">Volledig Presentatie Script</h3>
            </div>
            
            <div className="bg-gray-50 p-6 rounded-lg">
              <div className="prose max-w-none">
                <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                  {generatedScript}
                </div>
              </div>
            </div>
            
            {/* Download Buttons Section */}
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0 sm:space-x-4">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedScript)
                    alert('Script gekopieerd naar klembord!')
                  }}
                  className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                >
                  📋 Kopieer Script
                </button>
              </div>
              
              <div className="flex items-center space-x-3">
                <button
                  onClick={downloadScriptAsTxt}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center space-x-2"
                >
                  <span>📄 Download .txt</span>
                </button>
                
                <button
                  onClick={downloadScriptAsExcel}
                  className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium flex items-center space-x-2"
                >
                  <span>📊 Scripts .xlsx</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pptx"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFileUpload(file)
        }}
        className="hidden"
      />
      
      <input
        ref={scriptInputRef}
        type="file"
        accept=".txt"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleScriptUpload(file)
        }}
        className="hidden"
      />
    </div>
  )
}