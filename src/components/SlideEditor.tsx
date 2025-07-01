'use client'

import { useState } from 'react'

interface Slide {
  slideNumber: number
  title: string
  content: string
  script?: string
}

interface SlideEditorProps {
  slide: Slide
  onScriptUpdate: (slideNumber: number, script: string) => void
  scriptStyle: string
  scriptLength: string
  useTutoyeren: boolean
}

export default function SlideEditor({ 
  slide, 
  onScriptUpdate, 
  scriptStyle,
  scriptLength,
  useTutoyeren
}: SlideEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editingScript, setEditingScript] = useState(slide.script || '')
  const [isRegenerating, setIsRegenerating] = useState(false)

  const saveScript = () => {
    onScriptUpdate(slide.slideNumber, editingScript)
    setIsEditing(false)
  }

  const cancelEdit = () => {
    setEditingScript(slide.script || '')
    setIsEditing(false)
  }

  const regenerateScript = async (newLength?: string) => {
    setIsRegenerating(true)
    
    try {
      const response = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slides: [slide],
          style: scriptStyle,
          length: newLength || scriptLength,
          useTutoyeren: useTutoyeren
        }),
      })

      if (!response.ok) {
        throw new Error('Fout bij het regenereren van script')
      }

      const data = await response.json()
      const newScript = data.scripts[0] || ''
      
      onScriptUpdate(slide.slideNumber, newScript)
      setEditingScript(newScript)
      
    } catch (error) {
      console.error('Script regeneration error:', error)
      alert('Fout bij het regenereren van script: ' + (error instanceof Error ? error.message : 'Onbekende fout'))
    } finally {
      setIsRegenerating(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow">
      {/* Slide Header */}
      <div className="flex items-center justify-between mb-6">
        <h4 className="text-xl font-bold text-gray-800 flex items-center">
          <span className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">
            {slide.slideNumber}
          </span>
          Slide {slide.slideNumber}: {slide.title}
        </h4>
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
            {slide.script?.split(' ').length || 0} woorden
          </span>
        </div>
      </div>
      
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* LEFT: Visual Slide Preview */}
        <div>
          <h5 className="font-semibold text-gray-700 mb-3 flex items-center">
            <svg className="w-4 h-4 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Slide Preview
          </h5>
          <div className="bg-white border-2 border-gray-200 rounded-lg p-6 shadow-sm min-h-[300px] flex flex-col">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-blue-600 rounded text-white text-xs flex items-center justify-center font-bold">
                  {slide.slideNumber}
                </div>
                <span className="text-xs text-gray-500 font-medium">SLIDE {slide.slideNumber}</span>
              </div>
            </div>
            <div className="mb-4">
              <h3 className="text-lg font-bold text-gray-800 leading-tight">
                {slide.title}
              </h3>
            </div>
            <div className="flex-1 space-y-2">
              {slide.content.split(/[.\n]/).filter(line => line.trim().length > 0).slice(0, 5).map((point, idx) => (
                <div key={idx} className="flex items-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {point.trim()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* RIGHT: Script Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h5 className="font-semibold text-gray-700 flex items-center">
              <svg className="w-4 h-4 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Script
            </h5>
            
            {/* Action buttons */}
            <div className="flex items-center space-x-2">
              {/* Regenerate Script Button */}
              <button
                onClick={() => regenerateScript()}
                disabled={isRegenerating}
                className="px-3 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors disabled:opacity-50 text-xs font-medium flex items-center space-x-1"
                title="Genereer nieuw script voor deze slide"
              >
                {isRegenerating ? (
                  <>
                    <div className="w-3 h-3 border border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                    <span>Genereren...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Hergenereer</span>
                  </>
                )}
              </button>

              {/* Length adjustment dropdown */}
              <select
                onChange={(e) => {
                  const newLength = e.target.value as 'beknopt' | 'normaal' | 'uitgebreid'
                  regenerateScript(newLength)
                }}
                disabled={isRegenerating}
                className="text-xs px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                defaultValue={scriptLength}
              >
                <option value="beknopt">⚡ Beknopt</option>
                <option value="normaal">📝 Normaal</option>
                <option value="uitgebreid">📖 Uitgebreid</option>
              </select>
              
              {/* Edit button */}
              <button
                onClick={() => {
                  setEditingScript(slide.script || '')
                  setIsEditing(true)
                }}
                disabled={isRegenerating}
                className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors disabled:opacity-50 text-xs font-medium"
                title="Script handmatig bewerken"
              >
                ✏️ Bewerk
              </button>
            </div>
          </div>
          
          {/* Script content or editor */}
          {isEditing ? (
            <div className="space-y-3">
              <textarea
                value={editingScript}
                onChange={(e) => setEditingScript(e.target.value)}
                className="w-full h-40 p-4 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Bewerk het script..."
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={saveScript}
                    className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors font-medium"
                  >
                    ✅ Opslaan
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    ❌ Annuleren
                  </button>
                </div>
                <span className="text-sm text-gray-500">
                  {editingScript.split(' ').length} woorden
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Script Display */}
              <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-lg min-h-[200px]">
                {isRegenerating ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="flex items-center space-x-3 text-purple-600">
                      <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                      <span className="font-medium">Script wordt gegenereerd...</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {slide.script || 'Script wordt gegenereerd...'}
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              {slide.script && !isRegenerating && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 font-medium">🎯 Snelle acties:</span>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => regenerateScript('beknopt')}
                        className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs hover:bg-yellow-200 transition-colors"
                      >
                        ⚡ Korter
                      </button>
                      <button
                        onClick={() => regenerateScript('uitgebreid')}
                        className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 transition-colors"
                      >
                        📖 Langer
                      </button>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(slide.script || '')
                          alert('Script gekopieerd!')
                        }}
                        className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200 transition-colors"
                      >
                        📋 Kopieer
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}