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

    console.log('🔊 Attempting Gemini TTS generation:', {
      textLength: text.length,
      voice: voiceName,
      emotion: emotion
    })

    // Since Gemini TTS is not yet widely available, we'll return an error
    // that suggests using Microsoft TTS instead
    console.log('❌ Gemini TTS not available - suggesting Microsoft TTS fallback')
    
    return NextResponse.json(
      { 
        error: 'Gemini TTS is momenteel niet beschikbaar. Gebruik Microsoft TTS als alternatief.',
        details: 'Gemini AI TTS is nog niet algemeen beschikbaar. Schakel over naar Microsoft TTS in de instellingen voor betrouwbare audio generatie.',
        modelError: true,
        fallbackSuggestion: 'microsoft_tts',
        helpText: 'Klik op "← Wijzig Instellingen" en selecteer "🎤 Microsoft TTS" voor betrouwbare audio generatie.'
      },
      { status: 400 }
    )

  } catch (error) {
    console.error('❌ TTS generation error:', error)
    
    // Check if it's a quota error and provide helpful message
    if (error instanceof Error && error.message.includes('quota')) {
      return NextResponse.json(
        { 
          error: 'API quota overschreden. Controleer je Google Cloud billing en quota instellingen.',
          details: 'Je hebt je Gemini API limiet bereikt. Wacht tot je quota reset of verhoog je limiet in Google Cloud Console.',
          quotaError: true,
          helpUrl: 'https://ai.google.dev/gemini-api/docs/rate-limits'
        },
        { status: 429 }
      )
    }
    
    // Check if it's a billing error
    if (error instanceof Error && (error.message.includes('billing') || error.message.includes('payment'))) {
      return NextResponse.json(
        { 
          error: 'Billing probleem. Controleer je Google Cloud billing instellingen.',
          details: 'Er is een probleem met je Google Cloud billing. Controleer je betalingsmethode en billing account.',
          billingError: true,
          helpUrl: 'https://console.cloud.google.com/billing'
        },
        { status: 402 }
      )
    }
    
    return NextResponse.json(
      { 
        error: 'Fout bij TTS generatie',
        details: error instanceof Error ? error.message : 'Onbekende fout',
        suggestion: 'Probeer Microsoft TTS als alternatief in de instellingen',
        fallbackSuggestion: 'microsoft_tts'
      },
      { status: 500 }
    )
  }
}