import PowerPointProcessor from '@/components/PowerPointProcessor'
import PhotoToPowerPoint from '@/components/PhotoToPowerPoint'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-6">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          
          <h1 className="text-5xl font-bold text-gray-800 mb-4">
            PowerPoint Script Generator
          </h1>
          
          <p className="text-xl text-blue-700 font-medium mb-6">
            Upload je PowerPoint, krijg een professioneel script, en download met notities
          </p>

          <div className="flex justify-center space-x-8 text-sm text-gray-600">
            <div className="flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
              Upload .pptx bestanden
            </div>
            <div className="flex items-center">
              <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
              AI-gegenereerd script
            </div>
            <div className="flex items-center">
              <span className="w-2 h-2 bg-purple-500 rounded-full mr-2"></span>
              Download met notities
            </div>
            <div className="flex items-center">
              <span className="w-2 h-2 bg-orange-500 rounded-full mr-2"></span>
              Foto's naar PowerPoint
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto space-y-12">
          {/* PowerPoint Script Generator */}
          <PowerPointProcessor />
          
          {/* Photo to PowerPoint Generator */}
          <PhotoToPowerPoint />
        </div>

        {/* Footer */}
        <div className="text-center mt-16">
          <p className="text-gray-500 text-sm">
            Powered by Gemini AI • Veilig en privé • Geen data opslag
          </p>
        </div>
      </div>
    </div>
  )
}