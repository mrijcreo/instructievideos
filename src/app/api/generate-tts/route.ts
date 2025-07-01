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

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

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
    
    // Get audio data from response
    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inline_data?.data
    
    if (!audioData) {
      throw new Error('Geen audio data ontvangen van Gemini TTS')
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
    
    return NextResponse.json(
      { 
        error: 'Fout bij TTS generatie',
        details: error instanceof Error ? error.message : 'Onbekende fout'
      },
      { status: 500 }
    )
  }
}