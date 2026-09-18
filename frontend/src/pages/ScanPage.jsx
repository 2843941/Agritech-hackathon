// ScanPage — soil scanner + adviser chat on one page.
//
// These two features are combined because they belong to the same user
// intent: "look at something and get advice about it". The soil scanner
// gives visual observations, the chat lets you follow up in words.
// Combines the previous /scan and /adviser routes into one.

import SoilScanner from '../components/SoilScanner'
import AdviserChat from '../components/AdviserChat'

export default function ScanPage({
  // Soil scanner props
  scanFile,
  scanPreview,
  scanResult,
  scanLoading,
  scanError,
  onSelectFile,
  onScan,
  onRemove,
  // Chat props
  messages,
  messageInput,
  chatLoading,
  chatError,
  onInputChange,
  onSend,
  onPresetQuestion,
}) {
  return (
    <main>
      <SoilScanner
        scanFile={scanFile}
        scanPreview={scanPreview}
        scanResult={scanResult}
        scanLoading={scanLoading}
        scanError={scanError}
        onSelectFile={onSelectFile}
        onScan={onScan}
        onRemove={onRemove}
      />
      <AdviserChat
        messages={messages}
        messageInput={messageInput}
        chatLoading={chatLoading}
        chatError={chatError}
        onInputChange={onInputChange}
        onSend={onSend}
        onPresetQuestion={onPresetQuestion}
      />
    </main>
  )
}