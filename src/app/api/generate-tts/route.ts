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

    console.log('🔊 Generating TTS with Gemini:', {
      textLength: text.length,
      voice: voiceName,
      emotion: emotion
    })

    // Use gemini-2.0-flash-thinking-exp-1219 which supports audio generation
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-thinking-exp-1219' })

    // Create TTS request with proper typing
    const requestConfig = {
      contents: [{
        role: 'user' as const,
        parts: [{
          text: text
        }]
      }],
      generationConfig: {
        // Use any type to bypass TypeScript restrictions for experimental features
        response_modalities: ['AUDIO'],
        speech_config: {
          voice_config: {
            prebuilt_voice_config: {
              voice_name: voiceName
            }
          }
        }
      } as any
    }

    const result = await model.generateContent(requestConfig)
    const response = await result.response
    
    // Get audio data from response - use proper TypeScript access with any casting
    const responseData = response as any
    const audioData = responseData.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
    
    if (!audioData) {
      // Try alternative access patterns for different API versions
      const altAudioData = responseData.candidates?.[0]?.content?.parts?.[0]?.inline_data?.data ||
                          responseData.candidates?.[0]?.content?.parts?.[0]?.audioData?.data ||
                          responseData.audioData?.data
      
      if (!altAudioData) {
        console.error('No audio data found in response:', JSON.stringify(responseData, null, 2))
        throw new Error('Geen audio data ontvangen van Gemini TTS')
      }
      
      console.log('✅ TTS generation successful (alternative access)')
      return NextResponse.json({
        success: true,
        audioData: altAudioData,
        mimeType: 'audio/wav',
        voice: voiceName,
        emotion: emotion,
        textLength: text.length
      })
    }

    console.log('✅ TTS generation successful')

    // Return audio as base64
    return NextResponse.json({
      success: true,
      audioData: audioData,
      mimeType: 'audio/wav',
      voice: voiceName,
      emotion: emotion,
      textLength: text.length
    })

  } catch (error) {
    console.error('❌ TTS generation error:', error)
    
    // Check if it's a quota error and provide helpful message
    if (error instanceof Error && error.message.includes('quota')) {
      return NextResponse.json(
        { 
          error: 'API quota overschreden. Controleer je Google Cloud billing en quota instellingen.',
          details: 'Je hebt je Gemini API limiet bereikt. Wacht tot je quota reset of verhoog je limiet in Google Cloud Console.',
          quotaError: true
        },
        { status: 429 }
      )
    }
    
    // Check if it's a model support error
    if (error instanceof Error && error.message.includes('does not support')) {
      return NextResponse.json(
        { 
          error: 'Model ondersteunt geen audio generatie. Probeer Microsoft TTS als alternatief.',
          details: 'De huidige Gemini model configuratie ondersteunt geen TTS. Gebruik de Microsoft TTS optie in de instellingen.',
          modelError: true
        },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { 
        error: 'Fout bij TTS generatie',
        details: error instanceof Error ? error.message : 'Onbekende fout'
      },
      { status: 500 }
    )
  }
}