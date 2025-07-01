'use client'

import { useState, useRef } from 'react'
import { saveAs } from 'file-saver'
import CameraCapture from './CameraCapture'

interface PhotoSlide {
  id: string
  image: string
  order: number
}

export default function PhotoToPowerPoint() {
  const [photos, setPhotos] = useState<PhotoSlide[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [presentationTitle, setPresentationTitle] = useState('Foto_Presentatie')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const generateId = () => `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  const addPhoto = (imageData: string, fileName: string = 'Nieuwe foto') => {
    const newPhoto: PhotoSlide = {
      id: generateId(),
      image: imageData,
      order: photos.length + 1
    }
    setPhotos(prev => [...prev, newPhoto])
  }

  const handleFileUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    
    for (const file of fileArray) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (e) => {
          const result = e.target?.result as string
          addPhoto(result, file.name)
        }
        reader.readAsDataURL(file)
      }
    }
  }

  const handleCameraCapture = (imageData: string) => {
    addPhoto(imageData, `Camera foto ${new Date().toLocaleTimeString()}`)
  }

  const removePhoto = (id: string) => {
    setPhotos(prev => prev.filter(photo => photo.id !== id))
  }

  const movePhoto = (id: string, direction: 'up' | 'down') => {
    const currentIndex = photos.findIndex(photo => photo.id === id)
    if (currentIndex === -1) return

    const newPhotos = [...photos]
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1

    if (targetIndex >= 0 && targetIndex < photos.length) {
      [newPhotos[currentIndex], newPhotos[targetIndex]] = [newPhotos[targetIndex], newPhotos[currentIndex]]
      
      // Update order numbers
      newPhotos.forEach((photo, index) => {
        photo.order = index + 1
      })
      
      setPhotos(newPhotos)
    }
  }

  const generatePowerPoint = async () => {
    if (photos.length === 0) {
      alert('Voeg eerst foto\'s toe om een presentatie te maken!')
      return
    }

    setIsGenerating(true)

    try {
      // Import PptxGenJS dynamically to avoid SSR issues
      const PptxGenJS = (await import('pptxgenjs')).default
      const pptx = new PptxGenJS()

      // Set presentation properties
      pptx.author = 'Foto naar PowerPoint Generator'
      pptx.company = 'AI Template'
      pptx.subject = presentationTitle
      pptx.title = presentationTitle

      // Standard PowerPoint slide dimensions (16:9 aspect ratio)
      const slideWidth = 10 // inches
      const slideHeight = 5.625 // inches (16:9 ratio)

      // Add ONLY photo slides with fullscreen images - NO title slide, NO text, NO slide numbers
      for (const photo of photos) {
        const slide = pptx.addSlide()
        
        // Add fullscreen background image - completely fills the slide
        const imageData = photo.image.startsWith('data:') ? photo.image : `data:image/jpeg;base64,${photo.image}`
        
        slide.addImage({
          data: imageData,
          x: 0,           // Start at left edge
          y: 0,           // Start at top edge
          w: slideWidth,  // Full width
          h: slideHeight, // Full height
          sizing: { type: 'cover', w: slideWidth, h: slideHeight }
        })

        // COMPLETELY CLEAN - NO text overlays, NO titles, NO descriptions, NO slide numbers
        // Just pure fullscreen photos - nothing else!
      }

      // Generate and download
      const fileName = `${presentationTitle.replace(/[^a-z0-9]/gi, '_')}.pptx`
      await pptx.writeFile({ fileName })
      
      setIsGenerating(false)
      
    } catch (error) {
      console.error('PowerPoint generation error:', error)
      alert('Fout bij het genereren van PowerPoint: ' + (error instanceof Error ? error.message : 'Onbekende fout'))
      setIsGenerating(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleFileUpload(files)
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

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-600 rounded-full mb-4">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        
        <h2 className="text-3xl font-bold text-gray-800 mb-4">
          Foto's naar PowerPoint
        </h2>
        
        <p className="text-lg text-green-700 mb-6">
          Upload foto's en maak automatisch een PowerPoint met volledig schermvullende foto's (geen titels, geen tekst, geen nummers)
        </p>
      </div>

      {/* Presentation Title */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Bestandsnaam (alleen voor download)
        </label>
        <input
          type="text"
          value={presentationTitle}
          onChange={(e) => setPresentationTitle(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          placeholder="Foto_Presentatie"
        />
      </div>

      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 mb-6 ${
          isDragOver
            ? 'border-green-500 bg-green-50'
            : 'border-gray-300 hover:border-green-400'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="flex flex-col items-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          
          <div>
            <p className="text-xl font-medium text-gray-700">
              Sleep foto's hier naartoe
            </p>
            <p className="text-gray-500 mt-2">
              of gebruik de knoppen hieronder
            </p>
          </div>
          
          <div className="flex items-center space-x-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              📁 Selecteer Foto's
            </button>
            
            <CameraCapture 
              onCapture={handleCameraCapture}
              disabled={false}
            />
          </div>
          
          <p className="text-sm text-gray-400">
            Ondersteunt: JPG, PNG, GIF, WebP, BMP
          </p>
        </div>
      </div>

      {/* Photo Grid */}
      {photos.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-800">
              Foto's ({photos.length})
            </h3>
            <button
              onClick={() => setPhotos([])}
              className="text-red-600 hover:text-red-800 text-sm"
            >
              🗑️ Alles wissen
            </button>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">📸 Pure Schermvullende Foto's</p>
                <p>Elke foto wordt volledig schermvullend weergegeven zonder enige tekst, titels, nummers of overlays. Volledig clean voor pure foto presentaties!</p>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {photos.map((photo, index) => (
              <div key={photo.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                {/* Photo Preview */}
                <div className="relative mb-3">
                  <img 
                    src={photo.image} 
                    alt={`Foto ${photo.order}`}
                    className="w-full h-32 object-cover rounded-lg"
                  />
                  <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                    {photo.order}
                  </div>
                  <div className="absolute bottom-1 left-1 right-1 bg-green-600 text-white text-xs p-1 rounded text-center">
                    Pure Foto
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => movePhoto(photo.id, 'up')}
                      disabled={index === 0}
                      className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      title="Omhoog"
                    >
                      ⬆️
                    </button>
                    <button
                      onClick={() => movePhoto(photo.id, 'down')}
                      disabled={index === photos.length - 1}
                      className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      title="Omlaag"
                    >
                      ⬇️
                    </button>
                  </div>
                  
                  <button
                    onClick={() => removePhoto(photo.id)}
                    className="p-1 text-red-500 hover:text-red-700 text-sm"
                    title="Verwijderen"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generate Button */}
      {photos.length > 0 && (
        <div className="text-center">
          <button
            onClick={generatePowerPoint}
            disabled={isGenerating}
            className="px-8 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <span className="flex items-center space-x-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>PowerPoint wordt gegenereerd...</span>
              </span>
            ) : (
              <span className="flex items-center space-x-2">
                <span>📊</span>
                <span>Genereer PowerPoint ({photos.length} pure foto slides)</span>
              </span>
            )}
          </button>
          
          <p className="text-gray-500 text-sm mt-3">
            Volledig clean - {photos.length} schermvullende foto's zonder enige tekst of nummers
          </p>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={(e) => {
          const files = e.target.files
          if (files && files.length > 0) {
            handleFileUpload(files)
          }
          e.target.value = ''
        }}
        className="hidden"
      />
    </div>
  )
}