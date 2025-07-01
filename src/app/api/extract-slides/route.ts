import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import JSZip from 'jszip'

// Initialize Gemini AI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'Geen bestand gevonden' }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith('.pptx')) {
      return NextResponse.json({ error: 'Alleen .pptx bestanden zijn toegestaan' }, { status: 400 })
    }

    console.log('🔍 Starting PowerPoint analysis for:', file.name)

    // Read the PowerPoint file
    const arrayBuffer = await file.arrayBuffer()
    const zip = new JSZip()
    const pptx = await zip.loadAsync(arrayBuffer)

    const slides: any[] = []
    
    // Get all slide files and sort them properly
    const slideFiles = Object.keys(pptx.files)
      .filter(name => name.startsWith('ppt/slides/slide') && name.endsWith('.xml') && !name.includes('_rels'))
      .sort((a, b) => {
        // Extract slide numbers for proper sorting
        const aNum = parseInt(a.match(/slide(\d+)\.xml$/)?.[1] || '0')
        const bNum = parseInt(b.match(/slide(\d+)\.xml$/)?.[1] || '0')
        return aNum - bNum
      })

    console.log(`📊 Found ${slideFiles.length} slide files:`, slideFiles)

    if (slideFiles.length === 0) {
      return NextResponse.json({ error: 'Geen slides gevonden in het PowerPoint bestand' }, { status: 400 })
    }

    // Process each slide with enhanced extraction
    for (let i = 0; i < slideFiles.length; i++) {
      const slideFile = pptx.files[slideFiles[i]]
      if (slideFile) {
        console.log(`🔍 Processing slide ${i + 1}/${slideFiles.length}`)
        
        const slideXml = await slideFile.async('text')
        
        // Enhanced text extraction with multiple methods
        const extractedContent = await extractSlideContent(slideXml, i + 1)
        
        // If basic extraction fails or returns minimal content, use Gemini for analysis
        if (!extractedContent.content || extractedContent.content.length < 20) {
          console.log(`🤖 Using Gemini AI for slide ${i + 1} analysis (basic extraction insufficient)`)
          const aiAnalysis = await analyzeSlideWithGemini(slideXml, i + 1)
          if (aiAnalysis) {
            slides.push(aiAnalysis)
            continue
          }
        }

        slides.push(extractedContent)
      }
    }

    // Final validation and enhancement with Gemini if needed
    const validSlides = slides.filter(slide => slide && slide.content && slide.content.trim().length > 0)
    
    if (validSlides.length === 0) {
      console.log('⚠️ No valid slides extracted, attempting full AI analysis')
      
      // Last resort: analyze the entire presentation structure with Gemini
      const fullAnalysis = await analyzeFullPresentationWithGemini(pptx, slideFiles.length)
      if (fullAnalysis && fullAnalysis.length > 0) {
        return NextResponse.json({
          success: true,
          slides: fullAnalysis,
          totalSlides: fullAnalysis.length,
          extractionMethod: 'AI_FULL_ANALYSIS'
        })
      }
      
      return NextResponse.json({ error: 'Geen bruikbare slide content gevonden. Het PowerPoint bestand bevat mogelijk alleen afbeeldingen of complexe layouts.' }, { status: 400 })
    }

    console.log(`✅ Successfully extracted ${validSlides.length} slides`)

    return NextResponse.json({
      success: true,
      slides: validSlides,
      totalSlides: validSlides.length,
      extractionMethod: validSlides.length === slideFiles.length ? 'STANDARD_EXTRACTION' : 'HYBRID_EXTRACTION'
    })

  } catch (error) {
    console.error('❌ Error extracting slides:', error)
    return NextResponse.json(
      { error: 'Fout bij het verwerken van het PowerPoint bestand: ' + (error instanceof Error ? error.message : 'Onbekende fout') },
      { status: 500 }
    )
  }
}

// Enhanced slide content extraction with multiple parsing strategies
async function extractSlideContent(slideXml: string, slideNumber: number) {
  console.log(`🔍 Extracting content from slide ${slideNumber}`)
  
  // Strategy 1: Extract all text content with improved regex
  const textMatches = slideXml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || []
  const allText = textMatches
    .map(match => {
      // Decode XML entities and clean up
      return match.replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
    })
    .filter(text => text.trim().length > 0)
    .map(text => text.trim())

  // Strategy 2: Try to identify title vs content based on XML structure
  let title = ''
  let content = ''

  // Look for title placeholder
  const titleMatches = slideXml.match(/<p:ph[^>]*type="title"[^>]*>[\s\S]*?<a:t[^>]*>([^<]*)<\/a:t>/g)
  if (titleMatches && titleMatches.length > 0) {
    const titleMatch = titleMatches[0].match(/<a:t[^>]*>([^<]*)<\/a:t>/)
    if (titleMatch) {
      title = titleMatch[1].trim()
    }
  }

  // If no title found, use first text as title
  if (!title && allText.length > 0) {
    title = allText[0]
    content = allText.slice(1).join(' ')
  } else {
    content = allText.filter(text => text !== title).join(' ')
  }

  // Strategy 3: Extract from different text containers
  if (!content || content.length < 10) {
    // Try paragraph extraction
    const paragraphMatches = slideXml.match(/<a:p[^>]*>[\s\S]*?<\/a:p>/g) || []
    const paragraphTexts = paragraphMatches
      .map(para => {
        const textInPara = para.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || []
        return textInPara.map(t => t.replace(/<[^>]*>/g, '').trim()).join(' ')
      })
      .filter(text => text.length > 0)
    
    if (paragraphTexts.length > 0) {
      content = paragraphTexts.join('\n')
    }
  }

  // Strategy 4: Extract from text runs and shapes
  if (!content || content.length < 10) {
    const shapeMatches = slideXml.match(/<p:sp[^>]*>[\s\S]*?<\/p:sp>/g) || []
    const shapeTexts = shapeMatches
      .map(shape => {
        const textInShape = shape.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || []
        return textInShape.map(t => t.replace(/<[^>]*>/g, '').trim()).join(' ')
      })
      .filter(text => text.length > 0)
    
    if (shapeTexts.length > 0) {
      content = shapeTexts.join('\n')
    }
  }

  // Fallback: use all text if still no content
  if (!content || content.length < 5) {
    content = allText.join(' ')
  }

  // Generate title if still empty
  if (!title) {
    if (content.length > 0) {
      // Use first 50 characters as title
      title = content.split(/[.!?]|[\n\r]/)[0].substring(0, 50).trim()
      if (title.length < content.length) {
        title += '...'
      }
    } else {
      title = `Slide ${slideNumber}`
    }
  }

  console.log(`📝 Slide ${slideNumber} extracted: title="${title.substring(0, 30)}...", content=${content.length} chars`)

  return {
    slideNumber: slideNumber,
    title: title.length > 100 ? title.substring(0, 100) + '...' : title,
    content: content
  }
}

