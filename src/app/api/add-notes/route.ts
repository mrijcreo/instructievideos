import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const slidesData = formData.get('slides') as string
    
    if (!file || !slidesData) {
      return NextResponse.json({ error: 'Bestand en slides data zijn vereist' }, { status: 400 })
    }

    const slides = JSON.parse(slidesData)
    
    // Read the original PowerPoint file
    const arrayBuffer = await file.arrayBuffer()
    const zip = new JSZip()
    const pptx = await zip.loadAsync(arrayBuffer)

    console.log('📊 Processing PowerPoint with', slides.length, 'slides')

    // Get existing presentation structure
    const presentationFile = pptx.files['ppt/presentation.xml']
    if (!presentationFile) {
      throw new Error('Invalid PowerPoint file: missing presentation.xml')
    }

    let presentationXml = await presentationFile.async('text')
    console.log('📄 Loaded presentation.xml')

    // Process each slide to add notes
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i]
      const slideNumber = i + 1
      const notesFileName = `ppt/notesSlides/notesSlide${slideNumber}.xml`
      
      console.log(`📝 Adding notes to slide ${slideNumber}:`, slide.title)
      
      // Create notes XML content with proper structure
      const notesXml = createNotesXml(slide.script || '', slideNumber)
      
      // Add the notes file to the zip
      pptx.file(notesFileName, notesXml)
      
      // Update presentation.xml to reference the notes slide if not already present
      const slideIdPattern = new RegExp(`<p:sldId[^>]*id="[^"]*"[^>]*r:id="rId${slideNumber + 1}"[^>]*/>`)
      if (slideIdPattern.test(presentationXml)) {
        // Check if notes relationship already exists in presentation
        const notesRelPattern = new RegExp(`r:id="rId${1000 + slideNumber}"`)
        if (!notesRelPattern.test(presentationXml)) {
          // Add notes relationship reference to slide
          presentationXml = presentationXml.replace(
            slideIdPattern,
            (match) => match.replace('/>', ` notes="rId${1000 + slideNumber}"/>`)
          )
        }
      }
    }

    // Update presentation.xml
    pptx.file('ppt/presentation.xml', presentationXml)

    // Update content types to include notes slides
    const contentTypesFile = pptx.files['[Content_Types].xml']
    if (contentTypesFile) {
      let contentTypes = await contentTypesFile.async('text')
      
      // Add notes slide content type if not present
      if (!contentTypes.includes('application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml')) {
        contentTypes = contentTypes.replace(
          '</Types>',
          '  <Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>\n</Types>'
        )
        
        // Add override for each notes slide
        for (let i = 2; i <= slides.length; i++) {
          contentTypes = contentTypes.replace(
            '</Types>',
            `  <Override PartName="/ppt/notesSlides/notesSlide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>\n</Types>`
          )
        }
        
        pptx.file('[Content_Types].xml', contentTypes)
        console.log('✅ Updated Content_Types.xml')
      }
    }

    // Update relationships to include notes slides
    const relsFile = pptx.files['ppt/_rels/presentation.xml.rels']
    if (relsFile) {
      let rels = await relsFile.async('text')
      
      // Add relationships for notes slides
      for (let i = 0; i < slides.length; i++) {
        const slideNumber = i + 1
        const relId = `rId${1000 + slideNumber}` // Use high IDs to avoid conflicts
        
        if (!rels.includes(`notesSlides/notesSlide${slideNumber}.xml`)) {
          rels = rels.replace(
            '</Relationships>',
            `  <Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="notesSlides/notesSlide${slideNumber}.xml"/>\n</Relationships>`
          )
        }
      }
      
      pptx.file('ppt/_rels/presentation.xml.rels', rels)
      console.log('✅ Updated presentation relationships')
    }

    // Create notes slide relationships for each slide
    for (let i = 0; i < slides.length; i++) {
      const slideNumber = i + 1
      const slideRelsPath = `ppt/slides/_rels/slide${slideNumber}.xml.rels`
      
      // Check if slide relationships file exists
      let slideRels = ''
      const existingSlideRels = pptx.files[slideRelsPath]
      
      if (existingSlideRels) {
        slideRels = await existingSlideRels.async('text')
      } else {
        // Create basic slide relationships file
        slideRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`
      }
      
      // Add notes relationship if not present
      const notesRelId = `rId${100 + slideNumber}`
      if (!slideRels.includes(`../notesSlides/notesSlide${slideNumber}.xml`)) {
        slideRels = slideRels.replace(
          '</Relationships>',
          `  <Relationship Id="${notesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${slideNumber}.xml"/>\n</Relationships>`
        )
        
        pptx.file(slideRelsPath, slideRels)
      }
    }

    console.log('🔧 Generating modified PowerPoint...')

    // Generate the modified PowerPoint file
    const modifiedPptx = await pptx.generateAsync({ 
      type: 'arraybuffer',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 6
      }
    })
    
    console.log('✅ PowerPoint generated successfully')
    
    return new Response(modifiedPptx, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': 'attachment; filename="presentation_with_notes.pptx"',
        'Content-Length': modifiedPptx.byteLength.toString()
      },
    })

  } catch (error) {
    console.error('❌ Error adding notes:', error)
    return NextResponse.json(
      { 
        error: 'Fout bij het toevoegen van notities',
        details: error instanceof Error ? error.message : 'Onbekende fout'
      },
      { status: 500 }
    )
  }
}

function createNotesXml(scriptText: string, slideNumber: number): string {
  // Escape XML special characters properly
  const escapedScript = scriptText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Slide Image Placeholder ${slideNumber}"/>
          <p:cNvSpPr>
            <a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/>
          </p:cNvSpPr>
          <p:nvPr>
            <p:ph type="sldImg"/>
          </p:nvPr>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="685800" y="685800"/>
            <a:ext cx="6858000" cy="5143500"/>
          </a:xfrm>
        </p:spPr>
      </p:sp>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Notes Placeholder ${slideNumber}"/>
          <p:cNvSpPr>
            <a:spLocks noGrp="1"/>
          </p:cNvSpPr>
          <p:nvPr>
            <p:ph type="body" idx="1"/>
          </p:nvPr>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="685800" y="6000000"/>
            <a:ext cx="6858000" cy="4114800"/>
          </a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:r>
              <a:rPr lang="nl-NL" dirty="0" smtClean="0"/>
              <a:t>${escapedScript}</a:t>
            </a:r>
            <a:endParaRPr lang="nl-NL" dirty="0"/>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr>
    <a:masterClrMapping/>
  </p:clrMapOvr>
</p:notes>`
}