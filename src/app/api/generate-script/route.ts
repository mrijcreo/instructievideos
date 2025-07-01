import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest, NextResponse } from 'next/server'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

export async function POST(request: NextRequest) {
  try {
    // Check if API key is configured
    if (!process.env.GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY not found in environment variables')
      return NextResponse.json(
        { 
          error: 'GEMINI_API_KEY niet geconfigureerd',
          details: 'Voeg GEMINI_API_KEY toe aan je .env.local bestand',
          hint: 'Herstart de development server na het toevoegen van de API key'
        },
        { status: 500 }
      )
    }

    // Validate API key format
    if (!process.env.GEMINI_API_KEY.startsWith('AIza')) {
      console.error('Invalid GEMINI_API_KEY format')
      return NextResponse.json(
        { 
          error: 'Ongeldige GEMINI_API_KEY format',
          details: 'De API key moet beginnen met "AIza"',
          hint: 'Controleer je API key in Google AI Studio'
        },
        { status: 500 }
      )
    }

    const { slides, style, length, useTutoyeren } = await request.json()

    if (!slides || slides.length === 0) {
      return NextResponse.json({ 
        error: 'Geen slides ontvangen',
        details: 'Er zijn geen slides gevonden om een script voor te genereren'
      }, { status: 400 })
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    // Updated length-specific settings
    const lengthSettings: Record<string, { timePerSlide: string; wordCount: string; description: string }> = {
      beknopt: {
        timePerSlide: '15-30 seconden',
        wordCount: '40-80 woorden',
        description: 'zeer korte, bondige scripts'
      },
      normaal: {
        timePerSlide: '30-45 seconden',
        wordCount: '80-120 woorden',
        description: 'standaard scripts'
      },
      uitgebreid: {
        timePerSlide: '45-60 seconden',
        wordCount: '120-180 woorden',
        description: 'uitgebreide, gedetailleerde scripts'
      }
    }

    // Style-specific prompts
    const stylePrompts: Record<string, string> = {
      professional: "Schrijf een professioneel, zakelijk presentatiescript. Gebruik formele taal, duidelijke structuur en overtuigende argumenten.",
      casual: "Schrijf een informeel, toegankelijk presentatiescript. Gebruik een vriendelijke toon, spreektaal en maak het persoonlijk.",
      educational: "Schrijf een educatief presentatiescript. Leg concepten duidelijk uit, gebruik voorbeelden en zorg voor goede leerdoelen."
    }

    const currentLength = lengthSettings[length]

    // Tutoyeren instruction
    const tutoyerenInstruction = useTutoyeren 
      ? "BELANGRIJK: Gebruik ALTIJD de informele aanspreekvorm 'jij/jouw/je' in plaats van 'u/uw'. Spreek het publiek direct en persoonlijk aan."
      : "Gebruik de formele aanspreekvorm 'u/uw' waar gepast."

    const prompt = `
Je bent een expert presentatiescriptschrijver. Genereer een professioneel script voor een PowerPoint presentatie.

STIJL: ${stylePrompts[style]}

SCRIPT LENGTE: ${length.toUpperCase()}
- Tijd per slide: ${currentLength.timePerSlide}
- Woordenaantal per slide: ${currentLength.wordCount}
- Type: ${currentLength.description}

AANSPREEKVORM: ${tutoyerenInstruction}

SPECIFICATIES:
- Aantal slides: ${slides.length}
- Taal: Nederlands
- Maak het script natuurlijk en spreekbaar

SLIDES INHOUD:
${slides.map((slide: any, index: number) => `
Slide ${slide.slideNumber}: ${slide.title}
Inhoud: ${slide.content}
`).join('\n')}

INSTRUCTIES:
1. Genereer voor elke slide een apart script van ${currentLength.wordCount}
2. Zorg voor vloeiende overgangen tussen slides
3. Begin met een sterke opening en eindig met een krachtige conclusie
4. Maak het script natuurlijk en spreekbaar
5. Voeg waar nodig pauzes en ademruimte toe
6. Gebruik de ${style} stijl consequent
7. Houd rekening met de ${length} lengte-instelling
8. ${tutoyerenInstruction}

${length === 'beknopt' ? 'BELANGRIJK: Houd het zeer kort en krachtig. Ga direct to the point. Maximaal 80 woorden per slide.' : ''}
${length === 'normaal' ? 'BELANGRIJK: Geef voldoende detail maar blijf gefocust. Ongeveer 80-120 woorden per slide.' : ''}
${length === 'uitgebreid' ? 'BELANGRIJK: Geef uitgebreide uitleg, voorbeelden en context. Ongeveer 120-180 woorden per slide.' : ''}

FORMAAT:
Geef het resultaat in deze structuur:

SLIDE 1 SCRIPT:
[Script voor slide 1]

SLIDE 2 SCRIPT:
[Script voor slide 2]

[etc. voor alle slides]

VOLLEDIG SCRIPT:
[Het complete script als één doorlopende tekst]
`

    console.log('Generating script with Gemini API...')
    const result = await model.generateContent(prompt)
    const response = await result.response
    const scriptText = response.text()

    // Parse the response to extract individual slide scripts
    const slideScripts: string[] = []
    const slideMatches = scriptText.match(/SLIDE \d+ SCRIPT:\s*([\s\S]*?)(?=SLIDE \d+ SCRIPT:|VOLLEDIG SCRIPT:|$)/g)
    
    if (slideMatches) {
      slideMatches.forEach(match => {
        const script = match.replace(/SLIDE \d+ SCRIPT:\s*/, '').trim()
        slideScripts.push(script)
      })
    }

    // Extract full script
    const fullScriptMatch = scriptText.match(/VOLLEDIG SCRIPT:\s*([\s\S]*)$/)
    const fullScript = fullScriptMatch ? fullScriptMatch[1].trim() : scriptText

    // Ensure we have scripts for all slides
    while (slideScripts.length < slides.length) {
      slideScripts.push(`Script voor slide ${slideScripts.length + 1} wordt gegenereerd...`)
    }

    console.log('Script generation successful')
    return NextResponse.json({
      success: true,
      scripts: slideScripts,
      fullScript: fullScript,
      metadata: {
        totalSlides: slides.length,
        style: style,
        length: length,
        useTutoyeren: useTutoyeren,
        estimatedTimePerSlide: currentLength.timePerSlide,
        wordsPerSlide: slideScripts.map(script => script.split(' ').length)
      }
    })

  } catch (error) {
    console.error('Script generation error:', error)
    
    // Enhanced error handling with specific error types
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        return NextResponse.json(
          { 
            error: 'API key probleem',
            details: error.message,
            hint: 'Controleer je GEMINI_API_KEY in .env.local'
          },
          { status: 401 }
        )
      }
      
      if (error.message.includes('quota') || error.message.includes('limit')) {
        return NextResponse.json(
          { 
            error: 'API quota bereikt',
            details: 'Je hebt je API limiet bereikt',
            hint: 'Wacht even of upgrade je Gemini API plan'
          },
          { status: 429 }
        )
      }
      
      if (error.message.includes('network') || error.message.includes('fetch')) {
        return NextResponse.json(
          { 
            error: 'Netwerkfout',
            details: 'Kan geen verbinding maken met Gemini API',
            hint: 'Controleer je internetverbinding'
          },
          { status: 503 }
        )
      }
    }
    
    return NextResponse.json(
      { 
        error: 'Fout bij het genereren van script',
        details: error instanceof Error ? error.message : 'Onbekende fout',
        hint: 'Probeer het opnieuw of controleer je API configuratie'
      },
      { status: 500 }
    )
  }
}