// Use Gemini AI to analyze slide content when standard extraction fails
async function analyzeSlideWithGemini(slideXml: string, slideNumber: number) {
  if (!process.env.GEMINI_API_KEY) {
    console.log('⚠️ No Gemini API key available for AI analysis')
    return null
  }

  try {
    console.log(`🤖 Using Gemini 2.5 Pro for slide ${slideNumber} analysis`)
    
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro-preview-06-05' })

    const prompt = `
Analyseer deze PowerPoint slide XML en extraheer de belangrijkste informatie:

SLIDE XML:
${slideXml.substring(0, 8000)} ${slideXml.length > 8000 ? '...[truncated]' : ''}

INSTRUCTIES:
1. Zoek naar alle tekstuele content in de slide
2. Identificeer wat de titel zou kunnen zijn (meestal de eerste of grootste tekst)
3. Verzamel alle andere tekstuele content als slide inhoud
4. Negeer XML tags en technische elementen
5. Geef een duidelijke, leesbare samenvatting

FORMAAT (JSON):
{
  "slideNumber": ${slideNumber},
  "title": "Duidelijke slide titel (max 100 karakters)",
  "content": "Alle tekstuele content van de slide, gestructureerd en leesbaar"
}

Geef ALLEEN de JSON terug, geen extra tekst.`

    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text().trim()

    // Try to parse JSON response
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        console.log(`✅ Gemini analysis successful for slide ${slideNumber}`)
        return {
          slideNumber: slideNumber,
          title: parsed.title || `Slide ${slideNumber}`,
          content: parsed.content || 'Geen tekstuele content gevonden'
        }
      }
    } catch (parseError) {
      console.log(`⚠️ Failed to parse Gemini JSON response for slide ${slideNumber}`)
    }

    // Fallback: use the text response directly
    return {
      slideNumber: slideNumber,
      title: `Slide ${slideNumber} (AI Analyzed)`,
      content: text.substring(0, 1000)
    }

  } catch (error) {
    console.error(`❌ Gemini analysis failed for slide ${slideNumber}:`, error)
    return null
  }
}

// Analyze entire presentation structure when individual slide extraction fails
async function analyzeFullPresentationWithGemini(pptx: JSZip, slideCount: number) {
  if (!process.env.GEMINI_API_KEY) {
    console.log('⚠️ No Gemini API key available for full presentation analysis')
    return null
  }

  try {
    console.log(`🤖 Using Gemini 2.5 Pro for full presentation analysis (${slideCount} slides)`)
    
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro-preview-06-05' })

    // Get presentation structure
    const presentationFile = pptx.files['ppt/presentation.xml']
    let presentationXml = ''
    if (presentationFile) {
      presentationXml = await presentationFile.async('text')
    }

    // Get slide relationship info
    const relsFile = pptx.files['ppt/_rels/presentation.xml.rels']
    let relsXml = ''
    if (relsFile) {
      relsXml = await relsFile.async('text')
    }

    const prompt = `
Analyseer deze PowerPoint presentatie structuur en genereer slide informatie:

PRESENTATIE XML (eerste 3000 karakters):
${presentationXml.substring(0, 3000)}

RELATIES XML (eerste 2000 karakters):
${relsXml.substring(0, 2000)}

AANTAL SLIDES: ${slideCount}

INSTRUCTIES:
1. Genereer voor elke slide (1 tot ${slideCount}) een logische titel en content
2. Gebruik de XML structuur om slide volgorde en relaties te begrijpen
3. Maak realistische slide content gebaseerd op wat je kunt afleiden
4. Als er geen specifieke content te vinden is, maak dan generieke maar nuttige placeholders

FORMAAT (JSON Array):
[
  {
    "slideNumber": 1,
    "title": "Slide titel",
    "content": "Slide content en beschrijving"
  },
  ...
]

Geef ALLEEN de JSON array terug, geen extra tekst.`

    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text().trim()

    // Try to parse JSON response
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`✅ Gemini full analysis successful: ${parsed.length} slides`)
          return parsed
        }
      }
    } catch (parseError) {
      console.log(`⚠️ Failed to parse Gemini full analysis JSON response`)
    }

    // Fallback: generate basic slides
    const fallbackSlides = []
    for (let i = 1; i <= slideCount; i++) {
      fallbackSlides.push({
        slideNumber: i,
        title: `Slide ${i}`,
        content: `Content voor slide ${i} - geanalyseerd door AI maar geen specifieke tekst gevonden.`
      })
    }
    
    return fallbackSlides

  } catch (error) {
    console.error(`❌ Gemini full presentation analysis failed:`, error)
    return null
  }
}