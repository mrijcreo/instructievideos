import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest, NextResponse } from 'next/server'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

export async function POST(request: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY niet geconfigureerd' },
        { status: 500 }
      )
    }

    const { text, voiceName = 'Kore', emotion = 'neutral' } = await request.json()

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Tekst is vereist voor TTS generatie' },
        { status: 400 }
      )
    }

    // Limit text length for TTS (Gemini has limits)
    if (text.length > 5000) {
      return NextResponse.json(
        { error: 'Tekst te lang voor TTS (max 5000 karakters)' },
        { status: 400 }
      )
    }

    console.log('🔊 Generating TTS with Gemini 2.5 Flash:', {
      textLength: text.length,
      voice: voiceName,
      emotion: emotion
    })

    // Use gemini-2.5-flash which supports multimodal including audio generation
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
      }
    })

    try {
      // First attempt: Try with audio generation request
      const audioPrompt = `Generate speech audio for the following Dutch text using voice "${voiceName}" with "${emotion}" emotion:

"${text}"

Please generate this as audio output.`

      const result = await model.generateContent([
        {
          text: audioPrompt
        }
      ])

      const response = await result.response
      
      // Check if we got audio data in the response
      const candidates = response.candidates
      if (candidates && candidates.length > 0) {
        const candidate = candidates[0]
        
        // Look for audio data in various possible locations
        const content = candidate.content
        if (content && content.parts) {
          for (const part of content.parts) {
            // Check for inline audio data
            if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('audio/')) {
              console.log('✅ Found audio data in response')
              return NextResponse.json({
                success: true,
                audioData: part.inlineData.data,
                mimeType: part.inlineData.mimeType,
                voice: voiceName,
                emotion: emotion,
                textLength: text.length
              })
            }
            
            // Check for file data
            if (part.fileData && part.fileData.mimeType && part.fileData.mimeType.startsWith('audio/')) {
              console.log('✅ Found file audio data in response')
              return NextResponse.json({
                success: true,
                audioData: part.fileData.fileUri, // This would need special handling
                mimeType: part.fileData.mimeType,
                voice: voiceName,
                emotion: emotion,
                textLength: text.length
              })
            }
          }
        }
      }

      // If no audio found, try alternative approach with explicit audio request
      console.log('🔄 No audio found, trying alternative approach...')
      
      // Second attempt: Use a more explicit audio generation request without unsupported MIME type
      const audioRequest = {
        contents: [{
          role: 'user',
          parts: [{
            text: `Convert this text to speech audio in Dutch with voice "${voiceName}" and emotion "${emotion}": ${text}`
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          candidateCount: 1,
          // Remove responseMimeType as audio/wav is not supported
        }
      }

      const audioResult = await model.generateContent(audioRequest)
      const audioResponse = await audioResult.response
      
      // Check for audio in the alternative response
      const audioCandidates = audioResponse.candidates
      if (audioCandidates && audioCandidates.length > 0) {
        const audioCandidate = audioCandidates[0]
        const audioContent = audioCandidate.content
        
        if (audioContent && audioContent.parts) {
          for (const part of audioContent.parts) {
            if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('audio/')) {
              console.log('✅ Found audio data in alternative response')
              return NextResponse.json({
                success: true,
                audioData: part.inlineData.data,
                mimeType: part.inlineData.mimeType,
                voice: voiceName,
                emotion: emotion,
                textLength: text.length
              })
            }
          }
        }
      }

      // If still no audio, return error with helpful message
      console.log('❌ No audio data found in Gemini response')
      return NextResponse.json(
        { 
          error: 'Gemini TTS niet beschikbaar',
          details: 'Gemini 2.5 Flash ondersteunt momenteel geen audio generatie via deze API. Gebruik Microsoft TTS als alternatief.',
          suggestion: 'Schakel over naar Microsoft TTS in de instellingen voor betrouwbare audio generatie.'
        },
        { status: 400 }
      )

    } catch (apiError: any) {
      console.error('❌ Gemini API error:', apiError)
      
      // Check for specific error types
      if (apiError.message && apiError.message.includes('audio')) {
        return NextResponse.json(
          { 
            error: 'Audio generatie niet ondersteund',
            details: 'Gemini 2.5 Flash ondersteunt momenteel geen audio output via deze API configuratie.',
            suggestion: 'Gebruik Microsoft TTS voor betrouwbare audio generatie.'
          },
          { status: 400 }
        )
      }
      
      if (apiError.message && apiError.message.includes('quota')) {
        return NextResponse.json(
          { 
            error: 'API quota overschreden',
            details: 'Je hebt je Gemini API limiet bereikt. Wacht tot je quota reset of verhoog je limiet.',
            quotaError: true
          },
          { status: 429 }
        )
      }
      
      return NextResponse.json(
        { 
          error: 'Gemini API fout',
          details: apiError.message || 'Onbekende API fout',
          suggestion: 'Probeer Microsoft TTS als alternatief.'
        },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('❌ TTS generation error:', error)
    
    return NextResponse.json(
      { 
        error: 'Fout bij TTS generatie',
        details: error instanceof Error ? error.message : 'Onbekende fout',
        suggestion: 'Gebruik Microsoft TTS voor betrouwbare audio generatie.'
      },
      { status: 500 }
    )
  }
}