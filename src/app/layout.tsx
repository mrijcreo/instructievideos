import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PowerPoint Script Generator',
  description: 'Upload PowerPoint, genereer script en download met notities',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="nl">
      <body className="bg-gray-50 min-h-screen" suppressHydrationWarning={true}>
        {children}
      </body>
    </html>
  )
}