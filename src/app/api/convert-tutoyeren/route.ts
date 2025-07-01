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

    const { slides } = await request.json()

    if (!slides || slides.length === 0) {
      return NextResponse.json({ error: 'Geen slides ontvangen' }, { status: 400 })
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const prompt = `
Je bent een expert tekstbewerker. Converteer de volgende presentatiescripts naar de informele aanspreekvorm (tutoyeren).

INSTRUCTIES:
1. Vervang ALLE vormen van "u/uw/uzelf" door "jij/jouw/jezelf/je"
2. Pas werkwoordsvormen aan waar nodig (u bent → jij bent, u heeft → jij hebt, etc.)
3. Behoud de exacte inhoud, structuur en toon van het script
4. Maak het natuurlijk en vloeiend klinken
5. Behoud alle interpunctie en opmaak
6. Zorg dat het script nog steeds professioneel klinkt ondanks de informele aanspreekvorm

SLIDES MET SCRIPTS:
${slides.map((slide: any, index: number) => `
SLIDE ${slide.slideNumber} SCRIPT:
${slide.script || 'Geen script beschikbaar'}
`).join('\n')}

FORMAAT:
Geef het resultaat in deze exacte structuur:

SLIDE 1 SCRIPT:
[Geconverteerd script voor slide 1]

SLIDE 2 SCRIPT:
[Geconverteerd script voor slide 2]

[etc. voor alle slides]

VOLLEDIG SCRIPT:
[Het complete geconverteerde script als één doorlopende tekst]
`

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
      slideScripts.push(`Geconverteerd script voor slide ${slideScripts.length + 1}...`)
    }

    return NextResponse.json({
      success: true,
      scripts: slideScripts,
      fullScript: fullScript,
      converted: true
    })

  } catch (error) {
    console.error('Tutoyeren conversion error:', error)
    return NextResponse.json(
      { error: 'Fout bij het converteren naar tutoyeren' },
      { status: 500 }
    )
  }
}